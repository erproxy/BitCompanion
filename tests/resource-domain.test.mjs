import test from 'node:test';
import { catalogDirectory } from './catalog-fixture.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRecipeBook } from '../web/recipe-domain.js';
import { createResourceIndex, defaultResourceKey, filterResources, resourceCategory, resourceProfile } from '../web/resource-domain.js';

const catalog=JSON.parse(readFileSync(new URL('recipe-catalog.json', catalogDirectory),'utf8'));
const book=createRecipeBook(catalog),index=createResourceIndex(book);

test('resource catalogue contains real materials and visible nodes, independently of equipment',()=>{
 assert.ok(index.materials.length>1000);
 assert.ok(index.nodes.length>500);
 assert.equal(defaultResourceKey(index),'item:6050001');
 for(const key of ['item:6050001','item:6040002','cargo:3005'])assert.ok(index.byKey.has(key),key);
 const rathiumPickaxes=catalog.entities.filter(entity=>entity.name==='Rathium Pickaxe');
 assert.ok(rathiumPickaxes.length>0);
 for(const entity of rathiumPickaxes)assert.equal(index.byKey.has(entity.key),false);
 assert.ok(!index.materials.some(entity=>entity.itemListId||entity.visible===false));
 assert.ok(index.nodes.every(entity=>entity.type==='resource'&&entity.visible!==false));
});

test('material and source keys preserve Item versus Cargo ids',()=>{
 const b=createRecipeBook({entities:[
  {key:'item:1',name:'Ore',tag:'Ore',type:'item',visible:true},
  {key:'cargo:1',name:'Ore Chunk',tag:'Ore Chunk',type:'cargo',visible:true},
  {key:'resource:1',name:'Vein',tag:'Ore Vein',type:'resource',visible:true}
 ],recipes:[{key:'extraction:1',kind:'extraction',name:'Mine',ingredients:[],outputs:[],possibleOutputs:[{key:'cargo:1',quantity:1}],origins:[{key:'resource:1'}]},
 {key:'crafting:1',kind:'crafting',name:'Extract Ore',ingredients:[{key:'cargo:1',quantity:1}],outputs:[{key:'item:1',quantity:1}]},
 {key:'crafting:2',kind:'crafting',name:'Smelt Ore',ingredients:[{key:'item:1',quantity:1}],outputs:[]}]});
 const i=createResourceIndex(b);
 assert.deepEqual(i.materials.map(entity=>entity.key).sort(),['cargo:1','item:1']);
 assert.equal(resourceProfile(i,'item:1').methods[0].key,'crafting:1');
 assert.equal(resourceProfile(i,'cargo:1').methods[0].key,'extraction:1');
 assert.equal(resourceProfile(i,'resource:1').methods[0].key,'extraction:1');
});

test('Rathium processing and world-source links are backed by recipe origins',()=>{
 const ingot=resourceProfile(index,'item:6050001');
 assert.equal(ingot.entity.name,'Rathium Ingot');
 assert.ok(ingot.methods.some(recipe=>recipe.kind==='crafting'&&recipe.ingredients.some(stack=>book.entitiesByKey.get(stack.key)?.name==='Molten Rathium')));
 const node=index.nodes.find(entity=>entity.name==='Large Rathium Vein'&&entity.tier===6);
 assert.ok(node);
 const source=resourceProfile(index,node.key);
 assert.equal(source.isNode,true);
 assert.ok(source.methods.some(recipe=>recipe.kind==='extraction'&&recipe.possibleOutputs.some(stack=>stack.key==='cargo:3005')));
 for(const recipe of source.methods)assert.ok(recipe.origins.some(origin=>origin.key===node.key));
});

test('source fields retain unknown chance semantics without normalizing extraction probability',()=>{
 const sticks=resourceProfile(index,'resource:1');
 const gather=sticks.methods.find(recipe=>recipe.key==='extraction:1');
 assert.ok(gather);
 assert.deepEqual(gather.possibleOutputs[0].probabilityPath,[2]);
 assert.equal(gather.seconds,null);
 assert.equal(gather.outputs.length,0);
 assert.equal(gather.possibleOutputs[0].quantity,1);
});

test('creatures are browsable by type and tier and link to their own loot records',()=>{
 const creatures=filterResources(index,{mode:'creatures',showNodes:true,category:'metal',buildingCategory:'14'});
 assert.equal(creatures.length,catalog.entities.filter(entity=>entity.type==='enemy'&&entity.visible!==false&&entity.name!=='Practice Dummy').length);
 assert.ok(creatures.every(entity=>entity.type==='enemy'));
 assert.equal(defaultResourceKey(index,'creatures'),creatures[0].key);
 assert.ok(!filterResources(index).some(entity=>entity.type==='enemy'));
 const matches=filterResources(index,{mode:'creatures',search:'Rangifer t4',tier:'4',creatureCategory:'Huntable Animal'});
 assert.deepEqual(matches.map(entity=>entity.key),['enemy:9']);
 assert.equal(filterResources(index,{mode:'creatures',search:'Rangifer',creatureCategory:'Monster'}).length,0);
 const rangifer=resourceProfile(index,'enemy:9');
 assert.equal(rangifer.isCreature,true);
 assert.deepEqual(rangifer.methods.map(recipe=>recipe.key),['enemy:9']);
 assert.deepEqual(rangifer.methods[0].possibleOutputs.find(stack=>stack.key==='item:400827528'),{key:'item:400827528',quantity:1,probabilityPath:[0.02]});
 assert.deepEqual(resourceProfile(index,'enemy:42').methods,[]);
});

test('search, tier and category filter materials separately from world nodes',()=>{
 const rathium=filterResources(index,{search:'Rathium',tier:'6',category:'metal'});
 assert.ok(rathium.some(entity=>entity.key==='item:6050001'));
 assert.ok(rathium.every(entity=>entity.tier===6&&entity.category==='metal'&&entity.type!=='resource'));
 const nodes=filterResources(index,{search:'Rathium',tier:'6',category:'metal',showNodes:true});
 assert.ok(nodes.length>0);
 assert.ok(nodes.every(entity=>entity.type==='resource'));
 assert.ok(filterResources(index,{search:'руда T6'}).some(entity=>entity.key==='item:6050001'));
 assert.equal(filterResources(index,{search:'no_such_material_91873'}).length,0);
});

test('service resolvers stay out of acquisition methods and unknown references remain explicit',()=>{
 for(const entity of index.materials.slice(0,100))assert.ok(resourceProfile(index,entity.key).methods.every(recipe=>!recipe.internalResolver));
 const missing=resourceProfile(index,'item:missing');
 assert.equal(missing.entity.name,'item:missing');
 assert.deepEqual(missing.methods,[]);
 assert.equal(missing.isNode,false);
 assert.equal(resourceCategory({tag:'Ingot'}),'metal');
 assert.equal(resourceCategory({tag:'Ore Chunk'}),'metal');
 assert.equal(resourceCategory({tag:'Package',name:'Rathium Ingot Package'}),'metal');
});

test('buildings have their own visible catalogue and function categories',()=>{
 const visible=catalog.entities.filter(entity=>entity.type==='building'&&entity.visible!==false);
 assert.equal(index.buildings.length,visible.length);
 assert.ok(index.buildings.length>800);
 assert.equal(defaultResourceKey(index,'buildings'),'building:1014');
 assert.ok(index.buildings.every(entity=>entity.type==='building'&&entity.visible!==false));
 assert.ok(!index.materials.some(entity=>entity.type==='building'));
 assert.ok(filterResources(index).every(entity=>entity.type!=='building'));
 assert.ok(filterResources(index,{showNodes:true}).every(entity=>entity.type==='resource'));
 for(const hidden of catalog.entities.filter(entity=>entity.type==='building'&&entity.visible===false))assert.equal(index.byKey.has(hidden.key),false,hidden.key);
 assert.ok(index.buildingCategories.some(([key,name])=>key==='14'&&name==='Loom'));
 assert.ok(index.buildingCategories.some(([key])=>key==='none'));
 assert.equal(index.byKey.get('building:1014').tier,null,'a function level is not an overall building tier');
});

test('building search filters actual functions and preserves construction, station and deconstruction references',()=>{
 const looms=filterResources(index,{mode:'buildings',search:'Loom',buildingCategory:'14',tier:'2',category:'metal',showNodes:true});
 assert.deepEqual(looms.map(entity=>entity.key),['building:2014']);
 assert.equal(filterResources(index,{mode:'buildings',search:'постройка T2',buildingCategory:'14'})[0].key,'building:2014');
 const loom=resourceProfile(index,'building:2014');
 assert.equal(loom.isBuilding,true);
 assert.equal(loom.isNode,false);
 assert.ok(loom.entity.functions.some(f=>f.type===14&&f.tier===2&&f.name==='Loom'));
 const construction=loom.methods.find(recipe=>recipe.key==='construction:2019');
 assert.ok(construction);
 assert.equal(construction.seconds,null);
 assert.equal(construction.planEligible,false);
 assert.ok(construction.ingredients.length>0);
 assert.ok(loom.stationUses.length>0);
 assert.ok(loom.stationUses.every(recipe=>recipe.requirements.station.buildings.some(building=>building.key===loom.entity.key)&&!recipe.internalResolver));
 assert.ok(loom.uses.some(recipe=>recipe.kind==='deconstruction'));
 assert.ok(resourceProfile(index,'item:6050001').stationUses.length===0);
 const noFunctions=filterResources(index,{mode:'buildings',buildingCategory:'none'});
 assert.ok(noFunctions.length>0);
 assert.ok(noFunctions.every(entity=>entity.functions.length===0));
 assert.equal(filterResources(index,{mode:'buildings',buildingCategory:'none',tier:'1'}).length,0);
});

test('function and level filters match one function, and named functions need no production recipe',()=>{
 const b=createRecipeBook({entities:[
  {key:'building:1',name:'Workshop',type:'building',visible:true,functions:[{type:10,tier:1,name:'Workbench'},{type:14,tier:3,name:'Loom'}]},
  {key:'building:2',name:'Hidden Workshop',type:'building',visible:false,functions:[{type:99,tier:5,name:'Hidden'}]},
  {key:'building:3',name:'Older Workshop',type:'building',visible:true,functions:[]}
 ],recipes:[
  {key:'construction:1',name:'Upgrade Workshop',kind:'construction',ingredients:[{key:'building:3',quantity:1}],outputs:[{key:'building:1',quantity:1}]},
  {key:'crafting:1',name:'Make Cloth',kind:'crafting',ingredients:[],outputs:[],requirements:{station:{id:14,name:'Loom',buildings:[{key:'building:1'}]}}},
  {key:'conversion:1',name:'Resolve Item 1',kind:'conversion',internalResolver:true,ingredients:[],outputs:[],requirements:{station:{id:99,name:'Hidden',buildings:[{key:'building:1'}]}}}
 ]});
 const i=createResourceIndex(b);
 assert.equal(filterResources(i,{mode:'buildings',buildingCategory:'10',tier:'3'}).length,0);
 assert.deepEqual(filterResources(i,{mode:'buildings',buildingCategory:'14',tier:'3'}).map(entity=>entity.key),['building:1']);
 assert.ok(i.buildingCategories.some(([key,name])=>key==='10'&&name==='Workbench'));
 assert.ok(!i.buildingCategories.some(([key])=>key==='99'));
 const workshop=resourceProfile(i,'building:1');
 assert.deepEqual(workshop.methods[0].ingredients,[{key:'building:3',quantity:1}]);
 assert.equal(resourceProfile(i,'building:3').uses[0].key,'construction:1');
 assert.deepEqual(workshop.stationUses.map(recipe=>recipe.key),['crafting:1']);
});
