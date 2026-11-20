import test from 'node:test';
import { catalogDirectory } from './catalog-fixture.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRecipeBook } from '../web/recipe-domain.js';
import { getDungeonIndex, findDungeons, normalizeDungeonState } from '../web/dungeon-domain.js';

const book = createRecipeBook(JSON.parse(await readFile(new URL('recipe-catalog.json', catalogDirectory), 'utf8')));
const index = getDungeonIndex(book);

test('dungeon networks retain directed room connections and resolve bosses through the game enum', () => {
  const expected = [
    [208697589, [69, 70, 74, 72, 73, 71, 68], 'enemy:32', 101794940, 120, 300],
    [853770752, [81, 85926629], 'enemy:59', 1206414961, 120, 300],
    [1084069097, [77, 76], 'enemy:40', 455850385, 120, 300],
    [1785852446, [75], 'enemy:36', 1346914781, 60, 180]
  ];
  assert.equal(index.dungeons.length, expected.length);
  for (const [id, roomIds, bossKey, spawnId, collapseSeconds, respawnSeconds] of expected) {
    const dungeon = index.byId.get(id);
    assert.equal(book.entitiesByKey.get(dungeon.buildingKey).visible, false);
    assert.deepEqual(dungeon.rooms.map(room => room.id), roomIds);
    assert.equal(dungeon.passages.find(passage => passage.from === 0).to, roomIds[0]);
    for (const { from, to } of dungeon.passages) {
      assert.ok(from === 0 || roomIds.includes(from));
      assert.ok(to === 0 || roomIds.includes(to));
    }
    const [boss] = dungeon.rooms.at(-1).bosses;
    assert.equal(boss.key, bossKey);
    assert.equal(boss.spawnId, spawnId);
    assert.equal(dungeon.collapseSeconds, collapseSeconds);
    assert.equal(dungeon.respawnSeconds, respawnSeconds);
  }
  const outpost = index.byId.get(853770752);
  assert.ok(outpost.passages.some(passage => passage.from === 81 && passage.to === 85926629 && passage.enemyLock));
  assert.ok(outpost.rooms[0].conditions.some(condition => condition.all && condition.required.filter(name => name === 'Unlit Torch').length === 4));
});

test('contribution reward links use tangible items and keep the thresholds source-specific', () => {
  const [boss] = index.byId.get(1084069097).rooms.at(-1).bosses;
  assert.deepEqual(boss.pools.map(pool => pool.minimum), [0, 20, 30, 40]);
  assert.ok(boss.pools.some(pool => pool.rewardKeys.includes('item:770032196')), 'Araknir pet is reached through a nested list');
  assert.deepEqual(index.rewardSources.get('item:770032196').map(dungeon => dungeon.id), [1084069097]);
  for (const [key, sources] of index.rewardSources) {
    const entity = book.entitiesByKey.get(key);
    assert.ok(entity && !entity.missing && !entity.itemListId, key);
    assert.equal(new Set(sources).size, sources.length, key);
  }
});

test('dungeon search accepts Russian spelling and previous English names', () => {
  for (const query of ['  арсенал ЗВЕЗД ', 'sentinel dungeon']) {
    assert.deepEqual(findDungeons(index, query).map(dungeon => dungeon.id), [208697589]);
  }
  assert.deepEqual(findDungeons(index, 'Araknir Dungeon').map(dungeon => dungeon.id), [1084069097]);
  assert.deepEqual(findDungeons(index, 'нет такого совпадения'), []);
  assert.deepEqual(normalizeDungeonState(undefined), { id: 0, search: '' });
  assert.deepEqual(normalizeDungeonState({ id: '123', search: 0 }), { id: 0, search: '' });
  assert.equal(normalizeDungeonState({ id: 123, search: 'a'.repeat(200) }).search.length, 160);
});
