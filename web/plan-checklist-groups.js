import { resourceCategory } from './resource-domain.js';

const gatheringKinds = new Set(['extraction', 'resource-destroy', 'enemy', 'chest', 'growth', 'terraform']);
const relatedProfessions = new Map([
  [3, 2], // Carpentry and Forestry
  [6, 5], // Smithing and Mining
  [9, 8] // Hunting and Leatherworking
]);

function groupByProfession(book, branch, parentGroup) {
  const recipe = book.recipesByKey.get(branch.recipeKey);
  const sources = recipe ? [recipe] : (book.recipesProducing.get(branch.key) ?? [])
    .filter(source => !source.internalResolver && gatheringKinds.has(source.kind));
  const byGroup = new Map();
  for (const source of sources) {
    for (const skill of source.requirements?.skills ?? []) {
      const { id, name } = skill;
      if (!id || !name) continue;
      const textile = id === 14 && (parentGroup === 10 || resourceCategory(book.entitiesByKey.get(branch.key)) === 'textile');
      const group = textile ? 10 : relatedProfessions.get(id) ?? id;
      if (!byGroup.has(group)) byGroup.set(group, new Map());
      byGroup.get(group).set(id, name);
    }
  }
  if (byGroup.size === 1) return byGroup.entries().next().value;
  if (byGroup.has(parentGroup)) return [parentGroup, byGroup.get(parentGroup)];
  // A selected recipe can require multiple professions. Keep those skills together.
  if (recipe && byGroup.size) {
    return [[...byGroup.keys()].sort((a, b) => a - b).join('+'), new Map([...byGroup.values()].flatMap(skills => [...skills]))];
  }
  return [parentGroup];
}

const onlyGroup = groups => groups?.size === 1 ? groups.values().next().value : undefined;

export function groupPlanChecklist(checklist, book) {
  const branchGroups = [];
  const possibilities = new Map();
  const groups = new Map();
  for (const branch of checklist.branches) {
    const parentGroup = branchGroups[branch.parent];
    const [key, skills] = book ? groupByProfession(book, branch, parentGroup) : [
      branch.depth <= 1 ? branch.id : parentGroup
    ];
    branchGroups.push(key);
    if (!possibilities.has(branch.key)) possibilities.set(branch.key, { direct: new Set(), inherited: new Set() });
    const alternatives = possibilities.get(branch.key);
    if (key === undefined) continue;
    if (!groups.has(key)) groups.set(key, {
      key, skills: new Map(), name: !book && branch.depth === 1 ? branch.name : undefined,
      goal: !book && branch.depth === 0, rows: []
    });
    if (skills) for (const [id, name] of skills) groups.get(key).skills.set(id, name);
    (skills ? alternatives.direct : alternatives.inherited).add(key);
  }

  const shared = { key: 'shared', skills: new Map(), rows: [] };
  for (const row of checklist.rows) {
    const { direct, inherited } = possibilities.get(row.key);
    const key = onlyGroup(direct.size ? direct : inherited);
    const tier = book?.entitiesByKey.get(row.key)?.tier;
    (groups.get(key) ?? shared).rows.push({ ...row, tier: tier > 0 ? tier : null });
  }
  return [...groups.values(), shared].filter(group => group.rows.length).map(group => ({
    ...group,
    skills: [...group.skills].sort(([a], [b]) => a - b).map(([, name]) => name),
    rows: group.rows.sort((a, b) => (a.tier ?? Infinity) - (b.tier ?? Infinity) || a.workOrder - b.workOrder)
  }));
}
