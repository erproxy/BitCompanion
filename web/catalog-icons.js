// Classify the English snapshot names and tags. The drawing is shared by all
// rarity variants, while the tier supplies the metal color.
const tools = new Map(Object.entries({
  'forester tool': 'axe', 'carpenter tool': 'saw', 'mason tool': 'chisel',
  'miner tool': 'pickaxe', 'blacksmith tool': 'hammer', 'leatherworker tool': 'knife',
  'hunter tool': 'bow', 'tailor tool': 'scissors', 'farmer tool': 'hoe',
  'fisher tool': 'rod', 'forager tool': 'machete', 'scholar tool': 'quill'
}));

const skills = new Map(Object.entries({
  forestry: 'axe', carpentry: 'saw', masonry: 'chisel', mining: 'pickaxe',
  smithing: 'hammer', scholar: 'quill', leatherworking: 'knife', hunting: 'bow',
  tailoring: 'scissors', farming: 'hoe', fishing: 'rod', cooking: 'meal',
  foraging: 'machete', construction: 'house', taming: 'paw', slayer: 'sword',
  merchanting: 'coins', sailing: 'ship', 'hexite gathering': 'gem'
}));

const weapons = [
  [/crossbow/, 'crossbow'], [/dagger/, 'daggers'], [/bow/, 'bow'],
  [/shield/, 'shield'], [/axe/, 'axe'], [/spear|polearm/, 'spear']
];

const apparel = [
  [/hood|helmet|hat\b|bonnet|tiara|circlet|crown|cowl/, 'helmet'],
  [/boot|shoe|greave|sandal|slipper|flipper/, 'boots'],
  [/glove|bracer|gauntlet|mitten/, 'glove']
];

const materials = [
  [/antler/, 'antler'],
  [/chitin|shell|scale|mollusk|mollusc|clam/, 'shell'],
  [/connector|ancient gear|component|automata|ancient relic/, 'gear'],
  [/mushroom|fungus/, 'mushroom'],
  [/geode|gem|quartz|hexite|crystal|coralith|energy|meteor|glass/, 'gem'],
  [/ingot|metal bar/, 'ingot'],
  [/\bore\b|rock|stone|clay|boulder|brick|pebble|sand|dirt|chunk|scrap|charcoal|muck/, 'ore'],
  [/plank|timber|frame|lumber/, 'planks'],
  [/wood|log\b|trunk|bark|tree|stump|sapling/, 'wood'],
  [/cloth|fabric|thread|fiber|fibre|rope|tarp|silk|yarn|filament/, 'cloth'],
  [/leather|hide|pelt|fur|wool/, 'hide'],
  [/fish|lobster|chum|trophy fish|baitfish/, 'fish'],
  [/grain|wheat|rice|seed/, 'grain'],
  [/elixir|potion|tannin|dye\b|oil\b|tonic|solvent|tea\b|pigment|\bink\b/, 'potion'],
  [/meal|food|filet|fillet|pie\b|meat|stew|bread|morsel/, 'meal'],
  [/flower|berry|vegetable|plant|fruit|leaf|roots|bulb|herb|vines/, 'leaf'],
  [/coin|currency/, 'coins']
];

const terrains = [
  [/beach|ocean|coast|lake|river/, 'waves'],
  [/cave/, 'cave'],
  [/autumn/, 'autumn-forest'],
  [/tundra|snow|peak|rocky|mountain/, 'mountains'],
  [/volcan|crag|lava/, 'volcano'],
  [/desert|wasteland/, 'desert'],
  [/swamp|marsh|wetland/, 'reeds'],
  [/grassland|meadow|plain/, 'grass'],
  [/jungle|tropic/, 'leaf']
];

const creatures = [
  [/rangifer|cervus|goat|yagi|tundra ox/, 'antler'],
  [/bird|ardea|dromai/, 'bird'],
  [/araknir|spider/, 'spider'], [/crab/, 'crab'],
  [/guardian|sentinel|watcher|skirmisher|captain/, 'helmet']
];

function matchingIcon(value, rules) {
  return rules.find(([pattern]) => pattern.test(value))?.[1];
}

function itemIcon(type, tag, name) {
  const tool = tools.get(tag);
  if (tool) return tool;

  if (/\b(?:package|pack|supplies)\b/.test(tag + ' ' + name)) return 'parcel';
  if (/recipe|deed|knowledge|training|hieroglyph|research|codex|journal/.test(tag)) return 'scroll';
  if (/^boat$|^vehicle$/.test(tag)) return tag === 'boat' ? 'ship' : 'paw';
  if (/prospecting item|quest item/.test(tag)) return /\bmap\b/.test(name) ? 'map' : 'scroll';
  if (/jewelry|trinket/.test(tag)) return 'ring';
  if (/weapon|dungeon equipment|shield/.test(tag)) return matchingIcon(name, weapons) || 'sword';
  if (/armor|clothing|clothes|cosmetic/.test(tag)) {
    return matchingIcon(name, apparel) || (tag.includes('armor') ? 'armor' : 'garment');
  }
  if (/^(?:animal|tamed animal|huntable animal|monster)$/.test(tag)) return matchingIcon(name, creatures) || 'paw';
  if (/fish.*filet|fish.*fillet|raw meat|^raw meal$/.test(tag)) return 'meal';
  if (tag === 'currency' || /hex coin/.test(name)) return 'coins';
  return matchingIcon(tag + ' ' + name, materials) || (type === 'cargo' ? 'parcel' : 'bag');
}

function structureIcon(tag, name) {
  if (tag === 'dungeon') {
    if (/araknir/.test(name)) return 'spider';
    if (/skitch/.test(name)) return 'mask';
    return /immortal/.test(name) ? 'ruin' : 'doorway';
  }
  if (/portal|archway|gate|entrance|waystone/.test(name)) return 'doorway';
  if (/ruin|remnants/.test(name)) return 'ruin';
  if (/station|workbench|anvil|forge|kiln|loom|workshop|sawhorse/.test(name)) return 'anvil';
  return 'house';
}

export function catalogIcon(entity) {
  const type = entity.key?.split(':', 1)[0];
  const tag = String(entity.tag ?? '').toLowerCase();
  const name = String(entity.name ?? '').toLowerCase();

  switch (type) {
    case 'item':
    case 'cargo':
    case 'family': return itemIcon(type, tag, name);
    case 'chest': return 'chest';
    case 'building': return structureIcon(tag, name);
    case 'resource':
      if (/chest|cache|vessel/.test(name)) return 'chest';
      if (/door|archway/.test(name)) return 'doorway';
      if (/school|fish spot|baited/.test(tag)) return 'fish';
      if (/tree|sapling/.test(tag)) return 'forest';
      if (/fiber plant|flower|berry/.test(tag)) return 'leaf';
      return matchingIcon(tag + ' ' + name, materials) || 'ore';
    case 'enemy': return matchingIcon(name, creatures) || (tag === 'monster' ? 'mask' : 'paw');
    case 'biome': return matchingIcon(name, terrains) || 'forest';
    case 'achievement': return 'medal';
    case 'prospecting': return 'compass';
    case 'skill': return skills.get(name) || 'hammer';
    case 'knowledge': return 'book';
    case 'quest': return 'map';
    case 'collectible':
      if (entity.type === 'Title') return 'flag';
      if (entity.type === 'Emote') return 'mask';
      return entity.type?.startsWith('Clothes') ? 'garment' : 'medal';
    default: return 'bag';
  }
}
