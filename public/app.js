/* ============================================================
   Team Task Manager — Multi-project via URL path
   ============================================================ */

'use strict';

/* ------------------------------------------------------------
   Project Detection from URL
   ------------------------------------------------------------ */
function detectProjectFromURL() {
  const path = window.location.pathname
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .split('/')[0];

  if (!path || path === 'index.html') return 'general';
  return path.toLowerCase().replace(/[^a-z0-9-_]/g, '');
}

const API_BASE = '/api';

const PRIORITY_MAP = {
  low:      { color: 'bg-emerald-500', label: 'Low' },
  medium:   { color: 'bg-amber-500',   label: 'Medium' },
  high:     { color: 'bg-orange-500',  label: 'High' },
  critical: { color: 'bg-rose-500',    label: 'Critical' }
};

// قائمة إعدادات المواد الأربع والأعضاء الخاصين بكل مادة
// Sidi Mohammed
// Jassim Almurrikhi
// Abdelrahman Abusleibeh
// Saad Abdulkadder
// Omar Alhomidi
// عبد الهادي = 
const PROJECTS_CONFIG = {
  'cmps307': {
    name: 'cmps307 - Introduction to project management and enterprise',
    members: ['Omar Alhomidi', 'Mohammad Saeid', 'Salman Alsaai', 'Abdulrahman Alajbar']
  },
  'cmps310': {
    name: 'cmps 310 - Software Engineering',
    members: ['Sidi Mohammed', 'Jassim Almurrikhi', 'Omar Alhomidi', 'Jassim Alambari']
  },
  'cmps200': {
    name: 'cmps200 - Computer Ethics',
    members: ['Omar Alhomidi', 'Jassim Almurrikhi', 'Saad Abdulkadder','Abdelrahman Abusleibeh']
  },
  'cmps303': {
    name: 'cmps303 - Data Structures and Algorithms',
    members: ['Omar Alhomidi', 'Saad Abdulkadder', 'Abdulhadi']
  },
  'general': {
    name: 'General Workspace',
    members: ['Omar Alhomidi']
  }
};

/* ------------------------------------------------------------
   State
   ------------------------------------------------------------ */
const state = {
  tasks: [],
  visible: [],
  taskMap: new Map(),
  assigneeFilter: 'all',
  priorityFilter: 'all',
  search: '',
  dragId: null,
  isLocalMode: false,
  calendarView: window.matchMedia('(max-width: 767px)').matches ? 'day' : 'week', // الجوال: Day تلقائياً
  calendarAnchor: new Date(),
  mobileTab: 'todo',   // جديد
  currentProject: detectProjectFromURL()
};

/* ------------------------------------------------------------
   Utilities
   ------------------------------------------------------------ */
const $  = sel => document.querySelector(sel); const $$ = sel => Array.from(document.querySelectorAll(sel));

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function toLocalISO(date) {
  const d = new Date(date);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfWeek(date) {
  const d = startOfDay(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function endOfWeek(date) {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  return endOfDay(d);
}

function startOfMonth(date) {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

function endOfMonth(date) {
  const d = startOfDay(date);
  d.setMonth(d.getMonth() + 1, 0);
  return endOfDay(d);
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isToday(date) {
  return isSameDay(new Date(date), new Date());
}

function formatDate(date, opts = {}) {
  return new Intl.DateTimeFormat('en-US', opts).format(date);
}

function escapeHTML(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

/* ------------------------------------------------------------
   Project Context Setup
   ------------------------------------------------------------ */
function getProjectInfo() {
  return PROJECTS_CONFIG[state.currentProject] || {
    name: `المادة: ${state.currentProject.toUpperCase()}`,
    members: ['عمر الحميدي', 'عضو عام 1', 'عضو عام 2']
  };
}

function setupProjectContext() {
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

/* ---------- Assignee Filter ---------- */
function renderFilterBar() {
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

function applyFilter() {
  const q = state.search.trim().toLowerCase();
  state.visible = state.tasks.filter(t =>
    (state.assigneeFilter === 'all' || t.assignee === state.assigneeFilter) &&
    (state.priorityFilter === 'all' || t.priority === state.priorityFilter) &&
    (!q || (t.title || '').toLowerCase().includes(q))
  );
  state.taskMap = new Map(state.visible.map(t => [t.id, t]));
}

////////////////////





const PRIORITY_FILTERS = [
  ['all', 'All'], ['critical', '🔴 Critical'], ['high', '🟠 High'],
  ['medium', '🟡 Medium'], ['low', '🟢 Low']
];

function renderPriorityBar() {
  const el = $('#priority-filter');
  if (!el) return;
  el.innerHTML = PRIORITY_FILTERS.map(([val, label]) => {
    const cls = state.priorityFilter === val
      ? 'bg-purple-600 text-white border-purple-500 shadow-lg shadow-purple-600/25'
      : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border-slate-800';
    return `<button type="button" data-priority="${val}" class="px-3 py-1.5 rounded-full text-xs font-semibold border transition ${cls}">${label}</button>`;
  }).join('');
}

////////////

/* ------------------------------------------------------------
   Toast
   ------------------------------------------------------------ */
function showToast(message, type = 'info', duration = 3000) {
  const container = $('#toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

/* ------------------------------------------------------------
   API Layer
   ------------------------------------------------------------ */
async function apiRequest(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/* ------------------------------------------------------------
   LocalStorage Fallback
   ------------------------------------------------------------ */
const LS_KEY = 'team_tasks_multi';

function loadLocalTasks() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalTasks(allTasks) {
  localStorage.setItem(LS_KEY, JSON.stringify(allTasks));
}

/* ------------------------------------------------------------
   Data Fetching
   ------------------------------------------------------------ */
async function fetchTasks(silent = false) {
  try {
    if (
      window.location.protocol === 'blob:' ||
      !window.location.origin ||
      window.location.origin === 'null'
    ) {
      throw new Error('Local-only environment');
    }

    const tasks = await apiRequest(
      `/tasks?project=${encodeURIComponent(state.currentProject)}`
    );
    state.tasks = Array.isArray(tasks) ? tasks : [];
    state.isLocalMode = false;
    updateConnectionStatus(true);
    renderAll();
  } catch (err) {
    if (!silent) console.warn('API unreachable, local mode:', err.message);
    state.isLocalMode = true;
    state.tasks = loadLocalTasks().filter(
      t => t.project === state.currentProject
    );
    updateConnectionStatus(false);
    renderAll();
  }
}

function updateConnectionStatus(online) {
  const el = $('#connection-status');
  if (!el) return;
  if (online) {
    el.className =
      'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
    el.innerHTML =
      '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span> Live Sync';
  } else {
    el.className =
      'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20';
    el.innerHTML =
      '<span class="w-2 h-2 rounded-full bg-amber-400"></span> Offline (Local)';
  }
}

/* ------------------------------------------------------------
   Deadline Logic
   ------------------------------------------------------------ */
function getDeadlineInfo(task) {
  if (!task.deadline) {
    return {
      label: 'No Deadline',
      class: 'bg-slate-800 text-slate-400 border-slate-700',
      isOverdue: false,
      timeText: '—',
      percent: 0
    };
  }

  if (task.status === 'done') {
    return {
      label: 'Completed',
      class: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      isOverdue: false,
      timeText: 'Done',
      percent: 100
    };
  }

  const target = new Date(task.deadline).getTime();
  const now = Date.now();
  if (isNaN(target)) {
    return {
      label: 'Invalid',
      class: 'bg-slate-800 text-slate-300 border-slate-700',
      isOverdue: false,
      timeText: task.deadline,
      percent: 50
    };
  }

  const diff = target - now;

  if (diff <= 0) {
    const h = Math.abs(Math.floor(diff / 3600000));
    return {
      label: '🚨 OVERDUE',
      class: 'bg-rose-500/20 text-rose-400 border-rose-500/50 animate-pulse font-bold',
      isOverdue: true,
      timeText: `${h}h overdue`,
      percent: 100
    };
  }

  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);

  let txt = '';
  if (d > 0) txt += `${d}d `;
  txt += `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;

  if (diff < 86400000) {
    return {
      label: '⚡ DUE SOON',
      class: 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-semibold',
      isOverdue: false,
      timeText: txt,
      percent: 85
    };
  }

  return {
    label: '⏳ ON TRACK',
    class: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    isOverdue: false,
    timeText: txt,
    percent: 45
  };
}

/* ------------------------------------------------------------
   Kanban Rendering
   ------------------------------------------------------------ */
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
      </div> <!-- 👈 هذا هو الوسم المفقود الذي كان يسبب التداخل -->

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

function renderKanban() {
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

/* ------------------------------------------------------------
   Calendar — Helpers
   ------------------------------------------------------------ */
function taskColorClass(task) {
  const info = getDeadlineInfo(task);
  if (info.isOverdue && task.status !== 'done') {
    return { bg: 'bg-rose-500/20', border: 'border-rose-500', text: 'text-rose-200' };
  }
  if (task.status === 'done') {
    return { bg: 'bg-emerald-500/15', border: 'border-emerald-500', text: 'text-emerald-200' };
  }
  if (task.status === 'in-progress') {
    return { bg: 'bg-indigo-500/15', border: 'border-indigo-500', text: 'text-indigo-200' };
  }
  return { bg: 'bg-amber-500/15', border: 'border-amber-500', text: 'text-amber-200' };
}

function tasksOnDay(date) {
  const dayStart = startOfDay(date).getTime();
  const dayEnd = endOfDay(date).getTime();
  return state.visible.filter(t => {
    if (!t.deadline) return false;
    const ts = new Date(t.deadline).getTime();
    return ts >= dayStart && ts <= dayEnd;
  });
}

/* ------------------------------------------------------------
   Calendar — Month View
   ------------------------------------------------------------ */
function renderMonthView() {
  const anchor = state.calendarAnchor;
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);

  const titleEl = $('#cal-title');
  const rangeEl = $('#cal-range');
  if (titleEl) titleEl.textContent = formatDate(anchor, { month: 'long', year: 'numeric' });
  if (rangeEl) rangeEl.textContent = `${formatDate(monthStart, { month: 'short', day: 'numeric' })} → ${formatDate(monthEnd, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const gridStart = startOfWeek(monthStart);
  const days = [];
  for (let i = 0; i < 42; i++) days.push(addDays(gridStart, i));

  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const html = `
    <div class="min-w-[700px]">
      <div class="grid grid-cols-7 gap-1.5 mb-1.5">
        ${weekdays.map(d => `<div class="text-center text-[10px] font-bold uppercase tracking-wider text-slate-500 py-1">${d}</div>`).join('')}
      </div>
      <div class="grid grid-cols-7 gap-1.5">
        ${days.map(day => {
          const isCurrentMonth = day.getMonth() === anchor.getMonth();
          const today = isToday(day);
          const tasks = tasksOnDay(day);
          const cls = [
            'cal-cell',
            'bg-slate-900/40',
            'border',
            'border-slate-800/60',
            'rounded-xl',
            'p-1.5',
            'flex',
            'flex-col',
            'gap-1',
            !isCurrentMonth ? 'other-month' : '',
            today ? 'today' : ''
          ].filter(Boolean).join(' ');

          const visible = tasks.slice(0, 3);
          const more = tasks.length - visible.length;

          return `
            <div class="${cls}">
              <div class="text-[11px] font-bold ${today ? 'text-purple-300' : isCurrentMonth ? 'text-slate-300' : 'text-slate-500'}">
                ${day.getDate()}
              </div>
              <div class="space-y-0.5 flex-1 overflow-hidden">
                ${visible.map(t => {
                  const c = taskColorClass(t);
                  return `<div class="cal-event ${c.bg} ${c.text} border-l-2 ${c.border}" title="${escapeHTML(t.title)}">${escapeHTML(t.title)}</div>`;
                }).join('')}
                ${more > 0 ? `<div class="text-[9px] text-slate-500 pl-1">+${more} more</div>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  const container = $('#calendar-container');
  if (container) container.innerHTML = html;
}
//-------------------------------------

/* ---------- Edit Modal ---------- */
function openEditModal(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;

  const members = [...getProjectInfo().members];
  if (t.assignee && !members.includes(t.assignee)) members.push(t.assignee);

  $('#edit-id').value = t.id;
  $('#edit-title').value = t.title;
  $('#edit-assignee').innerHTML = members
    .map(m => `<option value="${escapeHTML(m)}">👤 ${escapeHTML(m)}</option>`).join('');
  $('#edit-assignee').value = t.assignee;
  $('#edit-priority').value = t.priority || 'medium';

  const dl = t.deadline || '';
  $('#edit-deadline').value = dl.length >= 16 ? dl.slice(0, 16) : (dl ? `${dl}T00:00` : '');

  const modal = $('#edit-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  $('#edit-title').focus();
}

function closeEditModal() {
  const modal = $('#edit-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

/* ---------- Drag & Drop ---------- */
function clearDragStyles() {
  $$('[data-drop-status]').forEach(c => c.classList.remove('ring-2', 'ring-indigo-500/60'));
}

function bindDragDrop() {
  // نجعل كل عمود (الحاوية الأب) منطقة إفلات
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
//-----------------------

/* ------------------------------------------------------------
   Calendar — Week View
   ------------------------------------------------------------ */


   
function renderWeekView() {
  const anchor = state.calendarAnchor;
  const weekStart = startOfWeek(anchor);
  const weekEnd = endOfWeek(anchor);

  const titleEl = $('#cal-title');
  const rangeEl = $('#cal-range');
  if (titleEl) titleEl.textContent = `Week of ${formatDate(weekStart, { month: 'long', day: 'numeric', year: 'numeric' })}`;
  if (rangeEl) rangeEl.textContent = `${formatDate(weekStart, { month: 'short', day: 'numeric' })} → ${formatDate(weekEnd, { month: 'short', day: 'numeric' })}`;

  const days = [];
  for (let i = 0; i < 7; i++) days.push(addDays(weekStart, i));

  const html = `
    <div class="min-w-[800px]">
      <div class="grid grid-cols-7 gap-2">
        ${days.map(day => {
          const today = isToday(day);
          const tasks = tasksOnDay(day);
          const cls = [
            'bg-slate-900/40',
            'border',
            'border-slate-800/60',
            'rounded-2xl',
            'p-3',
            'min-h-[280px]',
            'flex',
            'flex-col',
            'gap-2',
            today ? 'border-purple-500/60 bg-purple-500/5' : ''
          ].filter(Boolean).join(' ');

          return `
            <div class="${cls}">
              <div class="flex items-center justify-between pb-2 border-b border-slate-800/60">
                <div>
                  <div class="text-[10px] uppercase font-bold tracking-wider ${today ? 'text-purple-300' : 'text-slate-500'}">
                    ${formatDate(day, { weekday: 'short' })}
                  </div>
                  <div class="text-lg font-bold ${today ? 'text-purple-200' : 'text-slate-200'}">
                    ${day.getDate()}
                  </div>
                </div>
                ${tasks.length ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">${tasks.length}</span>` : ''}
              </div>

              <div class="space-y-1.5 flex-1 overflow-y-auto max-h-[400px] pr-1">
                ${tasks.length === 0
                  ? `<div class="text-[10px] text-slate-600 text-center py-4 italic">No tasks</div>`
                  : tasks.map(t => {
                      const c = taskColorClass(t);
                      const time = new Date(t.deadline).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
                      return `
                        <div class="cal-event ${c.bg} ${c.text} border-l-2 ${c.border} !whitespace-normal !text-[10px] leading-tight p-1.5" title="${escapeHTML(t.title)}">
                          <div class="font-mono text-[9px] opacity-70">${time}</div>
                          <div class="font-semibold">${escapeHTML(t.title)}</div>
                          <div class="text-[9px] opacity-60 mt-0.5">👤 ${escapeHTML((t.assignee || '').split(' ')[0])}</div>
                        </div>
                      `;
                    }).join('')
                }
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  const container = $('#calendar-container');
  if (container) container.innerHTML = html;
}

/* ------------------------------------------------------------
   Calendar — Day View
   ------------------------------------------------------------ */
function renderDayView() {
  const anchor = state.calendarAnchor;

  const titleEl = $('#cal-title');
  const rangeEl = $('#cal-range');
  if (titleEl) titleEl.textContent = formatDate(anchor, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  if (rangeEl) rangeEl.textContent = isToday(anchor) ? 'Today' : '';

  const tasks = tasksOnDay(anchor);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const now = new Date();
  const showNowLine = isToday(anchor);

  const html = `
        <div class="md:min-w-[600px]">
      ${tasks.length === 0
        ? `<div class="text-center py-6 mb-4 bg-slate-900/40 rounded-2xl border border-slate-800/60 text-slate-500 text-xs italic">
             No deadlines on this day
           </div>`
        : `<div class="mb-4 p-3 bg-slate-900/40 rounded-2xl border border-slate-800/60">
             <div class="text-[10px] uppercase font-bold text-slate-500 mb-2 tracking-wider">${tasks.length} deadline${tasks.length > 1 ? 's' : ''}</div>
             <div class="flex flex-wrap gap-1.5">
               ${tasks.map(t => {
                 const c = taskColorClass(t);
                 const time = new Date(t.deadline).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
                 return `<span class="cal-event ${c.bg} ${c.text} border-l-2 ${c.border} inline-block">${time} • ${escapeHTML(t.title)}</span>`;
               }).join('')}
             </div>
           </div>`
      }

      <div class="bg-slate-900/30 rounded-2xl border border-slate-800/60 p-3 space-y-0">
        ${hours.map(h => {
          const slotTasks = tasks.filter(t => new Date(t.deadline).getHours() === h);
          const isNow = showNowLine && now.getHours() === h;
          return `
            <div class="cal-hour-slot flex gap-3 items-start">
              <div class="w-14 text-right text-[10px] font-mono text-slate-500 pt-1 flex-shrink-0">
                ${String(h).padStart(2, '0')}:00
              </div>
              <div class="flex-1 py-1 min-h-[36px] space-y-1 relative">
                ${isNow ? `<div class="cal-now-line" style="top:${(now.getMinutes() / 60) * 100}%"></div>` : ''}
                ${slotTasks.map(t => {
                  const c = taskColorClass(t);
                  const time = new Date(t.deadline).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
                  return `
                    <div class="cal-event ${c.bg} ${c.text} border-l-2 ${c.border} !whitespace-normal !text-[11px] p-2">
                      <div class="flex items-center justify-between gap-2">
                        <span class="font-semibold">${escapeHTML(t.title)}</span>
                        <span class="font-mono text-[9px] opacity-70 flex-shrink-0">${time}</span>
                      </div>
                      <div class="text-[9px] opacity-70 mt-0.5">👤 ${escapeHTML(t.assignee)} • ${t.status}</div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  const container = $('#calendar-container');
  if (container) container.innerHTML = html;
}

/* ------------------------------------------------------------
   Calendar — Dispatcher
   ------------------------------------------------------------ */
let calendarKey = '';

function renderCalendar(force = false) {
  const taskKey = state.visible
    .map(t => `${t.id}:${t.deadline}:${t.status}:${t.title}:${t.assignee}:${getDeadlineInfo(t).isOverdue}`)
    .join(',');
  const key = `${state.calendarView}|${state.calendarAnchor.toDateString()}|${taskKey}`;

  if (!force && key === calendarKey) return;
  calendarKey = key;

  if (state.calendarView === 'day')       renderDayView();
  else if (state.calendarView === 'week') renderWeekView();
  else                                    renderMonthView();
}

function renderAll() {
  applyFilter();
  renderKanban();
  renderCalendar();
}

/* ------------------------------------------------------------
   Task Actions
   ------------------------------------------------------------ */
async function createTask(payload) {
  const fullPayload = { ...payload, project: state.currentProject };

  if (state.isLocalMode) {
    const task = {
      id: uid(),
      ...fullPayload,
      createdAt: new Date().toISOString()
    };
    const all = loadLocalTasks();
    saveLocalTasks([task, ...all]);
    state.tasks = [task, ...state.tasks];
    renderAll();
    showToast('Task created', 'success');
    return;
  }

  try {
    await apiRequest('/tasks', {
      method: 'POST',
      body: JSON.stringify(fullPayload)
    });
    showToast('Task created', 'success');
    await fetchTasks(true);
  } catch (err) {
    showToast(`Failed: ${err.message}`, 'error');
  }
}

async function updateTask(id, changes) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return false;
  const backup = { ...task };

  Object.assign(task, changes);
  renderAll();

  try {
    if (state.isLocalMode) {
      saveLocalTasks(loadLocalTasks().map(t => (t.id === id ? { ...t, ...changes } : t)));
    } else {
      await apiRequest(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(changes) });
    }
    return true;
  } catch (err) {
    const cur = state.tasks.find(t => t.id === id);
    if (cur) Object.assign(cur, backup);
    renderAll();
    showToast(`Failed: ${err.message}`, 'error');
    return false;
  }
}

async function updateStatus(id, status) {
  const task = state.tasks.find(t => t.id === id);
  if (!task || task.status === status) return;
  if (await updateTask(id, { status })) showToast(`Moved to ${status}`, 'success', 1500);
}

async function deleteTask(id) {
  if (!confirm('Delete this task permanently?')) return;

  if (state.isLocalMode) {
    const all = loadLocalTasks().filter(t => t.id !== id);
    saveLocalTasks(all);
    state.tasks = state.tasks.filter(t => t.id !== id);
    renderAll();
    showToast('Task deleted', 'info');
    return;
  }

  try {
    await apiRequest(`/tasks/${id}`, { method: 'DELETE' });
    showToast('Task deleted', 'success');
    await fetchTasks(true);
  } catch (err) {
    showToast(`Failed: ${err.message}`, 'error');
  }
}

/* ------------------------------------------------------------
   Calendar Navigation
   ------------------------------------------------------------ */
function shiftCalendar(direction) {
  const d = new Date(state.calendarAnchor);
  if (state.calendarView === 'day') {
    d.setDate(d.getDate() + direction);
  } else if (state.calendarView === 'week') {
    d.setDate(d.getDate() + direction * 7);
  } else {
    d.setMonth(d.getMonth() + direction);
  }
  state.calendarAnchor = d;
  renderCalendar();
}
/* ---------- Mobile Kanban Tabs ---------- */
function setMobileTab(status) {
  state.mobileTab = status;
  ['todo', 'in-progress', 'done'].forEach(s => {
    const panel = $(`#col-${s}`)?.parentElement;
    if (!panel) return;
    panel.classList.add('kanban-panel');                       // الـ CSS يخفيها على الجوال فقط
    panel.classList.toggle('mobile-active', s === status);
  });
  $$('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === status));
}

/* ---------- Calendar view buttons ---------- */
const CAL_BTN_ACTIVE = 'cal-view-btn px-3 py-1 rounded-lg bg-purple-600 text-white font-medium transition';
const CAL_BTN_IDLE   = 'cal-view-btn px-3 py-1 rounded-lg text-slate-400 hover:text-white transition';

function syncCalViewButtons() {
  $$('.cal-view-btn').forEach(b => {
    b.className = b.dataset.calView === state.calendarView ? CAL_BTN_ACTIVE : CAL_BTN_IDLE;
  });
}
/* ------------------------------------------------------------
   Event Wiring
   ------------------------------------------------------------ */
function bindEvents() {
  $$('.quicktime-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const h = parseInt(btn.dataset.quicktime, 10);
      const d = new Date();
      d.setHours(d.getHours() + h);
      const el = $('#task-deadline');
      if (el) el.value = toLocalISO(d);
    });
  });

  const filterBar = $('#assignee-filter');
if (filterBar) {
  filterBar.addEventListener('click', e => {
    const btn = e.target.closest('button[data-assignee]');
    if (!btn || btn.dataset.assignee === state.assigneeFilter) return;
    state.assigneeFilter = btn.dataset.assignee;
    renderFilterBar();
    renderAll();
  });

    // Search (مع debounce بسيط)
  let searchTimer;
  $('#search-input')?.addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.search = e.target.value; renderAll(); }, 150);
  });

  // Priority filter
  $('#priority-filter')?.addEventListener('click', e => {
    const btn = e.target.closest('button[data-priority]');
    if (!btn || btn.dataset.priority === state.priorityFilter) return;
    state.priorityFilter = btn.dataset.priority;
    renderPriorityBar();
    renderAll();
  });

  // Edit modal
  $('#edit-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const id = $('#edit-id').value;
    const title = $('#edit-title').value.trim();
    if (!title) return;
    closeEditModal();
    const ok = await updateTask(id, {
      title,
      assignee: $('#edit-assignee').value,
      priority: $('#edit-priority').value,
      deadline: $('#edit-deadline').value
    });
    if (ok) showToast('Task updated', 'success');
  });

  $('#edit-modal')?.addEventListener('click', e => {
    if (e.target.id === 'edit-modal' || e.target.closest('[data-close-modal]')) closeEditModal();
  });

  bindDragDrop();
}

  const refreshBtn = $('#btn-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      showToast('Refreshing...', 'info', 1200);
      await fetchTasks();
    });
  }

  const form = $('#task-form');
  if (form) {
    form.addEventListener('submit', async e => {
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
  }
  $$('.cal-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.calendarView = btn.dataset.calView;
      syncCalViewButtons();
      renderCalendar();
    });
  });

  $$('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => setMobileTab(btn.dataset.tab));
  });

  const prevBtn = $('#cal-prev');
  const nextBtn = $('#cal-next');
  const todayBtn = $('#cal-today');
  if (prevBtn) prevBtn.addEventListener('click', () => shiftCalendar(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => shiftCalendar(1));
  if (todayBtn) {
    todayBtn.addEventListener('click', () => {
      state.calendarAnchor = new Date();
      renderCalendar();
    });
  }

  document.body.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const { action, id, status } = btn.dataset;
    if (action === 'delete') deleteTask(id);
    else if (action === 'status') updateStatus(id, status);
    else if (action === 'edit') openEditModal(id);
  });

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

/* ------------------------------------------------------------
   Live Ticker
   ------------------------------------------------------------ */
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
      if (el.dataset.label !== info.label) needsRender = true;   // تغيّرت الحالة (قريب/متأخر)
      else if (el.textContent !== info.timeText) el.textContent = info.timeText;
    });

    if (needsRender) { renderKanban(); renderCalendar(); }
  }, 1000);
}

/* ------------------------------------------------------------
   Bootstrap
   ------------------------------------------------------------ */
async function init() {
  setupProjectContext();   // أولاً: اسم المادة + الأعضاء + الفلاتر

  try {
    setMobileTab(state.mobileTab);
    syncCalViewButtons();
    bindEvents();
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
document.addEventListener('DOMContentLoaded', init);