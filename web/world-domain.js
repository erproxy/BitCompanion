import { gameSearch, searchable as searchForm } from './catalog-language.js';
export const WORLD_MODES = Object.freeze({
  achievements: 'Достижения', biomes: 'Биомы', prospecting: 'Разведка'
});
export const WORLD_DEFAULT_MODE = 'achievements';
export const WORLD_SEARCH_LIMIT = 160;
export const WORLD_ORDERS = Object.freeze({
  name: 'По названию', 'points-desc': 'Сначала больше очков', 'points-asc': 'Сначала меньше очков'
});

const biomeTitles = {
  'Calm Forest': 'Спокойный лес', 'Pine Woods': 'Сосновый лес', 'Snowy Peaks': 'Снежные вершины',
  'Breezy Grasslands': 'Ветреные луга', 'Autumn Forest': 'Осенний лес', 'Misty Tundra': 'Туманная тундра',
  'Desert Wasteland': 'Пустынные пустоши', Swamp: 'Болото', 'Rocky Garden': 'Каменистый сад',
  'Open Ocean': 'Открытый океан', 'Safe Meadows': 'Безопасные луга', Cave: 'Пещера',
  Jungle: 'Джунгли', Sapwoods: 'Леса сапвуда', 'Deserted Beach': 'Безлюдный пляж',
  'Tropical Canopy': 'Тропический полог', 'Volcanic Crag': 'Вулканические скалы', 'Uncharted Ocean': 'Неизведанный океан'
};
const hazards = { 'Freezing Cold': 'Сильный холод', 'Blazing Heat': 'Палящая жара' };

export const worldDefaults = (mode = WORLD_DEFAULT_MODE) => ({
  mode, id: 0, search: '', page: 0, achievementFilter: '', order: 'name', biomeId: 0
});

const positiveId = value => Number.isSafeInteger(value) && value > 0;

export function normalizeWorldState(raw) {
  if (typeof raw?.mode !== 'string' || !Object.hasOwn(WORLD_MODES, raw.mode)) return worldDefaults();
  const state = worldDefaults(raw.mode);
  if (positiveId(raw.id)) {
    state.id = raw.id;
    state.page = -1;
  }
  if (typeof raw.search === 'string') state.search = raw.search.slice(0, WORLD_SEARCH_LIMIT);
  if (state.mode === 'achievements') {
    const filter = raw.achievementFilter;
    if (filter === 'exploration' || (typeof filter === 'string' && /^[1-9]\d*$/.test(filter) && positiveId(Number(filter)))) {
      state.achievementFilter = filter;
    }
    if (typeof raw.order === 'string' && Object.hasOwn(WORLD_ORDERS, raw.order)) state.order = raw.order;
  }
  if (state.mode === 'prospecting' && positiveId(raw.biomeId)) state.biomeId = raw.biomeId;
  return state;
}

const indexes = new WeakMap();
const byId = entries => new Map(entries.map(entry => [entry.id, entry]));
const byName = (a, b) => a.name.localeCompare(b.name, 'en') || a.id - b.id;
const searchable = gameSearch;
const isExploration = entry => entry.chunks > 0 || entry.chunkPercent > 0;

function append(index, id, value) {
  if (!index.has(id)) index.set(id, []);
  index.get(id).push(value);
}

export function getWorldIndex(book) {
  if (indexes.has(book)) return indexes.get(book);
  const { achievements = [], collectibles = [], biomes = [], prospecting = [] } = book.catalog.world || {};
  const rawAchievements = byId(achievements);
  const skills = byId(book.catalog.guide?.skills || []);
  const skillIds = new Set();
  const unlocks = new Map();
  const searchesByBiome = new Map();
  const referenceName = key => book.entitiesByKey.get(key)?.name || book.recipesByKey.get(key)?.name;

  const entries = {
    achievements: achievements.map(entry => {
      const previous = entry.prerequisites.map(id => rawAchievements.get(id)).filter(Boolean);
      const requiredSkills = [...new Set([entry.skill?.id, ...previous.map(achievement => achievement.skill?.id)].filter(Boolean))];
      requiredSkills.forEach(id => skillIds.add(id));
      return { ...entry, requiredSkills, searchText: searchable(entry.name, entry.description,
        ...previous.map(achievement => achievement.name), ...requiredSkills.map(id => skills.get(id)?.name),
        ...entry.discoveries.map(referenceName), isExploration(entry) && "исследование мира world exploration") };
    }).sort(byName),
    biomes: biomes.filter(entry => !entry.internal).map(entry => {
      const title = biomeTitles[entry.name] || '';
      const hazardLabel = hazards[entry.hazard] || entry.hazard;
      return { ...entry, title, hazardLabel, searchText: searchable(entry.name, title, entry.description, entry.hazard, hazardLabel) };
    }).sort(byName)
  };
  const biomeById = byId(entries.biomes);
  entries.prospecting = prospecting.map(entry => {
    const locations = entry.biomes.map(id => biomeById.get(id)).filter(Boolean);
    const items = [...entry.itemsToStart, ...entry.consumedOnStart, ...entry.itemsForTarget];
    return { ...entry, searchText: searchable(entry.name, entry.description, ...locations.flatMap(biome => [biome.name, biome.title]),
      ...items.map(({ key }) => referenceName(key)), ...entry.targetKeys.map(referenceName)) };
  }).sort(byName);

  for (const entry of entries.achievements) {
    for (const id of entry.prerequisites) append(unlocks, id, entry);
  }
  for (const entry of entries.prospecting) {
    for (const id of entry.biomes) append(searchesByBiome, id, entry);
  }
  const index = {
    entries, byMode: Object.fromEntries(Object.entries(entries).map(([mode, rows]) => [mode, byId(rows)])),
    skills: [...skills.values()].filter(skill => skillIds.has(skill.id)).sort(byName),
    collectibles: byId(collectibles), unlocks, searchesByBiome
  };
  indexes.set(book, index);
  return index;
}

export function findWorldEntries(index, state) {
  const terms = searchForm(state.search).trim().split(/\s+/).filter(Boolean);
  const { mode, achievementFilter, biomeId, order } = state;
  const matches = index.entries[mode].filter(entry => {
    if (mode === 'achievements' && achievementFilter
      && !(achievementFilter === 'exploration' ? isExploration(entry) : entry.requiredSkills.includes(Number(achievementFilter)))) return false;
    if (mode === 'prospecting' && biomeId && !entry.biomes.includes(biomeId)) return false;
    return terms.every(term => entry.searchText.includes(term));
  });
  if (mode === 'achievements' && order !== 'name') {
    const direction = order === 'points-desc' ? -1 : 1;
    matches.sort((a, b) => direction * (a.points - b.points) || byName(a, b));
  }
  return matches;
}
