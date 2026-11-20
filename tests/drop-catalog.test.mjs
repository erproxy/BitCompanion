import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DROPS } from '../web/domain.js';
import { DROP_ENTITY_KEYS } from '../web/entity-images.js';
import { createRecipeBook } from '../web/recipe-domain.js';
import { DROP_ATTEMPTS, DROP_MODES, dropBrowserDefaults, dropTierOptions, findDropEntry, findDropPage, normalizeDropEntry } from '../web/drop-catalog.js';

const catalog = JSON.parse(await readFile(new URL('../web/data/recipe-catalog.json', import.meta.url), 'utf8'));
const book = createRecipeBook(catalog);
const drop = (source, itemKey) => findDropEntry(book, `${source}/${itemKey}`);

test('game loot covers each source group and only reachable random outcomes for tangible items', () => {
  const ids = new Set();
  const usedGroups = new Set();
  for (const source of catalog.drops.sources) {
    assert.ok(!ids.has(source.id), source.id);
    ids.add(source.id);
    usedGroups.add(source.group);
    assert.ok(Object.hasOwn(DROP_ATTEMPTS, source.attempt));
    if (source.methodKey) {
      const method = book.recipesByKey.get(source.methodKey);
      assert.ok(method && !method.recraft && !method.internalResolver, source.methodKey);
    }
    const outcomes = new Set();
    for (const [key, chance, max, min = 0] of source.outputs) {
      const item = book.entitiesByKey.get(key);
      assert.ok(item && !item.missing && !item.itemListId && ['item', 'cargo'].includes(item.type), key);
      assert.ok(chance > 0 && chance < 1 && Number.isInteger(max) && max > min && min >= 0);
      assert.ok(!outcomes.has(key));
      outcomes.add(key);
    }
  }
  assert.deepEqual([...usedGroups].sort(), Object.keys(DROP_MODES).filter(group => group !== 'presets').sort());
  assert.ok(ids.size > 2000);
});

test('all nine PDF controls agree exactly with the game snapshot, including 1/251', () => {
  for (const preset of DROPS) {
    const entry = drop(preset.methodKey, DROP_ENTITY_KEYS[preset.id]);
    assert.equal(entry.chance, preset.chance, preset.id);
    assert.equal(entry.min, 0);
    assert.equal(entry.max, 1);
    if (preset.tier) assert.equal(entry.sourceTier, preset.tier, preset.id);
  }
});

test('a random bonus uses the guaranteed minimum and combines independent chest rolls', () => {
  const coin = drop('chest:22', 'item:1');
  assert.equal(coin, undefined, 'the fixed 25 coins are not a random drop');
  const coolingEnergy = drop('chest:22', 'item:4000');
  assert.deepEqual([coolingEnergy.chance, coolingEnergy.min, coolingEnergy.max], [0.4375, 0, 2]);
  assert.equal(coolingEnergy.sourceTier, null);
  const pebbles = drop('crafting:103012', 'item:1030001');
  assert.deepEqual([pebbles.chance, pebbles.min, pebbles.max], [0.75, 8, 20]);
});

test('quest bonuses are conditional and boss chances identify their contribution pool and roll unit', () => {
  const shippable = drop('quest-drop:911076962:extraction:64', 'item:1376612754');
  assert.deepEqual([shippable.group, shippable.attempt, shippable.chance], ['quests', 'progress', 0.02]);
  assert.match(shippable.quest[3], /Lost Coin Purses/);
  const boss = drop('contribution:389225043', 'item:1950453713');
  assert.deepEqual([boss.group, boss.contribution, boss.attempt, boss.chance], ['bosses', [90, 129], 'contribution', 0.05]);
  const weighted = drop('quest-drop:877195415:contribution:223086209', 'item:1504964579');
  assert.equal(weighted.attempt, 'contribution-draw');
  assert.equal(weighted.chance, 0.007);
});

test('each criterion filters its own tier and saved loot retains its exact snapshot chance', () => {
  const filters = { ...dropBrowserDefaults('processing'), search: 'Прочный хитин' };
  const { entries, total } = findDropPage(book, { ...filters, sourceTier: '6' });
  assert.equal(total, 1);
  assert.equal(entries[0].originName, 'Peerless Lobster');
  assert.equal(entries[0].chance, 0.01);
  assert.equal(findDropPage(book, { ...filters, sourceTier: '6', itemTier: '6' }).total, 0);
  const withoutTier = findDropPage(book, { ...filters, sourceTier: '6', itemTier: 'none' });
  assert.equal(withoutTier.total, 1);
  assert.ok(dropTierOptions(book, 'processing', 'sourceTier').includes(10));
  const hexite = drop(DROPS.find(entry => entry.id === 'hexite-chitin').methodKey, DROP_ENTITY_KEYS['hexite-chitin']);
  const saved = normalizeDropEntry(JSON.parse(JSON.stringify(hexite)));
  assert.deepEqual(saved, hexite);
  assert.equal(saved.chance, 1 / 251);
  assert.equal(normalizeDropEntry({ ...saved, chance: 100 }), null);
});
