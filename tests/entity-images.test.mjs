import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { entityImageIndex } from '../web/data/entity-images.js';
import { entityImage,resolveEntityImage,DROP_ENTITY_KEYS } from '../web/entity-images.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('every bundled image is a local, unchanged WebP with verified dimensions',()=>{
 for(const [file,meta]of Object.entries(entityImageIndex.files)){
  assert.match(file,/^files\/[a-f0-9]{2}\/[a-f0-9]{64}\.webp$/);
  const content=fs.readFileSync(path.join(root,'web/assets/bitcraft',file));
  assert.equal(content.toString('ascii',0,4),'RIFF');assert.equal(content.toString('ascii',8,12),'WEBP');
  assert.equal(content.length,meta.bytes);
  assert.equal(createHash('sha256').update(content).digest('hex'),meta.sha256);
  assert.ok(meta.width>0&&meta.height>0);
 }
 assert.ok(Object.keys(entityImageIndex.files).length>3000);
});
test('typed keys, families and quantity variants resolve the intended downloaded image',()=>{
 assert.notEqual(resolveEntityImage('item:1'),resolveEntityImage('cargo:1'));
 assert.equal(resolveEntityImage('family:item:1606324183'),resolveEntityImage('item:1606324183'));
 assert.notEqual(resolveEntityImage('item:1',1),resolveEntityImage('item:1',10));
 assert.equal(resolveEntityImage('item:1',10),resolveEntityImage('item:1',499));
 assert.notEqual(resolveEntityImage('item:1',499),resolveEntityImage('item:1',500));
 for(const key of Object.keys(entityImageIndex.images)){
  const url=new URL(resolveEntityImage(key));
  assert.equal(url.protocol,'file:');
  assert.match(url.pathname,/\/web\/assets\/bitcraft\/files\/[a-f0-9]{2}\/[a-f0-9]{64}\.webp$/);
 }
});
test('missing, empty, transparent and glyph bindings render a stable fallback without guessed URLs',()=>{
 for(const status of ['missing','empty','transparent','glyph']){
  const key=Object.keys(entityImageIndex.unavailable).find(key=>entityImageIndex.unavailable[key]===status);
  assert.ok(key,status);assert.equal(resolveEntityImage(key),null);
  const html=entityImage(key);assert.match(html,/entity-image-fallback/);assert.doesNotMatch(html,/<img/);
 }
 assert.equal(resolveEntityImage('item:unknown'),null);
 assert.equal(resolveEntityImage('__proto__'),null);
 assert.match(entityImage('<untrusted>',{className:'" onclick="bad'}),/data-entity-key="&lt;untrusted&gt;"/);
 assert.doesNotMatch(entityImage('item:1'),/https?:\/\//);
});
test('each PDF drop preset has a matching real item icon',()=>{
 const catalog=JSON.parse(fs.readFileSync(path.join(root,'web/data/recipe-catalog.json'),'utf8'));
 const entities=new Map(catalog.entities.map(entity=>[entity.key,entity]));
 assert.equal(Object.keys(DROP_ENTITY_KEYS).length,9);
 for(const key of Object.values(DROP_ENTITY_KEYS)){
  assert.equal(entities.get(key)?.type,'item');assert.ok(resolveEntityImage(key),key);
 }
});
