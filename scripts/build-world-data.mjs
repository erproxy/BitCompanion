import assert from 'node:assert/strict';

export const worldTables = [
  'achievement_desc', 'collectible_desc', 'biome_desc', 'prospecting_desc',
  'resource_clump_desc', 'enemy_ai_params_desc', 'interior_instance_desc', 'interior_spawn_desc',
  'interior_spawn_random_group_desc'
];

function checkedIds(ids, index, source) {
  for (const id of ids) assert.ok(index.has(id), `${source}: missing reference ${id}`);
  return ids;
}

function buildSpawnLocations(get, biomeIds, symbols, clumps, resourceIds, enemyIdForAi) {
  const locations = new Map();
  const add = (key, biomeId) => {
    if (!locations.has(key)) locations.set(key, new Set());
    locations.get(key).add(biomeId);
  };
  const validBiome = id => id > 0 && biomeIds.has(id);
  for (const row of get('enemy_ai_params_desc')) {
    const biomeId = symbols.indexOf(row.biome);
    if (!validBiome(biomeId) || !(row.herds_per_chunk > 0 && row.avg_herd_size > 0 && row.spawn_frequency_minutes > 0)) continue;
    const enemyId = enemyIdForAi(row.id);
    if (enemyId) add(`enemy:${enemyId}`, biomeId);
  }
  const rooms = new Map(get('interior_instance_desc').filter(row => validBiome(row.biome)).map(row => [row.id, row.biome]));
  const groups = new Map(get('interior_spawn_random_group_desc').map(row => [row.id, row.resource_clump_ids]));
  const chests = new Set(get('loot_chest_desc').map(row => row.id));
  for (const row of get('interior_spawn_desc')) {
    const biomeId = rooms.get(row.interior_instance_id);
    if (!biomeId) continue;
    // Local room coordinates are not surface spawns. Use only the explicit biome of the room.
    const clumpIds = [row.resource_clump_id, ...(groups.get(row.interior_spawn_random_group_id) || [])].filter(Boolean);
    for (const clumpId of clumpIds) {
      for (const id of clumps.get(clumpId)?.resource_id || []) if (resourceIds.has(id)) add(`resource:${id}`, biomeId);
    }
    for (const id of row.loot_chests) if (chests.has(id)) add(`chest:${id}`, biomeId);
  }
  return [...locations].map(([key, ids]) => ({ key, biomes: [...ids].sort((a, b) => a - b) }));
}

export function buildWorldData(get, { stack, enemyIdForAi, schema }) {
  const achievementRows = get('achievement_desc');
  const achievementIds = new Set(achievementRows.map(row => row.id));
  const collectibleIds = new Set(achievementRows.flatMap(row => row.collectible_rewards));
  const collectibles = get('collectible_desc').filter(row => collectibleIds.has(row.id))
    .map(row => ({ id: row.id, name: row.name, type: row.collectible_type }));
  const skillIds = new Set(get('skill_desc').map(row => row.id));
  const discoverySources = [
    ['item_disc', 'item', 'item_desc'], ['cargo_disc', 'cargo', 'cargo_desc'],
    ['resource_disc', 'resource', 'resource_desc'], ['crafting_disc', 'crafting', 'crafting_recipe_desc']
  ].map(([field, type, table]) => ({ field, type, ids: new Set(get(table).map(row => row.id)) }));
  assert.equal(achievementIds.size, achievementRows.length, 'Achievement IDs must be unique');
  assert.equal(collectibles.length, collectibleIds.size, 'Achievement collectible rewards must resolve');

  const achievements = achievementRows.map(row => {
    const source = `Achievement ${row.id}`;
    const skill = row.skill_id > 0 && row.skill_level > 0 ? { id: row.skill_id, level: row.skill_level } : null;
    if (skill) checkedIds([skill.id], skillIds, source);
    return {
      id: row.id, name: row.name, description: row.description,
      prerequisites: checkedIds(row.requisites, achievementIds, source),
      skill, points: row.points_reward, rewards: row.collectible_rewards,
      chunks: row.chunks_discovered, chunkPercent: row.pct_chunks_discovered,
      discoveries: discoverySources.flatMap(({ field, type, ids }) =>
        checkedIds(row[field], ids, source).map(id => `${type}:${id}`))
    };
  });

  const biomeEnum = schema.types.find(type => type.name.name === 'Biome')?.ty;
  const biomeSymbols = schema.typespace.types[biomeEnum]?.Sum?.variants?.map(variant => variant.name.some);
  assert.equal(biomeSymbols?.[0], 'Dev', 'Missing Biome enum in the region schema');
  const biomes = get('biome_desc').map(row => ({
    id: row.biome_type, name: row.name, description: row.description,
    hazard: row.hazard_level, buildingRestricted: row.disallow_player_build,
    internal: row.biome_type === 0, symbol: biomeSymbols[row.biome_type]
  }));
  const biomeIds = new Set(biomes.map(row => row.id));
  assert.equal(biomeIds.size, biomes.length, 'Biome IDs must be unique');
  assert.ok(biomes.every(row => row.symbol), 'Every biome must match a variant from the region schema');

  const clumps = new Map(get('resource_clump_desc').map(row => [row.id, row]));
  const resourceIds = discoverySources.find(source => source.type === 'resource').ids;
  const prospecting = get('prospecting_desc').map(row => {
    const source = `Prospecting ${row.id}`;
    const clump = clumps.get(row.resource_clump_id);
    if (row.resource_clump_id) assert.ok(clump, `${source}: missing resource clump ${row.resource_clump_id}`);
    const targetKeys = checkedIds(clump?.resource_id ?? [], resourceIds, source).map(id => `resource:${id}`);
    if (row.enemy_ai_desc_id) {
      const enemyId = enemyIdForAi(row.enemy_ai_desc_id);
      assert.ok(enemyId, `${source}: missing creature for AI ${row.enemy_ai_desc_id}`);
      targetKeys.push(`enemy:${enemyId}`);
    }
    const { skill_id: skillId, quantity } = row.experience_per_node;
    if (skillId > 0) checkedIds([skillId], skillIds, source);
    return {
      id: row.id, name: row.name, description: row.description,
      biomes: checkedIds(row.biome_requirements, biomeIds, source),
      clues: row.bread_crumb_count, contribution: row.contribution_per_visited_bread_crumb,
      experience: skillId > 0 && quantity > 0 ? { id: skillId, quantity } : null,
      canSearchOnWater: row.allow_aquatic_prospecting,
      itemsToStart: row.required_items_to_start.map(entry => stack(entry)),
      consumedOnStart: row.consumed_items_by_ability_trigger.map(entry => stack(entry)),
      itemsForTarget: row.required_items_to_interact_with_reward.map(entry => stack(entry)),
      targetKeys: [...new Set(targetKeys)]
    };
  });
  assert.equal(new Set(prospecting.map(row => row.id)).size, prospecting.length, 'Prospecting IDs must be unique');
  const spawnLocations = buildSpawnLocations(get, biomeIds, biomeSymbols, clumps, resourceIds, enemyIdForAi);
  return { achievements, collectibles, biomes, prospecting, spawnLocations };
}
