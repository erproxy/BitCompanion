import { t as tr } from './i18n.js';
import { gameSearch, searchable } from './catalog-language.js';
import { setProductionTarget } from './recipe-domain.js';
/** Resource catalogue: a projection of the bundled, dated recipe book. */
export const RESOURCE_MODES = Object.freeze({game:'Игровые ресурсы',buildings:'Постройки',creatures:'Существа',custom:'Мои рецепты'});
export const RESOURCE_CATEGORIES = Object.freeze([
 ['metal','Руда и металлы'],['wood','Дерево'],['stone','Камень, глина и стекло'],
 ['textile','Волокно и ткани'],['animal','Кожа и животные материалы'],
 ['plants','Растения и урожай'],['fishing','Рыба и морские материалы'],
 ['gems','Самоцветы'],['other','Другие материалы']
]);
export const CREATURE_CATEGORIES = Object.freeze({'Huntable Animal':'Промысловые животные',Monster:'Монстры'});

export function resourceModeForKey(key=''){
 if(key.startsWith('building:'))return 'buildings';
 if(key.startsWith('enemy:'))return 'creatures';
 return 'game';
}

export function setResourceMode(state,mode){
 if(state.mode!==mode&&mode!=='custom'){
  Object.assign(state,{search:'',tier:'',page:0,stationPage:0});
  if(resourceModeForKey(state.targetKey)!==mode)setProductionTarget(state,'');
 }
 state.mode=mode;
}

const EQUIPMENT_TAG = /(?:\btool\b|armor|clothing|weapon|jewelry|trinket|cosmetic|deed|furniture|dungeon equipment|\bboat\b|vehicle|market kit|banking kit|settlement foundation|quest|outpost research|journal|codex|deployable|tamed animal|^animal$|^monster$)/i;
const SOURCE_KINDS = new Set(['extraction','resource-destroy','enemy','chest','growth','terraform']);
const ROUTE_KINDS = new Set(['crafting','conversion','construction','placement']);

export function resourceCategory(entity) {
 const tag=String(entity?.tag||'').toLowerCase(),name=String(entity?.name||'').toLowerCase();
 if(/gem|geode|crystal/.test(tag))return 'gems';
 if(/ore|ingot|metal|nail|scrap|flux/.test(tag))return 'metal';
 if(/wood|trunk|timber|plank|bark|stick|roots|tree seed/.test(tag))return 'wood';
 if(/rock|stone|pebble|brick|clay|sand|glass|chunk/.test(tag))return 'stone';
 if(/cloth|thread|rope|filament|fiber|tarp|sheeting/.test(tag))return 'textile';
 if(/fish|lobster|crab|shell|coral|chum|bait|seaweed|kelp/.test(tag)||/lobster|coralith/.test(name))return 'fishing';
 if(/leather|pelt|hide|tannin|meat|bone|antler|chitin|feather|animal/.test(tag))return 'animal';
 if(/grain|seed|vegetable|plant|fertilizer|berry|flower|mushroom|crop|fruit|tea/.test(tag))return 'plants';
 // Packages have a generic source tag. Their names still identify the material.
 if(tag==='package')return resourceCategory({...entity,tag:name.replace('package','')});
 return 'other';
}

/** Include items with a real material use/source and exclude equipment by source tag. */
export function createResourceIndex(book) {
 if(!book?.entitiesByKey||!book?.catalog?.recipes)throw new TypeError(tr("Нужна загруженная рецептурная книга."));
 const candidates=new Set(),originRecipes=new Map(),stationRecipes=new Map(),functionNames=new Map();
 for(const recipe of book.catalog.recipes){
  if(recipe.internalResolver)continue;
  if(ROUTE_KINDS.has(recipe.kind))for(const stack of recipe.ingredients||[])if(stack.quantity>0)candidates.add(stack.key);
  if(SOURCE_KINDS.has(recipe.kind))for(const stack of [...(recipe.outputs||[]),...(recipe.possibleOutputs||[])])if(stack.quantity>0)candidates.add(stack.key);
  for(const origin of recipe.origins||[]){if(!originRecipes.has(origin.key))originRecipes.set(origin.key,[]);originRecipes.get(origin.key).push(recipe);}
  const station=recipe.requirements?.station;
  if(station){
   if(station.name)functionNames.set(String(station.id),station.name);
   for(const building of station.buildings||[]){if(!stationRecipes.has(building.key))stationRecipes.set(building.key,[]);stationRecipes.get(building.key).push(recipe);}
  }
 }
 const materials=[],nodes=[],buildings=[],creatures=[],buildingFunctions=new Map();
 for(const entity of book.entitiesByKey.values()){
  if(entity.visible===false)continue;
  if(entity.type==='building'){
   const functions=(entity.functions||[]).map(f=>({...f,name:f.name||functionNames.get(String(f.type))||tr("Функция № {0}", f.type)}));
   for(const f of functions)buildingFunctions.set(String(f.type),f.name);
   buildings.push({...entity,functions});continue;
  }
  if(entity.type==='resource'){nodes.push({...entity,category:resourceCategory(entity)});continue;}
  if(entity.type==='enemy'){
   if(entity.name!=='Practice Dummy')creatures.push(entity);
   continue;
  }
  if(!['item','cargo'].includes(entity.type)||entity.itemListId||entity.familyKey||!candidates.has(entity.key))continue;
  if(EQUIPMENT_TAG.test(entity.tag||'')||/^developer\b/i.test(entity.name))continue;
  materials.push({...entity,category:resourceCategory(entity)});
 }
 const byKey=new Map([...materials,...nodes,...buildings,...creatures].map(entity=>[entity.key,entity]));
 const compare=(a,b)=>a.name.localeCompare(b.name,'en')||(a.tier||0)-(b.tier||0)||a.key.localeCompare(b.key);
 materials.sort(compare);nodes.sort(compare);buildings.sort(compare);creatures.sort(compare);
 const buildingCategories=[...buildingFunctions].sort((a,b)=>a[1].localeCompare(b[1],'en'));
 if(buildings.some(entity=>!entity.functions.length))buildingCategories.push(['none',"Без указанной функции"]);
 return {book,materials,nodes,buildings,creatures,buildingCategories,byKey,originRecipes,stationRecipes};
}

export function filterResources(index,{search='',tier='',category='',showNodes=false,mode='game',buildingCategory='',creatureCategory=''}={}){
 const terms=searchable(search).trim().split(/\s+/).filter(Boolean);
 if(mode==='creatures')return index.creatures.filter(entity=>{
  if(tier&&String(entity.tier)!==String(tier))return false;
  if(creatureCategory&&entity.tag!==creatureCategory)return false;
  const text=gameSearch(entity.name,entity.tag,CREATURE_CATEGORIES[entity.tag],entity.key,'T'+entity.tier);
  return terms.every(term=>text.includes(term));
 });
 const aliases={metal:"руда металл слиток металлы",wood:"дерево древесина бревно доски",stone:"камень глина песок стекло",textile:"ткань волокно нить верёвка",animal:"кожа шкура кость рог",plants:"растения семена зерно урожай",fishing:"рыба море ракушка хитин",gems:"самоцвет кристалл геода",other:"материалы"};
 return(mode==='buildings'?index.buildings:showNodes?index.nodes:index.materials).filter(entity=>{
  if(mode==='buildings'){
   // A building may expose several functions at different levels. Both filters
   // must match the same function; this does not invent an overall building tier.
   if(buildingCategory==='none'){
    if(entity.functions.length||tier)return false;
   }else if((tier||buildingCategory)&&!entity.functions.some(f=>(!tier||String(f.tier)===String(tier))&&(!buildingCategory||String(f.type)===buildingCategory)))return false;
  }else{
   if(tier&&String(entity.tier)!==String(tier))return false;
   if(category&&entity.category!==category)return false;
  }
  const functionNames=mode==='buildings'?entity.functions.flatMap(f=>[f.name,f.tier>0?'T'+f.tier:'']):[];
  const text=gameSearch(entity.name,entity.tag,entity.key,entity.tier>0?'T'+entity.tier:'',...functionNames,mode==='buildings'?'постройка здание building':aliases[entity.category]);
  return terms.every(term=>text.includes(term));
 });
}

export function resourceProfile(index,key){
 const entity=index.byKey.get(key)||index.book.entitiesByKey.get(key)||{key,name:key,type:String(key).split(':')[0]};
 const isNode=entity.type==='resource',isBuilding=entity.type==='building',isCreature=entity.type==='enemy';
 const direct=(isNode||isCreature?index.originRecipes:index.book.recipesProducing).get(key)||[];
 const methods=direct.filter(recipe=>!recipe.internalResolver);
 const uses=(index.book.recipesConsuming.get(key)||[]).filter(recipe=>!recipe.internalResolver);
 const stationUses=isBuilding?(index.stationRecipes.get(key)||[]):[];
 return {entity,isNode,isBuilding,isCreature,methods,uses,stationUses};
}

export function defaultResourceKey(index,mode='game'){
 if(mode==='buildings')return index.buildings.find(entity=>entity.key==='building:1014')?.key||index.buildings[0]?.key||'';
 if(mode==='creatures')return index.creatures[0]?.key||'';
 return index.materials.find(entity=>entity.name==='Rathium Ingot'&&entity.tier===6)?.key||index.materials[0]?.key||index.nodes[0]?.key||'';
}
