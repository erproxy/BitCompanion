import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRecipeBook } from '../web/recipe-domain.js';
import { getBiomeLocations, isWorldSource } from '../web/biome-domain.js';
import { findWorldEntries, getWorldIndex, normalizeWorldState, worldDefaults } from '../web/world-domain.js';
import { applyRoute, parseRoute, routeForState } from '../web/navigation.js';

const read = async file => JSON.parse(await readFile(new URL(file, import.meta.url), 'utf8'));
const raw = table => read(`../data/bitcraft/raw/static/${table}.json`);
const book = createRecipeBook(await read('../web/data/recipe-catalog.json'));
const index = getWorldIndex(book);
const find = settings => findWorldEntries(index, { ...worldDefaults(settings.mode), ...settings });

test('achievements keep every source condition and resolve prerequisites and collectible rewards', async () => {
  const source = await raw('achievement_desc');
  assert.equal(index.entries.achievements.length, source.length);
  for (const row of source) {
    const entry = index.byMode.achievements.get(row.id);
    assert.equal(entry.name, row.name);
    assert.equal(entry.points, row.points_reward);
    assert.equal(entry.chunks, row.chunks_discovered);
    assert.deepEqual(entry.prerequisites, row.requisites);
    assert.deepEqual(entry.rewards, row.collectible_rewards);
    assert.ok(entry.rewards.every(id => index.collectibles.has(id)));
    assert.ok(entry.prerequisites.every(id => index.unlocks.get(id).includes(entry)));
    assert.ok(entry.discoveries.every(key => book.entitiesByKey.has(key) || book.recipesByKey.has(key)));
  }
  const hunting = index.byMode.achievements.get(7);
  assert.deepEqual(hunting.skill, { id: 9, level: 2 });
  assert.deepEqual(hunting.discoveries, ['item:11020']);
  const landweaver = index.byMode.achievements.get(1930173963);
  assert.equal(landweaver.skill, null);
  assert.deepEqual(landweaver.prerequisites, [38, 138, 58]);
  assert.equal(index.byMode.achievements.get(141819081).chunks, 1440);
});

test('prospecting links the real biome and resource or creature and preserves the phases of item use', async () => {
  const [biomes, searches] = await Promise.all([raw('biome_desc'), raw('prospecting_desc')]);
  assert.equal(book.catalog.world.biomes.length, biomes.length);
  assert.equal(index.entries.biomes.length, biomes.length - 1);
  assert.equal(index.byMode.biomes.has(0), false);
  assert.equal(index.entries.prospecting.length, searches.length);
  for (const row of searches) {
    const entry = index.byMode.prospecting.get(row.id);
    assert.deepEqual(entry.biomes, row.biome_requirements);
    assert.deepEqual(entry.clues, row.bread_crumb_count);
    assert.ok(entry.biomes.every(id => index.searchesByBiome.get(id).includes(entry)));
    assert.ok(entry.targetKeys.length && entry.targetKeys.every(key => book.entitiesByKey.has(key)));
  }
  const lake = index.byMode.prospecting.get(1249466124);
  assert.deepEqual(lake.biomes, [1]);
  assert.deepEqual(lake.targetKeys, ['resource:1352550205']);
  assert.equal(book.entitiesByKey.get(lake.targetKeys[0]).visible, false);
  const swift = index.byMode.prospecting.get(192697986);
  assert.deepEqual(swift.targetKeys, ['enemy:42']);
  const iceChest = index.byMode.prospecting.get(273164973);
  assert.deepEqual(iceChest.itemsToStart, [{ key: 'item:833741484', quantity: 1 }]);
  assert.deepEqual(iceChest.itemsForTarget, iceChest.itemsToStart);
  assert.deepEqual(iceChest.consumedOnStart, []);
});

test('world search handles prerequisites, points, skills, localized biomes and exploration', () => {
  assert.ok(find({ search: 'Apprentice Forester' }).some(row => row.id === 67));
  assert.deepEqual(find({ search: 'Hunter’s First Steps', achievementFilter: '9' }).map(row => row.id), [7]);
  assert.ok(find({ achievementFilter: '11' }).some(row => row.id === 1930173963));
  const exploration = find({ achievementFilter: 'exploration', order: 'points-desc' });
  assert.equal(exploration.length, 11);
  assert.equal(exploration[0].points, 5000);
  assert.ok(exploration.every((row, i) => i === 0 || row.points <= exploration[i - 1].points));
  assert.deepEqual(find({ mode: 'biomes', search: 'спокойный лес' }).map(row => row.id), [1]);
  assert.ok(find({ mode: 'prospecting', search: 'спокойный лес', biomeId: 1 }).some(row => row.id === 1249466124));
  assert.ok(!find({ mode: 'prospecting', search: 'Survey the Lake', biomeId: 2 }).some(row => row.id === 1249466124));
});

test('biomes follow direct spawn and prospecting evidence to the exact collected outputs', () => {
  const locations = getBiomeLocations(book);
  const values = (map, key, kind) => [...map.get(key)[kind]].sort((a, b) => a - b);
  assert.deepEqual(values(locations.origins, 'enemy:9', 'spawn'), [6]);
  assert.deepEqual(values(locations.byEntity, 'item:400827528', 'spawn'), [6]);
  assert.deepEqual(values(locations.byMethod, 'enemy:9', 'spawn'), [6]);
  assert.deepEqual(values(locations.origins, 'enemy:42', 'spawn'), []);
  assert.deepEqual(values(locations.origins, 'enemy:42', 'prospecting'), [2, 5, 14]);
  assert.deepEqual(values(locations.byEntity, 'cargo:3005', 'prospecting'), [2, 13]);
  assert.deepEqual(values(locations.byMethod, 'extraction:1742371572', 'prospecting'), [2, 13]);
  assert.deepEqual(values(locations.byEntity, 'resource:1673056013', 'spawn'), [12]);
  assert.equal(locations.origins.has('resource:65'), false, 'Rich deposit evidence cannot be assigned to a regular vein');
  assert.ok(isWorldSource(book.entitiesByKey.get('resource:65'), locations));
  assert.equal(locations.origins.has('resource:3010009'), false, 'Allowed planting does not establish a wild spawn');
  assert.equal([...locations.byMethod.keys()].some(key => key.startsWith('crafting:') || key.startsWith('conversion:')), false);
  assert.ok([...locations.origins.keys()].every(key => book.entitiesByKey.has(key)));
  assert.ok([...locations.origins.values()].every(location => !location.spawn.has(0) && !location.prospecting.has(0)));
});

test('world routes round-trip only public mode and ID and accept pre-world state', () => {
  assert.deepEqual(normalizeWorldState(undefined), worldDefaults());
  assert.deepEqual(normalizeWorldState({ mode: 'constructor', id: 1 }), worldDefaults());
  const state = { tab: 'guide' };
  applyRoute(state, parseRoute('#/world'));
  assert.equal(routeForState(state), '#/world/achievements');
  applyRoute(state, parseRoute('#/world/achievements/106'));
  state.world.search = 'local search';
  state.world.achievementFilter = '5';
  assert.equal(routeForState(state), '#/world/achievements/106');
  applyRoute(state, parseRoute('#/world/prospecting/1249466124'));
  assert.equal(routeForState(state), '#/world/prospecting/1249466124');
  assert.equal(state.world.search, '');
  assert.equal(state.world.achievementFilter, '');
  for (const route of ['#/world/__proto__', '#/world/biomes/0', '#/world/biomes/1/2',
    '#/world/prospecting/%2D1', '#/world//106', '#/world/achievements/9007199254740992']) {
    assert.equal(parseRoute(route), null, route);
  }
});
