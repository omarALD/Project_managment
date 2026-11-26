/* ============================================================
   app.js — نقطة الدخول: تجميع كل الموديولات
   ============================================================ */

import { state, hooks } from './state.js';
import { PROJECTS_CONFIG } from './config.js';
import { $, $$, toLocalISO, showToast } from './utils.js';
import { applyFilter, setupProjectContext, bindFilterEvents } from './filters.js';
import { renderKanban, bindDragDrop, setMobileTab } from './kanban.js';
import { renderCalendar, shiftCalendar, syncCalViewButtons, bindCalendarEvents } from './calendar.js';
import { openEditModal, closeEditModal, bindEditModal } from './edit-modal.js';
import { bindBulkImport } from './bulk-import.js';
import { getDeadlineInfo } from './deadline.js';
import { fetchTasks, createTask, updateStatus, deleteTask } from './tasks.js';

/* ---------- Auto sort by nearest deadline ---------- */
const deadlineTs = t => {
  const ts = Date.parse(t.deadline);
  return Number.isNaN(ts) ? Infinity : ts; // بدون ديدلاين → آخر القائمة
};

function sortByDeadline(tasks) {
  return tasks
    .map(t => ({ t, k: deadlineTs(t) }))               // نحسب التاريخ مرة واحدة
    .sort((a, b) => (a.k === b.k ? 0 : a.k < b.k ? -1 : 1))
    .map(x => x.t);
}

/* ---------- Render ---------- */
function updateProgress(list, allTasks = list) {
  const fill = $('#progress-fill');
  const text = $('#progress-text');
  const track = $('#progress-track');
  if (!fill || !text || !track) return;

  const total = list.length;
  const done = list.filter(t => t.status === 'done').length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const isFiltered = list.length !== allTasks.length;

  fill.style.width = pct + '%';
  fill.dataset.complete = (total > 0 && pct === 100);
  text.textContent = `${done} / ${total} · ${pct}%` + (isFiltered ? ` (filtered from ${allTasks.length})` : '');
  track.setAttribute('aria-valuenow', pct);
}

function renderAll() {
  applyFilter();
  state.visible = sortByDeadline(state.visible); // الفرز بعد الفلترة وقبل الرسم
  renderKanban();
  renderCalendar();
  updateProgress(state.visible, state.tasks);
}
hooks.renderAll = renderAll;

/* ---------- Events ---------- */
function bindEvents() {
  // Quick deadline buttons
  $$('.quicktime-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const d = new Date();
      d.setHours(d.getHours() + parseInt(btn.dataset.quicktime, 10));
      const el = $('#task-deadline');
      if (el) {
        el.type = 'datetime-local';
        el.value = toLocalISO(d);
      }
    });
  });

  bindFilterEvents();
  bindEditModal();
  bindDragDrop();
  bindCalendarEvents();

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
      startDate: toLocalISO(new Date()), // توقيت محلي (بدل UTC من السيرفر)
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

    // لا نعيد الرسم أثناء السحب؛ سيُعاد في الثانية التالية. ونمر عبر renderAll ليبقى الفرز والتقدم متسقين
    if (needsRender && !state.dragId) renderAll();
  }, 1000);
}

/* ---------- Polling (بدون تداخل) ---------- */
let polling = false;
async function poll() {
  if (document.hidden || polling) return;
  polling = true;
  try { await fetchTasks(true); } finally { polling = false; }
}

/* ---------- Workspace Loader ---------- */
async function loadWorkspaceConfig(slug) {
  if (!slug || PROJECTS_CONFIG[slug]) return;   // المكتوبة يدويًا تبقى كما هي
  try {
    const res = await fetch(`/api/workspaces/${slug}`);
    if (!res.ok) return;                         // غير مسجّلة (404) → الحالة الافتراضية
    const ws = await res.json();
    PROJECTS_CONFIG[slug] = { name: ws.name, members: ws.members };
  } catch (e) { /* offline: نكمل بدون */ }
}

/* ---------- Bootstrap ---------- */
async function init() {
  const projectSlug = (location.pathname.split('/')[1] || '').toLowerCase();
  await loadWorkspaceConfig(projectSlug);

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

  const deadlineEl = $('#task-deadline');
  if (deadlineEl) {
    deadlineEl.value = '';
    deadlineEl.type = 'text';
  }

  try {
    await fetchTasks();
  } catch (err) {
    console.error('Load error:', err);
    showToast('Failed to load tasks: ' + err.message, 'error', 6000);
  }
  startTicker();

  setInterval(poll, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

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