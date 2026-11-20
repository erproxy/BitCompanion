/* Service worker template. The builder prepends RELEASE, RELEASE_BASE, CORE and IMAGE_FILES. */
const scopeURL = new URL(self.registration.scope);
const cachePrefix = 'bitcraft-web-v1:' + encodeURIComponent(scopeURL.pathname) + ':';
const coreCacheName = cachePrefix + 'core:' + RELEASE;
const imageCacheName = cachePrefix + 'images:' + RELEASE;
const fullCacheName = cachePrefix + 'full:' + RELEASE;
const shellURL = new URL(RELEASE_BASE + 'shell.html', scopeURL).href;
const imageURLs = IMAGE_FILES.map(path => new URL(path, scopeURL).href);
const imageURLSet = new Set(imageURLs);
const coreURLs = CORE.map(path => new URL(path, scopeURL).href);
const imageLimit = 200;
const clientReleases = new Map();
let imageDownload = null, downloadError = '', imageProgress = 0;
let imageWrites = Promise.resolve();

for (const url of [...coreURLs, ...imageURLs]) {
  if (!url.startsWith(scopeURL.href)) throw new Error('Offline asset is outside the application scope.');
}

self.addEventListener('install', event => {
  // Cache.addAll rejects an incomplete response set. A failed new release never
  // takes control, and neither old caches nor localStorage are touched.
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(coreCacheName);
      await cache.addAll(coreURLs.map(url => new Request(url, {cache:'reload'})));
    } catch (error) {
      await caches.delete(coreCacheName);
      throw error;
    }
  })());
});

async function broadcast(message) {
  const clients = await self.clients.matchAll({type:'window', includeUncontrolled:true});
  for (const client of clients) if (client.url.startsWith(scopeURL.href)) client.postMessage(message);
}

async function cleanOldReleases() {
  const clients = (await self.clients.matchAll({type:'window', includeUncontrolled:true}))
    .filter(client => client.url.startsWith(scopeURL.href));
  // Root URLs do not reveal which release an already open tab is executing.
  // Preserve all caches until every live tab has reported its module version.
  if (clients.some(client => !clientReleases.has(client.id))) return;
  const names = (await caches.keys()).filter(name => name.startsWith(cachePrefix));
  const releases = names.filter(name => name.startsWith(cachePrefix + 'core:'))
    .map(name => name.slice((cachePrefix + 'core:').length));
  const keep = new Set([RELEASE, ...releases.slice(-2), ...clients.map(client => clientReleases.get(client.id))]);
  await Promise.all(names.filter(name => !keep.has(name.slice(name.lastIndexOf(':') + 1)))
    .map(name => caches.delete(name)));
}

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await self.clients.claim();
    await broadcast({type:'BCF_REPORT_RELEASE'});
    await cleanOldReleases();
  })());
});

async function findReleaseResponse(request) {
  const names = (await caches.keys()).filter(name => name.startsWith(cachePrefix));
  // The URL itself includes the release. Searching these caches cannot serve
  // another release's JavaScript under the requested immutable URL.
  for (const name of names) {
    const response = await (await caches.open(name)).match(request);
    if (response) return response;
  }
  return null;
}

async function rememberImage(request, response) {
  imageWrites = imageWrites.catch(() => {}).then(async () => {
    const cache = await caches.open(imageCacheName);
    await cache.put(request, response);
    const keys = await cache.keys();
    for (const key of keys.slice(0, Math.max(0, keys.length - imageLimit))) await cache.delete(key);
  });
  return imageWrites;
}

self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== scopeURL.origin || !url.href.startsWith(scopeURL.href)) return;
  const rootNavigation = request.mode === 'navigate' &&
    (url.pathname === scopeURL.pathname || url.pathname === scopeURL.pathname + 'index.html');
  if (rootNavigation) {
    // Pin the shell to this active release. A deployment only becomes visible
    // after the user activates the waiting worker and reloads the page.
    event.respondWith((async () => (await (await caches.open(coreCacheName)).match(shellURL)) || fetch(request))());
    return;
  }
  if (!url.pathname.startsWith(scopeURL.pathname + 'releases/')) return;
  event.respondWith((async () => {
    const cached = await findReleaseResponse(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && imageURLSet.has(url.href)) {
      // Cache errors must not hide an image that was successfully downloaded.
      event.waitUntil(rememberImage(request, response.clone()).catch(() => {}));
    }
    return response;
  })());
});

async function status(repair = false) {
  const coreCache = await caches.open(coreCacheName);
  const available = new Set((await coreCache.keys()).map(key => key.url));
  let ready = coreURLs.every(url => available.has(url));
  let coreError = '';
  if (!ready && repair) {
    try {
      await coreCache.addAll(coreURLs.map(url => new Request(url, {cache:'reload'})));
      ready = true;
    } catch { coreError = 'Автономный пакет неполон. Откройте сайт с интернетом, чтобы восстановить его.'; }
  }
  if (!ready && !coreError) coreError = 'Автономный пакет удалён браузером или неполон. Откройте сайт с интернетом, чтобы восстановить его.';
  const cache = await caches.open(fullCacheName);
  const keys = await cache.keys();
  const completed = keys.filter(key => imageURLSet.has(key.url)).length;
  return {release:RELEASE, ready, downloading:!!imageDownload,
    completed:imageDownload ? imageProgress : completed, total:imageURLs.length, error:coreError || downloadError};
}

async function downloadImages() {
  const cache = await caches.open(fullCacheName);
  const existing = new Set((await cache.keys()).map(key => key.url));
  imageProgress = imageURLs.filter(url => existing.has(url)).length;
  downloadError = '';
  let next = 0, failure;
  const progress = () => broadcast({type:'BCF_IMAGES_PROGRESS', release:RELEASE,
    downloading:true, completed:imageProgress, total:imageURLs.length, error:''});
  await progress();
  // A failed download keeps completed immutable files for a retry, but never
  // reports the whole package ready. Only this explicit operation fills it.
  await Promise.all(Array.from({length:4}, async () => {
   try {
    while (next < imageURLs.length && !failure) {
      const url = imageURLs[next++];
      if (existing.has(url)) continue;
      const cached = await findReleaseResponse(new Request(url));
      const response = cached || await fetch(new Request(url, {cache:'no-cache'}));
      if (!response.ok) throw new Error('Не удалось загрузить изображения: HTTP ' + response.status + '. Повторите загрузку.');
      try { await cache.put(url, response); }
      catch (error) {
        if (error.name === 'QuotaExceededError') throw new Error('Недостаточно места в браузере. Освободите место и повторите загрузку изображений.');
        throw error;
      }
      imageProgress++;
      if (imageProgress % 20 === 0 || imageProgress === imageURLs.length) await progress();
    }
   } catch (error) { failure = failure || error; }
  }));
  if (failure) throw failure;
}

self.addEventListener('message', event => {
  const message = event.data || {};
  const reply = data => event.ports[0]?.postMessage(data);
  if (message.type === 'BCF_CLIENT_RELEASE') {
    if (event.source?.id && typeof message.release === 'string') clientReleases.set(event.source.id, message.release);
    event.waitUntil(cleanOldReleases());
  }
  if (message.type === 'BCF_STATUS') event.waitUntil(status(message.repair === true).then(reply));
  if (message.type === 'BCF_APPLY_UPDATE') {
    reply({ok:true});
    event.waitUntil(self.skipWaiting());
  }
  if (message.type === 'BCF_PREPARE_IMAGES') {
    if (!imageDownload) {
      imageDownload = downloadImages().catch(error => {
        downloadError = error.message || 'Не удалось сохранить изображения. Проверьте подключение и свободное место.';
      }).finally(async () => {
        imageDownload = null;
        await broadcast({type:'BCF_IMAGES_PROGRESS', ...(await status())});
      });
    }
    event.waitUntil(imageDownload.then(async () => reply(await status())));
  }
});
