import { gameName, gameText } from './catalog-language.js';
import { entityImage } from './entity-images.js';
import { formatNumber, locale, t } from './i18n.js';
import { groupPlanChecklist } from './plan-checklist-groups.js';
import { checklistProgress, MAX_PLAN_PROGRESS } from './plan-checklist.js';

const modes = [['chain', 'Цепочка'], ['groups', 'По группам']];

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

function quantity(value) {
  if (value > 0 && value < 0.000001) {
    return new Intl.NumberFormat(locale(), { notation: 'scientific', maximumFractionDigits: 2 }).format(value);
  }
  return formatNumber(value, 6);
}

function progressLabel(remaining) {
  const done = [...remaining.values()].filter(value => value === 0).length;
  return t('Выполнено {0} из {1}', formatNumber(done), formatNumber(remaining.size));
}

function hiddenBranches(checklist, collapsed) {
  const hidden = new Set();
  for (const { id, parent } of checklist.branches) {
    if (collapsed.has(parent) || hidden.has(parent)) hidden.add(id);
  }
  return hidden;
}

export function planChecklistView(plan, view, { title, icon, sampleName, disabled }) {
  const { book, checklist, mode, collapsed } = view;
  const progress = plan.progress ?? {};
  const { remaining, byBranch } = checklistProgress(checklist, progress);
  const chain = mode === 'chain';
  const hidden = chain ? hiddenBranches(checklist, collapsed) : new Set();
  const renderRow = (row, branch) => {
    const entity = book?.entitiesByKey.get(row.key);
    const name = book ? gameName(row.name) : sampleName(row.key, row.name);
    const left = branch ? byBranch[branch.id] : remaining.get(row.key);
    const complete = left === 0;
    const recorded = Object.hasOwn(progress, row.key) ? progress[row.key] : 0;
    const needed = branch?.needed ?? row.needed;
    const item = `${entityImage(entity ?? { name, type: 'item' })}<span>${escape(name)}</span>`;
    const hasChildren = branch?.children.length > 0;
    const shared = chain && row.occurrences > 1;
    const fieldLabel = escape(t(shared ? 'Готово всего · {0}' : 'Готово · {0}', name));
    const target = row.key === checklist.root.key;
    return `<tr data-plan-row="${escape(row.key)}" data-complete="${complete}"
      ${branch ? `id="plan-row-${branch.id}" data-plan-branch="${branch.id}"${hidden.has(branch.id) ? ' hidden' : ''}` : ''}
      class="${target ? 'plan-target-row' : branch?.depth === 1 ? 'plan-component-row' : ''}">
      <th scope="row" style="--plan-depth:${Math.min(8, branch?.depth ?? 0)}">
        ${hasChildren ? `<button type="button" class="plan-item plan-branch-toggle" data-action="plan-branch" data-branch="${branch.id}"
          aria-expanded="${!collapsed.has(branch.id)}" aria-controls="${branch.children.map(child => `plan-row-${child.id}`).join(' ')}">
          ${icon('chevron')}${item}
        </button>` : `<span class="plan-item">${branch ? '<span class="plan-branch-spacer" aria-hidden="true"></span>' : ''}${item}
          ${row.tier ? `<small class="plan-tier">T${row.tier}</small>` : ''}</span>`}
      </th>
      <td class="plan-quantity">${quantity(needed)}</td>
      <td class="plan-quantity"><input class="table-input plan-entry" type="number" inputmode="decimal" min="0" max="${MAX_PLAN_PROGRESS}" step="any"
        value="${recorded}" data-plan-progress="${escape(row.key)}" aria-label="${fieldLabel}" ${shared ? `title="${fieldLabel}"` : ''} ${disabled || !needed ? 'disabled' : ''}></td>
      <td class="plan-quantity"><span class="plan-balance"><b data-plan-left>${quantity(left)}</b>
        <span class="plan-complete" ${complete ? '' : 'hidden'}>${icon('check')}<span class="screen-reader">${t('Выполнено')}</span></span>
      </span></td>
    </tr>`;
  };
  let tableBody;
  if (chain) {
    tableBody = `<tbody>${checklist.branches.map(branch => renderRow(checklist.rowsByKey.get(branch.key), branch)).join('')}</tbody>`;
  } else {
    view.groups ??= groupPlanChecklist(checklist, book);
    tableBody = view.groups.map(group => {
      const label = group.skills.length ? group.skills.map(gameText).join(' · ') : group.name ?? t(group.goal ? 'Цель' : 'Общие материалы');
      return `<tbody class="plan-group"><tr class="plan-group-heading"><th colspan="4" scope="rowgroup">${escape(label)}</th></tr>
        ${group.rows.map(row => renderRow(row)).join('')}</tbody>`;
    }).join('');
  }
  return `<section class="card card-pad plan-checklist" aria-labelledby="plan-checklist-title">
    <div class="plan-checklist-header">
      <div><h2 id="plan-checklist-title">${escape(title)}</h2>
        <p data-plan-status class="subtitle" role="status">${progressLabel(remaining)}</p></div>
      <button class="secondary" data-action="open-plan-calculation" data-id="${escape(plan.id)}">${t('К расчёту {0}', icon('arrow'))}</button>
    </div>
    ${checklist.craftReference ? `<p class="plan-hint" data-plan-craft-reference>${t('Материалы рассчитаны для крафта предметов любой редкости. Для точной редкости может понадобиться больше партий.')}</p>` : ''}
    <div class="tabs-inline plan-modes" role="tablist" aria-label="${t('Вид списка работ')}">${modes.map(([key, label]) =>
      `<button id="plan-tab-${key}" role="tab" aria-controls="plan-table-panel" aria-selected="${key === mode}"
        tabindex="${key === mode ? 0 : -1}" class="${key === mode ? 'active' : ''}" data-action="plan-mode" data-mode="${key}">${t(label)}</button>`).join('')}
    </div>
    <div id="plan-table-panel" role="tabpanel" aria-labelledby="plan-tab-${mode}">
      ${chain && checklist.branches.length > checklist.rows.length
        ? `<p class="plan-hint">${t('У одинаковых предметов общее количество «Готово». Остаток показан для каждой ветки.')}</p>` : ''}
      <div class="plan-table-wrap">
      <table class="data-table plan-table">
        <thead><tr><th scope="col">${t('Предмет')}</th><th scope="col" class="plan-quantity">${t('Нужно')}</th>
          <th scope="col" class="plan-quantity">${t('Готово')}</th><th scope="col" class="plan-quantity">${t('Осталось')}</th></tr></thead>
        ${tableBody}
      </table>
      </div>
    </div>
  </section>`;
}

export function updatePlanBranches(container, checklist, collapsed) {
  const hidden = hiddenBranches(checklist, collapsed);
  for (const row of container.querySelectorAll('[data-plan-branch]')) {
    const id = Number(row.dataset.planBranch);
    row.hidden = hidden.has(id);
    row.querySelector('.plan-branch-toggle')?.setAttribute('aria-expanded', String(!collapsed.has(id)));
  }
}

export function updatePlanChecklist(container, checklist, progress, editedField) {
  const { remaining, byBranch } = checklistProgress(checklist, progress);
  container.querySelector('[data-plan-status]').textContent = progressLabel(remaining);
  for (const row of container.querySelectorAll('[data-plan-row]')) {
    const key = row.dataset.planRow;
    const left = row.dataset.planBranch === undefined ? remaining.get(key) : byBranch[Number(row.dataset.planBranch)];
    row.querySelector('[data-plan-left]').textContent = quantity(left);
    row.dataset.complete = String(left === 0);
    row.querySelector('.plan-complete').hidden = left !== 0;
    if (key === editedField.dataset.planProgress) {
      const field = row.querySelector('[data-plan-progress]');
      if (field !== editedField) field.value = Object.hasOwn(progress, key) ? progress[key] : 0;
    }
  }
}
