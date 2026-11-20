import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRoute,routeForState,applyRoute} from '../web/navigation.js';

test('public routes preserve entity types and resources mode without disclosing private state',()=>{
  const state={tab:'recipeBook',recipeBook:{targetKey:'family:item:42',quantity:6,inventory:{'item:1':99}},resourceCatalog:{mode:'buildings',targetKey:'building:123'},saved:[{title:'Private plan'}]};
  assert.equal(routeForState(state),'#/recipes/family%3Aitem%3A42');
  const recipeRoute=parseRoute(routeForState(state));
  assert.deepEqual(recipeRoute,{tab:'recipeBook',targetKey:'family:item:42'});
  state.tab='resources';
  const buildingRoute=parseRoute(routeForState(state));
  assert.deepEqual(buildingRoute,{tab:'resources',mode:'buildings',targetKey:'building:123'});
  applyRoute(state,recipeRoute);
  assert.equal(state.tab,'recipeBook');
  assert.equal(state.recipeBook.quantity,6);
  applyRoute(state,parseRoute('#/recipes/item:45'));
  assert.equal(state.recipeBook.quantity,1);
  assert.equal(state.recipeBook.inventory['item:1'],99);
});

test('malformed and inconsistent public entity routes cannot overwrite a valid selection',()=>{
  for(const hash of ['#/unknown','#/%E0%A4%A','#/recipes/__proto__','#/recipes/item:1/extra','#/resources/custom/item:1','#/resources/game/building:1','#/resources/buildings/item:1','#/resources/buildings/enemy:9','#/resources/creatures/resource:9','#/drops/extra'])assert.equal(parseRoute(hash),null,hash);
  assert.deepEqual(parseRoute('#/resources/custom'),{tab:'resources',mode:'custom',targetKey:''});
  assert.deepEqual(parseRoute('#/plans'),{tab:'journal'});
});

test('creature routes accept old source links and keep their own filter settings',()=>{
  const route={tab:'resources',mode:'creatures',targetKey:'enemy:9'};
  assert.deepEqual(parseRoute('#/resources/game/enemy%3A9'),route);
  assert.deepEqual(parseRoute('#/resources/creatures/enemy%3A9'),route);
  const state={tab:'resources',resourceCatalog:{mode:'buildings',targetKey:'building:123',quantity:5,tier:'0',search:'Loom',buildingCategory:'14',creatureCategory:'Huntable Animal'}};
  applyRoute(state,route);
  assert.equal(routeForState(state),'#/resources/creatures/enemy%3A9');
  assert.equal(state.resourceCatalog.tier,'');
  assert.equal(state.resourceCatalog.search,'');
  assert.equal(state.resourceCatalog.quantity,1);
  assert.equal(state.resourceCatalog.buildingCategory,'14');
  assert.equal(state.resourceCatalog.creatureCategory,'Huntable Animal');
});

test('dungeon routes round-trip only the selected public ID and accept older state',()=>{
  const state={tab:'dungeons'};
  assert.equal(routeForState(state),'#/dungeons');
  const route=parseRoute('#/dungeons/208697589');
  assert.deepEqual(route,{tab:'dungeons',id:208697589});
  applyRoute(state,route);
  state.dungeons.search='local search';
  assert.equal(routeForState(state),'#/dungeons/208697589');
  applyRoute(state,parseRoute('#/dungeons'));
  assert.deepEqual(state.dungeons,{id:0,search:'local search'});
  for(const hash of ['#/dungeons/0','#/dungeons/-1','#/dungeons/001','#/dungeons/','#/dungeons/9007199254740992','#/dungeons/208697589/extra','#/dungeons/__proto__']){
    assert.equal(parseRoute(hash),null,hash);
  }
});

test('the checklist has a local route with plan identity kept in history state',()=>{
  const state={tab:'journal',journal:{view:'checklist',id:'Private plan'},saved:[{title:'Private plan',progress:{logs:8}}]};
  assert.equal(routeForState(state),'#/plans/checklist');
  assert.equal(parseRoute('#/plans/checklist/Private%20plan'),null);
  applyRoute(state,parseRoute('#/plans'));
  assert.deepEqual(state.journal,{view:'list',id:'Private plan'});
  applyRoute(state,parseRoute('#/plans/checklist'),{journalPlanId:'Another plan'});
  assert.deepEqual(state.journal,{view:'checklist',id:'Another plan'});
});
