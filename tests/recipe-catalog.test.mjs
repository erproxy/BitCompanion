import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const catalog=JSON.parse(await readFile(new URL('../web/data/recipe-catalog.json',import.meta.url),'utf8'));
const entities=new Map(catalog.entities.map(e=>[e.key,e]));
const recipes=new Map(catalog.recipes.map(r=>[r.key,r]));
const raw=async table=>JSON.parse(await readFile(new URL(`../data/bitcraft/raw/static/${table}.json`,import.meta.url),'utf8'));

test('catalog keeps every Item, Cargo and primary recipe row under typed keys',async()=>{
  for(const [table,type] of [['item_desc','item'],['cargo_desc','cargo']]){
    const rows=await raw(table);
    assert.equal(catalog.entities.filter(e=>e.type===type&&!e.missing).length,rows.length);
    for(const row of rows)assert.equal(entities.get(`${type}:${row.id}`).name,row.name);
  }
  for(const [table,kind] of [['crafting_recipe_desc','crafting'],['item_conversion_recipe_desc','conversion'],['extraction_recipe_desc','extraction'],['construction_recipe_desc','construction'],['deconstruction_recipe_desc','deconstruction']]){
    assert.equal(catalog.recipes.filter(r=>r.kind===kind).length,(await raw(table)).length);
  }
  assert.notEqual(entities.get('item:1').name,entities.get('cargo:1').name);
});

test('all projected links resolve, with unique recipe and entity keys',()=>{
  assert.equal(entities.size,catalog.entities.length);assert.equal(recipes.size,catalog.recipes.length);
  for(const r of catalog.recipes){
    for(const s of [...r.ingredients,...r.outputs,...r.possibleOutputs,...r.familyOutputs]){
      assert.ok(entities.has(s.key),`${r.key} → ${s.key}`);
      assert.ok(Number.isFinite(s.quantity)&&s.quantity>=0,`${r.key}: quantity`);
    }
    for(const o of r.origins)assert.ok(entities.has(o.key),`${r.key} → origin ${o.key}`);
  }
});

test('bucket lists preserve grouped byproducts rather than counting a placeholder bucket',()=>{
  const r=recipes.get('crafting:1000');
  assert.deepEqual(r.outputs,[{key:'item:11006',quantity:10}]);
  assert.equal(r.outcomeGroups.length,2);
  assert.ok(r.outcomeGroups[1].outputs.some(x=>x.key==='item:1281380439'&&x.quantity===1));
  assert.equal(r.possibleOutputs.some(x=>x.key==='item:1767779973'),false);
});

test('T6 pickaxe supports a quantity family while preserving uncertain exact rarity',()=>{
  const r=recipes.get('crafting:1640014271');
  assert.equal(r.planEligible,false);
  assert.equal(r.familyEligible,true);
  assert.deepEqual(r.outputs,[]);
  assert.deepEqual(r.familyOutputs,[{key:'family:item:1606324183',quantity:1}]);
  const family=entities.get('family:item:1606324183');
  assert.equal(family.name,'Rathium Pickaxe');assert.equal(family.tier,6);
  assert.equal(entities.get('item:1103304424').familyKey,'family:item:1103304424');
  assert.ok(r.ingredients.some(x=>x.key==='item:1103304424'&&x.quantity===1));
  const variants=catalog.recipes.filter(x=>x.kind==='crafting'&&x.familyEligible&&x.familyOutputs.some(o=>o.key===family.key));
  assert.equal(variants.length,5);
  assert.equal(r.rank,0);
});

test('recraft is never an automatic guaranteed production chain',()=>{
  const recrafts=catalog.recipes.filter(r=>r.recraft);
  assert.ok(recrafts.length>0);
  assert.ok(recrafts.every(r=>!r.planEligible&&!r.familyEligible));
});

test('item-list integer weights retain guaranteed material and normalize only the selected group',()=>{
  const ingot=recipes.get('crafting:105009');
  assert.equal(ingot.planEligible,true);
  assert.deepEqual(ingot.outputs,[{key:'item:1050001',quantity:1}]);
  assert.deepEqual(ingot.outcomeGroups.map(g=>g.probability),[95,5]);
  assert.deepEqual(ingot.outcomeGroups.map(g=>g.chance),[.95,.05]);
  assert.equal(ingot.outcomeGroups[1].outputs.length,2);
  assert.equal(catalog.itemListVerification.model,'choose-one-weighted-group');
});

test('extraction retains raw probability parameters and source unit',()=>{
  const r=recipes.get('extraction:1');
  assert.equal(r.origins[0].key,'resource:1');
  assert.equal(r.origins[0].name,'Sticks');
  assert.deepEqual(r.possibleOutputs[0].probabilityPath,[2]);
  assert.equal(r.planEligible,false);
});

test('internal item-list resolvers are reference links rather than sources of raw materials',()=>{
  const resolver=recipes.get('conversion:2220027');
  assert.equal(resolver.internalResolver,true);
  assert.equal(resolver.planEligible,false);
  assert.equal(resolver.familyEligible,false);
  assert.ok(resolver.ingredients.some(i=>entities.get(i.key)?.itemListId));
});

test('time retains active progress and passive/conversion seconds separately',()=>{
  const active=recipes.get('crafting:1000');
  assert.deepEqual(active.time,{requirement:1.6,actions:50,passive:false,referenceActive:true});
  assert.equal(active.seconds,80);
  const passive=recipes.get('crafting:101000');
  assert.equal(passive.time.passive,true);assert.equal(passive.seconds,300);
  const conversion=recipes.get('conversion:1');assert.equal(conversion.seconds,1);
  assert.equal(catalog.timeVerification.serverCommit,'85c972d8d9433560fb51a906424b74b7958ddf99');
});

test('buildings retain named functions and their individual levels without inventing a building tier',async()=>{
  const types=new Map((await raw('building_type_desc')).map(row=>[row.id,row]));
  const buildings=await raw('building_desc');
  assert.equal(catalog.entities.filter(entity=>entity.type==='building'&&!entity.missing).length,buildings.length);
  for(const row of buildings){
    const entity=entities.get(`building:${row.id}`);
    assert.equal(entity.tier,row.tier??null,entity.key);
    assert.deepEqual(entity.functions,row.functions.map(fn=>({type:fn.function_type,tier:fn.level,
      name:types.get(fn.function_type).name,category:types.get(fn.function_type).category})),entity.key);
    assert.equal(entity.visible,row.show_in_compendium,entity.key);
  }
  const barter=entities.get('building:3210');
  assert.deepEqual(barter.functions.map(fn=>fn.tier),[2,3,3]);
  assert.equal(barter.tier,null,'A function level is not a universal building tier');
});

test('construction preserves materials and placement requirements while remaining reference-only',async()=>{
  const rows=await raw('construction_recipe_desc');
  assert.ok(rows.some(row=>row.required_paving_tier>0));
  assert.ok(rows.some(row=>row.instantly_built));
  assert.ok(rows.some(row=>row.required_claim_tech_ids.length));
  assert.ok(rows.some(row=>row.consumed_shards>0));
  for(const row of rows){
    const recipe=recipes.get(`construction:${row.id}`),req=recipe.requirements;
    assert.deepEqual(recipe.ingredients,[...row.consumed_item_stacks,...row.consumed_cargo_stacks].map(stack=>({
      key:`${stack.item_type.toLowerCase()}:${stack.item_id}`,quantity:stack.quantity,consumptionChance:stack.consumption_chance??1
    })),recipe.key);
    assert.deepEqual(recipe.outputs,[{key:`building:${row.building_description_id}`,quantity:1}],recipe.key);
    assert.deepEqual(req.claimTechIds,row.required_claim_tech_ids.length?row.required_claim_tech_ids:undefined,recipe.key);
    assert.equal(req.interiorTier,row.required_interior_tier>=0?row.required_interior_tier:undefined,recipe.key);
    assert.equal(req.pavingTier,row.required_paving_tier>0?row.required_paving_tier:undefined,recipe.key);
    assert.equal(req.consumedShards,row.consumed_shards||undefined,recipe.key);
    assert.equal(recipe.instantBuilt,row.instantly_built,recipe.key);
    assert.equal(recipe.seconds,null,recipe.key);
    assert.equal(recipe.planEligible,false,recipe.key);
  }
});

test('deconstruction retains all Item and Cargo returns without adding output_cargo_id twice',async()=>{
  const rows=await raw('deconstruction_recipe_desc');
  assert.ok(rows.some(row=>row.output_cargo_id>0));
  for(const row of rows){
    const recipe=recipes.get(`deconstruction:${row.id}`);
    const outputs=row.output_item_stacks.map(stack=>({key:`${stack.item_type.toLowerCase()}:${stack.item_id}`,quantity:stack.quantity}));
    assert.deepEqual(recipe.directOutputs,outputs,recipe.key);
    assert.deepEqual(recipe.outputs,outputs,recipe.key);
    assert.deepEqual(recipe.possibleOutputs,outputs.map(stack=>({...stack,probabilityPath:[]})),recipe.key);
    assert.equal(recipe.outputCargoId,row.output_cargo_id,recipe.key);
    if(row.output_cargo_id>0)assert.ok(outputs.some(stack=>stack.key===`cargo:${row.output_cargo_id}`),`${recipe.key}: cargo reference is already an output`);
    assert.deepEqual(recipe.ingredients,[{key:`building:${row.consumed_building}`,quantity:1,consumptionChance:1}],recipe.key);
    assert.equal(recipe.origins[0].key,`building:${row.consumed_building}`,recipe.key);
    assert.equal(recipe.planEligible,false,recipe.key);
    assert.equal(recipe.seconds,null,recipe.key);
  }
});
