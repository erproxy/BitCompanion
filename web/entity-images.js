import { entityImageIndex } from './data/entity-images.js';
import { assetUrl } from './runtime-config.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sizes=new Set(['sm','md','lg']);
const imageRoot=assetUrl('assets/bitcraft/');
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

// The skill table stores font glyphs. These local items illustrate the skills in the catalogue.
const skillItems = Object.freeze({
 1:12000, 2:11014, 3:11015, 4:11016, 5:11017, 6:11018, 7:11026, 8:11019, 9:11020, 10:11021,
 11:11022, 12:11023, 13:1170001, 14:11025, 15:1210006, 17:1012948676, 18:194332661, 19:1, 21:130, 22:873292785
});

export function skillImageKey(id) {
 const key = `skill:${id}`;
 return !resolveEntityImage(key) && Object.hasOwn(skillItems,id) ? `item:${skillItems[id]}` : key;
}

/** Resolves typed entities and rarity families without network access or guessed asset paths. */
export function resolveEntityImage(entityOrKey,quantity=1){
 const key=typeof entityOrKey==='string'?entityOrKey:entityOrKey?.key;
 if(typeof key!=='string'||!Object.hasOwn(entityImageIndex.images,key))return null;
 const image=entityImageIndex.images[key];
 if(!image)return null;
 let file=image.file;
 for(const variant of image.variants||[])if(quantity>=variant.minQuantity)file=variant.file;
 return imageRoot+file;
}

/** Decorative illustration; the neighbouring entity name remains the accessible label. */
export function entityImage(entityOrKey,{size='sm',quantity=1,className=''}={}){
 const key=typeof entityOrKey==='string'?entityOrKey:entityOrKey?.key||'';
 const url=resolveEntityImage(key,quantity);
 const dimension={sm:28,md:44,lg:68}[size]||28;
 const fallback='<svg class="entity-image-fallback" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 5v9l-9 5-9-5V8l9-5Z M3 8l9 5 9-5 M12 13v9 M7 5l9 5"/></svg>';
 return `<span class="entity-image entity-image-${sizes.has(size)?size:'sm'}${className?' '+escape(className):''}" data-entity-key="${escape(key)}" aria-hidden="true">${url?`<img src="${escape(url)}" data-entity-image="${escape(key)}" width="${dimension}" height="${dimension}" alt="" aria-hidden="true" loading="lazy" decoding="async">`:''}${fallback}</span>`;
}

// The fallback is already in the same fixed-size container. Removing a failed
// image avoids broken-image glyphs and never retries a missing file or a CDN.
if(typeof document!=='undefined')document.addEventListener('error',event=>{
 const image=event.target;
 if(image?.matches?.('img[data-entity-image]'))image.remove();
},true);
