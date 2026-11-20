export const GUIDE_MODES = ['skills', 'knowledge', 'quests'];

export const guideDefaults = () => ({ mode: 'skills', id: 0, level: 0, search: '', page: 0 });

const skillRanges = Array.from({ length: 10 }, (_, i) => {
  const tier = i + 1;
  return { tier, from: i ? tier * 10 : 0, to: (tier + 1) * 10, value: i ? tier * 10 : 1 };
});
const lastSkillLevel = skillRanges.at(-1).to;
const extraSkillRange = { tier: null, from: lastSkillLevel + 1, to: Infinity, value: lastSkillLevel + 1 };

export function skillLevelRange(level) {
  if (level > lastSkillLevel) return extraSkillRange;
  return skillRanges[Math.min(10, Math.max(1, Math.floor(level / 10))) - 1];
}

export function skillProgression(levels, requestedLevel) {
  const entries = [...(levels || [])].sort(([a], [b]) => a - b);
  const level = requestedLevel || entries[0]?.[0] || 1;
  const range = skillLevelRange(level);
  const ranges = entries.at(-1)?.[0] > lastSkillLevel || range === extraSkillRange
    ? [...skillRanges, extraSkillRange] : skillRanges;
  const rows = { recipes: [], tools: [], knowledge: [] };
  for (const [unlockLevel, unlocks] of entries) {
    if (skillLevelRange(unlockLevel) !== range) continue;
    for (const kind of Object.keys(rows)) rows[kind].push(...unlocks[kind].map(entry => ({ ...entry, level: unlockLevel })));
  }
  return { range, ranges, rows };
}

export function normalizeGuideState(raw) {
  const result = guideDefaults();
  if (!raw || !GUIDE_MODES.includes(raw.mode)) return result;
  result.mode = raw.mode;
  if (Number.isSafeInteger(raw.id) && raw.id > 0) {
    result.id = raw.id;
    result.page = -1;
  }
  if (result.mode === 'skills' && Number.isSafeInteger(raw.level) && raw.level > 0 && raw.level <= 10000) {
    result.level = raw.level;
  }
  if (typeof raw.search === 'string') result.search = raw.search.slice(0, 160);
  return result;
}

const indexes = new WeakMap();
const byId = entries => new Map(entries.map(entry => [entry.id, entry]));
const sorted = entries => [...entries].sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);

function append(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

export function getGuideIndex(book) {
  if (indexes.has(book)) return indexes.get(book);
  const {
    skills = [], knowledge = [], quests = [], trades = [], itemDetails = {}, buffs = {}, skillKnowledges = []
  } = book.catalog.guide || {};
  const skillById = byId(skills), knowledgeById = byId(knowledge), questById = byId(quests);
  const tradeGives = new Map(), tradeTakes = new Map(), questRewards = new Map();
  const unlocks = new Map(), knowledgeLevels = new Map(), knowledgeFromItem = new Map();

  for (const entry of knowledge) {
    for (const scroll of entry.scrolls || []) append(knowledgeFromItem, scroll.key, entry);
  }
  for (const trade of trades) {
    for (const key of new Set(trade.gives.map(stack => stack.key))) append(tradeGives, key, trade);
    for (const key of new Set(trade.takes.map(stack => stack.key))) append(tradeTakes, key, trade);
  }
  for (const quest of quests) {
    for (const kind of ['rewards', 'followupRewards', 'stageRewards']) {
      const keys = new Set(quest[kind].filter(entry => entry.kind === 'stack').map(entry => entry.key));
      for (const key of keys) append(questRewards, key, { kind, quest });
    }
  }

  function addUnlock(requirement, kind, entry) {
    const { id, level } = requirement;
    if (!skillById.has(id) || level <= 0) return;
    if (!unlocks.has(id)) unlocks.set(id, new Map());
    const levels = unlocks.get(id);
    if (!levels.has(level)) levels.set(level, { recipes: [], tools: [], knowledge: [] });
    levels.get(level)[kind].push(entry);
  }
  for (const requirement of skillKnowledges) {
    const entry = knowledgeById.get(requirement.knowledgeId);
    if (!entry) continue;
    addUnlock(requirement, 'knowledge', entry);
    append(knowledgeLevels, entry.id, requirement);
  }
  for (const [key, details] of Object.entries(itemDetails)) {
    const entity = book.entitiesByKey.get(key);
    if (details.tools?.length && details.equipment?.skill && entity?.visible && !entity.missing) {
      addUnlock(details.equipment.skill, 'tools', { key, name: entity.name });
    }
  }
  for (const recipe of book.recipesByKey.values()) {
    if (recipe.kind !== 'crafting' && recipe.kind !== 'conversion') continue;
    if (recipe.internalResolver || recipe.recraft || !recipe.requirements?.skills?.length) continue;
    const outputs = [
      ...(recipe.familyEligible ? recipe.familyOutputs || [] : []), ...(recipe.directOutputs || []), ...(recipe.possibleOutputs || [])
    ];
    const target = outputs.find(({ key }) => {
      const entity = book.entitiesByKey.get(key);
      return entity?.visible && !entity.itemListId && !entity.missing;
    });
    if (!target) continue;
    for (const requirement of recipe.requirements.skills) {
      addUnlock(requirement, 'recipes', { recipeKey: recipe.key, key: target.key, name: recipe.name });
    }
  }

  const index = {
    skills: sorted(skills), knowledge: sorted(knowledge), quests: sorted(quests),
    skillById, knowledgeById, questById, tradeGives, tradeTakes, questRewards,
    itemDetails, buffs, unlocks, knowledgeLevels, knowledgeFromItem
  };
  indexes.set(book, index);
  return index;
}
