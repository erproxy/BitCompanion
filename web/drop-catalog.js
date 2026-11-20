import { gameSearch, searchable } from './catalog-language.js';
import { DATA_SNAPSHOT, DROPS } from './domain.js';
import { DROP_ENTITY_KEYS } from './entity-images.js';

export const DROP_MODES = Object.freeze({
  presets: 'Пресеты',
  gather: 'Сбор и рыбалка',
  creatures: 'Существа',
  containers: 'Сундуки',
  processing: 'Обработка',
  crafting: 'Крафт',
  bosses: 'Боссы',
  quests: 'Квесты'
});

export const DROP_ATTEMPTS = Object.freeze({
  progress: 'Одна единица прогресса при добыче',
  deplete: 'Одна завершающая выдача при истощении источника',
  terraform: 'Одна единица работы по изменению рельефа',
  kill: 'Одна выдача добычи за убитое существо',
  chest: 'Содержимое одного сундука',
  operation: 'Одна операция по рецепту',
  contribution: 'Одна выдача награды за бой при указанном вкладе',
  'contribution-draw': 'Один розыгрыш из пула наград за вклад',
  'quest-reward': 'Одна выдача награды за завершение квеста'
});

export const DROP_SEARCH_LIMIT = 100;
const pageSize = 8;
const caches = new WeakMap();
const order = new Intl.Collator('en');
const aliases = new Map(DROPS.map(entry => [DROP_ENTITY_KEYS[entry.id], entry.name.replace(/ · T\d+$/, '')]));
const presetBySource = new Map(DROPS.map(entry => [`${entry.methodKey}/${DROP_ENTITY_KEYS[entry.id]}`, entry]));
const validTier = n => Number.isInteger(n) && n > 0 && n <= 100 ? n : null;
const itemKeyPattern = /^(?:item|cargo):-?\d+$/;
const sourceKeyPattern = /^(?:item|cargo|resource|enemy|chest):-?\d+$/;
const amount = n => Number.isSafeInteger(n) && n >= 0;
const string = (value, length = 220) => typeof value === 'string' ? value.slice(0, length) : '';

export const dropBrowserDefaults = (mode = 'presets') => ({ mode, search: '', sourceTier: '', itemTier: '', page: 0 });

export function normalizeDropBrowser(raw) {
  const filter = value => value === 'none' ? value : String(validTier(Number(value)) ?? '');
  return {
    mode: Object.hasOwn(DROP_MODES, raw?.mode) ? raw.mode : 'presets',
    search: string(raw?.search, DROP_SEARCH_LIMIT), sourceTier: filter(raw?.sourceTier), itemTier: filter(raw?.itemTier),
    page: Number.isInteger(raw?.page) && raw.page >= -1 && raw.page < 1e6 ? raw.page : 0
  };
}

// A plan keeps the chance and its unit from the day it was saved. It can be
// restored before the catalog loads or after the bundled snapshot changes.
export function normalizeDropEntry(raw) {
  if (!raw || typeof raw.id !== 'string' || !/^[\w:/-]{1,110}$/.test(raw.id) || !Object.hasOwn(DROP_MODES, raw.group) || raw.group === 'presets'
    || !itemKeyPattern.test(raw.itemKey) || typeof raw.name !== 'string' || !raw.name
    || !Object.hasOwn(DROP_ATTEMPTS, raw.attempt) || !(raw.chance > 0 && raw.chance < 1 && typeof raw.chance === 'number')
    || !amount(raw.min) || !amount(raw.max) || raw.max <= raw.min) return null;
  const contribution = Array.isArray(raw.contribution) && amount(raw.contribution[0])
    && (raw.contribution[1] === null || (amount(raw.contribution[1]) && raw.contribution[1] >= raw.contribution[0]))
    ? raw.contribution.slice(0, 2) : null;
  const quest = Array.isArray(raw.quest) && amount(raw.quest[0]) && amount(raw.quest[2])
    ? [raw.quest[0], string(raw.quest[1]), raw.quest[2], string(raw.quest[3])] : null;
  return {
    id: raw.id, group: raw.group, itemKey: raw.itemKey, name: string(raw.name), english: string(raw.english), rarity: string(raw.rarity, 20),
    itemTier: validTier(raw.itemTier), sourceTier: validTier(raw.sourceTier), sourceName: string(raw.sourceName),
    originKey: sourceKeyPattern.test(raw.originKey) ? raw.originKey : '', originName: string(raw.originName), station: string(raw.station),
    methodKey: /^[\w-]+:-?\d+$/.test(raw.methodKey) ? raw.methodKey : '', attempt: raw.attempt, contribution, quest,
    chance: raw.chance, min: raw.min, max: raw.max, snapshot: /^\d{4}-\d{2}-\d{2}$/.test(raw.snapshot) ? raw.snapshot : DATA_SNAPSHOT
  };
}

function catalogIndex(book) {
  if (caches.has(book)) return caches.get(book);
  const groups = Object.fromEntries(Object.keys(DROP_MODES).map(mode => [mode, []]));
  const byId = new Map();
  for (const source of book.catalog.drops?.sources ?? []) {
    const origin = book.entitiesByKey.get(source.originKey);
    const method = book.recipesByKey.get(source.methodKey);
    for (const [itemKey, chance, max, min = 0] of source.outputs) {
      const item = book.entitiesByKey.get(itemKey);
      const id = `${source.id}/${itemKey}`;
      const preset = presetBySource.get(id);
      const entry = {
        id, group: source.group, itemKey, name: aliases.get(itemKey) ?? item.name, english: item.name, rarity: item.rarity?.toLowerCase() ?? '',
        itemTier: validTier(item.tier), sourceTier: validTier(source.tier), sourceName: source.name, originKey: origin?.key ?? '',
        originName: origin?.name ?? '', station: method?.requirements.station?.name ?? '', methodKey: source.methodKey ?? '', attempt: source.attempt,
        contribution: source.contribution ?? null, quest: source.quest ?? null, chance, min, max,
        snapshot: book.catalog.source?.committedAt?.slice(0, 10) ?? DATA_SNAPSHOT
      };
      const search = gameSearch(entry.name, entry.english, entry.sourceName, entry.originName, entry.station, item.tag,
        ...(entry.quest ?? []), preset?.unit, itemKey, id);
      groups[source.group].push({ entry, search });
      byId.set(id, entry);
    }
  }
  for (const group of Object.values(groups)) group.sort(({ entry: a }, { entry: b }) => (a.sourceTier ?? 101) - (b.sourceTier ?? 101)
    || (a.itemTier ?? 101) - (b.itemTier ?? 101) || order.compare(a.english, b.english) || order.compare(a.sourceName, b.sourceName)
    || order.compare(a.id, b.id));
  const index = { groups, byId };
  caches.set(book, index);
  return index;
}

export function findDropEntry(book, id) {
  return book && catalogIndex(book).byId.get(id);
}

export function dropTierOptions(book, mode, key) {
  const tiers = new Set(catalogIndex(book).groups[mode].map(({ entry }) => entry[key]));
  return [...tiers].sort((a, b) => (a ?? Infinity) - (b ?? Infinity));
}

export function findDropPage(book, { mode, search, itemTier, sourceTier, page }, selected) {
  const terms = searchable(search).trim().split(/\s+/).filter(Boolean);
  const tierMatches = (filter, tier) => !filter || filter === (tier == null ? 'none' : String(tier));
  const matches = catalogIndex(book).groups[mode].filter(row => tierMatches(itemTier, row.entry.itemTier)
    && tierMatches(sourceTier, row.entry.sourceTier) && terms.every(term => row.search.includes(term)));
  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  const requested = page < 0 ? Math.floor(matches.findIndex(({ entry }) => entry.id === selected) / pageSize) : page;
  const current = Math.min(Math.max(0, requested), pages - 1);
  return { total: matches.length, page: current, pages, entries: matches.slice(current * pageSize, (current + 1) * pageSize).map(row => row.entry) };
}
