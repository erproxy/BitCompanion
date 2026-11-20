import { t as tr, formatDate, formatNumber } from './i18n.js';
import { gameName } from './catalog-language.js';
import { DUNGEON_SEARCH_LIMIT, getDungeonIndex, findDungeons, chestRewardKeys } from './dungeon-domain.js';
import { getRecipeBook, ensureRecipeCatalog, recipeCatalogError } from './recipes-view.js';
import { entityImage } from './entity-images.js';
import { catalogDropAction } from './catalog-details.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const number = formatNumber;
const patchNotes = 'https://bitcraftonline.com/news/bitcraft-online-1-0-patch-notes';

export function dungeonResults(state, icon) {
  const book = getRecipeBook();
  if (!book) return '';
  const index = getDungeonIndex(book);
  const matches = findDungeons(index, state.search);
  const selected = state.id || index.dungeons[0]?.id;
  return `<p class="recipe-result-count" role="status">${tr("Найдено {0}", number(matches.length))}</p>
    <div class="recipe-search-results">${matches.map(dungeon => {
      const active = dungeon.id === selected;
      return `<button type="button" class="recipe-search-item${active ? ' selected' : ''}" data-action="dungeon-target" data-id="${dungeon.id}" aria-pressed="${active}">
        ${entityImage(dungeon.buildingKey, { size: 'md' })}<span><b>${escape(gameName(dungeon.name, dungeon.title))}</b></span>${icon('arrow')}
      </button>`;
    }).join('') || `<p class="subtitle">${tr("Ничего не найдено. Попробуй другое название.")}</p>`}</div>`;
}

function entityLink(book, key, action = 'recipe-target', picture = false) {
  const entity = book.entitiesByKey.get(key);
  if (!entity || entity.missing) return escape(gameName(entity?.name || key));
  const label = escape(gameName(entity.name));
  return `<button type="button" class="recipe-link" data-action="${action}" data-id="${escape(key)}">${picture
    ? `<span class="entity-link-content">${entityImage(entity)}<span>${label}</span></span>` : label}</button>`;
}

function summaryCard(book, dungeon, roomNames, duration) {
  const entrance = dungeon.passages.find(passage => passage.from === 0);
  const date = book.catalog.source?.committedAt?.slice(0, 10);
  const interval = seconds => Number.isFinite(seconds) && seconds > 0 ? escape(duration(seconds)) : tr("В снимке не указано");
  const difference = dungeon.id === 1785852446 && date === '2026-11-13' &&
    (dungeon.collapseSeconds !== 120 || dungeon.respawnSeconds !== 300);
  return `<section class="card card-pad">
    <div class="recipe-target-heading">${entityImage(dungeon.buildingKey, { size: 'lg' })}<div>
      <h2 id="dungeon-heading">${escape(gameName(dungeon.name, dungeon.title))}</h2>
    </div></div>
    <dl class="recipe-facts dungeon-facts">
      <dt>${tr("Вход с поверхности")}</dt><dd>${escape(roomNames.get(entrance?.to) || tr("В снимке не указан"))}</dd>
      <dt>${tr("До обрушения")}</dt><dd>${interval(dungeon.collapseSeconds)}</dd>
      <dt>${tr("До восстановления")}</dt><dd>${interval(dungeon.respawnSeconds)}</dd>
    </dl>
    ${difference ? `<p class="warning dungeon-timing">${tr("Для данжей в")} <a class="recipe-link" href="${patchNotes}" target="_blank" rel="noopener noreferrer">${tr("патчноуте 1.0")}</a> ${tr("указаны 2 и 5 минут. Здесь приведены значения Giant Skitch из снимка.")}</p>` : ''}
    <p class="recipe-record">${tr("Снимок {0} · координаты входа не указаны", escape(date ? formatDate(date) : tr("каталога")))}</p>
  </section>`;
}

function roomTitle(room) {
  const fallback = /^Комната (\d+)$/.exec(room.title);
  return fallback ? tr("Комната {0}", fallback[1]) : tr(room.title);
}
function countedLabels(names) {
  const counts = new Map();
  for (const name of names) counts.set(name, (counts.get(name) || 0) + 1);
  return [...counts].map(([name, count]) => count > 1 ? `${escape(name)} × ${number(count)}` : escape(name)).join(', ');
}

function routeCard(book, dungeon, roomNames, icon) {
  return `<section class="card card-pad" aria-labelledby="dungeon-route-heading">
    <div class="section-title"><h2 id="dungeon-route-heading">${tr("{0}Маршрут", icon('compass'))}</h2></div>
    <ul class="guide-list dungeon-route">${dungeon.rooms.map(room => {
      const exits = dungeon.passages.filter(passage => passage.from === room.id);
      const options = exits.map(({ to, enemyLock }) => `${roomNames.get(to)}${enemyLock ? tr(" (блокируется врагами)") : ''}`);
      const conditions = room.conditions.length ? `<details class="recipe-method"><summary>${tr("Условия открытия проходов")}</summary>
        <ul class="guide-list">${room.conditions.map(condition => `<li>${condition.all ? tr("Все точки") : tr("Любая из точек")} <b>${countedLabels(condition.required.map(name => gameName(name)))}</b> ${tr("→ исчезают {0}", countedLabels(condition.removes.map(name => gameName(name))))}</li>`).join('')}</ul>
      </details>` : '';
      return `<li><h3>${escape(roomNames.get(room.id))}</h3>
        ${options.length ? `<p class="dungeon-room-line"><span>${tr("Порталы")}</span><span>${countedLabels(options)}</span></p>` : ''}
        ${room.enemyKeys.length ? `<p class="dungeon-room-line"><span>${tr("Противники")}</span><span>${room.enemyKeys.map(key => entityLink(book, key, 'resource-target')).join(', ')}</span></p>` : ''}
        ${conditions}</li>`;
    }).join('')}</ul>
  </section>`;
}

function rewardsCard(book, dungeon, icon) {
  const bosses = dungeon.rooms.flatMap(room => room.bosses.map(boss => ({ ...boss, room: roomTitle(room) })));
  const chests = [...new Set(dungeon.rooms.flatMap(room => room.chestKeys))];
  const name = key => gameName(book.entitiesByKey.get(key)?.name || key);
  const itemLinks = keys => [...keys].sort((a, b) => name(a).localeCompare(name(b))).map(key =>
    `<li>${entityLink(book, key, 'recipe-target', true)}</li>`).join('');
  return `<section class="card card-pad" aria-labelledby="dungeon-rewards-heading">
    <div class="section-title"><h2 id="dungeon-rewards-heading">${tr("{0}Награды", icon('bag'))}</h2></div>
    ${bosses.map(boss => `<article class="dungeon-reward-source"><h3>${entityLink(book, boss.key, 'resource-target', true)}</h3>
      <p class="subtitle">${tr("{0} · возможные предметы по минимальному вкладу", escape(boss.room))}</p>
      ${boss.pools.map((pool, index) => `<details class="recipe-method dungeon-pool"${index === 0 ? ' open' : ''}>
        <summary>${tr("Вклад от {0}", number(pool.minimum))}</summary>
        ${pool.rewardKeys.length ? `<ul class="guide-list dungeon-rewards">${itemLinks(pool.rewardKeys)}</ul>` : `<p class="recipe-record">${tr("Возможные предметы в снимке не указаны.")}</p>`}
      </details>`).join('') || `<p class="recipe-record">${tr("Таблица наград в снимке отсутствует.")}</p>`}
    </article>`).join('')}
    ${chests.map(key => {
      const method = book.recipesByKey.get(key);
      const keys = chestRewardKeys(book, key);
      return `<article class="dungeon-reward-source"><h3>${escape(gameName(book.entitiesByKey.get(key)?.name || key))}</h3>
        <ul class="guide-list dungeon-rewards">${itemLinks(keys)}</ul>${method ? keys.map(item => catalogDropAction(method, item)).join('') : ''}</article>`;
    }).join('')}
    ${bosses.length || chests.length ? '' : `<p class="subtitle">${tr("Связанные награды в снимке не найдены.")}</p>`}
  </section>`;
}

export function dungeonsView(state, { icon, duration }) {
  const book = getRecipeBook();
  if (!book) {
    const error = recipeCatalogError();
    if (!error) ensureRecipeCatalog().catch(() => {});
    return `<section class="card card-pad" role="status"><h2>${error ? tr("Не удалось открыть данжи") : tr("Открываем данжи…")}</h2>
      ${error ? `<p class="subtitle">${escape(error)}</p><button type="button" class="secondary" data-action="recipe-retry">${tr("Повторить")}</button>` : ''}</section>`;
  }
  const index = getDungeonIndex(book);
  const dungeon = state.id ? index.byId.get(state.id) : index.dungeons[0];
  const roomNames = new Map([[0, tr("Выход на поверхность")], ...(dungeon?.rooms || []).map(room => [room.id, roomTitle(room)])]);
  return `<div class="recipe-workspace dungeon-workspace">
    <aside class="stack"><section class="card card-pad recipe-catalog">
      <label class="field"><span>${tr("Поиск данжа")}</span><input type="search" id="dungeon-search" maxlength="${DUNGEON_SEARCH_LIMIT}" autocomplete="off" placeholder="${tr("Логово, Sentinel…")}" value="${escape(state.search)}"></label>
      <div id="dungeon-results">${dungeonResults(state, icon)}</div></section></aside>
    <div id="dungeon-detail" class="stack" tabindex="-1"${dungeon ? ' aria-labelledby="dungeon-heading"' : ''}>
      ${dungeon ? summaryCard(book, dungeon, roomNames, duration) + routeCard(book, dungeon, roomNames, icon) + rewardsCard(book, dungeon, icon)
        : `<section class="card empty"><h2>${tr("Данж не найден в снимке")}</h2><p>${tr("Выбери доступный данж из списка.")}</p></section>`}
    </div>
  </div>`;
}
