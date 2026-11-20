import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const archive=path.join(root,'data/bitcraft/icons');
const output=path.join(root,'web/assets/bitcraft');
const indexPath=path.join(root,'web/data/entity-images.js');
const check=process.argv.includes('--check');
const hash=value=>createHash('sha256').update(value).digest('hex');
const read=name=>JSON.parse(fs.readFileSync(path.join(archive,name),'utf8'));
const manifest=read('manifest.json'),bindings=read('bindings.json');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'web/data/recipe-catalog.json'),'utf8'));
if(manifest.dataSnapshot?.commit!==bindings.dataCommit||bindings.dataCommit!==catalog.source?.commit)throw Error('Icon package and catalogue refer to different data snapshots.');

// SilkenHexmoths is a fully transparent image in this archive. It is shared by several quest resources.
const transparentImageHash='50a5b97d338baf2d4c706e9f8e77816b2cfabcd3ab0873da91589227cf458c5c';
const images={},unavailable={},files={};
function projectedAsset(assetKey){
 const asset=manifest.assets[assetKey];
 if(asset?.status!=='downloaded')return null;
 if(!/^files\/[a-f0-9]{2}\/[a-f0-9]{64}\.webp$/.test(asset.file))throw Error(`Invalid archived image path: ${asset.file}`);
 const source=path.join(archive,asset.file),content=fs.readFileSync(source);
 if(content.length!==asset.bytes||hash(content)!==asset.sha256)throw Error(`Source image integrity failed: ${asset.file}`);
 if(!(asset.width>0&&asset.height>0))throw Error(`Invalid image dimensions: ${asset.file}`);
 if(!files[asset.file])files[asset.file]={sha256:asset.sha256,bytes:asset.bytes,width:asset.width,height:asset.height};
 return asset.sha256===transparentImageHash?null:asset.file;
}
for(const key of Object.keys(bindings.byEntity).sort()){
 const record=bindings.records[bindings.byEntity[key]];
 const file=record?.assetKey?projectedAsset(record.assetKey):null;
 if(!file){
  unavailable[key]=manifest.assets[record?.assetKey]?.sha256===transparentImageHash?'transparent':record?.status||'unbound';
  continue;
 }
 const entry={file};
 const variants=(record.variants||[]).map(variant=>({minQuantity:variant.minQuantity,file:projectedAsset(variant.assetKey)})).filter(v=>v.file&&Number.isFinite(v.minQuantity));
 if(variants.length)entry.variants=variants.sort((a,b)=>a.minQuantity-b.minQuantity);
 images[key]=entry;
}
for(const entity of catalog.entities){
 if(entity.type!=='family')continue;
 const representative=[entity.key.replace(/^family:/,''),...(entity.members||[])].find(key=>images[key]);
 if(representative)images[entity.key]={...images[representative],representative};
 else unavailable[entity.key]='unbound-family';
}
const index={formatVersion:1,dataCommit:bindings.dataCommit,downloadedAt:manifest.downloadedAt,source:{baseUrl:manifest.source.baseUrl,manifestSha256:hash(fs.readFileSync(path.join(archive,'manifest.json'))),bindingsSha256:hash(fs.readFileSync(path.join(archive,'bindings.json')))},images,unavailable,files};
const moduleText='// Generated offline by scripts/build-entity-images.mjs. Do not edit by hand.\nexport const entityImageIndex = '+JSON.stringify(index)+';\n';
if(check){
 if(!fs.existsSync(indexPath)||fs.readFileSync(indexPath,'utf8')!==moduleText)throw Error('Embedded image index is stale. Run node scripts/build-entity-images.mjs.');
 for(const [file,asset]of Object.entries(files)){
  const content=fs.readFileSync(path.join(output,file));
  if(content.length!==asset.bytes||hash(content)!==asset.sha256)throw Error(`Embedded image integrity failed: ${file}`);
 }
}else{
 fs.mkdirSync(path.dirname(indexPath),{recursive:true});
 for(const file of Object.keys(files)){
  const destination=path.join(output,file);fs.mkdirSync(path.dirname(destination),{recursive:true});
  fs.copyFileSync(path.join(archive,file),destination);
 }
 fs.writeFileSync(indexPath,moduleText);
}
const bytes=Object.values(files).reduce((sum,file)=>sum+file.bytes,0);
console.log(`PASS: ${Object.keys(images).length} entity image bindings, ${Object.keys(files).length} local WebP files, ${bytes.toLocaleString('en-US')} bytes; ${check?'embedded projection and source hashes verified':'offline projection generated'}.`);
