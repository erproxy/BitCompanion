import assert from 'node:assert/strict';

export const dungeonTables = [
  'interior_network_desc', 'interior_instance_desc', 'interior_spawn_desc',
  'interior_portal_connections_desc', 'building_portal_desc', 'enemy_ai_params_desc',
  'interior_spawn_destroy_trigger_desc', 'contribution_loot_desc'
];

const labels = new Map([
  [208697589, { title: 'Арсенал Искателей звёзд', aliases: ['Sentinel Dungeon'] }],
  [853770752, { title: 'Заброшенный аванпост Бессмертных' }],
  [1084069097, { title: 'Логово аракниров', aliases: ['Araknir Dungeon'] }],
  [1785852446, { title: 'Данж гигантского скитча' }]
]);
const roomTitles = new Map([
  [69, 'Входной коридор'], [70, 'Первый зал'], [74, 'Первый переход'],
  [72, 'Оружейная'], [73, 'Второй переход'], [71, 'Большой коридор'], [68, 'Финальный зал'],
  [81, 'Первый зал'], [85926629, 'Второй зал'], [77, 'Главный зал'], [76, 'Арена'], [75, 'Пещера']
]);

const byId = rows => new Map(rows.map(row => [row.id, row]));
const uniques = values => [...new Set(values)];

function groupBy(rows, field) {
  const groups = new Map();
  for (const row of rows) {
    const key = row[field];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

export function buildDungeonData(get, { stack, expand, enemyIdForAi }) {
  const buildings = byId(get('building_desc'));
  const rooms = byId(get('interior_instance_desc'));
  const spawns = byId(get('interior_spawn_desc'));
  const spawnsByRoom = groupBy(get('interior_spawn_desc'), 'interior_instance_id');
  const portals = byId(get('building_portal_desc'));
  const connections = get('interior_portal_connections_desc');
  const triggers = get('interior_spawn_destroy_trigger_desc');
  const chests = byId(get('loot_chest_desc'));
  const contribution = groupBy(get('contribution_loot_desc'), 'enemy_type_id');
  const lists = byId(get('item_list_desc'));
  function enemyFromSpawn(spawn) {
    if (spawn.spawn_type !== 'Enemy') return null;
    // Enemy spawns use this field for the AI parameters ID in the pinned data.
    return enemyIdForAi(spawn.traveler_ruin_entity_id, spawn.enemy_type);
  }

  function rewardPools(enemyId) {
    return (contribution.get(enemyId) || []).map(row => {
      const list = lists.get(row.item_list_id);
      assert.ok(list, `Contribution ${row.id}: missing item list ${row.item_list_id}`);
      // The catalogue preserves the nested lists. Here we only index tangible
      // possible results so this does not imply a probability or a quantity.
      const outputs = list.possibilities.flatMap(group => group.items.flatMap(item =>
        expand(stack(item), new Set([list.id]), [group.probability])));
      const rewardKeys = uniques(outputs.filter(output => !output.unresolved && output.quantity > 0 &&
        output.probabilityPath.every(weight => weight > 0)).map(output => output.key));
      return { id: row.id, itemListId: list.id, minimum: row.minimum_contribution, weighted: row.weighted, rewardKeys };
    }).sort((a, b) => a.minimum - b.minimum || a.id - b.id);
  }

  return get('interior_network_desc').filter(row => row.dimension_type === 'Dungeon').map(network => {
    const id = network.building_id;
    const building = buildings.get(id);
    assert.ok(building, `Dungeon ${id}: missing entrance building`);
    const roomIds = new Set(network.child_interior_instances);
    const passages = [];
    for (const link of connections) {
      const portal = portals.get(link.entrance_portal_id);
      const from = link.entrance_spawn_id === 0 ? 0 : spawns.get(link.entrance_spawn_id)?.interior_instance_id;
      if (!(from === 0 ? portal?.building_id === id : roomIds.has(from))) continue;
      const to = link.exit_spawn_id === 0 ? 0 : spawns.get(link.exit_spawn_id)?.interior_instance_id;
      assert.ok(portal && portals.has(link.exit_portal_id) && (to === 0 || roomIds.has(to)), `Dungeon ${id}: invalid portal connection ${link.id}`);
      passages.push({ id: link.id, from, to, enemyLock: portal.enemy_lock, allowDeployables: portal.allow_deployables });
    }

    // Traverse from the exterior in portal order. The table's array of rooms
    // describes membership, and its order need not follow the route.
    const roomOrder = new Set([0]);
    for (const current of roomOrder) {
      for (const passage of passages) if (passage.from === current) roomOrder.add(passage.to);
    }
    const orderedRooms = uniques([...roomOrder, ...roomIds]).filter(Boolean);
    const roomEntries = orderedRooms.map((roomId, index) => {
      const room = rooms.get(roomId);
      assert.ok(room, `Dungeon ${id}: missing room ${roomId}`);
      const entries = spawnsByRoom.get(roomId) || [];
      const enemyKeys = new Set();
      const bosses = [];
      for (const spawn of entries) {
        const enemyId = enemyFromSpawn(spawn);
        if (enemyId === null) continue;
        const key = `enemy:${enemyId}`;
        enemyKeys.add(key);
        if (spawn.collapse_trigger) bosses.push({ key, spawnId: spawn.id, pools: rewardPools(enemyId) });
      }
      const chestKeys = uniques(entries.flatMap(spawn => spawn.loot_chests)).map(chestId => {
        assert.ok(chests.has(chestId), `Dungeon ${id}: missing chest ${chestId}`);
        return `chest:${chestId}`;
      });
      const conditions = triggers.filter(trigger => trigger.trigger_interior_spawn_ids.some(spawnId =>
        spawns.get(spawnId)?.interior_instance_id === roomId)).map(trigger => {
        const spawnNames = ids => ids.map(spawnId => {
          const spawn = spawns.get(spawnId);
          assert.ok(spawn, `Dungeon ${id}: missing spawn ${spawnId} in trigger ${trigger.id}`);
          return spawn.name;
        });
        return { id: trigger.id, all: trigger.require_all_triggers,
          required: spawnNames(trigger.trigger_interior_spawn_ids), removes: spawnNames(trigger.destroyed_interior_spawn_ids) };
      });
      return { id: roomId, title: roomTitles.get(roomId) || `Комната ${index + 1}`, enemyKeys: [...enemyKeys], bosses, chestKeys, conditions };
    });
    const metadata = labels.get(id);
    return { id, buildingKey: `building:${id}`, name: building.name, title: metadata?.title || building.name,
      aliases: metadata?.aliases || [], collapseSeconds: network.trigger_collapse_time,
      respawnSeconds: network.respawn_time, passages, rooms: roomEntries };
  });
}
