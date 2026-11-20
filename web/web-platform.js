import { t as tr } from './i18n.js';
import { appBase, runtimeConfig } from './runtime-config.js';

let registration, initialized, recovering, changed = () => {}, applying = false;
let activeRelease = '';
const watchedRegistrations = new WeakSet(), watchedWorkers = new WeakSet();
const state = {ready:false, updateAvailable:false,
  downloading:false, completed:0, total:0, error:''};

export function getWebPlatformState() {
 const http = /^Не удалось загрузить изображения: HTTP (\d+)\. Повторите загрузку\.$/.exec(state.error);
 return {...state, error: http ? tr("Не удалось загрузить изображения · HTTP {0}. Повторите загрузку.", http[1]) : tr(state.error)};
}
function update(values) { Object.assign(state, values); changed(); }
function send(worker, type, payload = {}, timeout = 15000) {
  return new Promise((resolve, reject) => {
    if (!worker) { reject(new Error("Автономный режим ещё готовится. Повторите действие.")); return; }
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error("Браузер не ответил. Повторите действие.")); }, timeout);
    channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data); };
    worker.postMessage({type, ...payload}, [channel.port2]);
  });
}
function reportRelease() {
  navigator.serviceWorker.controller?.postMessage({type:'BCF_CLIENT_RELEASE', release:runtimeConfig.release});
}
async function refreshStatus() {
  if (!registration?.active) return;
  const result = await send(registration.active, 'BCF_STATUS', {repair:true}, 120000);
  activeRelease = result.release;
  update({...result, updateAvailable:!!registration.waiting || (activeRelease !== runtimeConfig.release)});
  reportRelease();
}

const preparationError = 'Не удалось подготовить автономный режим. При восстановлении интернета загрузка повторится; также можно обновить страницу.';
function watchWorker(worker) {
  if (!worker || watchedWorkers.has(worker)) return;
  watchedWorkers.add(worker);
  const check = () => {
    if (worker.state === 'installed' && registration.waiting) update({updateAvailable:true});
    if (worker.state === 'redundant' && !registration.active) update({ready:false, error:preparationError});
  };
  worker.addEventListener('statechange', check);
  check();
}
function waitForActive() {
  if (registration.active?.state === 'activated') return Promise.resolve();
  const worker = registration.installing || registration.waiting || registration.active;
  if (!worker) return Promise.reject(new Error(preparationError));
  return new Promise((resolve, reject) => {
    const check = () => {
      if (!['activated', 'redundant'].includes(worker.state)) return;
      worker.removeEventListener('statechange', check);
      if (worker.state === 'activated') resolve();
      else reject(new Error(preparationError));
    };
    worker.addEventListener('statechange', check);
    check();
  });
}
function recoverPlatform() {
  if (recovering) return recovering;
  recovering = (async () => {
    try {
      const scope = new URL(appBase);
      registration = await navigator.serviceWorker.register(new URL('sw.js', scope), {
        scope:scope.pathname, updateViaCache:'none'
      });
      if (!watchedRegistrations.has(registration)) {
        watchedRegistrations.add(registration);
        registration.addEventListener('updatefound', () => watchWorker(registration.installing));
      }
      if (registration.active) await registration.update().catch(() => {});
      watchWorker(registration.installing);
      if (registration.waiting) update({updateAvailable:true});
      // A rejected first install has no active registration and never resolves
      // navigator.serviceWorker.ready. Observe this attempt's actual outcome.
      await waitForActive();
      await refreshStatus();
    } catch { update({error:preparationError}); }
    return getWebPlatformState();
  })().finally(() => { recovering = null; });
  return recovering;
}

export function initWebPlatform(onChange) {
  if (typeof onChange === 'function') changed = onChange;
  if (initialized) return initialized;
  initialized = (async () => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) {
      update({error:"Автономный режим требует HTTPS и поддержки Service Worker в браузере."});
      return getWebPlatformState();
    }
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type === 'BCF_REPORT_RELEASE') reportRelease();
      if (event.data?.type === 'BCF_IMAGES_PROGRESS') {
        if (event.data.release === activeRelease) {
          const {downloading, completed, total, error} = event.data;
          update({downloading, completed, total, error});
        }
      }
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      reportRelease();
      if (applying) { window.location.reload(); return; }
      refreshStatus().catch(error => update({error:error.message}));
    });
    // Install this before the first registration attempt so a rejected initial
    // install can recover in the same tab. If a connection changes mid-install,
    // retry after that attempt settles rather than reusing its failed promise.
    window.addEventListener('online', () => {
      const pending = recovering;
      Promise.resolve(pending).then(() => recoverPlatform());
    });
    return recoverPlatform();
  })();
  return initialized;
}

export async function prepareOfflineImages() {
  if (!state.ready || state.downloading) return;
  if (activeRelease !== runtimeConfig.release) {
    update({error:"Сначала примените доступное обновление, затем сохраните изображения."});
    return;
  }
  update({downloading:true, error:''});
  try {
    // Progress is delivered separately. The request timeout covers a slow
    // connection for the explicitly requested full image package.
    const result = await send(registration.active, 'BCF_PREPARE_IMAGES', {}, 30 * 60 * 1000);
    update(result);
  } catch (error) { update({downloading:false, error:error.message}); }
}

export async function applyWebUpdate() {
  if (!state.updateAvailable) return;
  if (!registration?.waiting && activeRelease !== runtimeConfig.release) {
    window.location.reload();
    return;
  }
  try {
    applying = true;
    await send(registration?.waiting, 'BCF_APPLY_UPDATE');
  } catch (error) { applying = false; update({error:error.message}); }
}
