import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { planResources } from '../web/domain.js';
import { createRecipeBook, planProduction } from '../web/recipe-domain.js';
import { groupPlanChecklist } from '../web/plan-checklist-groups.js';
import { checklistProgress, createPlanChecklist, createRecipeChecklist, normalizePlanProgress } from '../web/plan-checklist.js';
import { catalogDirectory } from './catalog-fixture.mjs';

const ingredient = (id, amount) => ({ id, name: id, amount });
const recipe = (id, output, ingredients) => ({ id, name: id, output, seconds: 1, ingredients });
const recipes = [
  recipe('tool', 1, [ingredient('boards', 10), ingredient('ingots', 10)]),
  recipe('boards', 1, [ingredient('logs', 1)]),
  recipe('ingots', 1, [ingredient('ore', 1)])
];
const customChecklist = (book = recipes, stock = {}) =>
  createPlanChecklist(planResources(book, 'tool', 1, stock, { includeTree: true }).tree);
const left = (checklist, progress) => Object.fromEntries(checklistProgress(checklist, progress).remaining);

test('saved checklist lists the goal and components before materials and recomputes upstream work', () => {
  const checklist = customChecklist();
  assert.deepEqual(checklist.rows.map(({ key, depth }) => [key, depth]), [
    ['tool', 0], ['boards', 1], ['logs', 2], ['ingots', 1], ['ore', 2]
  ]);
  const expected = { tool: 1, boards: 2, logs: 2, ingots: 10, ore: 10 };
  assert.deepEqual(left(checklist, { boards: 8 }), expected);
  assert.deepEqual(left(checklist, { boards: 8, logs: 8 }), expected, 'logs used to make the boards only count once');
  assert.deepEqual(left(checklist, { boards: 10, logs: 8 }), { ...expected, boards: 0, logs: 0 });
  assert.deepEqual(left(checklist, { boards: 8, logs: 10 }), { ...expected, logs: 0 });
  assert.deepEqual(left(checklist, { tool: 1 }), { tool: 0, boards: 0, logs: 0, ingots: 0, ore: 0 });
});

test('baseline stock and materials shared across branches are accounted for once', () => {
  const shared = [recipes[0], recipes[1], recipe('ingots', 1, [ingredient('logs', 1)])];
  const checklist = customChecklist(shared, { logs: 4 });
  assert.equal(checklist.rows.filter(row => row.key === 'logs').length, 1);
  assert.equal(checklist.rowsByKey.get('logs').needed, 16);
  assert.equal(left(checklist, { boards: 8, logs: 4 }).logs, 12);
  assert.equal(left(checklist, { boards: 8, logs: 7 }).logs, 9);
  const logBranches = checklist.branches.filter(branch => branch.key === 'logs');
  const { byBranch } = checklistProgress(checklist, { boards: 10, logs: 7 });
  assert.deepEqual(logBranches.map(branch => byBranch[branch.id]), [0, 9]);
});

test('game checklist keeps batch sizes, the chosen method, and guaranteed output credits', () => {
  const entity = key => ({ key, name: key });
  const craft = (key, target, quantity, ingredients, secondOutput) => ({
    key, kind: 'crafting', name: key, ingredients, seconds: 1,
    outputs: [{ key: target, quantity }, ...(secondOutput ? [secondOutput] : [])]
  });
  const output = (key, quantity) => ({ key, quantity });
  const book = createRecipeBook({
    entities: ['tool', 'boards', 'nails', 'logs', 'ore'].map(entity),
    recipes: [
      craft('tool-method', 'tool', 1, [output('boards', 10), output('nails', 6)]),
      craft('boards-method', 'boards', 3, [output('logs', 2)], output('nails', 1)),
      craft('nails-method', 'nails', 1, [output('ore', 2)])
    ]
  });
  const checklist = createPlanChecklist(planProduction(book, 'tool', 1, { selections: { nails: 'nails-method' } }).tree);
  assert.deepEqual(left(checklist, { boards: 8 }), { tool: 1, boards: 2, logs: 2, nails: 2, ore: 4 });
  const external = createPlanChecklist(planProduction(book, 'tool', 1, { selections: { boards: 'external', nails: 'nails-method' } }).tree);
  assert.deepEqual(left(external, { boards: 8 }), { tool: 1, boards: 2, nails: 6, ore: 12 });
});

test('progress accepts legacy plans and only finite positive recorded amounts', () => {
  assert.deepEqual(normalizePlanProgress(undefined), {});
  assert.deepEqual(normalizePlanProgress({ boards: 8.5, logs: -1, ore: '4', ingots: Infinity, tool: 0 }), { boards: 8.5 });
});

test('an exact rarity checklist shows reference ingredients and retains the exact progress key', () => {
  const targetKey = 'item:1', familyKey = 'family:item:1', otherRarity = 'item:2', ingredientKey = 'item:3';
  const book = createRecipeBook({
    entities: [
      { key: targetKey, name: 'Axe', familyKey }, { key: otherRarity, name: 'Axe', familyKey },
      { key: familyKey, name: 'Axe', type: 'family' }, { key: ingredientKey, name: 'Plank' }
    ],
    recipes: [{
      key: 'crafting:1', kind: 'crafting', name: 'Craft Axe', seconds: 1, planEligible: false, familyEligible: true,
      ingredients: [{ key: ingredientKey, quantity: 2 }], outputs: [],
      possibleOutputs: [{ key: targetKey, quantity: 1 }], familyOutputs: [{ key: familyKey, quantity: 1 }]
    }]
  });
  const data = {
    targetKey, rarityPreference: { key: targetKey, scope: 'exact' },
    inventory: { [targetKey]: 2, [otherRarity]: 20, [ingredientKey]: 1 }, selections: {}
  };
  const plan = planProduction(book, targetKey, 10, data);
  assert.equal(plan.tree.status, 'unsupported');
  const checklist = createRecipeChecklist(book, data, plan.tree);
  assert.equal(checklist.craftReference, true);
  assert.deepEqual(left(checklist, {}), { [targetKey]: 8, [ingredientKey]: 15 });
  assert.deepEqual(left(checklist, { [targetKey]: 3 }), { [targetKey]: 5, [ingredientKey]: 10 });
  assert.equal(checklist.rowsByKey.has(familyKey), false);

  const external = { ...data, selections: { [targetKey]: 'external' } };
  const externalPlan = planProduction(book, targetKey, 10, external);
  assert.deepEqual(left(createRecipeChecklist(book, external, externalPlan.tree), {}), { [targetKey]: 8 });
});

test('completed Emarium covers its wood branches while Elenvar leather still needs buckets', () => {
  const book = createRecipeBook(JSON.parse(readFileSync(new URL('recipe-catalog.json', catalogDirectory))));
  const checklist = createPlanChecklist(planProduction(book, 'family:item:489724302', 100).tree);
  const progress = { 'family:item:1486054968': 100 };
  const { byBranch, remaining } = checklistProgress(checklist, progress);
  for (const [key, quantity] of [['item:1010001', 34], ['cargo:1000', 6]]) {
    const branches = checklist.branches.filter(branch => branch.key === key);
    const open = branches.filter(branch => byBranch[branch.id] > 0);
    assert.ok(branches.length > 1);
    assert.equal(open.length, 1);
    const names = [];
    for (let branch = open[0]; branch; branch = checklist.branches[branch.parent]) names.unshift(branch.name);
    assert.deepEqual(names.slice(0, 6), ['Elenvar Axe', 'Fine Leather', 'Fine Tanned Pelt', 'Fine Tannin', 'Water Bucket', 'Empty Bucket']);
    assert.equal(byBranch[open[0].id], quantity);
    assert.equal(remaining.get(key), quantity);
  }
  assert.equal(remaining.get('item:1201067083'), 0);

  const groups = groupPlanChecklist(checklist, book);
  assert.deepEqual(groups.map(group => group.skills), [
    ['Mining', 'Smithing'], ['Forestry', 'Carpentry'], ['Tailoring', 'Foraging'], ['Leatherworking', 'Hunting'], ['Cooking']
  ]);
  assert.equal(new Set(groups.flatMap(group => group.rows.map(row => row.key))).size, checklist.rowsByKey.size);
  const wood = groups.find(group => group.skills.includes('Forestry'));
  assert.equal(wood.rows.filter(row => row.key === 'item:1010001').length, 1);
  for (const group of groups) {
    const tiers = group.rows.map(row => row.tier ?? Infinity);
    assert.deepEqual(tiers, [...tiers].sort((a, b) => a - b));
  }
  for (const tier of [1, 2, 3, 4]) {
    assert.deepEqual(wood.rows.filter(row => row.tier === tier).slice(0, 4).map(row => row.name.split(' ').at(-1)),
      ['Trunk', 'Log', 'Wood', 'Plank']);
  }
});
