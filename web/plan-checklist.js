import { getProductionOptions, planProduction, productionBatches, productionGoal } from './recipe-domain.js';

export const isProductionPlan = plan => plan?.type === 'recipeBook' || plan?.type === 'resources';
export const MAX_PLAN_PROGRESS = Number.MAX_SAFE_INTEGER;

export function normalizePlanProgress(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).slice(0, 10000).filter(([key, value]) =>
    key.length > 0 && key.length <= 160 && Number.isFinite(value) && value > 0 && value <= MAX_PLAN_PROGRESS));
}

export function createPlanChecklist(tree) {
  const rowsByKey = new Map();
  const branches = [];
  let nextWorkOrder = 0;
  function visit(node, depth, parent) {
    const { key, name, missing: needed, recipeKey } = node;
    if (!rowsByKey.has(key)) {
      rowsByKey.set(key, { key, name, depth, needed: 0, occurrences: 0 });
    }
    const row = rowsByKey.get(key);
    row.needed += needed;
    row.occurrences++;
    const branch = { id: branches.length, parent, key, name, depth, needed, recipeKey, node, children: [] };
    branches.push(branch);
    branch.children = node.children.filter(child => child.missing > 0).map(child => visit(child, depth + 1, branch.id));
    // Visiting inputs before assigning the order puts them before their outputs
    // when the grouped table sorts items in the same tier.
    row.workOrder ??= nextWorkOrder++;
    return branch;
  }
  const root = visit(tree, 0, null);
  return { root, branches, rowsByKey, rows: [...rowsByKey.values()] };
}

export function createRecipeChecklist(book, data, tree) {
  if (tree.status !== 'unsupported' || tree.key !== data.targetKey) return createPlanChecklist(tree);
  const { familyKey } = productionGoal(book, data.targetKey, data);
  if (!familyKey) return createPlanChecklist(tree);

  // Exact stock already reduced the saved goal. Other rarities of the same
  // item cannot fill it, so exclude the entire family from the reference run.
  const inventory = Object.fromEntries(Object.entries(data.inventory ?? {}).filter(([key]) =>
    key !== familyKey && book.entitiesByKey.get(key)?.familyKey !== familyKey));
  const selections = { ...data.selections };
  const options = getProductionOptions(book, familyKey);
  const method = [selections[tree.key], selections[familyKey]].find(key =>
    options.some(option => option.eligible && option.recipe.key === key));
  if (method) selections[familyKey] = method;
  else delete selections[familyKey];
  const reference = planProduction(book, familyKey, tree.missing, { inventory, selections });
  return { ...createPlanChecklist({ ...reference.tree, key: tree.key, name: tree.name }), craftReference: true };
}

function difference(total, done) {
  const rest = total - done;
  return rest > Number.EPSILON * 8 * total ? rest : 0;
}

export function checklistProgress(checklist, progress = {}) {
  const remaining = new Map(checklist.rows.map(({ key }) => [key, 0]));
  const byBranch = new Array(checklist.branches.length).fill(0);
  const limits = new Map(checklist.rows.map(({ key, needed }) =>
    [key, difference(needed, Object.hasOwn(progress, key) ? progress[key] : 0)]));

  function visit(branch, required) {
    const { key, node, needed } = branch;
    // Completed parent batches already account for their ingredients. Cap the
    // remaining demand at the baseline minus recorded progress, so materials
    // recorded before crafting their parent are counted only once.
    const left = difference(limits.get(key), remaining.get(key));
    const qty = Math.min(needed, required, left);
    byBranch[branch.id] = qty;
    remaining.set(key, remaining.get(key) + qty);
    if (!qty || !branch.children.length) return;
    const batches = Math.min(node.batches, productionBatches(qty, node.produced / node.batches));
    const share = batches / node.batches;
    for (const child of branch.children) visit(child, child.node.required * share);
  }
  visit(checklist.root, checklist.root.node.required);
  return { remaining, byBranch };
}
