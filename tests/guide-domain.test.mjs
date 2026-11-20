import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DROPS } from '../web/domain.js';
import { DROP_ENTITY_KEYS, resolveEntityImage, skillImageKey } from '../web/entity-images.js';
import { getGuideIndex, normalizeGuideState, skillLevelRange, skillProgression } from '../web/guide-domain.js';
import { applyRoute, parseRoute, routeForState } from '../web/navigation.js';
import { createRecipeBook } from '../web/recipe-domain.js';

const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const raw = name => read(`../data/bitcraft/raw/static/${name}.json`);
const book = createRecipeBook(await read('../web/data/recipe-catalog.json'));
const guide = book.catalog.guide;
const index = getGuideIndex(book);

test('traveler exchanges are indexed by what the player gives and receives, with all requirements', async () => {
  assert.equal(guide.trades.length, (await raw('traveler_trade_order_desc')).length);
  const deed = index.tradeGives.get('item:1859190999')[0];
  assert.equal(deed.traveler, 'Brico');
  assert.deepEqual(deed.gives, [{ key: 'item:1859190999', quantity: 1 }]);
  assert.deepEqual(deed.takes, [{ key: 'item:78117662', quantity: 1 }, { key: 'item:1', quantity: 2500 }]);
  assert.deepEqual(deed.requirements.skills, [{ id: 15, name: 'Construction', level: 10 }]);
  assert.deepEqual(deed.requirements.knowledges.map(row => row.id), [844511805]);
  assert.deepEqual(deed.requirements.blockingKnowledges.map(row => row.id), [9154362]);
  assert.ok(index.tradeTakes.get('item:78117662').includes(deed));
  assert.ok(!index.tradeTakes.get('item:1859190999')?.includes(deed));
  assert.ok(!index.tradeTakes.get('cargo:1')?.includes(deed));
});

test('item details preserve separate health, stats, tool power and effect duration', async () => {
  const details = index.itemDetails;
  const bow = details['item:2140420099'];
  assert.deepEqual(bow.tools, [{ name: 'Bow', level: 6, power: 21 }]);
  assert.deepEqual([bow.weapon.minDamage, bow.weapon.maxDamage], [17, 27]);
  const cap = details['item:1512222364'].equipment;
  assert.deepEqual(cap.skill, { id: 1, level: 30 });
  assert.ok(cap.stats.some(stat => stat.id === 'GatheringSpeed' && stat.value === .024 && stat.percent));
  const food = details['item:5170017'].food;
  assert.equal(food.hunger, 40);
  assert.deepEqual(food.buffs.map(buff => buff.seconds), [1800, 1800]);
  const defaultBuff = (await raw('buff_desc')).find(buff => buff.id === 104813279);
  assert.deepEqual(details['item:6643932'].food.buffs, [{ id: defaultBuff.id, seconds: defaultBuff.duration }]);
});

test('nine drop shortcuts use the exact catalog method and the original fixed probability', () => {
  const methods = new Set();
  for (const preset of DROPS) {
    const recipe = book.recipesByKey.get(preset.methodKey);
    const key = DROP_ENTITY_KEYS[preset.id];
    assert.ok(recipe && !recipe.internalResolver && !methods.has(recipe.key));
    methods.add(recipe.key);
    assert.equal(book.entitiesByKey.get(key).name, preset.en);
    const results = recipe.possibleOutputs.filter(output => output.key === key);
    assert.ok(results.length && results.every(output => output.quantity === 1));
    const observed = recipe.outcomeGroups
      ? recipe.outcomeGroups.filter(group => group.outputs.some(output => output.key === key)).reduce((sum, group) => sum + group.chance, 0)
      : results[0].probabilityPath.reduce((product, chance) => product * chance, 1);
    assert.equal(observed, preset.chance, preset.id);
  }
});

test('skill unlocks use the equipment requirement rather than the tool tier and target the recipe output', () => {
  const level = index.unlocks.get(5).get(60);
  assert.ok(level.tools.some(tool => tool.name === 'Rathium Pickaxe'));
  assert.ok(level.knowledge.some(knowledge => knowledge.name === 'MiningLevel60Stats'));
  assert.ok(level.recipes.some(recipe => recipe.name === 'Craft Peerless Sand'));
  for (const levels of index.unlocks.values()) {
    for (const group of levels.values()) {
      for (const entry of group.recipes) {
        const recipe = book.recipesByKey.get(entry.recipeKey);
        assert.ok(book.recipesProducing.get(entry.key).includes(recipe), recipe.key);
      }
    }
  }
});

test('skill tiers retain precise unlock levels and every skill has a local illustration', () => {
  assert.deepEqual([0, 19, 20, 29, 30, 39, 40, 100, 110, 111].map(level => skillLevelRange(level).tier),
    [1, 1, 2, 2, 3, 3, 4, 10, 10, null]);
  const hunting = skillProgression(index.unlocks.get(9), 33);
  assert.equal(hunting.range.value, 30);
  assert.ok(hunting.rows.recipes.some(recipe => recipe.level === 33));
  assert.equal(hunting.rows.recipes.filter(recipe => recipe.level === 30 && recipe.name === 'Harvest Sturdy Raw Pelt').length, 2);
  assert.ok(Object.values(hunting.rows).flat().every(row => row.level >= 30 && row.level < 40));
  assert.ok(hunting.rows.tools.every(tool => tool.level === index.itemDetails[tool.key].equipment.skill.level));
  const mining = skillProgression(index.unlocks.get(5), 119);
  assert.equal(mining.range.tier, null);
  assert.ok(mining.rows.knowledge.some(knowledge => knowledge.level === 119));
  const illustrations = guide.skills.map(skill => resolveEntityImage(skillImageKey(skill.id)));
  assert.ok(illustrations.every(Boolean));
  assert.equal(new Set(illustrations).size, guide.skills.length);
});

test('quest stages preserve chain order and reward links distinguish indirect items', async () => {
  const source = await raw('quest_chain_desc');
  assert.equal(guide.quests.length, source.length);
  const opened = index.questById.get(1762918554);
  assert.equal(opened.name, 'The Long Haul');
  assert.deepEqual(opened.stages.map(stage => stage.id), source.find(quest => quest.id === opened.id).stages);
  assert.deepEqual(opened.rewards[0], { kind: 'xp', id: 15, quantity: 500 });
  assert.ok(index.questRewards.get('item:129').some(entry => entry.quest === opened && entry.kind === 'rewards'));
  const other = guide.quests.find(quest => quest.followupRewards.some(reward => reward.kind === 'stack'));
  const followup = other.followupRewards.find(reward => reward.kind === 'stack');
  assert.ok(index.questRewards.get(followup.key).some(entry => entry.quest === other && entry.kind === 'followupRewards'));
});

test('guide routes contain only the active mode, entry and skill level', () => {
  assert.deepEqual(normalizeGuideState(undefined), { mode: 'skills', id: 0, level: 0, search: '', page: 0 });
  const state = { tab: 'drops', guide: normalizeGuideState({ mode: 'skills', search: 'private data' }) };
  applyRoute(state, parseRoute('#/guide/skills/5/60'));
  assert.equal(state.guide.level, 60);
  assert.equal(routeForState(state), '#/guide/skills/5/60');
  applyRoute(state, parseRoute('#/guide/quests/1762918554'));
  assert.equal(state.guide.level, 0);
  assert.equal(state.guide.search, '');
  assert.equal(routeForState(state), '#/guide/quests/1762918554');
  assert.equal(parseRoute('#/guide/quests/1762918554/2'), null);
  assert.equal(parseRoute('#/guide/skills/%2d5'), null);
});
