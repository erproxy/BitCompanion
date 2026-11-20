import { gameSearch, searchable } from './catalog-language.js';
export const DUNGEON_SEARCH_LIMIT = 160;
export const dungeonDefaults = () => ({ id: 0, search: '' });

export function normalizeDungeonState(raw) {
  return {
    id: Number.isSafeInteger(raw?.id) && raw.id > 0 ? raw.id : 0,
    search: typeof raw?.search === 'string' ? raw.search.slice(0, DUNGEON_SEARCH_LIMIT) : ''
  };
}

const indexes = new WeakMap();

export function chestRewardKeys(book, chestKey) {
  const outputs = book.recipesByKey.get(chestKey)?.possibleOutputs || [];
  return [...new Set(outputs.filter(output => !output.unresolved && output.quantity > 0 &&
    output.probabilityPath.every(weight => weight > 0)).map(output => output.key))];
}

export function getDungeonIndex(book) {
  if (indexes.has(book)) return indexes.get(book);
  const dungeons = book.catalog.dungeons || [];
  const byId = new Map(dungeons.map(dungeon => [dungeon.id, dungeon]));
  const rewardSources = new Map();
  for (const dungeon of dungeons) {
    const keys = new Set();
    for (const room of dungeon.rooms) {
      for (const boss of room.bosses) {
        for (const pool of boss.pools) for (const key of pool.rewardKeys) keys.add(key);
      }
      for (const chest of room.chestKeys) for (const key of chestRewardKeys(book, chest)) keys.add(key);
    }
    for (const key of keys) {
      if (!rewardSources.has(key)) rewardSources.set(key, []);
      rewardSources.get(key).push(dungeon);
    }
  }
  const index = { dungeons, byId, rewardSources };
  indexes.set(book, index);
  return index;
}

export function findDungeons(index, search) {
  const terms = searchable(search).trim().split(/\s+/).filter(Boolean);
  return index.dungeons.filter(dungeon => {
    const names = gameSearch(dungeon.title, dungeon.name, ...dungeon.aliases);
    return terms.every(term => names.includes(term));
  });
}
