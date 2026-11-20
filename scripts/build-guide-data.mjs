const itemKey = id => `item:${id}`;
const byId = rows => new Map(rows.map(row => [row.id, row]));
const level = row => ({ id: row.skill_id, level: row.level });
const modifiers = rows => rows.map(row => ({ id: row.id, value: row.value, percent: row.is_pct }));

export const guideTables = [
  'traveler_trade_order_desc', 'food_desc', 'buff_desc', 'tool_desc', 'weapon_desc', 'weapon_type_desc',
  'equipment_desc', 'skill_level_knowledge_desc', 'knowledge_scroll_desc', 'knowledge_stat_modifier_desc',
  'quest_chain_desc', 'quest_stage_desc', 'stage_rewards_desc', 'collectible_desc', 'achievement_desc'
];

export function buildGuideData(get, stack, requirement) {
  const buffs = {};
  const itemDetails = {};
  const detail = id => itemDetails[itemKey(id)] ??= {};
  const buffRows = byId(get('buff_desc'));
  const toolTypes = byId(get('tool_type_desc'));
  const weaponTypes = byId(get('weapon_type_desc'));

  function addBuff(id) {
    const row = buffRows.get(id);
    if (row) buffs[id] ??= { name: row.description, stats: modifiers(row.stats) };
    return row;
  }

  for (const row of get('food_desc')) {
    detail(row.item_id).food = {
      hunger: row.hunger, health: row.hp, stamina: row.stamina, teleportation: row.teleportation_energy,
      combat: row.consumable_while_in_combat, auto: row.auto_consume,
      buffs: row.buffs.map(buff => {
        const base = addBuff(buff.buff_id);
        return { id: buff.buff_id, seconds: buff.duration ?? base?.duration ?? null };
      })
    };
  }

  for (const row of get('tool_desc')) {
    const tools = detail(row.item_id).tools ??= [];
    tools.push({ name: toolTypes.get(row.tool_type)?.name || `#${row.tool_type}`, level: row.level, power: row.power });
  }

  for (const row of get('weapon_desc')) {
    detail(row.item_id).weapon = {
      name: weaponTypes.get(row.weapon_type)?.name || `#${row.weapon_type}`,
      minDamage: row.min_damage, maxDamage: row.max_damage,
      cooldown: row.cooldown, staminaMultiplier: row.stamina_use_multiplier
    };
  }

  for (const row of get('equipment_desc')) {
    const equipment = detail(row.item_id).equipment = {
      slots: row.slots, skill: row.level_requirement ? level(row.level_requirement) : null, stats: modifiers(row.stats),
      knowledges: row.required_knowledges
    };
    if (row.equipment_buff_id) {
      const buff = addBuff(row.equipment_buff_id);
      equipment.buff = { id: row.equipment_buff_id, seconds: buff?.duration ?? null, chance: row.equipment_buff_chance_per_hit };
    }
  }

  const skills = get('skill_desc').map(row => ({
    id: row.id, name: row.name, title: row.title, category: row.skill_category, maxLevel: row.max_level
  }));
  const knowledge = get('secondary_knowledge_desc').map(row => ({ id: row.id, name: row.name }));
  const knowledgeById = byId(knowledge);
  for (const row of get('knowledge_scroll_desc')) {
    const entry = knowledgeById.get(row.secondary_knowledge_id);
    if (entry) {
      const scrolls = entry.scrolls ??= [];
      scrolls.push({ key: itemKey(row.item_id), title: row.title, tag: row.tag, knownByDefault: row.known_by_default });
    }
  }
  for (const row of get('knowledge_stat_modifier_desc')) {
    const entry = knowledgeById.get(row.secondary_knowledge_id);
    if (entry) entry.stats = modifiers(row.stats);
  }

  const skillKnowledges = get('skill_level_knowledge_desc').map(row => ({
    ...level(row), knowledgeId: row.secondary_knowledge_id
  }));
  const trades = get('traveler_trade_order_desc').map(row => ({
    id: row.id, traveler: row.traveler,
    gives: row.offer_items.map(entry => stack(entry)),
    takes: row.required_items.map(entry => stack(entry)), requirements: requirement(row)
  }));

  const stages = byId(get('quest_stage_desc'));
  const collectibles = byId(get('collectible_desc'));
  const achievements = byId(get('achievement_desc'));
  const stageRewards = new Map();
  for (const row of get('stage_rewards_desc')) {
    const rewards = stageRewards.get(row.chain_desc_id) ?? [];
    rewards.push(...row.rewards.map(entry => ({ kind: 'stack', ...stack(entry) })));
    stageRewards.set(row.chain_desc_id, rewards);
  }

  function questEntry(entry) {
    const [type, value] = Object.entries(entry)[0];
    switch (type) {
      case 'ItemStack_': return {
        kind: 'stack', ...stack(value.item_stack ?? value),
        ...(value.item_stack ? { consumed: value.is_consumed } : {})
      };
      case 'Level_': return { kind: 'skill', ...level(value) };
      case 'Experience_': return { kind: 'xp', id: value.skill_id, quantity: value.quantity };
      case 'QuestChain_': return { kind: 'quest', id: value };
      case 'SecondaryKnowledge_': return { kind: 'knowledge', id: value };
      case 'Collectible_': return { kind: 'collectible', id: value, name: collectibles.get(value)?.name };
      case 'Achievement_': return { kind: 'achievement', id: value, name: achievements.get(value)?.name };
      default: throw new Error(`Unknown quest condition or reward: ${type}`);
    }
  }

  const quests = get('quest_chain_desc').map(row => ({
    id: row.id, name: row.name, hint: row.is_hint, secret: row.is_secret, unstartable: row.unstartable,
    requirements: row.requirements.map(questEntry), rewards: row.rewards.map(questEntry),
    followupRewards: row.implicit_rewards.map(questEntry), stageRewards: stageRewards.get(row.id) ?? [],
    stages: row.stages.map(id => {
      const stage = stages.get(id);
      if (!stage || stage.chain_desc_id !== row.id) throw new Error(`Quest ${row.id}: invalid stage ${id}`);
      return { id, name: stage.name, conditions: stage.completion_conditions.map(questEntry) };
    })
  }));

  return { itemDetails, buffs, trades, skills, knowledge, skillKnowledges, quests };
}
