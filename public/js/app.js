/* ============================================================
   app.js — نقطة الدخول: تجميع كل الموديولات
   ============================================================ */

import { state, hooks } from './state.js';
import { $, $$, toLocalISO, showToast } from './utils.js';
import { applyFilter, setupProjectContext, bindFilterEvents } from './filters.js';
import { renderKanban, bindDragDrop, setMobileTab } from './kanban.js';
import { renderCalendar, shiftCalendar, syncCalViewButtons, bindCalendarEvents } from './calendar.js';
import { openEditModal, closeEditModal, bindEditModal } from './edit-modal.js';
import { bindBulkImport } from './bulk-import.js';
import { getDeadlineInfo } from './deadline.js';
import { fetchTasks, createTask, updateStatus, deleteTask } from './tasks.js';

/* ---------- Render ---------- */
function renderAll() {
  applyFilter();
  renderKanban();
  renderCalendar();
}
hooks.renderAll = renderAll;   // يربط باقي الموديولات بدون استيراد دائري

/* ---------- Events ---------- */
function bindEvents() {
  // Quick deadline buttons
  $$('.quicktime-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const d = new Date();
      d.setHours(d.getHours() + parseInt(btn.dataset.quicktime, 10));
      const el = $('#task-deadline');
      if (el) el.value = toLocalISO(d);
    });
  });

  bindFilterEvents();
  bindEditModal();
  bindDragDrop();
  bindCalendarEvents();

  // Refresh
  $('#btn-refresh')?.addEventListener('click', async () => {
    showToast('Refreshing...', 'info', 1200);
    await fetchTasks();
  });

  // New task form
  $('#task-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const titleEl = $('#task-title');
    const title = titleEl ? titleEl.value.trim() : '';
    if (!title) return;

    await createTask({
      title,
      assignee: $('#task-assignee')?.value || 'Unassigned',
      deadline: $('#task-deadline')?.value || '',
      priority: $('#task-priority')?.value || 'medium',
      status: 'todo'
    });

    if (titleEl) {
      titleEl.value = '';
      titleEl.focus();
    }
  });

  // Mobile tabs
  $$('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => setMobileTab(btn.dataset.tab));
  });

  // Card buttons (edit / delete / status)
  document.body.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const { action, id, status } = btn.dataset;
    if (action === 'delete') deleteTask(id);
    else if (action === 'status') updateStatus(id, status);
    else if (action === 'edit') openEditModal(id);
  });

  // Keyboard
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    const isTyping = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';

    if (e.key === 'Escape') {
      closeEditModal();
      document.activeElement?.blur();
      return;
    }

    if (!isTyping && $('#edit-modal')?.classList.contains('hidden')) {
      if (e.key === 'ArrowLeft') shiftCalendar(-1);
      if (e.key === 'ArrowRight') shiftCalendar(1);
    }
  });
}

/* ---------- Live Ticker ---------- */
let tickerInterval = null;
function startTicker() {
  if (tickerInterval) return;
  tickerInterval = setInterval(() => {
    if (document.hidden) return;
    let needsRender = false;

    document.querySelectorAll('[data-timer-id]').forEach(el => {
      const task = state.taskMap.get(el.dataset.timerId);
      if (!task) return;
      const info = getDeadlineInfo(task);
      if (el.dataset.label !== info.label) needsRender = true;
      else if (el.textContent !== info.timeText) el.textContent = info.timeText;
    });

    if (needsRender) { renderKanban(); renderCalendar(); }
  }, 1000);
}

/* ---------- Bootstrap ---------- */
async function init() {
  setupProjectContext();   // اسم المادة + الأعضاء + الفلاتر

  try {
    setMobileTab(state.mobileTab);
    syncCalViewButtons();
    bindEvents();
    bindBulkImport();
  } catch (err) {
    console.error('Init error:', err);
    showToast('JS error: ' + err.message, 'error', 8000);
  }

  document.title = `${state.currentProject.toUpperCase()} — Team Task Manager`;

  const defaultDeadline = new Date();
  defaultDeadline.setHours(defaultDeadline.getHours() + 24);
  const deadlineEl = $('#task-deadline');
  if (deadlineEl) deadlineEl.value = toLocalISO(defaultDeadline);

  await fetchTasks();
  startTicker();

  setInterval(() => { if (!document.hidden) fetchTasks(true); }, 15000);
  setInterval(() => {
    if (!document.hidden && state.calendarView === 'day') renderCalendar(true);
  }, 60000);
}

// الموديولات مؤجلة تلقائياً، فقد يكون DOMContentLoaded قد انطلق بالفعل
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}