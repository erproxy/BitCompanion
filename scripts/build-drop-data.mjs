import assert from 'node:assert/strict';

export const dropTables = ['chest_rarity_desc', 'placeable_desc', 'placeable_interaction_desc', 'quest_drop_desc'];

// A marginal outcome for one item: guaranteed quantity, maximum quantity, and
// probability of exceeding the guarantee. If the guarantee is zero, chance is
// the probability of getting the item at all.
const empty = new Map();
const certain = (key, quantity) => new Map([[key, { min: quantity, max: quantity, chance: 0 }]]);
const either = (a, b) => a + (1 - a) * b;

function together(distributions) {
  const result = new Map();
  for (const distribution of distributions) for (const [key, next] of distribution) {
    const prev = result.get(key);
    result.set(key, prev ? {
      min: prev.min + next.min,
      max: prev.max + next.max,
      chance: either(prev.chance, next.chance)
    } : next);
  }
  return result;
}

function choose(choices) {
  const active = choices.filter(option => option.weight > 0);
  const total = active.reduce((sum, option) => sum + option.weight, 0);
  if (!total) return empty;
  const result = new Map();
  const keys = new Set(active.flatMap(({ outcomes }) => [...outcomes.keys()]));
  for (const key of keys) {
    const min = Math.min(...active.map(({ outcomes }) => outcomes.get(key)?.min ?? 0));
    let max = 0, sum = 0;
    for (const { outcomes, weight } of active) {
      const outcome = outcomes.get(key);
      if (!outcome) continue;
      max = Math.max(max, outcome.max);
      sum += weight * (outcome.min > min ? 1 : outcome.chance);
    }
    result.set(key, { min, max, chance: sum / total });
  }
  return result;
}

function repeat(distribution, count) {
  if (count === 1) return distribution;
  return new Map([...distribution].map(([key, outcome]) => [key, {
    min: outcome.min * count,
    max: outcome.max * count,
    chance: -Math.expm1(count * Math.log1p(-outcome.chance))
  }]));
}

function gate(distribution, chance) {
  if (!(chance > 0)) return empty;
  if (chance >= 1) return distribution;
  return new Map([...distribution].map(([key, outcome]) => [key, {
    min: 0, max: outcome.max, chance: chance * (outcome.min > 0 ? 1 : outcome.chance)
  }]));
}

export function buildDropData(get, { entitiesByKey, recipes }) {
  const index = name => new Map(get(name).map(row => [row.id, row]));
  const lists = index('item_list_desc');
  const cachedLists = new Map();
  const methods = new Map(recipes.map(row => [row.key, row]));
  const seen = new Set();
  const sources = [];

  function fromList(id) {
    if (cachedLists.has(id)) return cachedLists.get(id);
    const list = lists.get(id);
    assert.ok(list, `Drop item list ${id} is missing`);
    assert.ok(!seen.has(id), `Cycle in drop item list ${id}`);
    seen.add(id);
    const result = choose(list.possibilities.filter(group => group.probability > 0).map(group => ({
      weight: group.probability,
      outcomes: together(group.items.map(fromStack))
    })));
    seen.delete(id);
    cachedLists.set(id, result);
    return result;
  }

  function fromStack(stack) {
    if (!stack || !(stack.quantity > 0)) return empty;
    const key = `${stack.item_type.toLowerCase()}:${stack.item_id}`;
    const entity = entitiesByKey.get(key);
    if (!entity || entity.missing) return empty;
    if (entity.itemListId) return repeat(fromList(entity.itemListId), stack.quantity);
    return certain(key, stack.quantity);
  }

  const fromRoll = roll => gate(fromStack(roll.item_stack), roll.probability);
  const origin = key => entitiesByKey.get(key);
  const tier = value => Number.isInteger(value) && value > 0 ? value : null;
  const tierOf = key => tier(origin(key)?.tier);

  function add(source, distribution) {
    const outputs = [];
    for (const [key, { chance, min, max }] of distribution) {
      if (chance > 0 && chance < 1 && max > min) outputs.push(min ? [key, chance, max, min] : [key, chance, max]);
    }
    if (outputs.length) sources.push({ ...source, outputs });
  }

  const extracts = new Map();
  for (const row of get('extraction_recipe_desc')) {
    const originKey = `resource:${row.resource_id}`;
    // The server rejects cargo extraction and requires an exact resource match.
    if (row.cargo_id || !origin(originKey) || origin(originKey).missing) continue;
    const id = `extraction:${row.id}`;
    const source = { id, group: 'gather', name: methods.get(id).name, originKey, tier: tierOf(originKey), methodKey: id, attempt: 'progress' };
    extracts.set(row.id, source);
    add(source, together(row.extracted_item_stacks.map(fromRoll)));
  }

  for (const row of get('resource_desc')) {
    const id = `resource-destroy:${row.id}`, originKey = `resource:${row.id}`;
    add({ id, group: 'gather', name: row.name, originKey, tier: tierOf(originKey), methodKey: id, attempt: 'deplete' },
      together(row.on_destroy_yield.filter(stack => stack.item_type !== 'Cargo').map(fromStack)));
  }

  const placeables = index('placeable_desc');
  for (const row of get('placeable_interaction_desc')) {
    const placeable = placeables.get(row.placeable_id);
    if (!placeable) continue;
    const name = `${row.verb_phrase} · ${placeable.name}`;
    const common = { group: 'gather', name, tier: tier(placeable.tier) };
    add({ ...common, id: `placeable:${row.id}`, attempt: 'progress' }, together(row.output_item_stacks.map(fromStack)));
    add({ ...common, id: `placeable-destroy:${row.id}`, attempt: 'deplete' }, together((row.on_destroy_yield ?? []).map(fromStack)));
  }

  for (const row of get('terraform_recipe_desc')) {
    const id = `terraform:${row.difference}`;
    add({ id, group: 'gather', name: methods.get(id).name, tier: null, methodKey: id, attempt: 'terraform' },
      together((row.output_item_stacks ?? []).map(fromRoll)));
  }

  const enemies = new Map();
  for (const row of get('enemy_desc')) {
    const id = `enemy:${row.enemy_type}`;
    const source = { id, group: 'creatures', name: row.name, originKey: id, tier: tierOf(id), attempt: 'kill' };
    enemies.set(row.enemy_type, source);
    add({ ...source, methodKey: id }, together(row.extracted_item_stacks.map(fromRoll)));
  }

  // Chests choose one table by weight, roll its slots independently and spawn
  // only with nonempty raw loot. Internal item lists resolve on receipt.
  const lootTables = index('loot_table_desc');
  const chestRarities = index('chest_rarity_desc');
  const chestTables = new Map();
  function chestOptions(table) {
    if (!chestTables.has(table.id)) {
      let options = [{ weight: 1, stacks: [] }];
      for (const roll of table.loot_item_stacks) {
        const p = Math.max(0, Math.min(1, roll.probability));
        if (!p) continue;
        const stack = { ...roll.item_stack, item_type: 'Item' };
        options = options.flatMap(option => [
          ...(p < 1 ? [{ weight: option.weight * (1 - p), stacks: option.stacks }] : []),
          { weight: option.weight * p, stacks: [...option.stacks, stack] }
        ]);
      }
      chestTables.set(table.id, options.filter(option => option.stacks.length).map(({ weight, stacks }) => ({
        weight, outcomes: together(stacks.slice(0, 15).map(fromStack))
      })));
    }
    return chestTables.get(table.id);
  }

  for (const row of get('loot_chest_desc')) {
    const id = `chest:${row.id}`, chestRarity = chestRarities.get(row.chest_rarity);
    const choices = row.loot_tables.flatMap(tableId => {
      const table = lootTables.get(tableId);
      const weight = chestRarity.loot_rarities.find(item => item.rarity === table.loot_rarity)?.probability ?? 0;
      return weight ? chestOptions(table).map(option => ({ ...option, weight: option.weight * weight })) : [];
    });
    const nameTier = Number(row.name.match(/\bT(\d+)\b/i)?.[1]);
    add({ id, group: 'containers', name: row.name, originKey: id, tier: tier(nameTier), methodKey: id, attempt: 'chest' }, choose(choices));
  }

  for (const [table, kind] of [['crafting_recipe_desc', 'crafting'], ['item_conversion_recipe_desc', 'conversion']]) {
    for (const row of get(table)) {
      const id = `${kind}:${row.id}`, method = methods.get(id);
      // These resolvers duplicate the same roll at the original source.
      // Recraft is modelled in the dedicated rarity calculator.
      if (method.internalResolver || method.recraft) continue;
      const inputTiers = new Set(method.ingredients.map(entry => tierOf(entry.key)).filter(Boolean));
      const sourceTier = inputTiers.size === 1 ? [...inputTiers][0] : null;
      const container = /^(Open|Unpack)\b/i.test(row.name);
      const input = method.ingredients.length === 1 ? origin(method.ingredients[0].key) : null;
      const processing = kind === 'conversion' || (input && /Fish$/.test(input.tag) && method.requirements.station?.name === 'Fishing Station')
        || /^(Identify|Extract|Process|Refine|Filet|Fillet|Cut Up|Butcher|Husk|Thresh|Grind|Crush|Mill|Clean|Break Down|Split|Smash)\b/i.test(row.name);
      const group = container ? 'containers' : processing ? 'processing' : 'crafting';
      const name = input && ['Identify {0}', 'Extract {0}', 'Process {1}'].includes(row.name)
        ? `${row.name.split(' {')[0]} · ${input.name}` : method.name;
      const base = { id, group, name, tier: sourceTier, methodKey: id, attempt: 'operation' };
      add({ ...base, ...(input ? { originKey: input.key } : {}) }, together((row.crafted_item_stacks ?? [row.output_item]).map(fromStack)));
    }
  }

  const lootByEnemy = new Map();
  for (const row of get('contribution_loot_desc')) {
    if (!lootByEnemy.has(row.enemy_type_id)) lootByEnemy.set(row.enemy_type_id, []);
    lootByEnemy.get(row.enemy_type_id).push(row);
  }
  const lootByList = new Map();
  for (const [enemyId, rows] of lootByEnemy) {
    const enemy = enemies.get(enemyId);
    if (!enemy) continue;
    const ordered = [...rows].sort((a, b) => a.minimum_contribution - b.minimum_contribution);
    const weighted = ordered[0].weighted;
    const pools = ordered.filter((row, i) => !i || row.item_list_id !== ordered[i - 1].item_list_id);
    for (const [i, row] of pools.entries()) {
      const next = pools[i + 1];
      const source = { ...enemy, id: `contribution:${row.id}`, group: 'bosses', attempt: weighted ? 'contribution-draw' : 'contribution',
        contribution: [i ? row.minimum_contribution : 0, next ? next.minimum_contribution - 1 : null] };
      add(source, fromList(row.item_list_id));
      const uses = lootByList.get(row.item_list_id) ?? [];
      uses.push(source);
      lootByList.set(row.item_list_id, uses);
    }
  }

  const quests = index('quest_chain_desc'), stages = index('quest_stage_desc');
  for (const row of get('quest_drop_desc')) {
    const quest = quests.get(row.required_quest_id);
    if (!quest) continue;
    const stage = stages.get(row.required_stage_id);
    const origins = row.item_list_id ? lootByList.get(row.item_list_id) ?? []
      : [row.extraction_id ? extracts.get(row.extraction_id) : enemies.get(row.enemy_id)].filter(Boolean);
    for (const source of origins) add({ ...source, id: `quest-drop:${row.id}:${source.id}`, group: 'quests',
      quest: [quest.id, quest.name, stage?.id ?? 0, stage?.name ?? ''] }, fromRoll(row.item_drop));
  }

  // Actual completion rewards use item-list resolution at deposit. Implicit
  // rewards are descriptive (they are already indexed at the original action).
  for (const quest of quests.values()) add({ id: `quest-reward:${quest.id}`, group: 'quests', name: quest.name, tier: null,
    attempt: 'quest-reward', quest: [quest.id, quest.name, 0, ''] }, together(quest.rewards.map(row => fromStack(row.ItemStack_))));

  assert.equal(new Set(sources.map(source => source.id)).size, sources.length, 'Drop source IDs must be unique');
  return { serverCommit: '85c972d8d9433560fb51a906424b74b7958ddf99', sources };
}
