import test from 'node:test';
import { catalogDirectory } from './catalog-fixture.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRecipeBook, getProductionOptions, planProduction, productionGoal, recipeYield } from '../web/recipe-domain.js';

const entity = (key, extra = {}) => ({ key, name: key, type: key.split(':')[0], ...extra });
const recipe = (key, ingredients, outputs, extra = {}) => ({ key, kind: 'crafting', name: key, ingredients: ingredients.map(([key, quantity]) => ({ key, quantity, consumptionChance: 1 })), outputs: outputs.map(([key, quantity]) => ({ key, quantity })), seconds: 10, planEligible: true, ...extra });
const book = (entities, recipes) => createRecipeBook({ entities: entities.map(value => typeof value === 'string' ? entity(value) : value), recipes });
const amountOf = (plan, key, field = 'missing') => plan.materials.find(row => row.key === key)?.[field] || 0;

test('Item and Cargo remain distinct and recipe ids are never item ids', () => {
  const b = book(['item:1', 'cargo:1', 'item:2'], [recipe('crafting:1', [['cargo:1', 3]], [['item:1', 1]])]);
  const p = planProduction(b, 'item:1', 2, { inventory: { 'item:1': 1, 'cargo:1': 1 } });
  assert.equal(amountOf(p, 'cargo:1'), 2);
  assert.equal(p.tree.batches, 1);
  assert.equal(p.totalSeconds, 10);
  assert.equal(b.entitiesByKey.get('item:1').type, 'item');
  assert.equal(b.entitiesByKey.get('cargo:1').type, 'cargo');
});

test('ten T6 tools expand through ten tools at every preceding tier', () => {
  const entities = ['ore', ...Array.from({ length: 6 }, (_, i) => `pick:T${i + 1}`)];
  const recipes = entities.slice(1).map((key, index) => recipe(`crafting:${index + 1}`, [...(index ? [[`pick:T${index}`, 1]] : []), ['ore', index + 1]], [[key, 1]], { seconds: 20 * (index + 1) }));
  const p = planProduction(book(entities, recipes), 'pick:T6', 10);
  let node = p.tree;
  for (let tier = 6; tier >= 1; tier--) {
    assert.equal(node.key, `pick:T${tier}`);
    assert.equal(node.required, 10);
    assert.equal(node.batches, 10);
    node = node.children.find(child => child.key.startsWith('pick:'));
  }
  assert.equal(amountOf(p, 'ore'), 210);
  assert.equal(p.totalSeconds, 4200);
  assert.equal(p.steps[0].recipeKey, 'crafting:1');
  assert.equal(p.steps.at(-1).recipeKey, 'crafting:6');
});

test('batch rounding and a shared surplus pool avoid crafting the same part twice', () => {
  const b = book(['target', 'a', 'b', 'part', 'ore'], [
    recipe('target-recipe', [['a', 1], ['b', 1]], [['target', 1]]),
    recipe('a-recipe', [['part', 3]], [['a', 1]]),
    recipe('b-recipe', [['part', 2]], [['b', 1]]),
    recipe('part-recipe', [['ore', 4]], [['part', 5]])
  ]);
  const p = planProduction(b, 'target', 1);
  assert.equal(amountOf(p, 'ore'), 4);
  assert.equal(p.steps.find(step => step.key === 'part-recipe').batches, 1);
  assert.equal(p.totalSeconds, 40);
  assert.equal(p.surplus.part, undefined);
});

test('shared original inventory is consumed once across sibling branches', () => {
  const b = book(['target', 'a', 'b', 'ore'], [
    recipe('target-recipe', [['a', 1], ['b', 1]], [['target', 1]]),
    recipe('a-recipe', [['ore', 4]], [['a', 1]]), recipe('b-recipe', [['ore', 4]], [['b', 1]])
  ]);
  const p = planProduction(b, 'target', 1, { inventory: { ore: 5 } });
  assert.equal(amountOf(p, 'ore', 'needed'), 8);
  assert.equal(amountOf(p, 'ore', 'owned'), 5);
  assert.equal(amountOf(p, 'ore'), 3);
  assert.equal(p.stockUsed.find(row => row.key === 'ore').amount, 5);
});

test('guaranteed coproducts feed later branches without extra batches', () => {
  const b = book(['target', 'bar', 'slag', 'ore'], [
    recipe('target-recipe', [['bar', 1], ['slag', 2]], [['target', 1]]),
    recipe('smelt', [['ore', 3]], [['bar', 1], ['slag', 2]])
  ]);
  const p = planProduction(b, 'target', 1);
  assert.equal(amountOf(p, 'ore'), 3);
  assert.equal(amountOf(p, 'slag'), 0);
  assert.equal(p.steps.find(step => step.key === 'smelt').batches, 1);
});

test('a repeated multi-output operation keeps its counts in one consistent unit', () => {
  const b = book(['target', 'bar', 'slag', 'ore'], [
    recipe('target-recipe', [['bar', 2], ['slag', 10]], [['target', 1]]),
    recipe('smelt', [['ore', 3]], [['bar', 1], ['slag', 2]])
  ]);
  const p = planProduction(b, 'target', 1);
  const smelt = p.steps.find(step => step.key === 'smelt');
  assert.equal(smelt.batches, 5);
  assert.equal(smelt.produced, 5);
  assert.equal(smelt.outputs.find(output => output.key === 'slag').quantity, 10);
  assert.equal(p.surplus.bar, 3);
  assert.equal(amountOf(p, 'ore'), 15);
});

test('explicit alternatives change ingredients and stale choices remain visible', () => {
  const b = book(['target', 'wood', 'stone'], [recipe('a', [['wood', 2]], [['target', 1]]), recipe('b', [['stone', 3]], [['target', 2]])]);
  const p = planProduction(b, 'target', 3, { selections: { target: 'b' } });
  assert.equal(amountOf(p, 'stone'), 6);
  assert.equal(amountOf(p, 'wood'), 0);
  assert.equal(p.surplus.target, 1);
  const stale = planProduction(b, 'target', 3, { selections: { target: 'removed' } });
  assert.equal(stale.complete, false);
  assert.equal(stale.issues[0].code, 'selection');
  assert.equal(amountOf(stale, 'target'), 3);
  assert.equal(stale.totalSeconds, null);
});

test('a cycle is finite and can be cut explicitly at an external ingredient', () => {
  const b = book(['a', 'b'], [recipe('a-recipe', [['b', 1]], [['a', 1]]), recipe('b-recipe', [['a', 1]], [['b', 1]])]);
  const p = planProduction(b, 'a', 2);
  assert.equal(p.issues[0].code, 'cycle');
  assert.equal(p.complete, false);
  assert.equal(amountOf(p, 'a'), 2);
  assert.equal(p.totalSeconds, null);
  const cut = planProduction(b, 'a', 2, { selections: { b: 'external' } });
  assert.equal(cut.complete, true);
  assert.equal(amountOf(cut, 'b'), 2);
  assert.equal(cut.steps.length, 1);
  assert.equal(cut.totalSeconds, 20);
});

test('automatic routing avoids using an ancestor as a return-container input', () => {
  const b = book([
    entity('water', { tier: 0 }), entity('bucket', { tier: 0 }), entity('wood', { tier: 1 })
  ], [
    recipe('fill', [['bucket', 1]], [['water', 1]], { seconds: 0.5 }),
    recipe('empty', [['water', 1]], [['bucket', 1]], { kind: 'conversion', seconds: 0.5 }),
    recipe('craft-bucket', [['wood', 2]], [['bucket', 1]], { seconds: 10 })
  ]);
  const p = planProduction(b, 'water', 3);
  assert.equal(p.issues.length, 0);
  assert.equal(amountOf(p, 'wood'), 6);
  assert.equal(p.tree.children[0].recipeKey, 'craft-bucket');
});

test('random possibilities, recrafts and conditional consumption are never guaranteed', () => {
  const b = book(['target', 'ore'], [
    recipe('random', [['ore', 1]], [], { possibleOutputs: [{ key: 'target', quantity: 1, probability: 0.5 }], planEligible: false }),
    recipe('recraft', [['ore', 1]], [['target', 1]], { name: 'Recraft target' }),
    recipe('conditional', [['ore', 1]], [['target', 1]], { ingredients: [{ key: 'ore', quantity: 1, consumptionChance: 0.5 }] })
  ]);
  assert.ok(getProductionOptions(b, 'target').every(option => !option.eligible));
  const p = planProduction(b, 'target', 4);
  assert.equal(p.steps.length, 0);
  assert.equal(amountOf(p, 'target'), 4);
  assert.equal(p.issues[0].code, 'unsupported');
  assert.equal(p.totalSeconds, null);
});

test('equipment families collapse rarity outcomes once and reuse real member inventory', () => {
  const entities = [
    entity('family:item:1', { type: 'family', members: ['item:1', 'item:2'] }),
    entity('item:1', { rarity: 'Common', familyKey: 'family:item:1' }), entity('item:2', { rarity: 'Uncommon', familyKey: 'family:item:1' }),
    entity('family:item:3', { type: 'family', members: ['item:3', 'item:4'] }),
    entity('item:3', { rarity: 'Common', familyKey: 'family:item:3' }), entity('item:4', { rarity: 'Uncommon', familyKey: 'family:item:3' }), entity('ore')
  ];
  const b = book(entities, [
    recipe('upgrade', [['item:1', 1], ['ore', 2]], [], { planEligible: false, familyEligible: true, familyOutputs: [{ key: 'family:item:3', quantity: 1 }], possibleOutputs: [{ key: 'item:3', quantity: 1 }, { key: 'item:4', quantity: 1 }] }),
    recipe('base', [['ore', 1]], [['item:1', 1]], { familyEligible: true, familyOutputs: [{ key: 'family:item:1', quantity: 1 }] })
  ]);
  const p = planProduction(b, 'family:item:3', 10, { inventory: { 'item:2': 3 } });
  assert.equal(p.steps.find(step => step.key === 'base').batches, 7);
  assert.equal(amountOf(p, 'ore'), 27);
  assert.equal(recipeYield(b, b.recipesByKey.get('upgrade'), 'item:3'), 0);
  assert.equal(recipeYield(b, b.recipesByKey.get('upgrade'), 'family:item:3'), 1);
  assert.equal(p.assumptions.length, 1);
  assert.equal(p.surplus['family:item:1'], undefined);
  assert.equal(planProduction(b, 'item:3', 10).steps.length, 0);
  assert.deepEqual(productionGoal(b, 'item:3'), { key: 'family:item:3', familyKey: 'family:item:3' });
  assert.deepEqual(productionGoal(b, 'item:1'), { key: 'item:1', familyKey: null });
  const legacy = { selections: { 'item:3': 'external' } };
  assert.equal(productionGoal(b, 'item:3', legacy).key, 'item:3');
  assert.equal(productionGoal(b, 'item:3', { rarityPreference: { key: 'item:3', scope: 'exact' } }).key, 'item:3');
  assert.equal(productionGoal(b, 'item:3', { rarityPreference: { key: 'item:1', scope: 'exact' } }).key, 'family:item:3');
  assert.equal(productionGoal(b, 'item:3', { ...legacy, rarityPreference: { key: 'item:3', scope: 'any' } }).key, 'family:item:3');
});

test('unknown time stays unknown, while a per-operation estimate can complete it', () => {
  const b = book(['target', 'part', 'ore'], [recipe('target-recipe', [['part', 1]], [['target', 1]], { seconds: null }), recipe('part-recipe', [['ore', 1]], [['part', 1]], { seconds: 7 })]);
  const p = planProduction(b, 'target', 3);
  assert.equal(p.unknownTime, true);
  assert.equal(p.totalSeconds, null);
  assert.equal(p.knownSeconds, 21);
  assert.equal(p.tree.seconds, null);
  const estimated = planProduction(b, 'target', 3, { timeOverrides: { 'target-recipe': 12 } });
  assert.equal(estimated.totalSeconds, 57);
  assert.equal(estimated.unknownTime, false);
});

test('decimal quantities do not create phantom batches', () => {
  const b = book(['target', 'part', 'ore'], [recipe('target-recipe', [['part', 0.1], ['part', 0.2]], [['target', 1]]), recipe('part-recipe', [['ore', 1]], [['part', 0.3]])]);
  const p = planProduction(b, 'target', 1);
  assert.equal(p.steps.find(step => step.key === 'part-recipe').batches, 1);
  assert.equal(amountOf(p, 'ore'), 1);
});

test('inventory covering the target needs no production or production time', () => {
  const b = book(['target', 'ore'], [recipe('target-recipe', [['ore', 3]], [['target', 1]], { seconds: null })]);
  const p = planProduction(b, 'target', 10, { inventory: { target: 10 } });
  assert.equal(p.steps.length, 0);
  assert.equal(p.materials.length, 0);
  assert.equal(p.totalSeconds, 0);
  assert.equal(p.tree.used, 10);
  assert.equal(p.unknownTime, false);
  assert.equal(planProduction(b, 'target', 0).steps.length, 0);
});

test('limits and unknown links return useful leaves instead of hanging', () => {
  const b = book(['a', 'b', 'c'], [recipe('a-recipe', [['b', 1]], [['a', 1]]), recipe('b-recipe', [['c', 1]], [['b', 1]])]);
  const p = planProduction(b, 'a', 2, { maxDepth: 1 });
  assert.equal(p.issues[0].code, 'limit');
  assert.equal(amountOf(p, 'b'), 2);
  const missing = planProduction(b, 'item:unknown', 3);
  assert.equal(missing.materials[0].name, 'item:unknown');
  assert.equal(missing.materials[0].reason, 'unknown');
});

test('nonfinite, negative, overlarge inputs and duplicate keys are rejected', () => {
  const b = book(['target'], []);
  for (const value of [-1, NaN, Infinity, 1e10]) assert.throws(() => planProduction(b, 'target', value), RangeError);
  assert.throws(() => planProduction(b, 'target', 1, { inventory: { target: -1 } }), RangeError);
  assert.throws(() => planProduction(b, 'target', 1, { maxNodes: 0 }), RangeError);
  assert.throws(() => book(['target', 'target'], []), RangeError);
  assert.throws(() => book(['target'], [recipe('same', [], [['target', 1]]), recipe('same', [], [['target', 1]])]), RangeError);
});

test('bundled Rathium T6 goal expands all six real tiers, with finite reference time and no internal tokens', () => {
  const catalog = JSON.parse(readFileSync(new URL('recipe-catalog.json', catalogDirectory), 'utf8'));
  const b = createRecipeBook(catalog);
  const p = planProduction(b, 'family:item:1606324183', 10);
  let node = p.tree;
  for (let tier = 6; tier >= 1; tier--) {
    assert.equal(b.entitiesByKey.get(node.key).tier, tier);
    assert.equal(node.required, 10);
    assert.equal(node.batches, 10);
    node = node.children.find(child => /Pickaxe/.test(child.name));
  }
  assert.equal(p.issues.length, 0);
  assert.ok(p.totalSeconds > 0 && Number.isFinite(p.totalSeconds));
  assert.equal(p.totalSeconds, p.steps.reduce((sum, step) => sum + step.seconds, 0));
  assert.ok(p.materials.every(row => !b.entitiesByKey.get(row.key)?.itemListId));
  assert.ok(p.materials.every(row => (b.entitiesByKey.get(row.key)?.tier || 0) <= 6));
  assert.ok(p.assumptions.some(text => text.includes('прогрессе 1')));
  const stocked = planProduction(b, 'family:item:1606324183', 10, { inventory: { 'family:item:1103304424': 6 } });
  assert.equal(stocked.tree.batches, 10);
  const t5 = stocked.tree.children.find(child => /Pickaxe/.test(child.name));
  assert.equal(t5.used, 6);
  assert.equal(t5.batches, 4);
  assert.equal(t5.children.find(child => /Pickaxe/.test(child.name)).required, 4);
  assert.ok(stocked.totalSeconds < p.totalSeconds);
});
