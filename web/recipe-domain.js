import { t as tr } from './i18n.js';

export const DEFAULT_PRODUCTION_QUANTITY = 1;

export function setProductionTarget(state, target, key = 'targetKey') {
  if (state[key] === target) return;
  state[key] = target;
  state.quantity = DEFAULT_PRODUCTION_QUANTITY;
}
/**
 * Production planning over the dated, local game catalogue.
 * Item, cargo and recipe identifiers deliberately remain separate. Only the
 * adapter's guaranteed outputs (or verified equipment families) are craftable.
 */
const EPSILON = 1e-9;
const MANUFACTURING = new Set(['crafting', 'conversion']);
const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'];

function amount(value, label, minimum = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
    throw new RangeError(tr("{0}: требуется конечное число не меньше {1}.", label, minimum));
  }
  return value;
}

function checked(value) {
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) {
    throw new RangeError(tr("Расчёт слишком велик: уменьшите количество предметов."));
  }
  return value;
}

function append(index, key, value) {
  if (!index.has(key)) index.set(key, []);
  const entries = index.get(key);
  if (!entries.includes(value)) entries.push(value);
}

function aggregate(stacks, normalize = key => key) {
  const result = new Map();
  for (const stack of stacks || []) {
    if (typeof stack?.key !== 'string' || !stack.key) continue;
    const quantity = amount(stack.quantity, tr("Количество {0}", stack.key));
    if (quantity > 0) {
      const key = normalize(stack.key);
      result.set(key, checked((result.get(key) || 0) + quantity));
    }
  }
  return [...result].map(([key, quantity]) => ({ key, quantity }));
}

/** Build reusable indices once after fetching the bundled catalogue. */
export function createRecipeBook(catalog) {
  if (!catalog || !Array.isArray(catalog.entities) || !Array.isArray(catalog.recipes)) {
    throw new TypeError(tr("Каталог должен содержать предметы и рецепты."));
  }
  const entitiesByKey = new Map(), recipesByKey = new Map();
  const recipesProducing = new Map(), recipesConsuming = new Map();
  for (const entity of catalog.entities) {
    if (!entity || typeof entity.key !== 'string' || !entity.key) throw new TypeError(tr("Предмет без ключа."));
    if (entitiesByKey.has(entity.key)) throw new RangeError(tr("Повторяется предмет: {0}", entity.key));
    entitiesByKey.set(entity.key, entity);
  }
  for (const recipe of catalog.recipes) {
    if (!recipe || typeof recipe.key !== 'string' || !recipe.key) throw new TypeError(tr("Рецепт без ключа."));
    if (recipesByKey.has(recipe.key)) throw new RangeError(tr("Повторяется рецепт: {0}", recipe.key));
    recipesByKey.set(recipe.key, recipe);
    for (const stack of [...(recipe.outputs || []), ...(recipe.possibleOutputs || []), ...(recipe.familyOutputs || [])]) {
      if (typeof stack?.key === 'string') append(recipesProducing, stack.key, recipe);
    }
    for (const stack of recipe.ingredients || []) {
      if (typeof stack?.key !== 'string') continue;
      append(recipesConsuming, stack.key, recipe);
      const familyKey = entitiesByKey.get(stack.key)?.familyKey;
      if (familyKey) append(recipesConsuming, familyKey, recipe);
    }
  }
  return { catalog, entitiesByKey, recipesByKey, recipesProducing, recipesConsuming };
}

function isFamily(book, key) {
  return book.entitiesByKey.get(key)?.type === 'family' || key.startsWith('family:');
}

function outputsFor(book, recipe, familyMode) {
  if (familyMode && recipe.familyEligible === true) {
    // familyOutputs are alternatives to exact outputs, never extra free items.
    const familyKeys = new Set((recipe.familyOutputs || []).map(stack => stack.key));
    const exact = (recipe.outputs || []).filter(stack => {
      const entityFamily = book.entitiesByKey.get(stack.key)?.familyKey;
      return !familyKeys.has(entityFamily);
    });
    return aggregate([...exact, ...(recipe.familyOutputs || [])], key => book.entitiesByKey.get(key)?.familyKey || key);
  }
  return aggregate(recipe.outputs || []);
}

/** Guaranteed units per batch for this exact target or verified rarity family. */
export function recipeYield(book, recipe, targetKey) {
  return outputsFor(book, recipe, isFamily(book, targetKey)).find(stack => stack.key === targetKey)?.quantity || 0;
}

function eligibility(book, recipe, targetKey) {
  const family = isFamily(book, targetKey);
  if (!MANUFACTURING.has(recipe.kind)) return { eligible: false, reason: tr("Источник получения; автоматический расчёт добычи не выполняется.") };
  if (/recraft/i.test(recipe.name || '') || recipe.isRecraft) return { eligible: false, reason: tr("Перековка зависит от случайного исхода и имеющегося снаряжения.") };
  if (family ? recipe.familyEligible !== true : recipe.planEligible === false) {
    return { eligible: false, reason: recipe.unsupportedReason || tr("Для этого способа не подтверждён гарантированный выход.") };
  }
  if (!(recipeYield(book, recipe, targetKey) > 0)) return { eligible: false, reason: tr("Желаемый результат зависит от случайного исхода.") };
  for (const ingredient of recipe.ingredients || []) {
    if (ingredient.consumptionChance !== undefined && ingredient.consumptionChance !== 1 && ingredient.quantity > 0) {
      return { eligible: false, reason: tr("Условный расход ингредиентов: точный расчёт не поддерживается.") };
    }
  }
  return { eligible: true, reason: '' };
}

function recipePriority(book, recipe, targetKey) {
  const rarity = Math.max(0, ...(recipe.ingredients || []).map(stack => RARITY_ORDER.indexOf(book.entitiesByKey.get(stack.key)?.rarity)));
  // Packaging is a useful explicit alternative, but making and immediately
  // unpacking a package is not a sensible default acquisition route.
  const recycling = /^(unpack|pack|wrap|unwrap|reclaim|deconstruct|disassemble|salvage|recycle|dismantle)\b/i.test(recipe.name || '') ? 1000 : 0;
  const targetTier = book.entitiesByKey.get(targetKey)?.tier || 0;
  const inputTier = Math.max(0, ...(recipe.ingredients || []).map(stack => book.entitiesByKey.get(stack.key)?.tier || 0));
  const tierPenalty = Math.max(0, inputTier - Math.max(0, targetTier)) * 2000;
  return recycling + tierPenalty + (recipe.kind === 'crafting' ? 0 : 100) + rarity + (recipe.planPriority || 0);
}

/** All source alternatives, with a separate capability flag for the planner. */
export function getProductionOptions(book, targetKey) {
  return [...(book.recipesProducing.get(targetKey) || [])]
    .map(recipe => ({ recipe, output: recipeYield(book, recipe, targetKey), ...eligibility(book, recipe, targetKey) }))
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || recipePriority(book, a.recipe, targetKey) - recipePriority(book, b.recipe, targetKey)
      || ((a.recipe.seconds ?? Infinity) / (a.output || 1) - (b.recipe.seconds ?? Infinity) / (b.output || 1))
      || a.recipe.key.localeCompare(b.recipe.key, 'en', { numeric: true }));
}

/** Keep the catalog card while choosing the guaranteed target of its quantity plan. */
export function productionGoal(book, targetKey, { selections = {}, rarityPreference } = {}) {
  const familyKey = book.entitiesByKey.get(targetKey)?.familyKey;
  const canUseFamily = familyKey && !getProductionOptions(book, targetKey).some(option => option.eligible)
    && getProductionOptions(book, familyKey).some(option => option.eligible);
  if (!canUseFamily) return { key: targetKey, familyKey: null };
  // Older plans with a saved exact source (including external) keep that choice.
  const preference = rarityPreference?.key === targetKey ? rarityPreference.scope : null;
  const exact = preference ? preference === 'exact' : Boolean(selections[targetKey]);
  return { key: exact ? targetKey : familyKey, familyKey };
}

/**
 * Expand the chosen production route. Inventory and all guaranteed by-products
 * share one pool; a unit is consumed at most once. An unavailable or circular
 * branch remains an explicit external requirement instead of being discarded.
 *
 * totalSeconds is null when any manufacturing step has unknown time.
 * knownSeconds is always the sum of known sequential manufacturing times.
 * Gathering, travel and parallel station scheduling are outside this sum.
 */
export function planProduction(book, targetKey, quantity, options = {}) {
  if (!book?.entitiesByKey || !book?.recipesByKey) throw new TypeError(tr("Сначала загрузите каталог рецептов."));
  if (typeof targetKey !== 'string' || !targetKey) throw new TypeError(tr("Не выбран целевой предмет."));
  amount(quantity, tr("Количество"));
  if (quantity > 1e9) throw new RangeError(tr("Количество: максимум 1 000 000 000."));
  const inventory = options.inventory || {}, selections = options.selections || {}, timeOverrides = options.timeOverrides || {};
  if (typeof inventory !== 'object' || Array.isArray(inventory)) throw new TypeError(tr("Запасы должны быть объектом."));
  const familyMode = isFamily(book, targetKey);
  const normalize = key => familyMode ? book.entitiesByKey.get(key)?.familyKey || key : key;
  const label = key => book.entitiesByKey.get(key)?.name || key;
  const original = new Map(), stock = new Map(), originalRemaining = new Map(), used = new Map();
  for (const [key, value] of Object.entries(inventory)) {
    amount(value, tr("Запас «{0}»", label(key)));
    const normalized = normalize(key);
    original.set(normalized, checked((original.get(normalized) || 0) + value));
  }
  for (const [key, value] of original) { stock.set(key, value); originalRemaining.set(key, value); }
  const external = new Set((options.external || []).map(normalize));
  const raw = new Map(), steps = new Map(), issues = [], assumptions = [];
  const issueKeys = new Set();
  let knownSeconds = 0, unknownTime = false, visits = 0;
  const maxNodes = options.maxNodes ?? 10000, maxDepth = options.maxDepth ?? 80;
  if (!Number.isSafeInteger(maxNodes) || maxNodes < 1 || !Number.isSafeInteger(maxDepth) || maxDepth < 1) throw new RangeError(tr("Некорректный предел раскрытия цепочки."));

  if (familyMode) assumptions.push(tr("Цель задана без требования редкости. Используются проверенные равнозначные нормы изготовления вариантов одного предмета и тира."));

  function issue(code, key, message, recipeKey = null) {
    const identity = `${code}:${key}:${recipeKey || ''}`;
    if (!issueKeys.has(identity)) { issues.push({ code, key, name: label(key), recipeKey, message }); issueKeys.add(identity); }
    // An implicitly stopped production branch is not a zero-second recipe.
    // Only an explicit external choice removes its time from the scope.
    unknownTime = true;
  }

  function take(key, required) {
    const available = stock.get(key) || 0;
    const taken = Math.min(available, required);
    stock.set(key, Math.max(0, available - taken));
    const originalTaken = Math.min(taken, originalRemaining.get(key) || 0);
    originalRemaining.set(key, Math.max(0, (originalRemaining.get(key) || 0) - originalTaken));
    used.set(key, checked((used.get(key) || 0) + originalTaken));
    return taken;
  }

  function leaf(node, reason) {
    node.status = reason;
    const previous = raw.get(node.key) || { key: node.key, name: node.name, needed: 0, owned: original.get(node.key) || 0, missing: 0, reason };
    previous.needed = checked(previous.needed + node.required);
    previous.missing = checked(previous.missing + node.missing);
    if (reason !== 'stock') previous.reason = reason;
    raw.set(node.key, previous);
    return node;
  }

  function expand(key, required, path, depth) {
    checked(required);
    const node = { key, name: label(key), required, used: 0, missing: required, recipeKey: null, batches: 0, produced: 0, seconds: 0, status: 'stock', children: [] };
    if (required === 0) return node;
    node.used = take(key, required);
    node.missing = Math.max(0, required - node.used);
    // Tiny decimal subtraction errors must not create an extra batch.
    if (node.missing <= Number.EPSILON * 8 * Math.max(1, required)) node.missing = 0;
    if (node.missing === 0) {
      // Raw materials still contribute to the total requirement when stocks
      // cover this particular branch; another branch may need the same item.
      return getProductionOptions(book, key).some(option => option.eligible) ? node : leaf(node, 'stock');
    }
    if (++visits > maxNodes || depth >= maxDepth) {
      issue('limit', key, tr("Цепочка слишком велика; оставшаяся ветвь показана как внешний ресурс."));
      return leaf(node, 'limit');
    }
    const explicit = selections[key];
    if (external.has(key) || explicit === 'external') return leaf(node, 'external');
    const choices = getProductionOptions(book, key);
    let choice;
    if (explicit) {
      choice = choices.find(option => option.recipe.key === explicit);
      if (!choice?.eligible) {
        issue('selection', key, choice?.reason || tr("Сохранённый способ отсутствует в этой версии каталога."), explicit);
        return leaf(node, 'unsupported');
      }
    } else {
      // A return container or unpacking route must not consume an ancestor
      // that this very branch is currently trying to produce.
      const eligible = choices.filter(option => option.eligible);
      choice = eligible.find(option => !(option.recipe.ingredients || []).some(stack => (normalize(stack.key) === key || path.has(normalize(stack.key))) && stack.quantity > 0)) || eligible[0];
    }
    if (!choice) {
      if (choices.some(option => !MANUFACTURING.has(option.recipe.kind))) return leaf(node, 'gather');
      if (choices.some(option => MANUFACTURING.has(option.recipe.kind))) {
        issue('unsupported', key, tr("Способы изготовления есть, но гарантированный расчёт этого результата не поддерживается."));
        return leaf(node, 'unsupported');
      }
      return leaf(node, choices.length ? 'gather' : 'unknown');
    }
    const recipe = choice.recipe;
    node.recipeKey = recipe.key;
    if (path.has(key)) {
      issue('cycle', key, tr("Обнаружен цикл. Выберите другой способ или отметьте этот предмет как внешний ресурс."), recipe.key);
      return leaf(node, 'cycle');
    }
    const ratio = node.missing / choice.output;
    const tolerance = Math.min(1e-8, Number.EPSILON * 8 * Math.max(1, ratio));
    const batches = Math.max(1, Math.ceil(ratio - tolerance));
    if (!Number.isSafeInteger(batches)) throw new RangeError(tr("Слишком много производственных операций."));
    const ingredients = aggregate(recipe.ingredients || [], normalize);
    const nextPath = new Set(path); nextPath.add(key);
    for (const ingredient of ingredients) node.children.push(expand(ingredient.key, checked(ingredient.quantity * batches), nextPath, depth + 1));
    const outputs = outputsFor(book, recipe, familyMode);
    for (const output of outputs) stock.set(output.key, checked((stock.get(output.key) || 0) + output.quantity * batches));
    const producedForTarget = checked(choice.output * batches);
    // These units were just produced, so cannot count as original inventory.
    stock.set(key, Math.max(0, (stock.get(key) || 0) - node.missing));
    const suppliedTime = Object.hasOwn(timeOverrides, recipe.key) ? amount(timeOverrides[recipe.key], tr("Время «{0}»", recipe.name)) : recipe.seconds;
    const seconds = typeof suppliedTime === 'number' && Number.isFinite(suppliedTime) && suppliedTime >= 0 ? checked(suppliedTime * batches) : null;
    if (recipe.time?.referenceActive && !Object.hasOwn(timeOverrides, recipe.key)) {
      const reference = tr("Время активного крафта рассчитано при скорости ×1, прогрессе 1 за действие и без критов. Фактическая скорость зависит от персонажа и инструмента.");
      if (!assumptions.includes(reference)) assumptions.push(reference);
    }
    if (seconds === null) unknownTime = true;
    else knownSeconds = checked(knownSeconds + seconds);
    node.batches = batches; node.produced = producedForTarget; node.seconds = seconds; node.status = 'craft';
    const previous = steps.get(recipe.key) || { key: recipe.key, recipeKey: recipe.key, targetKey: key, name: recipe.name || label(key), batches: 0, produced: 0, seconds: 0, ingredients: [], outputs: [] };
    previous.batches = checked(previous.batches + batches);
    previous.seconds = previous.seconds === null || seconds === null ? null : checked(previous.seconds + seconds);
    previous.ingredients = aggregate([...previous.ingredients, ...ingredients.map(stack => ({ key: stack.key, quantity: checked(stack.quantity * batches) }))]);
    previous.outputs = aggregate([...previous.outputs, ...outputs.map(stack => ({ key: stack.key, quantity: checked(stack.quantity * batches) }))]);
    // A multi-output operation can be reached through different branches.
    // Keep the displayed production count tied to the first target's unit.
    previous.produced = previous.outputs.find(output => output.key === previous.targetKey)?.quantity || 0;
    steps.set(recipe.key, previous);
    return node;
  }

  const tree = expand(targetKey, quantity, new Set(), 0);
  return {
    targetKey, quantity, tree, materials: [...raw.values()], steps: [...steps.values()],
    totalSeconds: unknownTime ? null : knownSeconds, knownSeconds, unknownTime,
    issues, assumptions, complete: issues.length === 0,
    stockUsed: [...used].filter(([, value]) => value > EPSILON).map(([key, value]) => ({ key, name: label(key), amount: value })),
    surplus: Object.fromEntries([...stock].filter(([, value]) => value > EPSILON))
  };
}
