import { t as tr, formatNumber } from './i18n.js';
import { gameName, gameText, gameSearch, searchable, rarityName } from './catalog-language.js';
import { RARITIES } from './domain.js';
import { GUIDE_MODES, getGuideIndex, skillProgression } from './guide-domain.js';
import { entityImage, resolveEntityImage, skillImageKey } from './entity-images.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const number = value => formatNumber(value, 5);
const pageSize = 12;
const rarityOrder = new Map(RARITIES.map(({ en }, order) => [en, order]));
const modes = {
  skills: { title: 'Профессии и навыки', tab: 'Профессии', map: 'skillById', sample: 'Mining, Sailing…' },
  knowledge: { title: 'Знания', tab: 'Знания', map: 'knowledgeById', sample: 'Training, Player House…' },
  quests: { title: 'Квесты', tab: 'Квесты', map: 'questById', sample: 'The Long Haul, Clipper…' }
};
let ui, loading = false, failure = '';

export function configureGuide(options) {
  ui = options;
}

export function retryGuide() {
  if (loading) return;
  loading = true;
  failure = '';
  ui.ensureBook().catch(error => { failure = error.message; }).finally(() => {
    loading = false;
    ui.refresh();
  });
}

export function guideLink(book, mode, id, { level = 0, text } = {}) {
  const entry = getGuideIndex(book)[modes[mode].map].get(id);
  const label = text || gameName(entry?.name) || `№ ${id}`;
  if (!entry) return escape(label);
  return `<button type="button" class="recipe-link guide-link" data-action="guide-target" data-mode="${mode}" data-id="${id}"${level > 0 ? ` data-level="${level}"` : ''}>${escape(label)}</button>`;
}

export function skillLink(book, { id, level, name }) {
  const skill = getGuideIndex(book).skillById.get(id);
  const label = (name || skill?.name) === 'ANY' ? tr("Любой навык (ANY)") : gameName(name || skill?.name) || tr("Навык № {0}", id);
  return guideLink(book, 'skills', id, { level, text: tr("{0} · уровень {1}", label, number(level)) });
}

export function knowledgeLink(book, id, name) {
  const entry = getGuideIndex(book).knowledgeById.get(id);
  return guideLink(book, 'knowledge', id, { text: gameName(name || entry?.name) || tr("Знание № {0}", id) });
}

const statNames = {
  MaxHealth: 'Макс. здоровье', MaxStamina: 'Макс. выносливость', MaxSatiation: 'Макс. сытость',
  MaxTeleportationEnergy: 'Макс. энергия телепортации', MovementMultiplier: 'Скорость передвижения',
  GatheringSpeed: 'Скорость сбора', CraftingSpeed: 'Скорость крафта', BuildingSpeed: 'Скорость строительства',
  Armor: 'Броня', Strength: 'Сила', Accuracy: 'Точность', Evasion: 'Уклонение',
  HeatProtection: 'Защита от жары', ColdProtection: 'Защита от холода', CooldownMultiplier: 'Время перезарядки',
  PassiveHealthRegenRate: 'Пассивное восстановление здоровья', ActiveHealthRegenRate: 'Активное восстановление здоровья',
  PassiveStaminaRegenRate: 'Пассивное восстановление выносливости', ActiveStaminaRegenRate: 'Активное восстановление выносливости',
  ExperienceRate: 'Получение опыта', BoatSpeed: 'Скорость лодки', CartSpeed: 'Скорость телеги', MountSpeed: 'Скорость ездового животного',
  HuntingWeaponPower: 'Мощность охотничьего оружия'
};
const statSuffixes = {
  Power: 'Мощность', Speed: 'Скорость', CritChance: 'Шанс крит. действия', CritMultiplier: 'Множитель крит. действия'
};

function statName(id) {
  if (statNames[id]) return tr(statNames[id]);
  const match = id.match(/^(.+?)(Power|Speed|CritChance|CritMultiplier)$/);
  const name = (match?.[1] ?? id).replace(/([a-z])([A-Z])/g, '$1 $2');
  return match ? `${tr(statSuffixes[match[2]])} · ${gameText(name)}` : gameText(name);
}

export function statList(stats = []) {
  const rows = stats.filter(({ value }) => Number.isFinite(value) && value !== 0);
  if (!rows.length) return '';
  return `<dl class="recipe-facts guide-stats">${rows.map(({ id, value, percent }) => {
    const signed = (value > 0 ? '+' : '−') + number(Math.abs(value) * (percent ? 100 : 1)) + (percent ? '%' : '');
    return `<dt>${escape(statName(id))}</dt><dd>${signed}</dd>`;
  }).join('')}</dl>`;
}

export function itemLink(book, key, { text, recipeKey } = {}) {
  const entry = book.entitiesByKey.get(key);
  if (!entry || entry.missing) return escape(text || key);
  const label = text || gameName(entry.name);
  return `<button type="button" class="recipe-link guide-item-link" data-action="recipe-target" data-id="${escape(key)}"${recipeKey ? ` data-method="${escape(recipeKey)}"` : ''}><span class="entity-link-content">${entityImage(entry)}<span>${escape(label)}</span></span></button>`;
}

function questEntry(book, entry) {
  switch (entry.kind) {
    case 'stack': {
      const note = entry.consumed == null ? '' : entry.consumed ? tr(" · расходуется") : tr(" · нужно иметь");
      return `${itemLink(book, entry.key)} <b>× ${number(entry.quantity)}</b>${note}`;
    }
    case 'skill': return skillLink(book, entry);
    case 'xp': {
      const skill = getGuideIndex(book).skillById.get(entry.id);
      return `<b>${number(entry.quantity)} XP</b> · ${guideLink(book, 'skills', entry.id, { text: gameName(skill?.name) || tr("Навык № {0}", entry.id) })}`;
    }
    case 'quest': return tr("Квест · {0}", guideLink(book, 'quests', entry.id));
    case 'knowledge': return tr("Знание · {0}", knowledgeLink(book, entry.id));
    case 'collectible': return tr("Коллекция · {0}", escape(gameName(entry.name || `№ ${entry.id}`)));
    case 'achievement': return tr("Достижение · {0}", escape(gameName(entry.name || `№ ${entry.id}`)));
    default: return '';
  }
}

function list(rows, className = 'guide-list') {
  return `<ul class="${className}">${rows.map(row => `<li>${row}</li>`).join('')}</ul>`;
}

function unlocked(title, rows) {
  if (!rows.length) return '';
  return `<details class="recipe-method guide-unlocks" open><summary>${title} · ${number(rows.length)}</summary>${list(rows, 'guide-list guide-unlock-list')}</details>`;
}

function guideEntryImage(index, mode, entry, size = 'md') {
  let keys = [];
  if (mode === 'skills') keys = [skillImageKey(entry.id)];
  if (mode === 'knowledge') {
    keys = [...(entry.scrolls || []).map(scroll => scroll.key),
      ...(index.knowledgeLevels.get(entry.id) || []).map(level => skillImageKey(level.id))];
  }
  if (mode === 'quests') keys = entry.rewards.filter(reward => reward.kind === 'stack').map(reward => reward.key);
  const key = keys.find(candidate => resolveEntityImage(candidate));
  const entryKey = `${mode.replace(/s$/, "")}:${entry.id}`;
  return entityImage(key || { key: entryKey, name: entry.name }, { size, className: 'guide-illustration' });
}

function unlockRow(link, level, details, requestedLevel) {
  return `<div class="guide-unlock-row${level === requestedLevel ? ' guide-unlock-current' : ''}">
    ${link}<small><b>${escape(details[0])} ${number(level)}</b>${details.slice(1).filter(Boolean).map(text => ' · ' + escape(text)).join('')}</small></div>`;
}

function skillDetail(book, index, skill, requestedLevel) {
  const { range, ranges, rows } = skillProgression(index.unlocks.get(skill.id), requestedLevel);
  const recipeNames = new Map();
  for (const row of rows.recipes) recipeNames.set(row.name, (recipeNames.get(row.name) || 0) + 1);
  const recipes = rows.recipes.map(row => {
    const method = book.recipesByKey.get(row.recipeKey);
    const output = book.entitiesByKey.get(row.key);
    const ingredients = recipeNames.get(row.name) > 1
      ? [...new Set(method.ingredients.map(({ key }) => book.entitiesByKey.get(key)?.name).filter(Boolean))] : [];
    const station = method.requirements?.station;
    const title = row.name === 'Craft' ? `Craft · ${output.name}` : row.name;
    return unlockRow(itemLink(book, row.key, { text: gameName(title), recipeKey: row.recipeKey }), row.level, [
      method.kind === 'conversion' ? tr("Обработка с уровня") : tr("Рецепт с уровня"),
      output.tier > 0 ? tr("Предмет T{0}", output.tier) : '',
      ingredients.length ? tr("Из {0}", ingredients.map(name => gameName(name)).join(', ')) : '',
      station?.name ? gameName(station.name) : ''
    ], requestedLevel);
  });
  const tools = rows.tools.map(row => ({ level: row.level, item: book.entitiesByKey.get(row.key) })).sort((a, b) =>
    a.level - b.level || a.item.name.localeCompare(b.item.name) || a.item.tier - b.item.tier ||
    (rarityOrder.get(a.item.rarity) ?? -1) - (rarityOrder.get(b.item.rarity) ?? -1));
  const group = skill.category === 'Profession' ? tr("Профессия") : tr("Навык");
  const rangeEnd = range.tier === 10 ? range.to : range.to - 1;
  return `<section class="card card-pad guide-detail"><div class="recipe-target-heading">${guideEntryImage(index, 'skills', skill)}<div>
      <h2>${escape(gameName(skill.name))}</h2><p class="subtitle">${tr("{0}{1} · макс. уровень {2}", group, skill.title ? ' · ' + escape(gameName(skill.title)) : '', number(skill.maxLevel))}</p>
    </div></div>
    <label class="field guide-level"><span>${tr("Тир навыка")}</span><select data-guide-level data-id="${skill.id}">${ranges.map(option =>
      `<option value="${option.value}"${option === range ? ' selected' : ''}>${option.tier ? `T${option.tier} · ${option.from}–${option.to}` : tr("Уровни {0}+ · записи снимка", option.from)}</option>`).join('')}</select></label>
    <p class="recipe-explanation">${range.tier ? tr("В этом тире показаны уровни {0}–{1}.", range.from, rangeEnd) : tr("Данные снимка для уровней выше T10.")}
      ${requestedLevel ? `<span class="guide-current-level">${tr("Отмечен уровень {0}.", number(requestedLevel))}</span>` : ''}</p>
    ${recipes.length || tools.length || rows.knowledge.length ? `
      ${unlocked(tr("Рецепты"), recipes)}
      ${unlocked(tr("Инструменты"), tools.map(({ item, level }) =>
        unlockRow(itemLink(book, item.key), level, [tr("Ношение с уровня"), item.tier > 0 ? `T${item.tier}` : '', rarityName(item.rarity)], requestedLevel)))}
      ${unlocked(tr("Знания"), rows.knowledge.map(entry =>
        unlockRow(knowledgeLink(book, entry.id), entry.level, [tr("Открывается на уровне")], requestedLevel)))}`
    : `<p class="recipe-explanation">${tr("Для этого тира в снимке пока нет связанных рецептов, инструментов или знаний.")}</p>`}</section>`;
}

function knowledgeDetail(book, index, entry) {
  const scrolls = entry.scrolls || [];
  const levels = index.knowledgeLevels.get(entry.id) || [];
  const stats = statList(entry.stats);
  return `<section class="card card-pad guide-detail"><div class="section-title"><h2>${escape(gameName(entry.name))}</h2></div>
    ${levels.length ? `<h3>${tr("Изучается на уровне")}</h3>${list(levels.map(level => skillLink(book, level)))}` : ''}
    ${scrolls.length ? `<h3>${tr("Свитки и предметы")}</h3>${list(scrolls.map(scroll => `${itemLink(book, scroll.key)}${scroll.tag ? ` <small>${escape(gameText(scroll.tag))}</small>` : ''}${scroll.knownByDefault ? ` <small>${tr("Известно по умолчанию")}</small>` : ''}`))}` : ''}
    ${stats ? `<h3>${tr("Эффекты знания")}</h3>${stats}` : ''}
    ${!levels.length && !scrolls.length && !stats ? `<p class="recipe-explanation">${tr("В этом снимке для знания указано название.")}</p>` : ''}</section>`;
}

function questDetail(book, quest) {
  const flags = [quest.hint ? tr("Подсказка") : '', quest.secret ? tr("Скрытый квест") : '', quest.unstartable ? tr("Вручную не запускается") : ''].filter(Boolean);
  const entries = rows => list(rows.map(entry => questEntry(book, entry)));
  return `<div class="stack"><section class="card card-pad guide-detail"><div class="section-title"><h2>${escape(gameName(quest.name))}</h2></div>
    ${flags.length ? `<p class="subtitle">${flags.join(' · ')}</p>` : ''}
    <h3>${tr("Требования")}</h3>${quest.requirements.length ? entries(quest.requirements) : `<p class="subtitle">${tr("В снимке не указаны.")}</p>`}
    <h3>${tr("Награды за завершение")}</h3>${quest.rewards.length ? entries(quest.rewards) : `<p class="subtitle">${tr("В снимке не указаны.")}</p>`}
    ${quest.stageRewards.length ? `<h3>${tr("Награды в ходе цепочки")}</h3>${entries(quest.stageRewards)}` : ''}
    ${quest.followupRewards.length ? `<h3>${tr("Предметы, получаемые по ходу задания")}</h3>${entries(quest.followupRewards)}` : ''}
    </section><section class="card card-pad guide-detail">
    <div class="section-title"><h2>${tr("Этапы")}</h2><span class="badge">${quest.stages.length}</span></div>
    ${quest.stages.length ? `<ol class="guide-stages">${quest.stages.map(stage => `<li><h3>${escape(gameName(stage.name))}</h3>${stage.conditions.length ? entries(stage.conditions) : ''}</li>`).join('')}</ol>` : `<p class="subtitle">${tr("Этапы в снимке не указаны.")}</p>`}
    </section></div>`;
}

function selectedEntry(index, { mode, id }) {
  if (id) return index[modes[mode].map].get(id);
  return mode === 'skills' ? index.skills.find(skill => skill.category === 'Profession') || index.skills[0] : index[mode][0];
}

export function guideResults(state) {
  const book = ui.getBook();
  if (!book) return '';
  const index = getGuideIndex(book);
  const terms = searchable(state.search).trim().split(/\s+/).filter(Boolean);
  const matches = index[state.mode].filter(entry => {
    const scrolls = (entry.scrolls || []).flatMap(scroll => [scroll.title, scroll.tag]);
    const searchText = gameSearch(entry.name, entry.title, ...scrolls);
    return terms.every(term => searchText.includes(term));
  });
  const selected = selectedEntry(index, state)?.id;
  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  if (state.page < 0) state.page = Math.floor(matches.findIndex(entry => entry.id === selected) / pageSize);
  state.page = Math.max(0, Math.min(state.page, pages - 1));
  return `<p class="recipe-result-count" role="status">${tr("Найдено: {0} · страница {1} из {2}", number(matches.length), state.page + 1, pages)}</p>
    <div class="recipe-search-results">${matches.slice(state.page * pageSize, (state.page + 1) * pageSize).map(entry =>
      `<button type="button" class="recipe-search-item guide-search-item${entry.id === selected ? ' selected' : ''}" data-action="guide-target" data-mode="${state.mode}" data-id="${entry.id}" aria-pressed="${entry.id === selected}">${guideEntryImage(index, state.mode, entry)}<b>${escape(gameName(entry.name))}</b>${ui.icon('arrow')}</button>`
    ).join('') || `<p class="subtitle">${tr("Ничего не найдено.")}</p>`}</div>
    ${pages > 1 ? `<div class="recipe-pagination"><button class="secondary" data-action="guide-page" data-delta="-1"${state.page === 0 ? ' disabled' : ''}>${tr("Назад")}</button><button class="secondary" data-action="guide-page" data-delta="1"${state.page === pages - 1 ? ' disabled' : ''}>${tr("Далее {0}", ui.icon('arrow'))}</button></div>` : ''}`;
}

export function guideView(state) {
  const book = ui.getBook();
  if (!book) {
    if (!loading && !failure) retryGuide();
    return `<section class="card card-pad" role="status"><h2>${failure ? tr("Не удалось открыть справочник") : tr("Открываем справочник…")}</h2>${failure ? `<p class="subtitle">${escape(failure)}</p><button class="secondary" data-action="guide-retry">${tr("Повторить")}</button>` : ''}</section>`;
  }
  const index = getGuideIndex(book);
  const config = modes[state.mode];
  const entry = selectedEntry(index, state);
  const detail = !entry ? `<section class="card empty"><h3>${tr("Запись не найдена в снимке")}</h3><p>${tr("Выбери другую запись из списка.")}</p></section>`
    : state.mode === 'skills' ? skillDetail(book, index, entry, state.level)
    : state.mode === 'knowledge' ? knowledgeDetail(book, index, entry)
    : questDetail(book, entry);
  return `<div class="tabs-inline resource-modes" role="tablist" aria-label="${tr("Разделы справочника")}">${GUIDE_MODES.map(mode =>
    `<button type="button" role="tab" class="${state.mode === mode ? 'active' : ''}" aria-selected="${state.mode === mode}" data-action="guide-mode" data-mode="${mode}">${tr(modes[mode].tab)}</button>`
  ).join('')}</div>
  <div class="recipe-workspace guide-workspace"><aside class="stack"><section class="card card-pad recipe-catalog">
    <div class="section-title"><h2>${ui.icon(config.icon)}${tr(config.title)}</h2></div>
    <label class="field"><span>${tr("Поиск по названию")}</span><input id="guide-search" type="search" value="${escape(state.search)}" placeholder="${tr(config.sample)}" maxlength="160" autocomplete="off"></label>
    <div id="guide-results">${guideResults(state)}</div></section></aside><div id="guide-detail" tabindex="-1">${detail}</div></div>`;
}
