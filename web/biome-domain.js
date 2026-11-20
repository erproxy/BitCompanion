const indexes = new WeakMap();
const directMethods = new Set(['enemy', 'extraction', 'resource-destroy', 'chest']);
const worldTypes = new Set(['enemy', 'resource', 'chest']);

function newLocations() {
  return { spawn: new Set(), prospecting: new Set() };
}

function locationsFor(index, key) {
  if (!index.has(key)) index.set(key, newLocations());
  return index.get(key);
}

function mergeLocations(target, source) {
  for (const kind of ['spawn', 'prospecting']) {
    for (const id of source[kind]) target[kind].add(id);
  }
}

export function getBiomeLocations(book) {
  if (indexes.has(book)) return indexes.get(book);
  const { spawnLocations = [], prospecting = [], biomes = [] } = book.catalog.world || {};
  const playable = new Set(biomes.filter(biome => !biome.internal).map(biome => biome.id));
  const origins = new Map(), byEntity = new Map(), byMethod = new Map(), worldEntities = new Set();
  for (const entry of spawnLocations) {
    const locations = locationsFor(origins, entry.key);
    for (const id of entry.biomes) if (playable.has(id)) locations.spawn.add(id);
  }
  for (const search of prospecting) {
    for (const key of search.targetKeys) {
      const locations = locationsFor(origins, key);
      for (const id of search.biomes) if (playable.has(id)) locations.prospecting.add(id);
    }
  }
  for (const [key, locations] of origins) mergeLocations(locationsFor(byEntity, key), locations);
  for (const recipe of book.recipesByKey.values()) {
    if (!directMethods.has(recipe.kind)) continue;
    const worldOrigins = (recipe.origins || []).filter(origin => worldTypes.has(origin.type));
    if (!worldOrigins.length) continue;
    const locations = newLocations();
    for (const { key } of worldOrigins) {
      const known = origins.get(key);
      if (known) mergeLocations(locations, known);
    }
    if (locations.spawn.size || locations.prospecting.size) byMethod.set(recipe.key, locations);
    for (const output of [...(recipe.outputs || []), ...(recipe.possibleOutputs || [])]) {
      if (output.unresolved || !(output.quantity > 0) || output.probabilityPath?.some(weight => weight <= 0)) continue;
      const entity = book.entitiesByKey.get(output.key);
      if (!entity || entity.itemListId || entity.missing) continue;
      for (const key of [entity.key, entity.familyKey].filter(Boolean)) {
        worldEntities.add(key);
        if (byMethod.has(recipe.key)) mergeLocations(locationsFor(byEntity, key), locations);
      }
    }
  }
  const index = { byEntity, byMethod, origins, worldEntities };
  indexes.set(book, index);
  return index;
}

export function isWorldSource(entity, index) {
  return worldTypes.has(entity.type) || index.worldEntities.has(entity.key);
}
