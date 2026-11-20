import { t as tr, formatNumber, formatDate } from './i18n.js';
import { gameName, gameText } from './catalog-language.js';
import { WORLD_MODES, WORLD_ORDERS, WORLD_SEARCH_LIMIT, findWorldEntries, getWorldIndex } from './world-domain.js';
import { ensureRecipeCatalog, getRecipeBook, recipeCatalogError } from './recipes-view.js';
import { guideLink, itemLink, skillLink } from './guide-view.js';
import { entityImage, resolveEntityImage, skillImageKey } from './entity-images.js';
import { getBiomeLocations } from './biome-domain.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const number = formatNumber;
const pageSize = 12;
const modes = {
  achievements: { table: 'achievement_desc', searchLabel: 'Найти достижение', example: 'World Explorer, Mining…' },
  biomes: { table: 'biome_desc', searchLabel: 'Найти биом', example: 'Лес, Open Ocean…' },
  prospecting: { table: 'prospecting_desc', searchLabel: 'Найти разведку', example: 'Survey the Lake, Снежные вершины…' }
};

function entryImage(mode, entry, size) {
  if (mode === 'biomes') return entityImage({ key: `biome:${entry.id}`, name: entry.name }, { size });
  const ownKey = `${mode === 'achievements' ? 'achievement' : 'prospecting'}:${entry.id}`;
  const related = mode === 'achievements'
    ? [...entry.discoveries, ...(entry.skill ? [skillImageKey(entry.skill.id)] : []), ...entry.rewards.map(id => `collectible:${id}`)]
    : [...entry.targetKeys, ...entry.itemsToStart.map(stack => stack.key), ...entry.biomes.map(id => `biome:${id}`)];
  const key = [ownKey, ...related].find(candidate => resolveEntityImage(candidate));
  return entityImage(key || { key: ownKey }, { size, className: 'world-entry-art' });
}

function entryLink(mode, entry, fallback) {
  if (!entry) return escape(fallback);
  return `<button type="button" class="recipe-link" data-action="world-target" data-mode="${mode}" data-id="${entry.id}">
    <span class="entity-link-content">${entryImage(mode, entry, 'sm')}<span>${escape(gameName(entry.name, entry.title))}</span></span></button>`;
}

function entityLink(book, key) {
  if (key.startsWith('crafting:')) {
    const recipe = book.recipesByKey.get(key);
    const output = recipe?.outputs[0] || recipe?.possibleOutputs[0];
    return output ? itemLink(book, output.key, { text: gameName(recipe.name), recipeKey: key }) : escape(gameName(recipe?.name || key));
  }
  if (key.startsWith('item:') || key.startsWith('cargo:') || key.startsWith('chest:')) return itemLink(book, key);
  const entity = book.entitiesByKey.get(key);
  if (!entity || entity.missing) return escape(gameName(entity?.name || key));
  return `<button type="button" class="recipe-link resource-inline-link" data-action="resource-target" data-id="${escape(key)}">
    ${entityImage(entity)}<span>${escape(gameName(entity.name))}</span></button>`;
}

function listSection(title, rows, className = '') {
  return rows.length ? `<section class="world-section"><h3>${title}</h3><ul class="guide-list ${className}">
    ${rows.map(row => `<li>${row}</li>`).join('')}</ul></section>` : '';
}

function sourceRecord(book, mode, id) {
  const { committedAt, tableBaseUrl } = book.catalog.source || {};
  const date = committedAt ? formatDate(committedAt.slice(0, 10)) : '';
  const table = `${modes[mode].table}.json`;
  const source = tableBaseUrl ? `<a class="recipe-link" href="${escape(tableBaseUrl + table)}" target="_blank" rel="noopener noreferrer">${tr("Таблица источника ↗")}</a>` : escape(table);
  return `<p class="recipe-record">${tr("{0}{1} · запись № {2}", date ? tr("Снимок {0} · ", escape(date)) : '', source, number(id))}</p>`;
}

function achievementContent(book, index, entry) {
  const prerequisites = entry.prerequisites.map(id => entryLink('achievements', index.byMode.achievements.get(id), tr("Достижение № {0}", id)));
  const conditions = [
    ...(entry.skill ? [skillLink(book, entry.skill)] : []),
    ...entry.discoveries.map(key => tr("Обнаружить · {0}", entityLink(book, key))),
    ...(entry.chunks > 0 ? [`${tr("Открыть участки мира ·")} <b class="world-value">${number(entry.chunks)}</b>`] : [])
  ];
  const rewards = entry.rewards.map(id => {
    const collectible = index.collectibles.get(id);
    const type = collectible?.type;
    const label = type === 'Title' ? tr("Титул") : type === 'Emote' ? tr("Эмоция") : type?.startsWith('Clothes') ? tr("Косметика") : tr("Коллекция");
    return `<span class="entity-link-content">${entityImage({ key: `collectible:${id}`, type })}<span><span>${escape(gameName(collectible?.name || `№ ${id}`))}</span>
      <small>${label}</small></span></span>`;
  });
  const next = (index.unlocks.get(entry.id) || []).map(achievement => entryLink('achievements', achievement));
  return listSection(tr("Условия"), conditions) + listSection(tr("Предыдущие достижения"), prerequisites) +
    (conditions.length || prerequisites.length || entry.description ? '' : `<p class="subtitle">${tr("Условия в снимке не указаны.")}</p>`) +
    listSection(tr("Коллекционные награды"), rewards, 'world-rewards') + listSection(tr("Следующие достижения"), next);
}

function facts(rows) {
  return `<dl class="recipe-facts world-facts">${rows.map(([term, value]) => `<dt>${term}</dt><dd>${value}</dd>`).join('')}</dl>`;
}

function biomeContent(book, index, entry) {
  const searches = (index.searchesByBiome.get(entry.id) || []).map(search => entryLink('prospecting', search));
  const sources = [...getBiomeLocations(book).origins].filter(([, locations]) => locations.spawn.has(entry.id))
    .map(([key]) => book.entitiesByKey.get(key)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  return facts([
    [tr("Климатическая опасность"), escape(entry.hazard ? gameName(entry.hazard, entry.hazardLabel) : tr("В снимке не указана"))],
    [tr("Строительство"), entry.buildingRestricted ? tr("Постройки игроков запрещены") : tr("Ограничение для биома не указано")]
  ]) + listSection(tr("Известные источники"), sources.map(entity => entityLink(book, entity.key)), 'guide-unlock-list')
    + (searches.length ? listSection(tr("Разведки в биоме"), searches, 'guide-unlock-list')
    : `<p class="subtitle">${tr("Связанных разведок в снимке нет.")}</p>`);
}

function prospectingContent(book, index, entry) {
  const biomes = entry.biomes.map(id => entryLink('biomes', index.byMode.biomes.get(id), tr("Биом № {0}", id)));
  const [min, max] = entry.clues;
  const clues = min === max ? number(min) : `${number(min)}–${number(max)}`;
  const itemRows = stacks => stacks.map(({ key, quantity }) =>
    `${itemLink(book, key)} <b class="world-value">× ${number(quantity)}</b>`);
  return facts([
    [tr("Биомы"), biomes.join(', ') || tr("В снимке не указаны")],
    [tr("Число подсказок"), `<b class="world-value">${clues}</b>`],
    ...(entry.contribution > 0 ? [[tr("Вклад за подсказку"), `<b class="world-value">${number(entry.contribution)}</b>`]] : []),
    ...(entry.experience ? [[tr("Опыт за подсказку"), `<b class="world-value">${number(entry.experience.quantity)} XP</b> · ${guideLink(book, 'skills', entry.experience.id)}`]] : []),
    ...(entry.canSearchOnWater ? [[tr("Разведка с воды"), tr("Доступна")]] : [])
  ]) + listSection(tr("Нужно для запуска"), itemRows(entry.itemsToStart)) +
    listSection(tr("Расходуется при запуске"), itemRows(entry.consumedOnStart)) +
    listSection(tr("Нужно при взаимодействии с целью"), itemRows(entry.itemsForTarget)) +
    (entry.targetKeys.length ? listSection(tr("Цель поиска"), entry.targetKeys.map(key => entityLink(book, key)))
      : `<p class="subtitle">${tr("Цель поиска в снимке не указана.")}</p>`);
}

function detailCard(book, index, mode, entry) {
  if (!entry) return `<section class="card empty"><h2 id="world-heading">${tr("Запись не найдена в снимке")}</h2><p>${tr("Выбери другую запись из списка.")}</p></section>`;
  const content = mode === 'achievements' ? achievementContent(book, index, entry)
    : mode === 'biomes' ? biomeContent(book, index, entry) : prospectingContent(book, index, entry);
  return `<section class="card card-pad world-card">
    <div class="world-card-top"><div class="recipe-target-heading">${entryImage(mode, entry, 'lg')}<div>
      <h2 id="world-heading">${escape(gameName(entry.name, entry.title))}</h2>
    </div></div>${mode === 'achievements' ? `<div class="world-points">
      <b>${number(entry.points)}</b><span>${tr("Очки достижения")}</span></div>` : ''}</div>
    ${entry.description ? `<p class="recipe-description">${escape(gameText(entry.description))}</p>` : ''}
    ${content}${sourceRecord(book, mode, entry.id)}</section>`;
}

function selectedEntry(index, { mode, id }) {
  return id ? index.byMode[mode].get(id) : index.entries[mode][0];
}

export function worldResults(state, icon) {
  const book = getRecipeBook();
  if (!book) return '';
  const { mode } = state;
  const index = getWorldIndex(book);
  const matches = findWorldEntries(index, state);
  const selected = selectedEntry(index, state)?.id;
  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  const requested = state.page < 0 ? Math.floor(matches.findIndex(entry => entry.id === selected) / pageSize) : state.page;
  const page = Math.min(Math.max(0, requested), pages - 1);
  const resultMeta = entry => mode === 'achievements' ? tr("{0} очк.", number(entry.points)) : mode === 'biomes' ? ''
    : entry.biomes.map(id => { const biome = index.byMode.biomes.get(id); return biome && gameName(biome.name, biome.title); }).filter(Boolean).join(', ');
  return `<p class="recipe-result-count" role="status">${tr("Найдено: {0}{1}", number(matches.length), pages > 1 ? tr(" · страница {0} из {1}", page + 1, pages) : '')}</p>
    ${matches.length ? `<div class="recipe-search-results">${matches.slice(page * pageSize, (page + 1) * pageSize).map(entry => {
      const active = entry.id === selected;
      return `<button type="button" class="recipe-search-item world-result${active ? ' selected' : ''}" data-action="world-target" data-mode="${mode}" data-id="${entry.id}" aria-pressed="${active}">
        ${entryImage(mode, entry, 'md')}<span><b>${escape(gameName(entry.name, entry.title))}</b>${resultMeta(entry) ? `<small>${escape(resultMeta(entry))}</small>` : ''}</span>${icon('arrow')}</button>`;
    }).join('')}</div>` : `<p class="subtitle">${tr("Ничего не найдено. Измени запрос или сбрось фильтры.")}</p>`}
    ${pages > 1 ? `<div class="recipe-pagination"><button type="button" class="secondary" data-action="world-page" data-page="${page - 1}"${page === 0 ? ' disabled' : ''}>${tr("Назад")}</button>
      <button type="button" class="secondary" data-action="world-page" data-page="${page + 1}"${page === pages - 1 ? ' disabled' : ''}>${tr("Далее {0}", icon('arrow'))}</button></div>` : ''}`;
}

function filters(index, state) {
  const option = (value, name, current) => `<option value="${escape(value)}"${value === current ? ' selected' : ''}>${escape(name)}</option>`;
  if (state.mode === 'achievements') {
    const bySkill = index.skills.map(skill => option(String(skill.id), gameName(skill.name), state.achievementFilter)).join('');
    return `<label class="field"><span>${tr("Условия")}</span><select data-world-filter="achievementFilter">
      <option value="">${tr("Все достижения")}</option>${option('exploration', tr("Исследование мира"), state.achievementFilter)}
      <optgroup label="${tr('Навыки')}">${bySkill}</optgroup></select></label>
      <label class="field"><span>${tr("Сортировка")}</span><select data-world-filter="order">
      ${Object.entries(WORLD_ORDERS).map(([value, label]) => option(value, tr(label), state.order)).join('')}</select></label>`;
  }
  if (state.mode === 'prospecting') {
    return `<label class="field"><span>${tr("Биом")}</span><select data-world-filter="biomeId">
      <option value="0">${tr("Все биомы")}</option>${index.entries.biomes.map(entry =>
        option(entry.id, gameName(entry.name, entry.title), state.biomeId)).join('')}</select></label>`;
  }
  return '';
}

export function worldView(state, icon) {
  const book = getRecipeBook();
  if (!book) {
    const error = recipeCatalogError();
    if (!error) ensureRecipeCatalog().catch(() => {});
    return `<section class="card card-pad" role="status"><h2>${error ? tr("Не удалось открыть каталог мира") : tr("Открываем каталог мира…")}</h2>
      ${error ? `<p class="subtitle">${escape(error)}</p><button type="button" class="secondary" data-action="recipe-retry">${tr("Повторить")}</button>` : ''}</section>`;
  }
  if (!book.catalog.world) return `<section class="card empty"><h2>${tr("Каталог мира отсутствует в этом снимке")}</h2></section>`;
  const { mode } = state;
  const index = getWorldIndex(book);
  return `<div class="tabs-inline resource-modes" role="tablist" aria-label="${tr("Разделы мира")}">
    ${Object.entries(WORLD_MODES).map(([id, name]) => `<button type="button" role="tab" id="world-tab-${id}" aria-controls="world-panel"
      aria-selected="${id === mode}" tabindex="${id === mode ? 0 : -1}" data-action="world-mode" data-mode="${id}" class="${id === mode ? 'active' : ''}">${tr(name)}</button>`).join('')}</div>
    <div id="world-panel" class="recipe-book recipe-workspace world-workspace" role="tabpanel" aria-labelledby="world-tab-${mode}">
      <aside class="stack"><section class="card card-pad recipe-catalog" aria-label="${tr("Поиск и фильтры")}">
        <div class="section-title"><h2>${tr(WORLD_MODES[mode])}</h2><button type="button" class="text-button" data-action="world-reset">${tr("Сбросить")}</button></div>
        <label class="field"><span>${tr(modes[mode].searchLabel)}</span><input type="search" id="world-search" maxlength="${WORLD_SEARCH_LIMIT}"
          value="${escape(state.search)}" placeholder="${tr(modes[mode].example)}" autocomplete="off"></label>
        ${filters(index, state)}<div id="world-results">${worldResults(state, icon)}</div>
      </section></aside>
      <div id="world-detail" tabindex="-1" aria-labelledby="world-heading">${detailCard(book, index, mode, selectedEntry(index, state))}</div>
    </div>`;
}
