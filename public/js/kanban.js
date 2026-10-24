/* ============================================================
   kanban.js — اللوحة + السحب والإفلات + تبويبات الجوال
   ============================================================ */

import { state } from './state.js';
import { $, $$, escapeHTML } from './utils.js';
import { PRIORITY_MAP } from './config.js';
import { getDeadlineInfo } from './deadline.js';
import { updateStatus } from './tasks.js';

const kanbanCache = { todo: '', 'in-progress': '', done: '' };

function kanbanCardHTML(task, info) {
  const pr = PRIORITY_MAP[task.priority] || PRIORITY_MAP.medium;
  return `
    <div draggable="true" data-card-id="${task.id}" class="cursor-grab active:cursor-grabbing glass-panel p-4 rounded-2xl border ${info.isOverdue ? 'border-rose-500/50 bg-rose-950/10' : 'border-slate-800'} shadow-md space-y-3 hover:border-slate-700 transition duration-200">

      <!-- 1. الهيدر: العنوان وأزرار التعديل والحذف -->
      <div class="flex justify-between items-start gap-2">
        <div class="flex items-start gap-2 flex-1 min-w-0">
          <span class="w-2 h-2 rounded-full ${pr.color} mt-1.5 flex-shrink-0" title="Priority: ${pr.label}"></span>
          <h4 class="font-semibold text-sm text-slate-100 leading-snug break-words">${escapeHTML(task.title)}</h4>
        </div>
        <div class="flex items-center flex-shrink-0">
          <button data-action="edit" data-id="${task.id}" title="Edit" class="text-slate-500 hover:text-indigo-400 transition text-xs p-1">✏️</button>
          <button data-action="delete" data-id="${task.id}" title="Delete" class="text-slate-500 hover:text-rose-400 transition text-xs p-1">✕</button>
        </div>
      </div>

      <!-- 2. حالة المهمة -->
      <div class="flex items-center justify-between gap-2">
        <span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded-md border ${info.class}">${info.label}</span>
        <span data-timer-id="${task.id}" data-label="${info.label}" class="text-xs font-mono font-medium text-slate-300">${info.timeText}</span>
      </div>

      <!-- 3. المكلف بالمهمة -->
      <div class="flex justify-between items-center text-xs text-slate-400 pt-2 border-t border-slate-800/80">
        <span class="flex items-center gap-1 font-medium text-slate-300 truncate">👤 ${escapeHTML(task.assignee)}</span>
      </div>

      <!-- 4. أزرار نقل الحالة -->
      <div class="pt-2 flex gap-1.5 text-[11px]">
        ${task.status !== 'todo' ? `<button data-action="status" data-id="${task.id}" data-status="todo" class="flex-1 bg-slate-900 hover:bg-slate-800 text-slate-300 py-1.5 rounded-lg border border-slate-800 transition text-center">To Do</button>` : ''}
        ${task.status !== 'in-progress' ? `<button data-action="status" data-id="${task.id}" data-status="in-progress" class="flex-1 bg-slate-900 hover:bg-slate-800 text-blue-400 py-1.5 rounded-lg border border-slate-800 transition text-center">Progress</button>` : ''}
        ${task.status !== 'done' ? `<button data-action="status" data-id="${task.id}" data-status="done" class="flex-1 bg-emerald-950/80 hover:bg-emerald-900/80 text-emerald-400 py-1.5 rounded-lg border border-emerald-800/50 transition font-semibold text-center">Done</button>` : ''}
      </div>

    </div>`;
}

export function renderKanban() {
  if (state.dragId) return; // لا تعيد الرسم أثناء السحب كي لا يُلغى

  const priorityWeight = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...state.visible].sort((a, b) => {
    const pa = priorityWeight[a.priority] ?? 2;
    const pb = priorityWeight[b.priority] ?? 2;
    if (pa !== pb) return pa - pb;
    return (a.deadline || '').localeCompare(b.deadline || '');
  });

  const groups = { todo: [], 'in-progress': [], done: [] };
  sorted.forEach(t => groups[t.status]?.push(t));

  Object.keys(groups).forEach(status => {
    const col = $(`#col-${status}`);
    const countEl = $(`#count-${status}`);
    if (countEl) countEl.textContent = groups[status].length;
    const tabCountEl = $(`#tab-count-${status}`);
    if (tabCountEl) tabCountEl.textContent = groups[status].length;
    if (!col) return;

    const infos = groups[status].map(getDeadlineInfo);
    const key = groups[status]
      .map((t, i) => [t.id, t.title, t.assignee, t.priority, t.deadline, t.status, infos[i].label].join('~'))
      .join('|');

    if (key === kanbanCache[status]) return;
    kanbanCache[status] = key;

    col.innerHTML = groups[status].length
      ? groups[status].map((t, i) => kanbanCardHTML(t, infos[i])).join('')
      : `<div class="text-center text-xs text-slate-600 italic py-10">No tasks</div>`;
  });
}

/* ---------- Drag & Drop ---------- */
function clearDragStyles() {
  $$('[data-drop-status]').forEach(c => c.classList.remove('ring-2', 'ring-indigo-500/60'));
}

export function bindDragDrop() {
  ['todo', 'in-progress', 'done'].forEach(s => {
    const panel = $(`#col-${s}`)?.parentElement;
    if (panel) panel.dataset.dropStatus = s;
  });

  const board = $('#col-todo')?.closest('section');
  if (!board) return;

  board.addEventListener('dragstart', e => {
    const card = e.target.closest('[data-card-id]');
    if (!card) return;
    state.dragId = card.dataset.cardId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', state.dragId);
    requestAnimationFrame(() => card.classList.add('opacity-40'));
  });

  board.addEventListener('dragover', e => {
    const col = e.target.closest('[data-drop-status]');
    if (!col || !state.dragId) return;
    e.preventDefault();
    clearDragStyles();
    col.classList.add('ring-2', 'ring-indigo-500/60');
  });

  board.addEventListener('drop', e => {
    const col = e.target.closest('[data-drop-status]');
    if (!col || !state.dragId) return;
    e.preventDefault();
    const id = state.dragId;
    state.dragId = null;
    clearDragStyles();
    updateStatus(id, col.dataset.dropStatus);
  });

  board.addEventListener('dragend', () => {
    state.dragId = null;
    clearDragStyles();
    renderKanban();
  });
}

/* ---------- Mobile Kanban Tabs ---------- */
export function setMobileTab(status) {
  state.mobileTab = status;
  ['todo', 'in-progress', 'done'].forEach(s => {
    const panel = $(`#col-${s}`)?.parentElement;
    if (!panel) return;
    panel.classList.add('kanban-panel');
    panel.classList.toggle('mobile-active', s === status);
  });
  $$('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === status));
}