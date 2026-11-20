import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RARITIES, DROPS, probabilityAtLeast, attemptsForConfidence,
  expectedAttempts, rarityDistribution, planResources
} from '../web/domain.js';

const close = (actual, expected, epsilon = 1e-10) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);

test('reference PDF single-step attempts and Mythic example', () => {
  const expected95 = [9, 19, 39, 79, 159];
  const expected50 = [2, 5, 9, 19, 37];
  RARITIES.slice(1).forEach((rarity, i) => {
    assert.equal(attemptsForConfidence(rarity.chance, 1, 0.95), expected95[i]);
    assert.equal(attemptsForConfidence(rarity.chance, 1, 0.5), expected50[i]);
  });
  close(probabilityAtLeast(0.01875, 100) * 100, 84.94, 0.005);
  close(expectedAttempts(0.01875), 53.333333333333336);
});

test('reference PDF rarity chain preserves mass and tiny Mythic probabilities', () => {
  for (let tier = 1; tier <= 10; tier++) close(rarityDistribution(0, 1, tier).reduce((a, b) => a + b), 1);
  const t6 = rarityDistribution(0, 1, 6);
  close(t6[5] * 100, 0.0002373046875, 1e-12);
  close(rarityDistribution(0, 1, 10)[5] * 100, 0.020109, 0.000001);
  close(rarityDistribution(5, 6, 10)[5], 1);
  assert.throws(() => rarityDistribution(5, 1, 10), RangeError);
});

test('all drop presets and exact compound probabilities are transcribed', () => {
  assert.equal(DROPS.length, 9);
  assert.equal(DROPS.find(drop => drop.id === 'hexite-chitin').chance, 1 / 251);
  assert.equal(DROPS.find(drop => drop.id === 'ancient-connector').chance, 0.015);
  assert.equal(DROPS.find(drop => drop.id === 'trask-scale').chance, 0.03);
});

test('multiple required drops use a binomial tail, not repeated single-drop chance', () => {
  close(probabilityAtLeast(0.5, 3, 2), 0.5);
  close(probabilityAtLeast(0.1, 10, 2), 1 - 0.9 ** 10 - 10 * 0.1 * 0.9 ** 9);
  assert.equal(attemptsForConfidence(0.5, 2, 0.5), 3);
  for (const [p, k, confidence] of [[0.02, 3, 0.95], [0.8, 20, 0.9], [0.002, 5, 0.5]]) {
    const n = attemptsForConfidence(p, k, confidence);
    assert.ok(probabilityAtLeast(p, n, k) >= confidence);
    assert.ok(probabilityAtLeast(p, n - 1, k) < confidence);
  }
  close(expectedAttempts(0.02, 3), 150);
});

test('probability boundaries, impossible goals and input validation', () => {
  assert.equal(probabilityAtLeast(0, 10), 0);
  assert.equal(probabilityAtLeast(1, 10, 10), 1);
  assert.equal(probabilityAtLeast(0.3, 0), 0);
  assert.equal(probabilityAtLeast(0, 0, 0), 1);
  assert.equal(probabilityAtLeast(0.3, 5, 6), 0);
  assert.equal(attemptsForConfidence(0, 1, 0.95), Infinity);
  assert.equal(attemptsForConfidence(0.3, 1, 1), Infinity);
  assert.equal(attemptsForConfidence(1, 5, 1), 5);
  assert.equal(attemptsForConfidence(0, 0, 1), 0);
  assert.equal(expectedAttempts(0), Infinity);
  assert.equal(expectedAttempts(0, 0), 0);
  for (const action of [() => probabilityAtLeast(-0.1, 4), () => probabilityAtLeast(0.1, 1.5), () => probabilityAtLeast(0.1, -1), () => expectedAttempts(NaN), () => attemptsForConfidence(0.1, -1, 0.95)]) assert.throws(action, RangeError);
});

test('very small probabilities retain precision for multiple-drop goals', () => {
  // Poisson(1) limit: a trillion trials at p=1e-12.
  close(probabilityAtLeast(1e-12, 1e12, 2), 1 - 2 / Math.E, 1e-11);
  const n = attemptsForConfidence(1e-12, 2, 0.95);
  // The limiting 95th percentile of Gamma(shape=2, rate=1) is 4.743864518...
  close(n / 1e12, 4.743864518390577, 1e-10);
  assert.ok(probabilityAtLeast(1e-12, n, 2) >= 0.95);
  assert.ok(probabilityAtLeast(1e-12, n - 1, 2) < 0.95);
});

const recipes = [
  { id: 'tool', name: 'Инструмент', output: 1, seconds: 20, ingredients: [{ id: 'handle', name: 'Рукоять', amount: 1 }, { id: 'head', name: 'Наконечник', amount: 1 }] },
  { id: 'handle', name: 'Рукоять', output: 1, seconds: 5, ingredients: [{ id: 'plank', name: 'Доска', amount: 1 }] },
  { id: 'head', name: 'Наконечник', output: 1, seconds: 10, ingredients: [{ id: 'plank', name: 'Доска', amount: 1 }, { id: 'stone', name: 'Камень', amount: 2 }] },
  { id: 'plank', name: 'Доска', output: 2, seconds: 8, ingredients: [{ id: 'wood', name: 'Дерево', amount: 3 }] }
];

test('nested recipes reuse batch surplus and aggregate shared raw stock once', () => {
  const result = planResources(recipes, 'tool', 2, { wood: 4, stone: 1 });
  assert.deepEqual(result.materials.map(({ id, needed, owned, missing }) => ({ id, needed, owned, missing })), [
    { id: 'wood', needed: 6, owned: 4, missing: 2 },
    { id: 'stone', needed: 4, owned: 1, missing: 3 }
  ]);
  assert.equal(result.steps.find(step => step.id === 'plank').batches, 2);
  assert.equal(result.batches, 2);
  assert.equal(result.produced, 2);
  assert.equal(result.totalSeconds, 86);
  assert.equal(planResources(recipes, 'tool', 1).steps.find(step => step.id === 'plank').batches, 1);
});

test('existing intermediate and target stock reduce the crafting tree', () => {
  const result = planResources(recipes, 'tool', 2, { tool: 1, handle: 1, plank: 1, stone: 2 });
  assert.equal(result.batches, 1);
  assert.equal(result.totalSeconds, 30);
  assert.deepEqual(result.materials, [{ id: 'stone', name: 'Камень', needed: 2, owned: 2, missing: 0 }]);
  assert.equal(planResources(recipes, 'tool', 0).totalSeconds, 0);
});

test('batch leftovers are tracked and cycles are reported before consuming stock', () => {
  const result = planResources(recipes, 'plank', 3, { wood: 20 });
  assert.equal(result.batches, 2);
  assert.equal(result.surplus.plank, 1);
  assert.equal(result.surplus.wood, 14);
  const cycle = [{ id: 'a', name: 'A', output: 1, seconds: 1, ingredients: [{ id: 'b', name: 'B', amount: 1 }] }, { id: 'b', name: 'B', output: 1, seconds: 1, ingredients: [{ id: 'a', name: 'A', amount: 1 }] }];
  assert.throws(() => planResources(cycle, 'a', 1, { a: 2 }), /Циклический/);
  assert.throws(() => planResources(recipes, 'missing', 1), RangeError);
  assert.throws(() => planResources(recipes, 'tool', -1), RangeError);
});

test('fractional amounts round batch count without dropping tiny requirements', () => {
  const decimal = [{ id: 'item', name: 'Предмет', output: 0.1, seconds: 1, ingredients: [{ id: 'raw', name: 'Сырьё', amount: 1 }] }];
  assert.equal(planResources(decimal, 'item', 0.1 + 0.2).batches, 3);
  assert.equal(planResources(decimal, 'item', 1e-20).batches, 1);
});
