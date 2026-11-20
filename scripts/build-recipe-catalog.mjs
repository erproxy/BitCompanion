import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildGuideData, guideTables } from './build-guide-data.mjs';
import { buildDungeonData, dungeonTables } from './build-dungeon-data.mjs';
import { buildWorldData, worldTables } from './build-world-data.mjs';
import { buildDropData, dropTables } from './build-drop-data.mjs';

// This is a deterministic, offline projection. Raw tables remain the source.
const root = fileURLToPath(new URL('../', import.meta.url));
const dataRoot = path.join(root, 'data', 'bitcraft');
const manifest = JSON.parse(await readFile(path.join(dataRoot, 'manifest.json'), 'utf8'));
const tables = new Map();
async function readSource(meta) {
  const bytes = await readFile(path.join(dataRoot, meta.path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), meta.sha256, `${meta.table}: SHA-256`);
  return JSON.parse(bytes);
}
async function table(name) {
  if (tables.has(name)) return tables.get(name);
  const meta = manifest.tables.find(t => t.table === name);
  assert.ok(meta, `Missing source table: ${name}`);
  const rows = await readSource(meta);
  assert.equal(rows.length, meta.rows, `${name}: row count`);
  tables.set(name, rows);
  return rows;
}
const names = ['item_desc','cargo_desc','building_desc','resource_desc','enemy_desc','loot_chest_desc','loot_table_desc',
  'item_list_desc','crafting_recipe_desc','item_conversion_recipe_desc','extraction_recipe_desc',
  'construction_recipe_desc','deconstruction_recipe_desc','resource_growth_recipe_desc','resource_placement_recipe_desc','terraform_recipe_desc',
  'building_type_desc','skill_desc','tool_type_desc','secondary_knowledge_desc',...guideTables,...dungeonTables,...worldTables,...dropTables];
const [schema] = await Promise.all([readSource(manifest.schema), ...[...new Set(names)].map(table)]);
const get = name => tables.get(name);
const index = name => new Map(get(name).map(row => [row.id, row]));
const items = index('item_desc'), lists = index('item_list_desc'), buildings = index('building_desc');
const stationTypes = index('building_type_desc'), skills = index('skill_desc'), tools = index('tool_type_desc'), knowledges = index('secondary_knowledge_desc');
const entities = [];
const entitiesByKey = new Map();
function addEntity(entity) { assert.ok(!entitiesByKey.has(entity.key), entity.key); entities.push(entity); entitiesByKey.set(entity.key, entity); return entity; }
for (const [name,type] of [['item_desc','item'],['cargo_desc','cargo'],['building_desc','building'],['resource_desc','resource'],['enemy_desc','enemy'],['loot_chest_desc','chest']]) {
  for (const row of get(name)) {
    const id = row.id ?? row.enemy_type;
    addEntity({ key:`${type}:${id}`, id, type, name:row.name, description:row.description || '', tier:row.tier ?? null,
      rarity:row.rarity || null, tag:row.tag || '', visible:row.compendium_entry ?? row.show_in_compendium ?? true,
      ...(row.item_list_id ? { itemListId:row.item_list_id } : {}),
      ...(type === 'building' ? { functions:row.functions.map(f => ({type:f.function_type,tier:f.level,
        name:stationTypes.get(f.function_type)?.name || `Function ${f.function_type}`,
        category:stationTypes.get(f.function_type)?.category || ''})) } : {}) });
  }
}
function ensure(key) {
  if (!entitiesByKey.has(key)) addEntity({key,type:key.split(':')[0],id:Number(key.split(':')[1]),name:`${key} — missing entry`,description:'',tier:null,rarity:null,tag:'',visible:false,missing:true});
  return key;
}
function stack(s, consumed=false) {
  return {key:ensure(`${String(s.item_type || 'Item').toLowerCase()}:${s.item_id}`),quantity:s.quantity,
    ...(consumed ? {consumptionChance:s.consumption_chance ?? 1} : {})};
}
function aggregate(stacks) {
  const map = new Map();
  for (const s of stacks) if (s.quantity > 0) map.set(s.key,(map.get(s.key)||0)+s.quantity);
  return [...map].map(([key,quantity]) => ({key,quantity}));
}

// Families only combine tangible variants whose name, tier and category agree;
// placeholder items referring to item_lists are never counted as tangible stock.
const families = new Map();
for (const e of entities) if (['item','cargo'].includes(e.type) && !e.itemListId && e.tier > 0) {
  const signature = JSON.stringify([e.type,e.name,e.tier,e.tag]);
  if (!families.has(signature)) families.set(signature,[]);
  families.get(signature).push(e);
}
for (const members of families.values()) {
  if (new Set(members.map(e=>e.rarity)).size < 2) continue;
  members.sort((a,b)=>(a.rarity==='Common'?-1:b.rarity==='Common'?1:0)||a.id-b.id);
  const representative = members[0];
  const key = `family:${representative.key}`;
  addEntity({key,id:representative.id,type:'family',name:representative.name,description:representative.description,
    tier:representative.tier,rarity:'Any',tag:representative.tag,visible:members.some(e=>e.visible),members:members.map(e=>e.key)});
  for (const member of members) member.familyKey = key;
}

function expand(s, seen=new Set(), probabilityPath=[]) {
  const e = entitiesByKey.get(s.key);
  if (!e?.itemListId) return [{...s,probabilityPath}];
  if (seen.has(e.itemListId)) return [{...s,probabilityPath,unresolved:true}];
  const list = lists.get(e.itemListId);
  if (!list) return [{...s,probabilityPath,unresolved:true}];
  const nextSeen = new Set(seen).add(e.itemListId);
  return list.possibilities.flatMap(p=>p.items.flatMap(i=>expand({...stack(i),quantity:i.quantity*s.quantity},nextSeen,[...probabilityPath,p.probability])));
}
function guaranteed(s, family=false, seen=new Set()) {
  const e = entitiesByKey.get(s.key);
  if (!e?.itemListId) return [{key:family ? e?.familyKey || s.key : s.key,quantity:s.quantity}];
  if (seen.has(e.itemListId)) return [];
  const list = lists.get(e.itemListId);
  // Server ItemListDesc::roll selects one group using relative weights. Values
  // such as 95/5 and 299/1 are valid weights, never independent percentages.
  if (!list || !list.possibilities.length || list.possibilities.some(p=>!Number.isFinite(p.probability)||p.probability<0)
    || list.possibilities.reduce((a,p)=>a+p.probability,0)<=0) return [];
  const nextSeen = new Set(seen).add(e.itemListId);
  const possibilities = list.possibilities.filter(p=>p.probability>0).map(p=>aggregate(p.items.flatMap(i=>guaranteed({...stack(i),quantity:i.quantity*s.quantity},family,nextSeen))));
  if (!possibilities.length) return [];
  return possibilities[0].map(x=>({key:x.key,quantity:Math.min(...possibilities.map(p=>p.find(y=>y.key===x.key)?.quantity || 0))})).filter(x=>x.quantity>0);
}
function requirement(row) {
  const r = {};
  if (row.building_requirement?.building_type) {
    const b = row.building_requirement;
    r.station = {id:b.building_type,name:stationTypes.get(b.building_type)?.name || `Station ${b.building_type}`,tier:b.tier,
      buildings:get('building_desc').filter(x=>x.functions.some(f=>f.function_type===b.building_type&&f.level>=b.tier)).map(x=>({key:`building:${x.id}`,name:x.name,tier:Math.min(...x.functions.filter(f=>f.function_type===b.building_type).map(f=>f.level))}))};
  }
  r.skills = (row.level_requirements||[]).map(x=>({id:x.skill_id,name:skills.get(x.skill_id)?.name || `Skill ${x.skill_id}`,level:x.level}));
  r.tools = (row.tool_requirements||[]).map(x=>({id:x.tool_type,name:tools.get(x.tool_type)?.name || `Tool ${x.tool_type}`,level:x.level,power:x.power}));
  r.knowledges = (row.required_knowledges||[]).map(id=>({id,name:knowledges.get(id)?.name || `Knowledge ${id}`}));
  r.blockingKnowledges = (row.blocking_knowledges||[]).map(id=>({id,name:knowledges.get(id)?.name || `Knowledge ${id}`}));
  if (row.required_claim_tech_id) r.claimTechId=row.required_claim_tech_id;
  if (row.required_claim_tech_ids?.length) r.claimTechIds=row.required_claim_tech_ids;
  if (row.required_equipment_id) {r.equipmentId=row.required_equipment_id;r.equipmentTier=row.required_equipment_tier;}
  if (row.location_context !== undefined) {r.locationContext=row.location_context;r.locationLabel=row.string_context;}
  if (row.consumed_shards) r.consumedShards=row.consumed_shards;
  if (row.required_interior_tier >= 0) r.interiorTier=row.required_interior_tier;
  if (row.required_paving_tier > 0) r.pavingTier=row.required_paving_tier;
  if (row.required_biomes?.length) r.biomes=row.required_biomes;
  return r;
}
const recipes=[];
function recipe(kind,row,sourceTable,inputStacks,outputStacks,extra={}) {
  const directOutputs=outputStacks.map(x=>stack(x));
  const possibleOutputs=directOutputs.flatMap(x=>expand(x)).map(x=>({...x,...(x.probabilityPath.length===1?{probability:x.probabilityPath[0]}:{})}));
  const outputs=aggregate(directOutputs.flatMap(x=>guaranteed(x)));
  const familyOutputs=aggregate(directOutputs.flatMap(x=>guaranteed(x,true))).filter(x=>x.key.startsWith('family:'));
  const ingredients=inputStacks.map(x=>stack(x,true));
  const outputName=entitiesByKey.get(possibleOutputs[0]?.key)?.name || entitiesByKey.get(directOutputs[0]?.key)?.name || row.name || kind;
  const name=(row.name||row.verb_phrase||kind).replace(/\{\d+\}/g,outputName);
  const recraft=/^Recraft\b/i.test(row.name || '');
  const internalResolver=kind==='conversion'&&/^Resolve Item \d+$/i.test(row.name || '')&&ingredients.some(i=>
    entitiesByKey.get(i.key)?.itemListId&&directOutputs.some(o=>o.key===i.key));
  const eligibleKind=['crafting','conversion'].includes(kind);
  const conditional=ingredients.some(x=>x.consumptionChance!==1);
  const passiveModel=kind==='crafting'&&row.is_passive&&!!row.building_requirement?.building_type;
  const referenceActive=kind==='crafting'&&!passiveModel&&Number.isFinite(row.time_requirement)&&Number.isFinite(row.actions_required);
  const r={key:`${kind}:${row.id ?? row.enemy_type}`,id:row.id ?? row.enemy_type,kind,name,ingredients,outputs,possibleOutputs,
    directOutputs,familyOutputs,seconds:kind==='conversion'?row.time_cost:passiveModel?row.time_requirement:referenceActive?row.time_requirement*row.actions_required:null,
    time:{requirement:row.time_requirement ?? row.time_cost ?? null,actions:row.actions_required ?? null,passive:row.is_passive ?? false,...(referenceActive?{referenceActive:true}:{})},
    requirements:requirement(row),source:{table:sourceTable,id:row.id ?? row.enemy_type},origins:[],
    planEligible:eligibleKind&&!recraft&&!internalResolver&&!conditional&&outputs.length>0,
    familyEligible:eligibleKind&&!recraft&&!internalResolver&&!conditional&&familyOutputs.length>0,
    ...(recraft?{recraft:true}:{}),
    ...(internalResolver?{internalResolver:true}:{}),
    ...(!eligibleKind?{unsupportedReason:'Источник добычи или внешняя операция: количество и время не раскрываются автоматически.'}:recraft?{unsupportedReason:'Перековка возвращает предмет с вероятностной редкостью; автоматическая цепочка исключена.'}:internalResolver?{unsupportedReason:'Внутренняя обработка таблицы результатов; это не самостоятельный способ получения.'}:conditional?{unsupportedReason:'Условный расход ингредиентов требует отдельной модели.'}:!outputs.length?{unsupportedReason:'Выход содержит случайные варианты; заданная редкость не гарантирована.'}:{}),
    visibility:{hideWithoutKnowledge:!!row.hide_without_required_knowledge,hideWithBlockingKnowledge:!!row.hide_with_blocking_knowledges,showInProgression:!!row.show_in_progression},...extra};
  if (directOutputs.length===1) {
    const list=lists.get(entitiesByKey.get(directOutputs[0].key)?.itemListId);
    if(list) {
      const weightTotal=list.possibilities.reduce((n,p)=>n+p.probability,0);
      r.outcomeGroups=list.possibilities.map(p=>({probability:p.probability,weightTotal,chance:weightTotal>0?p.probability/weightTotal:null,
        outputs:p.items.map(i=>({...stack(i),quantity:i.quantity*directOutputs[0].quantity}))}));
    }
  }
  recipes.push(r);return r;
}
function origin(key) {ensure(key);const e=entitiesByKey.get(key);return {key,name:e.name,type:e.type,tier:e.tier};}
for(const row of get('crafting_recipe_desc')) recipe('crafting',row,'crafting_recipe_desc',row.consumed_item_stacks,row.crafted_item_stacks);
for(const row of get('item_conversion_recipe_desc')) recipe('conversion',row,'item_conversion_recipe_desc',row.input_items,[row.output_item]);
for(const row of get('construction_recipe_desc')) {
  const r=recipe('construction',row,'construction_recipe_desc',[...row.consumed_item_stacks,...row.consumed_cargo_stacks],[],{instantBuilt:row.instantly_built});
  if(row.consumed_building) r.ingredients.push({key:ensure(`building:${row.consumed_building}`),quantity:1,consumptionChance:1});
  r.outputs=[{key:ensure(`building:${row.building_description_id}`),quantity:1}];r.possibleOutputs=r.outputs;
}
for(const row of get('deconstruction_recipe_desc')) {
  const r=recipe('deconstruction',row,'deconstruction_recipe_desc',[],row.output_item_stacks,{outputCargoId:row.output_cargo_id});
  if(row.consumed_building) {r.ingredients=[{key:ensure(`building:${row.consumed_building}`),quantity:1,consumptionChance:1}];r.origins=[origin(`building:${row.consumed_building}`)];}
}
for(const row of get('extraction_recipe_desc')) {
  const r=recipe('extraction',row,'extraction_recipe_desc',row.consumed_item_stacks,[],{action:row.verb_phrase});
  r.possibleOutputs=row.extracted_item_stacks.flatMap(x=>expand(stack(x.item_stack),new Set(),[x.probability]));
  r.outputs=[];
  if(row.resource_id) r.origins.push(origin(`resource:${row.resource_id}`));
  if(row.cargo_id) r.origins.push(origin(`cargo:${row.cargo_id}`));
  r.name=`${row.verb_phrase || 'Gather'} · ${r.origins.map(x=>x.name).join(' / ') || row.id}`;
}
for(const row of get('resource_placement_recipe_desc')) {
  const r=recipe('placement',row,'resource_placement_recipe_desc',[...row.consumed_item_stacks,...row.consumed_cargo_stacks],[]);
  if(row.consumed_resource) r.ingredients.push({key:ensure(`resource:${row.consumed_resource}`),quantity:1,consumptionChance:1});
  r.outputs=[{key:ensure(`resource:${row.resource_description_id}`),quantity:1}];r.possibleOutputs=r.outputs;
}
for(const row of get('resource_growth_recipe_desc')) {
  const r=recipe('growth',row,'resource_growth_recipe_desc',[],[],{growthTime:row.time,growthChance:row.grown_resource_chance});
  r.origins=[origin(`resource:${row.resource_id}`)];
  r.possibleOutputs=row.grown_resource_id?[{key:ensure(`resource:${row.grown_resource_id}`),quantity:1,probabilityPath:[row.grown_resource_chance]}]:[];
  r.name=`Grow ${r.origins[0].name}`;
}
for(const row of get('terraform_recipe_desc')) {
  const r=recipe('terraform',{...row,id:row.difference,tool_requirements:[row.tool_requirement],time_requirement:row.time_per_action,actions_required:row.actions_count},'terraform_recipe_desc',[],[],{difference:row.difference});
  r.source.keyField='difference';
  r.possibleOutputs=row.output_item_stacks.flatMap(x=>expand(stack(x.item_stack),new Set(),[x.probability]));
  r.name=`Terraform · height difference ${row.difference}`;
}
for(const row of get('enemy_desc')) if(row.extracted_item_stacks.length) {
  const r=recipe('enemy',{...row,id:row.enemy_type},'enemy_desc',[],[]);
  r.possibleOutputs=row.extracted_item_stacks.flatMap(x=>expand(stack(x.item_stack),new Set(),[x.probability]));
  r.origins=[origin(`enemy:${row.enemy_type}`)];r.name=`Loot from ${row.name}`;
}
for(const [tableName,type,field,kind] of [['resource_desc','resource','on_destroy_yield','resource-destroy'],['cargo_desc','cargo','on_destroy_yield_cargos','cargo-destroy']]) {
  for(const row of get(tableName)) if(row[field]?.length) {
    const stacks=type==='cargo'?row[field].map(x=>typeof x==='number'?{item_id:x,quantity:1,item_type:'Cargo'}:x):row[field];
    const r=recipe(kind,row,tableName,[],stacks);r.origins=[origin(`${type}:${row.id}`)];r.name=`Deplete ${row.name}`;
  }
}
const lootTables=index('loot_table_desc');
for(const row of get('loot_chest_desc')) {
  const r=recipe('chest',row,'loot_chest_desc',[],[]);r.origins=[origin(`chest:${row.id}`)];r.name=`Contents of ${row.name}`;
  r.possibleOutputs=row.loot_tables.flatMap(id=>(lootTables.get(id)?.loot_item_stacks||[]).flatMap(x=>expand(stack(x.item_stack),new Set(),[x.probability]).map(s=>({...s,lootTableId:id}))));
  r.lootTableIds=row.loot_tables;r.unsupportedReason='Таблицы содержимого показаны как исходные варианты; общий шанс контейнера не вычислен.';
}

// Expose family variants only when their material norms and base action model
// agree after replacing rarity-specific ingredients with their explicit family.
const variantGroups=new Map();
for(const r of recipes) if(r.familyEligible) {
  const key=JSON.stringify([r.kind,r.familyOutputs]);
  if(!variantGroups.has(key))variantGroups.set(key,[]);variantGroups.get(key).push(r);
}
for(const group of variantGroups.values()) {
  const signatures=new Set(group.map(r=>JSON.stringify({ingredients:r.ingredients.map(i=>({...i,key:entitiesByKey.get(i.key)?.familyKey||i.key})).sort((a,b)=>a.key.localeCompare(b.key)),time:r.time,requirements:r.requirements})));
  if(signatures.size>1) for(const r of group) {r.familyEligible=false;r.familyReason='Нормы или базовое время вариантов редкости различаются; единую цепочку нельзя подставить автоматически.';}
  for(const r of group) r.rank=r.directOutputs.reduce((n,o)=>n+(entitiesByKey.get(o.key)?.rarity==='Common'?0:1),0);
}
const enemyAi = index('enemy_ai_params_desc');
const enemyIds = new Set(get('enemy_desc').map(row => row.enemy_type));
const enemyEnumRef = schema.types.find(type => type.name.name === 'EnemyType')?.ty;
const enemyVariants = schema.typespace.types[enemyEnumRef]?.Sum?.variants;
assert.ok(enemyVariants?.length && enemyVariants[0].name.some === 'None', 'EnemyType enum is missing from the region schema');
const enemyTypes = new Map(enemyVariants.map((variant, id) => [variant.name.some, id]));
function enemyIdForAi(aiId, fallbackType) {
  const id = enemyTypes.get(enemyAi.get(aiId)?.enemy_type ?? fallbackType);
  return id > 0 && enemyIds.has(id) ? id : null;
}

const guide=buildGuideData(get,stack,requirement);
const dungeons=buildDungeonData(get,{stack,expand,enemyIdForAi});
const world=buildWorldData(get,{stack,enemyIdForAi,schema});
const drops=buildDropData(get,{entitiesByKey,recipes});
const catalog={formatVersion:1,source:{...manifest.source,downloadedAt:manifest.downloadedAt,tableBaseUrl:`https://github.com/${manifest.source.repository}/blob/${manifest.source.commit}/static/`},
  notes:['Это статический снимок сообщества; соответствие текущему серверу отдельно не проверено.','probabilityPath хранит исходные параметры таблиц, включая значения >1; они не нормированы в проценты.','Результаты списков сохранены группами. outputs содержит только минимум всех допустимых исходов.','Семейства Any объединяют варианты одного имени, тира и категории; редкость результата не задаётся.','time хранит исходные параметры; итоговое время персонажа зависит от скорости, силы инструмента и критических действий.'],
  timeVerification:{checkedAt:'2026-11-14',serverCommit:'85c972d8d9433560fb51a906424b74b7958ddf99',
    active:'reference-one-progress-per-action-speed-one',passive:'requirement-per-operation-with-station',conversion:'timeCost-seconds-per-operation',documentation:'docs/CRAFTING_TIME.md'},
  timeModel:'reference-one-progress-per-action-speed-one-no-critical-actions',
  itemListVerification:{checkedAt:'2026-11-14',serverCommit:'85c972d8d9433560fb51a906424b74b7958ddf99',
    model:'choose-one-weighted-group',url:'https://github.com/clockworklabs/BitCraftPublic/blob/85c972d8d9433560fb51a906424b74b7958ddf99/BitCraftServer/packages/game/src/game/entities/item_list.rs#L64-L104'},
  entities,recipes,guide,dungeons,world,drops,itemLists:get('item_list_desc').map(x=>({id:x.id,name:x.name,possibilities:x.possibilities.map(p=>({probability:p.probability,items:p.items.map(i=>stack(i))}))})),
  counts:{entities:entities.length,recipes:recipes.length,sourceTables:tables.size}};

assert.equal(new Set(recipes.map(r=>r.key)).size,recipes.length,'Recipe keys must be unique');
for(const r of recipes) for(const s of [...r.ingredients,...r.outputs,...r.possibleOutputs,...r.familyOutputs]) {
  assert.ok(entitiesByKey.has(s.key),`${r.key}: missing ${s.key}`);assert.ok(Number.isFinite(s.quantity)&&s.quantity>=0,`${r.key}: quantity`);
}
const outputPath=path.join(root,'web','data','recipe-catalog.json');
const serialized=JSON.stringify(catalog);
if(process.argv.includes('--check')) {
  assert.equal(await readFile(outputPath,'utf8'),serialized,'Catalog is stale; run node scripts/build-recipe-catalog.mjs');
} else {await mkdir(path.dirname(outputPath),{recursive:true});await writeFile(outputPath,serialized);}
console.log(`PASS: ${entities.length} entities, ${recipes.length} acquisition methods, ${serialized.length.toLocaleString('en-US')} characters; source hashes and references verified${process.argv.includes('--check')?', generated catalog matches':''}.`);
