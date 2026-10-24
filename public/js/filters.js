/* ============================================================
   filters.js — أشرطة التصفية والبحث + سياق المشروع
   ============================================================ */

import { state, hooks } from './state.js';
import { $, escapeHTML } from './utils.js';
import { PRIORITY_FILTERS, getProjectInfo } from './config.js';

export function setupProjectContext() {
  const projectInfo = getProjectInfo();

  const labelEl = document.getElementById('current-project-label');
  if (labelEl) labelEl.textContent = projectInfo.name;

  const assigneeSelect = document.getElementById('task-assignee');
  if (assigneeSelect) {
    assigneeSelect.innerHTML = projectInfo.members
      .map(m => `<option value="${escapeHTML(m)}">👤 ${escapeHTML(m)}</option>`)
      .join('');
  }

  renderFilterBar();
  renderPriorityBar();
}

export function renderFilterBar() {
  const el = $('#assignee-filter');
  if (!el) return;

  const options = ['all', ...getProjectInfo().members];
  el.innerHTML =
    `<span class="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mr-1">🔍 Filter</span>` +
    options.map(m => {
      const active = state.assigneeFilter === m;
      const cls = active
        ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-600/25'
        : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border-slate-800';
      return `<button type="button" data-assignee="${escapeHTML(m)}" class="px-3 py-1.5 rounded-full text-xs font-semibold border transition ${cls}">${m === 'all' ? 'All' : escapeHTML(m)}</button>`;
    }).join('');
}

export function renderPriorityBar() {
  const el = $('#priority-filter');
  if (!el) return;
  el.innerHTML = PRIORITY_FILTERS.map(([val, label]) => {
    const cls = state.priorityFilter === val
      ? 'bg-purple-600 text-white border-purple-500 shadow-lg shadow-purple-600/25'
      : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border-slate-800';
    return `<button type="button" data-priority="${val}" class="px-3 py-1.5 rounded-full text-xs font-semibold border transition ${cls}">${label}</button>`;
  }).join('');
}

export function applyFilter() {
  const q = state.search.trim().toLowerCase();
  state.visible = state.tasks.filter(t =>
    (state.assigneeFilter === 'all' || t.assignee === state.assigneeFilter) &&
    (state.priorityFilter === 'all' || t.priority === state.priorityFilter) &&
    (!q || (t.title || '').toLowerCase().includes(q))
  );
  state.taskMap = new Map(state.visible.map(t => [t.id, t]));
}

export function bindFilterEvents() {
  // Assignee
  $('#assignee-filter')?.addEventListener('click', e => {
    const btn = e.target.closest('button[data-assignee]');
    if (!btn || btn.dataset.assignee === state.assigneeFilter) return;
    state.assigneeFilter = btn.dataset.assignee;
    renderFilterBar();
    hooks.renderAll();
  });

  // Priority
  $('#priority-filter')?.addEventListener('click', e => {
    const btn = e.target.closest('button[data-priority]');
    if (!btn || btn.dataset.priority === state.priorityFilter) return;
    state.priorityFilter = btn.dataset.priority;
    renderPriorityBar();
    hooks.renderAll();
  });

  // Search (debounce)
  let searchTimer;
  $('#search-input')?.addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = e.target.value;
      hooks.renderAll();
    }, 150);
  });
}