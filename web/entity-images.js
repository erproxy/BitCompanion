import { entityImageIndex } from './data/entity-images.js';
import { assetUrl } from './runtime-config.js';
import { catalogIcon } from './catalog-icons.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sizes=new Set(['sm','md','lg']);
const imageRoot=assetUrl('assets/bitcraft/');
const catalogArtwork=assetUrl('icons/catalog.svg');
const remoteIndex=entityImageIndex.remote;
const failedRemoteImages=new Set();
export const hasGameImages=Object.keys(entityImageIndex.images).length>0;

export const DROP_ENTITY_KEYS=Object.freeze({
 'rangifer-antler':'item:400827528',
 'preserved-mushroom':'item:1155509503',
 'berserker-mushroom':'item:1498621368',
 'trask-scale':'item:822614926',
 'lobster-chitin-t4':'item:496741270',
 'lobster-chitin-t6':'item:496741270',
 'hexite-chitin':'item:1118112344',
 'coralith':'item:1589679052',
 'ancient-connector':'item:11'
});

// The skill table stores font glyphs. These items can illustrate the skills in the catalogue.
const skillItems = Object.freeze({
 1:12000, 2:11014, 3:11015, 4:11016, 5:11017, 6:11018, 7:11026, 8:11019, 9:11020, 10:11021,
 11:11022, 12:11023, 13:1170001, 14:11025, 15:1210006, 17:1012948676, 18:194332661, 19:1, 21:130, 22:873292785
});

export function skillImageKey(id) {
 const key = `skill:${id}`;
 return !resolveEntityImage(key) && Object.hasOwn(skillItems,id) ? `item:${skillItems[id]}` : key;
}

function findImage(entityOrKey, quantity) {
 const key = typeof entityOrKey === 'string' ? entityOrKey : entityOrKey?.key;
 if (typeof key !== 'string') return null;
 const local = Object.hasOwn(entityImageIndex.images, key) && entityImageIndex.images[key];
 if (local) {
  let file = local.file;
  for (const variant of local.variants || []) if (quantity >= variant.minQuantity) file = variant.file;
  return { url: imageRoot + file, remote: false };
 }
 if (!remoteIndex) return null;
 const images = remoteIndex.images;
 const candidates = key.startsWith('family:')
  ? [key, key.slice('family:'.length), ...(entityOrKey?.members ?? [])]
  : [key];
 const match = candidates.find(candidate => Object.hasOwn(images, candidate));
 if (!match) return null;
 const url = new URL(images[match], remoteIndex.baseUrl).href;
 return failedRemoteImages.has(url) ? null : { url, remote: true };
}

/** Resolves an indexed image, without starting any network requests. */
export function resolveEntityImage(entityOrKey, quantity = 1) {
 return findImage(entityOrKey, quantity)?.url ?? null;
}

/** Decorative illustration; the neighbouring entity name remains the accessible label. */
export function entityImage(entityOrKey,{size='sm',quantity=1,className=''}={}){
 const entity=typeof entityOrKey==='string'?{key:entityOrKey}:entityOrKey||{};
 const key=entity.key||'';
 const image=findImage(entity,quantity);
 const dimension={sm:28,md:44,lg:68}[size]||28;
 const tier=Number.isInteger(entity.tier)&&entity.tier>=1&&entity.tier<=10? " data-entity-tier=\""+entity.tier+"\"":"";
 const fallback=`<svg class="entity-image-fallback" viewBox="0 0 32 32" focusable="false" aria-hidden="true"><use href="${escape(catalogArtwork)}#${catalogIcon(entity)}"/></svg>`;
 let picture='';
 if(image){
  const source=image.remote
   ? `data-remote-src="${escape(image.url)}" referrerpolicy="no-referrer" fetchpriority="low"`
   : `src="${escape(image.url)}"`;
  picture=`<img ${source} data-entity-image="${escape(key)}" width="${dimension}" height="${dimension}" alt="" aria-hidden="true" loading="lazy" decoding="async">`;
 }
 return `<span class="entity-image entity-image-${sizes.has(size)?size:'sm'}${image?.remote?' entity-image-remote':''}${className?' '+escape(className):''}" data-entity-key="${escape(key)}"${tier} aria-hidden="true">${picture}${fallback}</span>`;
}

const pendingImage = 'img[data-remote-src]:not([src])';

function visitPendingImages(root, visit) {
 if (root.nodeType !== Node.ELEMENT_NODE) return;
 if (root.matches(pendingImage)) visit(root);
 root.querySelectorAll(pendingImage).forEach(visit);
}

function installRemoteLoading() {
 const start = image => {
  if (!image.isConnected) return;
  const url = image.dataset.remoteSrc;
  if (failedRemoteImages.has(url)) image.remove();
  else image.src = url;
 };
 const viewport = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
  for (const { isIntersecting, target } of entries) {
   if (!isIntersecting) continue;
   viewport.unobserve(target);
   start(target);
  }
 }) : null;
 const observe = viewport ? image => viewport.observe(image) : start;
 const unobserve = viewport ? image => viewport.unobserve(image) : null;

 // The catalogue replaces sections as the user filters and navigates.
 const changes = new MutationObserver(records => {
  for (const { addedNodes, removedNodes } of records) {
   if (unobserve) for (const root of removedNodes) visitPendingImages(root, unobserve);
   for (const root of addedNodes) if (root.isConnected) visitPendingImages(root, observe);
  }
 });
 changes.observe(document.documentElement, { childList: true, subtree: true });
 visitPendingImages(document.documentElement, observe);

 document.addEventListener('load', event => {
  const image = event.target;
  if (image?.matches?.('img[data-remote-src]')) image.setAttribute('data-image-ready', '');
 }, true);
 window.addEventListener('online', () => failedRemoteImages.clear());
}

if (typeof document !== 'undefined') {
 document.addEventListener('error', event => {
  const image = event.target;
  if (!image?.matches?.('img[data-entity-image]')) return;
  if (image.dataset.remoteSrc) {
   if (!image.hasAttribute('src')) return;
   failedRemoteImages.add(image.dataset.remoteSrc);
  }
  image.remove();
 }, true);
 if (remoteIndex) installRemoteLoading();
}
