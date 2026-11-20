import { t as tr, formatNumber, formatDate, locale } from './i18n.js';
import { gameName } from './catalog-language.js';
import { entityImage } from './entity-images.js';
import { ensureRecipeCatalog, getRecipeBook, recipeCatalogError } from './recipes-view.js';
import { biomeListLabel, entityBiomeDetails } from './biome-view.js';
import { DROP_ATTEMPTS, DROP_MODES, DROP_SEARCH_LIMIT, dropTierOptions, findDropPage } from './drop-catalog.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const tier = value => value ? `T${value}` : tr("Тир не указан");
const resultTier = entry => entry.sourceTier ? tr("Источники T{0}", entry.sourceTier)
  : entry.itemTier ? tr("Предметы T{0}", entry.itemTier) : tr("Тиры не указаны");
const sourceTitle = entry => entry.originName && !entry.sourceName.includes(entry.originName)
  ? `${gameName(entry.sourceName)} · ${gameName(entry.originName)}` : gameName(entry.sourceName);
function chanceLabel(value) {
  const formatted = new Intl.NumberFormat(locale(), { maximumSignificantDigits: 5 }).format(value * 100);
  return `${formatted === '100' && value < 1 ? '≈' : ''}${formatted}%`;
}

export function dropTabs(mode) {
  return `<div class="tabs-inline resource-modes drop-modes" role="tablist" aria-label="${tr("Источники добычи")}">
    ${Object.entries(DROP_MODES).map(([id, name]) => `<button type="button" role="tab" id="drop-tab-${id}" aria-controls="drop-panel" aria-selected="${id === mode}" tabindex="${id === mode ? 0 : -1}"
      data-action="drop-mode" data-mode="${id}" class="${id === mode ? 'active' : ''}">${tr(name)}</button>`).join('')}
  </div>`;
}

function contributionLabel([min, max]) {
  if (!min && max == null) return tr("Вклад любого размера");
  if (!min) return tr("Вклад до {0}", formatNumber(max));
  if (max == null) return tr("Вклад от {0}", formatNumber(min));
  return tr("Вклад {0}–{1}", formatNumber(min), formatNumber(max));
}

export function dropResults(state, selected, icon) {
  const book = getRecipeBook();
  if (!book) return '';
  const { total, page, pages, entries } = findDropPage(book, state, selected);
  let previousGroup;
  return `<p class="recipe-result-count" role="status">${tr("Найдено {0}{1}", formatNumber(total), pages > 1 ? tr(" · страница {0} из {1}", page + 1, pages) : '')}</p>
    ${entries.length ? `<div class="recipe-search-results drop-results-list">${entries.map(entry => {
      const group = resultTier(entry);
      const heading = previousGroup === group ? '' : `<h3 class="drop-tier-heading">${group}</h3>`;
      previousGroup = group;
      const active = selected === entry.id;
      const location = /^(resource|enemy):/.test(entry.originKey) ? biomeListLabel(book, entry.originKey) : '';
      const meta = [sourceTitle(entry), entry.itemTier ? tr("предмет T{0}", entry.itemTier) : '', entry.contribution ? contributionLabel(entry.contribution) : '', gameName(entry.quest?.[1])].filter(Boolean).join(' · ');
      return `${heading}
        <button type="button" class="recipe-search-item drop-result${active ? ' selected' : ''}" data-action="drop-target" data-id="${escape(entry.id)}" aria-pressed="${active}">
          ${entityImage(book.entitiesByKey.get(entry.itemKey) || entry.itemKey)}<span><b>${escape(gameName(entry.english || entry.name))}</b>
            <small>${escape(meta)}</small>${location ? `<small>${escape(location)}</small>` : ''}</span>
          <span class="drop-result-chance"><b>${chanceLabel(entry.chance)}</b>${entry.min ? `<small>${tr("на бонус")}</small>` : ''}</span>
        </button>`;
    }).join('')}</div>` : `<p class="subtitle">${tr("Ничего не найдено. Измените запрос или сбросьте фильтры.")}</p>`}
    ${pages > 1 ? `<div class="recipe-pagination"><button type="button" class="secondary" data-action="drop-page" data-page="${page - 1}"${page === 0 ? ' disabled' : ''}>${tr("Назад")}</button>
      <button type="button" class="secondary" data-action="drop-page" data-page="${page + 1}"${page + 1 === pages ? ' disabled' : ''}>${tr("Далее {0}", icon('arrow'))}</button></div>` : ''}`;
}

export function dropBrowserView(state, selected, icon) {
  const book = getRecipeBook();
  const error = recipeCatalogError();
  if (!book && !error) ensureRecipeCatalog().catch(() => {});
  const tierFilter = (key, title) => `<label class="field"><span id="drop-label-${key}">${title}</span><select aria-labelledby="drop-label-${key}" data-drop-filter="${key}">
    <option value="">${tr("Все тиры")}</option>${dropTierOptions(book, state.mode, key).map(value => {
      const keyValue = value == null ? 'none' : String(value);
      return `<option value="${keyValue}"${state[key] === keyValue ? ' selected' : ''}>${tier(value)}</option>`;
    }).join('')}</select></label>`;
  return `<section class="card card-pad drop-browser"><div class="section-title"><h2>${icon('bag')}${tr(DROP_MODES[state.mode])}</h2>
    ${book && (state.search || state.sourceTier || state.itemTier) ? `<button type="button" class="text-button" data-action="drop-reset">${tr("Сбросить")}</button>` : `<button type="button" class="text-button" data-action="drop-reset" hidden>${tr("Сбросить")}</button>`}</div>
    ${book ? `<label class="field"><span>${tr("Предмет или источник")}</span><input id="drop-search" type="search" maxlength="${DROP_SEARCH_LIMIT}" value="${escape(state.search)}"
      placeholder="Rangifer, Hex Coin…"></label>
      <div class="row drop-filters">${tierFilter('itemTier', tr("Тир предмета"))}${tierFilter('sourceTier', tr("Тир источника"))}</div>
      <div id="drop-results">${dropResults(state, selected, icon)}</div>`
    : error ? `<div class="error">${tr("Не удалось загрузить игровой каталог. {0}", escape(error))}</div>
      <button type="button" class="secondary" data-action="recipe-retry">${tr("Повторить")}</button>` : `<p class="subtitle" role="status">${tr("Загружаем добычу из игрового снимка…")}</p>`}
  </section>`;
}

export function dropChanceField(entry) {
  return `<div class="field"><span id="drop-chance-caption">${tr("Шанс за попытку")}</span>
    <output class="drop-chance-value" aria-labelledby="drop-chance-caption" data-drop-probability="${entry.chance}"
      title="${String(entry.chance * 100).replace('.', locale() === 'ru-RU' ? ',' : '.')}%">${chanceLabel(entry.chance)}</output>
    <small>${tr("Снимок {0}", formatDate(entry.snapshot))}</small></div>`;
}

export function dropSourceView(entry, icon) {
  const book = getRecipeBook();
  const sourceKey = escape(entry.originKey);
  const origin = book?.entitiesByKey.get(entry.originKey);
  const worldSource = origin && ['resource', 'enemy'].includes(origin.type);
  const range = entry.contribution ? `<small>${contributionLabel(entry.contribution)}</small>` : '';
  const unitNote = entry.attempt === 'progress' ? tr("Число проверок за действие зависит от прогресса.")
    : entry.attempt === 'contribution-draw' ? tr("Число розыгрышей за бой равно вкладу, округлённому вверх.")
    : entry.attempt === 'contribution' ? tr("Для выбора пула вклад округляется вверх.") : '';
  const yieldNote = entry.min ? tr("Гарантировано {0} шт. Указан шанс получить больше за попытку.", formatNumber(entry.min))
    : entry.max > 1 ? tr("До {0} шт. за попытку. Удачная выдача приносит хотя бы один предмет.", formatNumber(entry.max)) : '';
  return `<div class="tip drop-source">${icon('info')}<div>
    <b>${escape(sourceTitle(entry))}</b>${entry.sourceTier ? ` · T${entry.sourceTier}` : ''}
    ${entry.station ? `<small>${escape(gameName(entry.station))}</small>` : ''}${range}
    ${entry.quest ? `<small>${entry.attempt === 'quest-reward' ? '' : tr("Активный квест · ")}<button type="button" class="recipe-link" data-action="guide-target" data-mode="quests" data-id="${entry.quest[0]}">${escape(gameName(entry.quest[1]))}</button>
      ${entry.quest[3] ? ` · ${escape(gameName(entry.quest[3]))}` : ''}</small>` : ''}
    <small><b>${tr("Одна попытка")}</b> · ${tr(DROP_ATTEMPTS[entry.attempt])}.</small>
    ${unitNote ? `<small>${unitNote}</small>` : ''}${yieldNote ? `<small>${yieldNote}</small>` : ''}
    ${entry.methodKey ? `<button type="button" class="recipe-link drop-source-link" data-action="recipe-target" data-id="${escape(entry.itemKey)}" data-method="${escape(entry.methodKey)}">${tr("Открыть способ получения")}</button>` : ''}
    ${worldSource ? `<button type="button" class="recipe-link drop-source-link" data-action="resource-target" data-id="${sourceKey}">${tr("Открыть источник")}</button>` : ''}
    </div></div>${worldSource ? entityBiomeDetails(book, origin) : ''}`;
}
