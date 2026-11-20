import { t as tr, formatNumber, formatDate } from './i18n.js';
import { gameName, gameText, rarityName } from './catalog-language.js';
import { DATA_SNAPSHOT, DROPS, RARITIES } from './domain.js';
import { DROP_ENTITY_KEYS } from './entity-images.js';
import { getDungeonIndex } from './dungeon-domain.js';
import { getGuideIndex, skillLevelRange } from './guide-domain.js';
import { guideLink, knowledgeLink, skillLink, statList } from './guide-view.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const number = value => formatNumber(value, 5);
const snapshotDate = () => formatDate(DATA_SNAPSHOT);

function facts(rows) {
  return `<dl class="recipe-facts guide-facts">${rows.map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join('')}</dl>`;
}

function stackList(stacks, link) {
  if (!stacks.length) return '—';
  return stacks.map(({ key, quantity }) => `${link(key)} <b>× ${number(quantity)}</b>`).join('<br>');
}

const slotNames = {
  MainHand: 'Основная рука', OffHand: 'Вторая рука',
  HeadClothing: 'Голова · одежда', TorsoClothing: 'Торс · одежда', HandClothing: 'Руки · одежда',
  FeetClothing: 'Ступни · одежда', LegClothing: 'Ноги · одежда', BeltClothing: 'Пояс · одежда',
  HeadArtifact: 'Голова · артефакт', HandArtifact: 'Руки · артефакт', FeetArtifact: 'Ступни · артефакт'
};

function slotName(slot) {
  if (slotNames[slot]) return tr(slotNames[slot]);
  const match = slot.match(/^(.+?)(Charm|Instrument)$/);
  return match ? `${match[2] === 'Charm' ? tr("Амулет") : tr("Инструмент")} · ${gameText(match[1])}` : gameText(slot);
}

function buffDetails({ id, seconds, chance }, buffs, duration) {
  const buff = buffs[id];
  const time = seconds == null ? tr("длительность в снимке не указана") : seconds < 0 ? tr("без ограничения по времени") : duration(seconds);
  return `<div class="guide-effect"><b>${escape(gameName(buff?.name)||tr("Эффект № {0}", id))}</b>
    <small>${escape(time)}${chance == null ? '' : tr(" · шанс срабатывания {0}%", number(chance * 100))}</small>
    ${statList(buff?.stats)}</div>`;
}

function foodDetails(food, buffs, duration) {
  const rows = [
    [tr("Сытость"), food.hunger], [tr("Здоровье"), food.health], [tr("Выносливость"), food.stamina],
    [tr("Энергия телепортации"), food.teleportation]
  ].filter(([, value]) => value !== 0).map(([label, value]) => [label, (value > 0 ? '+' : '') + number(value)]);
  rows.push([tr("Употребление в бою"), food.combat ? tr("Доступно") : tr("Недоступно")]);
  if (food.auto) rows.push([tr("Употребление"), tr("Автоматическое")]);
  return `<h3>${tr("При употреблении")}</h3>${facts(rows)}${food.buffs.map(buff => buffDetails(buff, buffs, duration)).join('')}`;
}

export function catalogEquipmentLabel(book, key) {
  const index = getGuideIndex(book);
  const requirement = index.itemDetails[key]?.equipment?.skill;
  if (!(requirement?.level > 0)) return '';
  const name = gameName(index.skillById.get(requirement.id)?.name) || tr("Навык № {0}", requirement.id);
  return tr("Ношение · {0} · уровень {1}", name, number(requirement.level));
}

export function catalogMethodLevels(requirements) {
  const levels = (requirements?.skills || []).filter(skill => skill.level > 0)
    .map(skill => tr("{0} · ур. {1}", escape(gameName(skill.name)), number(skill.level)));
  return levels.length ? `<small class="catalog-method-levels">${levels.join(' / ')}</small>` : '';
}

export function catalogCharacteristics(book, entity, { link, duration }) {
  const index = getGuideIndex(book);
  const { food, tools, weapon, equipment } = index.itemDetails[entity.key] || {};
  const scrolls = index.knowledgeFromItem.get(entity.key) || [];
  const variants = (entity.members || []).filter(key => index.itemDetails[key]);
  if (!food && !tools && !weapon && !equipment && !scrolls.length && !variants.length) return '';
  const skills = equipment?.skill;
  const skillTier = skills?.level > 0 ? skillLevelRange(skills.level).tier : null;
  return `<section class="card card-pad guide-characteristics"><div class="section-title"><h2>${tr("Характеристики")}</h2></div>
    ${variants.length ? `<p class="subtitle">${tr("Выбери редкость предмета, чтобы увидеть её характеристики.")}</p><div class="guide-variants">${variants.map(key => book.entitiesByKey.get(key)).sort((a, b) =>
      RARITIES.findIndex(row => row.en === a.rarity) - RARITIES.findIndex(row => row.en === b.rarity)
    ).map(variant => link(variant.key, rarityName(variant.rarity))).join('')}</div>` : ''}
    ${food ? foodDetails(food, index.buffs, duration) : ''}
    ${tools?.length ? `<h3>${tr("Инструмент")}</h3>${tools.map(tool => facts([
      [tr("Тип"), escape(gameName(tool.name))], [tr("Уровень инструмента"), number(tool.level)], [tr("Мощность"), number(tool.power)]
    ])).join('')}` : ''}
    ${weapon ? `<h3>${tr("Оружие")}</h3>${facts([
      [tr("Тип"), escape(gameName(weapon.name))], [tr("Урон"), `${number(weapon.minDamage)}–${number(weapon.maxDamage)}`],
      [tr("Перезарядка"), number(weapon.cooldown) + tr(" сек")], [tr("Множитель расхода выносливости"), '×' + number(weapon.staminaMultiplier)]
    ])}` : ''}
    ${equipment ? `<h3>${tr("Экипировка")}</h3>${facts([
      [tr("Ячейки"), equipment.slots.map(slot => escape(slotName(slot))).join('<br>')],
      ...(skills?.level > 0 ? [[tr("Условие ношения"), skillLink(book, skills) +
        (skillTier ? ` <small class="catalog-item-tier">${tr("· T{0} навыка", skillTier)}</small>` : '')]] : []),
      ...(equipment.knowledges.length ? [[tr("Знания"), equipment.knowledges.map(id => knowledgeLink(book, id)).join('<br>')]] : [])
    ])}${statList(equipment.stats)}${equipment.buff ? buffDetails(equipment.buff, index.buffs, duration) : ''}` : ''}
    ${scrolls.length ? `<h3>${tr("Связанное знание")}</h3><div class="guide-variants">${scrolls.map(entry => knowledgeLink(book, entry.id)).join('')}</div>` : ''}
  </section>`;
}

export function catalogTrades(book, key, direction, link) {
  const index = getGuideIndex(book);
  const trades = (direction === 'gives' ? index.tradeGives : index.tradeTakes).get(key);
  if (!trades?.length) return '';
  return `<details class="recipe-method guide-related"><summary>${direction === 'gives' ? tr("Получить у путешественников") : tr("Отдать путешественникам")} · ${number(trades.length)}</summary>
    <div class="guide-trades">${trades.map(trade => {
      const { skills, knowledges, blockingKnowledges } = trade.requirements;
      const rows = [[tr("Отдаёшь"), stackList(trade.takes, link)], [tr("Получаешь"), stackList(trade.gives, link)]];
      if (skills.length) rows.push([tr("Уровень навыка"), skills.map(skill => skillLink(book, skill)).join('<br>')]);
      if (knowledges.length) rows.push([tr("Нужные знания"), knowledges.map(entry => knowledgeLink(book, entry.id, entry.name)).join('<br>')]);
      if (blockingKnowledges.length) rows.push([tr("Блокирующие знания"), blockingKnowledges.map(entry => knowledgeLink(book, entry.id, entry.name)).join('<br>')]);
      return `<article class="guide-trade"><h3>${escape(gameName(trade.traveler))}</h3>${facts(rows)}</article>`;
    }).join('')}</div></details>`;
}

const rewardLabels = {
  rewards: 'Награда за завершение', stageRewards: 'Награда в ходе цепочки', followupRewards: 'Предмет по ходу задания'
};

export function catalogQuestRewards(book, key) {
  const rewards = getGuideIndex(book).questRewards.get(key);
  if (!rewards?.length) return '';
  return `<details class="recipe-method guide-related"><summary>${tr("Получить в квестах · {0}", number(rewards.length))}</summary><ul class="guide-list">${rewards.map(({ quest, kind }) =>
    `<li>${guideLink(book, 'quests', quest.id)} <small>${tr(rewardLabels[kind])}</small></li>`
  ).join('')}</ul></details>`;
}

export function catalogDungeonRewards(book, key) {
  const index = getDungeonIndex(book);
  const creature = key.startsWith('enemy:');
  const sources = creature ? index.dungeons.filter(dungeon => dungeon.rooms.some(room => room.bosses.some(boss => boss.key === key)))
    : index.rewardSources.get(key);
  if (!sources?.length) return '';
  return `<details class="recipe-method guide-related"><summary>${creature ? tr("Награды за вклад в данжах") : tr("Получить в данжах")} · ${number(sources.length)}</summary><ul class="guide-list">${sources.map(dungeon =>
    `<li><button type="button" class="recipe-link" data-action="dungeon-target" data-id="${dungeon.id}">${escape(gameName(dungeon.name, dungeon.title))}</button></li>`
  ).join('')}</ul></details>`;
}

export function catalogDropAction(recipe, targetKey) {
  const preset = DROPS.find(entry => entry.methodKey === recipe.key && DROP_ENTITY_KEYS[entry.id] === targetKey);
  if (!preset) return '';
  return `<div class="guide-drop"><div><b>${number(preset.chance * 100)}%</b> · ${escape(tr(preset.unit))}
    <small>${tr("Шанс из справочника · снимок {0}", snapshotDate())}</small></div>
    <button type="button" class="secondary" data-action="drop-from-catalog" data-id="${preset.id}" aria-label="${tr("Рассчитать добычу · {0}", escape(tr(preset.unit)))}">${tr("Рассчитать добычу")}</button></div>`;
}
