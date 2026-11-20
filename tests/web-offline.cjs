const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {launchBrowser, browserName} = require('./browser-runtime.cjs');

// Exercises the real worker/runtime against small immutable release fixtures.
// Every run uses a new browser context and a temporary loopback origin.
(async () => {
  if (browserName !== 'chromium') {
    console.log('SKIP web-offline: this service-worker lifecycle suite requires Chromium.');
    return;
  }
  const template = await fs.readFile(path.resolve(__dirname, '../web/sw.js'), 'utf8');
  const modules = new Map(await Promise.all(['web-platform.js', 'i18n.js', 'messages-en.js'].map(async file =>
    [file, await fs.readFile(path.resolve(__dirname, '../web', file), 'utf8')])));
  const prefix = '/companion/';
  let release = 'one', brokenCore = false, brokenImage = false;
  const imageRequests = [];
  const imageCount = 206;
  const list = version => Array.from({length:imageCount}, (_, i) => `releases/${version}/assets/bitcraft/${i}.webp`);
  const core = version => ['shell.html', ...modules.keys(), 'runtime-config.js', 'data/catalog.json', 'assets/bitcraft/0.webp']
    .map(file => `releases/${version}/${file}`);
  const shell = version => `<!doctype html><meta charset="utf-8"><h1 id="release">${version}</h1>
    <script type="module">import * as platform from './releases/${version}/web-platform.js';
    window.platform=platform; await platform.initWebPlatform(()=>{});window.platformInitialized=true;</script>`;
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    let body, type = 'text/javascript';
    if (url.pathname === prefix || url.pathname === prefix + 'index.html' || url.pathname === prefix + 'online.html') {
      body = shell(release); type = 'text/html';
    } else if (url.pathname === prefix + 'sw.js') {
      body = `const RELEASE=${JSON.stringify(release)};const RELEASE_BASE=${JSON.stringify(`releases/${release}/`)};
        const CORE=${JSON.stringify(core(release))};const IMAGE_FILES=${JSON.stringify(list(release))};\n` + template;
    } else {
      const match = url.pathname.match(/^\/companion\/releases\/([^/]+)\/(.+)$/);
      if (match) {
        const [, version, file] = match;
        if (file === 'shell.html') { body = shell(version); type = 'text/html'; }
        if (modules.has(file)) body = modules.get(file);
        if (file === 'runtime-config.js') body = `export const runtimeConfig={release:${JSON.stringify(version)},assetBase:new URL('./',import.meta.url).href};export const appBase=new URL('../../',import.meta.url).href;`;
        if (file === 'data/catalog.json' && !(brokenCore && version === release)) { body = '{"fixture":true}'; type = 'application/json'; }
        if (/^assets\/bitcraft\/\d+\.webp$/.test(file)) {
          imageRequests.push({version, file});
          if (!(brokenImage && file.endsWith('/205.webp'))) { body = Buffer.from([1, 2, 3]); type = 'image/webp'; }
        }
      }
    }
    response.writeHead(body == null ? 404 : 200, {'Content-Type':type, 'Cache-Control':'no-store'});
    response.end(body == null ? 'Not found' : body);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}${prefix}`;
  let browser, context;
  try {
    browser = await launchBrowser();
    // A first installation with one unavailable core file must settle as an
    // error and recover on the online event without a navigation or new tab.
    const initialContext = await browser.newContext({ locale: 'ru-RU', serviceWorkers:'allow'});
    try {
      brokenCore = true;
      const initial = await initialContext.newPage();
      await initial.goto(base);
      await initial.waitForFunction(() => window.platformInitialized &&
        !window.platform.getWebPlatformState().ready && !!window.platform.getWebPlatformState().error);
      await initial.evaluate(() => {window.initialIdentity='same-document';});
      await initialContext.setOffline(true);
      brokenCore = false;
      await initialContext.setOffline(false);
      await initial.waitForFunction(() => window.platform.getWebPlatformState().ready);
      assert.equal(await initial.evaluate(() => window.initialIdentity), 'same-document', 'Initial-install recovery does not reload the page');
      assert.equal(await initial.evaluate(() => window.platform.getWebPlatformState().error), '');
    } finally { brokenCore = false; await initialContext.close(); }
    imageRequests.length = 0;
    context = await browser.newContext({ locale: 'ru-RU', serviceWorkers:'allow'});
    const page = await context.newPage();
    const waitReady = () => page.waitForFunction(() => window.platform?.getWebPlatformState().ready);
    const state = () => page.evaluate(() => window.platform.getWebPlatformState());
    const cacheKeys = suffix => page.evaluate(async suffix => {
      const name = (await caches.keys()).find(name => name.endsWith(suffix));
      return name ? (await (await caches.open(name)).keys()).map(request => request.url) : [];
    }, suffix);
    const send = (type, payload = {}) => page.evaluate(({type, payload}) => new Promise(resolve => {
      const channel = new MessageChannel(); channel.port1.onmessage = event => resolve(event.data);
      navigator.serviceWorker.controller.postMessage({type, ...payload}, [channel.port2]);
    }), {type, payload});
    const image = index => `${base}releases/one/assets/bitcraft/${index}.webp`;
    await page.goto(base);
    await waitReady();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    assert.equal(await page.locator('#release').textContent(), 'one');
    assert.ok(imageRequests.length <= 1, 'Initial install only fetches the core preset image');
    assert.equal((await cacheKeys('images:one')).length, 0, 'No full image precache');
    await page.evaluate(() => localStorage.setItem('bitcraft-companion-v1', '{"version":1,"fixture":"preserve"}'));

    await context.setOffline(true);
    await page.reload(); await waitReady();
    assert.equal(await page.locator('#release').textContent(), 'one', 'Application shell survives offline reload');
    assert.equal(await page.evaluate(async url => (await fetch(url)).ok, `${base}releases/one/data/catalog.json`), true);
    assert.equal(await page.evaluate(async url => {try {return (await fetch(url)).ok;} catch {return false;}}, image(1)), false,
      'An unseen image remains unavailable until fetched or explicitly saved');
    await context.setOffline(false);
    await page.evaluate(async url => {await fetch(url);}, image(1));
    await page.waitForFunction(async () => (await caches.keys()).some(name => name.endsWith('images:one')));
    await context.setOffline(true);
    await page.waitForFunction(async url => {try {return (await fetch(url)).ok;} catch {return false;}}, image(1));
    await context.setOffline(false);

    // Simulate browser quota rejection within the isolated worker, then retry.
    const worker = context.serviceWorkers()[0];
    await worker.evaluate(() => {
      self.originalCachePut = Cache.prototype.put;
      Cache.prototype.put = function () {return Promise.reject(new DOMException('test quota', 'QuotaExceededError'));};
    });
    await page.evaluate(() => window.platform.prepareOfflineImages());
    assert.match((await state()).error, /Недостаточно места/);
    assert.equal((await state()).downloading, false, 'A quota failure completes the operation');
    await worker.evaluate(() => {Cache.prototype.put = self.originalCachePut;});

    brokenImage = true;
    await page.evaluate(() => window.platform.prepareOfflineImages());
    const partial = await state();
    assert.match(partial.error, /HTTP 404/);
    assert.ok(partial.completed > 0 && partial.completed < partial.total, 'Incomplete image package is reported accurately');
    brokenImage = false;
    await page.evaluate(() => window.platform.prepareOfflineImages());
    assert.equal((await state()).completed, imageCount);
    assert.equal((await state()).error, '');
    await context.setOffline(true);
    assert.equal(await page.evaluate(async url => (await fetch(url)).ok, image(205)), true, 'Explicit full package works offline');
    await context.setOffline(false);

    // An evicted catalog leaves enough shell to reopen offline, but readiness
    // must turn false. Reconnection repairs it even when SW bytes do not change.
    await context.setOffline(true);
    await page.evaluate(async base => {
      const name = (await caches.keys()).find(key => key.endsWith('core:one'));
      await (await caches.open(name)).delete(`${base}releases/one/data/catalog.json`);
    }, base);
    assert.equal((await send('BCF_STATUS')).ready, false);
    await page.reload();
    await page.waitForFunction(() => window.platformInitialized &&
      !window.platform.getWebPlatformState().ready && !!window.platform.getWebPlatformState().error);
    await page.evaluate(() => {window.repairIdentity='same-document';});
    await context.setOffline(false);
    await waitReady();
    assert.equal(await page.evaluate(() => window.repairIdentity), 'same-document', 'Core repair does not reload the document');
    assert.equal((await send('BCF_STATUS')).ready, true);
    assert.equal((await state()).error, '');

    const stale = await context.newPage(); await stale.goto(base);
    await stale.waitForFunction(() => window.platform?.getWebPlatformState().ready);
    const updateTo = async version => {
      release = version;
      await page.evaluate(async () => {await (await navigator.serviceWorker.getRegistration()).update();});
      await page.waitForFunction(() => window.platform.getWebPlatformState().updateAvailable);
    };
    await updateTo('two');
    assert.equal(await page.locator('#release').textContent(), 'one', 'A waiting update never changes the open page');
    await page.reload(); await waitReady();
    assert.equal(await page.locator('#release').textContent(), 'one', 'Navigation remains pinned until an explicit update');
    await page.goto(base + 'online.html'); await waitReady();
    assert.equal(await page.locator('#release').textContent(), 'two', 'The online entry loads the new release while the old worker is active');
    assert.equal(await page.evaluate(() => localStorage.getItem('bitcraft-companion-v1')), '{"version":1,"fixture":"preserve"}');
    await Promise.all([page.waitForNavigation(), page.evaluate(() => window.platform.applyWebUpdate())]);
    await page.goto(base);
    await waitReady();
    assert.equal(await page.locator('#release').textContent(), 'two');
    assert.equal(await page.evaluate(() => localStorage.getItem('bitcraft-companion-v1')), '{"version":1,"fixture":"preserve"}');
    assert.equal(await stale.locator('#release').textContent(), 'one', 'Other tabs keep their current release');

    release = 'broken'; brokenCore = true;
    await page.evaluate(async () => {await (await navigator.serviceWorker.getRegistration()).update();});
    await page.waitForFunction(async () => !(await navigator.serviceWorker.getRegistration()).installing);
    assert.equal(await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting), false,
      'An incomplete core never becomes an available update');
    assert.equal((await cacheKeys('core:broken')).length, 0, 'Failed install cache is removed');
    brokenCore = false;

    await updateTo('four');
    await Promise.all([page.waitForNavigation(), page.evaluate(() => window.platform.applyWebUpdate())]);
    await waitReady();
    await context.setOffline(true);
    assert.equal(await stale.evaluate(async url => (await fetch(url)).ok, `${base}releases/one/data/catalog.json`), true,
      'A live stale tab keeps its original release assets after two updates');
    assert.ok((await cacheKeys('core:one')).length > 0, 'The live stale release is retained');
    await context.setOffline(false);

    // New release images use the bounded on-demand cache, not the full cache.
    await page.evaluate(async base => {
      for (let i = 1; i < 206; i++) await fetch(`${base}releases/four/assets/bitcraft/${i}.webp`);
    }, base);
    await page.waitForFunction(async () => {
      const key = (await caches.keys()).find(name => name.endsWith('images:four'));
      return key && (await (await caches.open(key)).keys()).length === 200;
    });
    assert.ok((await cacheKeys('images:four')).length <= 200, 'On-demand image cache is bounded');
    await stale.close();
    await page.evaluate(() => navigator.serviceWorker.controller.postMessage({type:'BCF_CLIENT_RELEASE', release:'four'}));
    await page.waitForFunction(async () => !(await caches.keys()).some(name => name.endsWith('core:one')));
    console.log('PASS web-offline: initial-install/eviction recovery online without reload, offline core, explicit images/quota/retry, bounded cache, atomic update and live stale tabs.');
  } finally {
    await context?.close(); await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
