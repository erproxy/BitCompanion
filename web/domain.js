import { t as tr } from './i18n.js';
/**
 * BitCraft Fieldbook calculation core.
 * Presets are a dated transcription of the user's reference PDF (13 Nov 2026),
 * not a promise about the current live server configuration.
 */
export const DATA_SNAPSHOT = '2026-11-13';

export const RARITIES = Object.freeze([
  { id: 'common', name: 'Обычная', en: 'Common', color: '#969d8c', chance: 0, minTier: 1 },
  { id: 'uncommon', name: 'Необычная', en: 'Uncommon', color: '#78a96c', chance: 0.3, minTier: 2 },
  { id: 'rare', name: 'Редкая', en: 'Rare', color: '#6e9cc0', chance: 0.15, minTier: 3 },
  { id: 'epic', name: 'Эпическая', en: 'Epic', color: '#aa87bd', chance: 0.075, minTier: 4 },
  { id: 'legendary', name: 'Легендарная', en: 'Legendary', color: '#d4a35c', chance: 0.0375, minTier: 5 },
  { id: 'mythic', name: 'Мифическая', en: 'Mythic', color: '#cd7b76', chance: 0.01875, minTier: 6 }
].map(Object.freeze));

export const DROPS = Object.freeze([
  { id: 'rangifer-antler', methodKey: 'enemy:9', name: 'Рог рангифера', en: 'Rangifer Antler', rarity: 'rare', tier: null, chance: 0.02, unit: 'Убить одного рангифера (Rangifer)', sourceNote: 'Одна выдача дропа с врага.' },
  { id: 'preserved-mushroom', methodKey: 'crafting:1864254862', name: 'Сохранившийся гриб', en: 'Preserved Mushroom', rarity: 'legendary', tier: 1, chance: 0.002, unit: 'Опознать один неопознанный базовый гриб (Unidentified Basic Mushroom), T1', sourceNote: 'Шанс за опознание одного гриба.' },
  { id: 'berserker-mushroom', methodKey: 'crafting:1341859690', name: 'Гриб берсерка', en: 'Berserker Mushroom', rarity: 'epic', tier: 2, chance: 0.02, unit: 'Опознать один неопознанный простой гриб (Unidentified Simple Mushroom), T2', sourceNote: 'Шанс за опознание одного гриба.' },
  { id: 'trask-scale', methodKey: 'crafting:462392278', name: 'Огромная чешуя', en: 'Enormous Trask Scale', rarity: 'legendary', tier: 1, chance: 0.03, unit: 'Разделать одного огромного траска (Enormous Trask), T1, на рыболовной станции (Fishing Station)', sourceNote: 'За разделку уже пойманной рыбы; время поимки добавьте отдельно.' },
  { id: 'lobster-chitin-t4', methodKey: 'conversion:271741003', name: 'Прочный хитин · T4', en: 'Hardened Lobster Chitin', rarity: 'epic', tier: 4, chance: 0.005, unit: 'Разделать одного качественного лобстера (Fine Lobster), T4', sourceNote: 'Для непревзойдённого лобстера (Peerless Lobster), T6, есть отдельный пресет.' },
  { id: 'lobster-chitin-t6', methodKey: 'conversion:1745794600', name: 'Прочный хитин · T6', en: 'Hardened Lobster Chitin', rarity: 'epic', tier: 6, chance: 0.01, unit: 'Разделать одного непревзойдённого лобстера (Peerless Lobster), T6', sourceNote: 'Шанс зависит от исходного лобстера.' },
  { id: 'hexite-chitin', methodKey: 'conversion:546548972', name: 'Хитин с хекситом', en: 'Hexite Infused Lobster Chitin', rarity: 'mythic', tier: 10, chance: 1 / 251, unit: 'Разделать одного безупречного лобстера (Flawless Lobster), T10', sourceNote: 'Точное значение 1 / 251; примерно 0,3984%.' },
  { id: 'coralith', methodKey: 'crafting:1004595492', name: 'Коралит', en: 'Coralith', rarity: 'legendary', tier: 7, chance: 0.005, unit: 'Обработать одну украшенную жеоду (Ornate Geode), T7, на станции каменщика (Masonry Station)', sourceNote: 'Подтверждено именно для геоды T7.' },
  { id: 'ancient-connector', methodKey: 'chest:22', name: 'Древний соединитель', en: 'Damaged Ancient Connector', rarity: 'mythic', tier: null, chance: 0.015, unit: 'Открыть один украшенный пустынный сундук (Ornate Desert Chest)', sourceNote: 'Совместный шанс: 30% × 5% = 1,5%.' }
].map(Object.freeze));

function finite(value, name, min = 0, max = Infinity) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(tr("{0}: требуется число от {1} до {2}", name, min, max));
  }
  return value;
}

function integer(value, name, min = 0, max = Number.MAX_SAFE_INTEGER) {
  finite(value, name, min, max);
  if (!Number.isSafeInteger(value)) throw new RangeError(tr("{0}: требуется целое число", name));
  return value;
}

// Lanczos log-gamma + a continued fraction avoid underflow from summing tiny
// binomial terms when the target contains more than one successful drop.
function logGamma(z) {
  const c = [676.5203681218851, -1259.1392167224028, 771.3234287776531,
    -176.6150291621406, 12.507343278686905, -0.13857109526572012,
    9.984369578019572e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < c.length; i++) x += c[i] / (z + i + 1);
  const t = z + c.length - 0.5;
  return 0.9189385332046727 + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function betaFraction(a, b, x) {
  const tiny = 1e-300;
  const safe = value => Math.abs(value) < tiny ? tiny : value;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 / safe(1 - qab * x / qap), h = d;
  for (let m = 1; m <= 2000; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 / safe(1 + aa * d);
    c = safe(1 + aa / c);
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 / safe(1 + aa * d);
    c = safe(1 + aa / c);
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 3e-14) return h;
  }
  throw new RangeError(tr("Расчёт вероятности не сошёлся: уменьшите число попыток или цель."));
}

function regularizedBeta(x, a, b) {
  const small = Math.min(a, b), large = Math.max(a, b);
  let logCoefficient;
  if (Number.isInteger(small) && small <= 2048) {
    // Subtracting logGamma(1e15 + 2) - logGamma(1e15) loses several
    // significant digits. For small integer drop targets use the exact ratio.
    logCoefficient = -logGamma(small);
    for (let i = 0; i < small; i++) logCoefficient += Math.log(large + i);
  } else {
    logCoefficient = logGamma(a + b) - logGamma(a) - logGamma(b);
  }
  const logFront = logCoefficient + a * Math.log(x) + b * Math.log1p(-x);
  const front = Math.exp(logFront);
  const value = x < (a + 1) / (a + b + 2)
    ? front * betaFraction(a, b, x) / a
    : 1 - front * betaFraction(b, a, 1 - x) / b;
  return Math.max(0, Math.min(1, value));
}

/** P(at least k successes after n independent attempts), p expressed as a fraction. */
export function probabilityAtLeast(p, n, k = 1) {
  finite(p, tr("Шанс"), 0, 1);
  integer(n, tr("Попытки"));
  integer(k, tr("Цель"));
  if (k === 0) return 1;
  if (k > n || n === 0 || p === 0) return 0;
  if (p === 1) return 1;
  if (k === 1) return -Math.expm1(n * Math.log1p(-p));
  if (k === n) return Math.exp(n * Math.log(p));
  if (k <= 2048 && n * p >= k) {
    // Sum the lower tail in log space. This also avoids forming 1-p inside
    // beta symmetry when p is so small that subtraction loses precision.
    let term = n * Math.log1p(-p);
    let sum = term;
    const logOdds = Math.log(p) - Math.log1p(-p);
    for (let j = 1; j < k; j++) {
      term += Math.log(n - j + 1) - Math.log(j) + logOdds;
      const larger = Math.max(sum, term), smaller = Math.min(sum, term);
      sum = larger + Math.log1p(Math.exp(smaller - larger));
    }
    return Math.max(0, Math.min(1, -Math.expm1(Math.min(0, sum))));
  }
  return regularizedBeta(p, k, n - k + 1);
}

/** Minimum integer attempts for P(X >= k) >= confidence; Infinity if impossible. */
export function attemptsForConfidence(p, k = 1, confidence = 0.95) {
  finite(p, tr("Шанс"), 0, 1);
  integer(k, tr("Цель"));
  finite(confidence, tr("Уверенность"), 0, 1);
  if (confidence === 0 || k === 0) return 0;
  if (p === 0) return Infinity;
  if (p === 1) return k;
  if (confidence === 1) return Infinity;
  // Exact stable inversion for the overwhelmingly common single-drop case.
  if (k === 1) {
    let n = Math.ceil(Math.log1p(-confidence) / Math.log1p(-p));
    if (!Number.isSafeInteger(n)) return Infinity;
    while (n > 0 && probabilityAtLeast(p, n - 1, k) >= confidence) n--;
    while (probabilityAtLeast(p, n, k) < confidence) n++;
    return Number.isSafeInteger(n) ? n : Infinity;
  }
  let low = k - 1;
  let high = Math.min(Number.MAX_SAFE_INTEGER, Math.max(k, Math.ceil(k / p)));
  while (probabilityAtLeast(p, high, k) < confidence) {
    low = high;
    if (high === Number.MAX_SAFE_INTEGER) return Infinity;
    high = Math.min(Number.MAX_SAFE_INTEGER, high * 2);
  }
  while (high - low > 1) {
    const middle = low + Math.floor((high - low) / 2);
    if (probabilityAtLeast(p, middle, k) >= confidence) high = middle;
    else low = middle;
  }
  return high;
}

/** Negative-binomial expectation: attempts needed to obtain k independent successes. */
export function expectedAttempts(p, k = 1) {
  finite(p, tr("Шанс"), 0, 1);
  integer(k, tr("Цель"));
  return k === 0 ? 0 : p === 0 ? Infinity : k / p;
}

/** Exact rarity distribution after one upgrade per tier, no additional recrafts. */
export function rarityDistribution(startRarityIndex, startTier, targetTier) {
  integer(startRarityIndex, tr("Редкость"), 0, RARITIES.length - 1);
  integer(startTier, tr("Начальный тир"), 1, 10);
  integer(targetTier, tr("Конечный тир"), startTier, 10);
  if (RARITIES[startRarityIndex].minTier > startTier) {
    throw new RangeError(tr("Эта редкость недоступна на начальном тире стандартной цепочки снаряжения."));
  }
  let distribution = RARITIES.map((_, i) => i === startRarityIndex ? 1 : 0);
  for (let tier = startTier + 1; tier <= targetTier; tier++) {
    const next = Array(6).fill(0);
    for (let i = 0; i < distribution.length; i++) {
      const p = i < 5 && RARITIES[i + 1].minTier <= tier ? RARITIES[i + 1].chance : 0;
      next[i] += distribution[i] * (1 - p);
      if (i < 5) next[i + 1] += distribution[i] * p;
    }
    distribution = next;
  }
  return distribution;
}

/**
 * Expand recipes into raw materials and sequential crafting time.
 * A shared stock pool consumes original inventory and reuses batch surplus once.
 * Ingredient ids matching a recipe id are crafted recursively.
 */
export function planResources(recipes, targetId, targetAmount, inventory = {}) {
  if (!Array.isArray(recipes)) throw new TypeError(tr("Рецепты должны быть массивом."));
  finite(targetAmount, tr("Количество"));
  const book = new Map();
  const label = new Map();
  for (const recipe of recipes) {
    if (!recipe || typeof recipe.id !== 'string' || !recipe.id.trim()) throw new TypeError(tr("У рецепта должен быть id."));
    if (book.has(recipe.id)) throw new RangeError(tr("Повторяется рецепт: {0}", recipe.id));
    finite(recipe.output, tr("Выход «{0}»", recipe.name), Number.MIN_VALUE);
    finite(recipe.seconds, tr("Время «{0}»", recipe.name));
    if (!Array.isArray(recipe.ingredients)) throw new TypeError(tr("Ингредиенты должны быть массивом."));
    for (const ingredient of recipe.ingredients) {
      if (!ingredient || typeof ingredient.id !== 'string' || !ingredient.id.trim()) throw new TypeError(tr("У ингредиента должен быть id."));
      finite(ingredient.amount, tr("Количество «{0}»", ingredient.name));
      label.set(ingredient.id, ingredient.name || ingredient.id);
    }
    book.set(recipe.id, recipe);
    label.set(recipe.id, recipe.name || recipe.id);
  }
  if (!book.has(targetId)) throw new RangeError(tr("Целевой рецепт не найден."));
  if (!inventory || typeof inventory !== 'object' || Array.isArray(inventory)) throw new TypeError(tr("Запасы должны быть объектом."));
  const stock = new Map(), original = new Map();
  for (const [id, amount] of Object.entries(inventory)) {
    finite(amount, tr("Запас «{0}»", id));
    stock.set(id, amount);
    original.set(id, amount);
  }

  // Detect a bad recipe before consuming stocks, even when inventory covers it.
  const visiting = new Set(), visited = new Set();
  function checkCycles(id) {
    if (visiting.has(id)) throw new RangeError(tr("Циклический рецепт: {0}", label.get(id) || id));
    if (visited.has(id) || !book.has(id)) return;
    visiting.add(id);
    for (const ingredient of book.get(id).ingredients) if (ingredient.amount > 0) checkCycles(ingredient.id);
    visiting.delete(id);
    visited.add(id);
  }
  checkCycles(targetId);

  const raw = new Map(), steps = new Map(), used = new Map();
  function consume(id, required) {
    if (required === 0) return;
    if (!Number.isFinite(required)) throw new RangeError(tr("Количество ресурсов слишком велико."));
    const available = stock.get(id) || 0;
    const taken = Math.min(available, required);
    stock.set(id, available - taken);
    const originalAvailable = (original.get(id) || 0) - (used.get(id) || 0);
    used.set(id, (used.get(id) || 0) + Math.min(taken, Math.max(0, originalAvailable)));
    const missing = Math.max(0, required - taken);
    if (!book.has(id)) {
      raw.set(id, (raw.get(id) || 0) + required);
      return;
    }
    if (missing === 0) return;
    const recipe = book.get(id);
    // Tolerate the tiny floating point residue produced by decimal ingredients.
    const ratio = missing / recipe.output;
    const roundingTolerance = Math.min(1e-8, Number.EPSILON * 4 * Math.max(1, ratio));
    const batches = Math.max(1, Math.ceil(ratio - roundingTolerance));
    if (!Number.isSafeInteger(batches)) throw new RangeError(tr("Слишком много операций крафта."));
    for (const ingredient of recipe.ingredients) consume(ingredient.id, ingredient.amount * batches);
    const produced = recipe.output * batches;
    stock.set(id, (stock.get(id) || 0) + Math.max(0, produced - missing));
    const previous = steps.get(id) || { id, name: recipe.name || id, batches: 0, produced: 0, seconds: 0 };
    previous.batches += batches;
    previous.produced += produced;
    previous.seconds += recipe.seconds * batches;
    if (!Number.isFinite(previous.produced) || !Number.isFinite(previous.seconds)) throw new RangeError(tr("Результат слишком велик."));
    steps.set(id, previous);
  }
  consume(targetId, targetAmount);
  const materials = [...raw].map(([id, needed]) => ({
    id, name: label.get(id) || id, needed,
    owned: original.get(id) || 0,
    missing: Math.max(0, needed - (original.get(id) || 0))
  }));
  const stepList = [...steps.values()];
  const target = steps.get(targetId);
  return {
    materials,
    steps: stepList,
    totalSeconds: stepList.reduce((sum, step) => sum + step.seconds, 0),
    batches: target?.batches || 0,
    produced: target?.produced || 0,
    stockUsed: [...used].filter(([, amount]) => amount > 0).map(([id, amount]) => ({ id, name: label.get(id) || id, amount })),
    surplus: Object.fromEntries([...stock].filter(([, amount]) => amount > 1e-10))
  };
}
