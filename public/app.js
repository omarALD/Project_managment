/* ============================================================
   Team Task & Timeline Manager v4.0
   Calendar + Templates + Kanban + Gantt
   ============================================================ */

'use strict';

/* ------------------------------------------------------------
   Constants
   ------------------------------------------------------------ */
const API_BASE = '/api';




const PRIORITY_MAP = {
  low:      { color: 'bg-emerald-500', label: 'Low' },
  medium:   { color: 'bg-amber-500',   label: 'Medium' },
  high:     { color: 'bg-orange-500',  label: 'High' },
  critical: { color: 'bg-rose-500',    label: 'Critical' }
};

/* ------------------------------------------------------------
   State
   ------------------------------------------------------------ */
const state = {
  tasks: [],
  isLocalMode: false,
  calendarView: 'week',      // 'day' | 'week' | 'month'
  calendarAnchor: new Date() // reference date
};

/* ------------------------------------------------------------
   Utilities
   ------------------------------------------------------------ */
const $  = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

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
  // Sunday-start week
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
   Toast Notifications
   ------------------------------------------------------------ */
function showToast(message, type = 'info', duration = 3000) {
  const container = $('#toast-container');
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
const LS_KEY = 'team_tasks_v4';

function loadLocalTasks() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalTasks(tasks) {
  localStorage.setItem(LS_KEY, JSON.stringify(tasks));
  state.tasks = tasks;
  renderAll();
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

    const tasks = await apiRequest('/tasks');
    state.tasks = tasks;
    state.isLocalMode = false;
    updateConnectionStatus(true);
    renderAll();
  } catch (err) {
    if (!silent) console.warn('API unreachable, using local mode:', err.message);
    state.isLocalMode = true;
    state.tasks = loadLocalTasks();
    updateConnectionStatus(false);
    renderAll();
  }
}

function updateConnectionStatus(online) {
  const el = $('#connection-status');
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
   Templates Rendering
   ------------------------------------------------------------ */




/* ------------------------------------------------------------
   Kanban Rendering
   ------------------------------------------------------------ */
function renderKanban() {
  const cols = {
    todo: $('#col-todo'),
    'in-progress': $('#col-in-progress'),
    done: $('#col-done')
  };

  Object.values(cols).forEach(c => (c.innerHTML = ''));

  const counts = { todo: 0, 'in-progress': 0, done: 0 };

  // Sort by priority then deadline
  const priorityWeight = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...state.tasks].sort((a, b) => {
    const pa = priorityWeight[a.priority] ?? 2;
    const pb = priorityWeight[b.priority] ?? 2;
    if (pa !== pb) return pa - pb;
    return (a.deadline || '').localeCompare(b.deadline || '');
  });

  sorted.forEach(task => {
    counts[task.status] = (counts[task.status] || 0) + 1;
    const info = getDeadlineInfo(task);
    const pr = PRIORITY_MAP[task.priority] || PRIORITY_MAP.medium;

    const card = document.createElement('div');
    card.className = `glass-panel p-4 rounded-2xl border ${
      info.isOverdue ? 'border-rose-500/50 bg-rose-950/10' : 'border-slate-800'
    } shadow-md space-y-3 hover:border-slate-700 transition duration-200`;

    card.innerHTML = `
      <div class="flex justify-between items-start gap-2">
        <div class="flex items-start gap-2 flex-1 min-w-0">
          <span class="w-2 h-2 rounded-full ${pr.color} mt-1.5 flex-shrink-0" title="Priority: ${pr.label}"></span>
          <h4 class="font-semibold text-sm text-slate-100 leading-snug break-words">${escapeHTML(task.title)}</h4>
        </div>
        <button data-action="delete" data-id="${task.id}" title="Delete" class="text-slate-500 hover:text-rose-400 transition text-xs p-1 flex-shrink-0">✕</button>
      </div>

      <div class="flex items-center justify-between gap-2">
        <span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded-md border ${info.class}">${info.label}</span>
        <span class="text-xs font-mono font-medium text-slate-300">${info.timeText}</span>
      </div>

      <div class="flex justify-between items-center text-xs text-slate-400 pt-2 border-t border-slate-800/80">
        <span class="flex items-center gap-1 font-medium text-slate-300 truncate">👤 ${escapeHTML(task.assignee)}</span>
        ${task.category && task.category !== 'general' ? `<span class="text-[10px] px-1.5 py-0.5 bg-slate-800 rounded text-slate-400">${escapeHTML(task.category)}</span>` : ''}
      </div>

      <div class="pt-2 flex gap-1.5 text-[11px]">
        ${task.status !== 'todo' ? `<button data-action="status" data-id="${task.id}" data-status="todo" class="flex-1 bg-slate-900 hover:bg-slate-800 text-slate-300 py-1.5 rounded-lg border border-slate-800 transition text-center">To Do</button>` : ''}
        ${task.status !== 'in-progress' ? `<button data-action="status" data-id="${task.id}" data-status="in-progress" class="flex-1 bg-slate-900 hover:bg-slate-800 text-blue-400 py-1.5 rounded-lg border border-slate-800 transition text-center">Progress</button>` : ''}
        ${task.status !== 'done' ? `<button data-action="status" data-id="${task.id}" data-status="done" class="flex-1 bg-emerald-950/80 hover:bg-emerald-900/80 text-emerald-400 py-1.5 rounded-lg border border-emerald-800/50 transition font-semibold text-center">Done</button>` : ''}
      </div>
    `;

    if (cols[task.status]) cols[task.status].appendChild(card);
  });

  $('#count-todo').textContent = counts.todo;
  $('#count-in-progress').textContent = counts['in-progress'];
  $('#count-done').textContent = counts.done;
}

/* ------------------------------------------------------------
   Timeline (Gantt) Rendering
   ------------------------------------------------------------ */


  filtered.forEach(task => {
    const info = getDeadlineInfo(task);

    let barBg = 'bg-amber-500';
    let barGlow = 'shadow-amber-500/20';
    let widthPercent = 40;

    if (task.status === 'done') {
      barBg = 'bg-emerald-500';
      barGlow = 'shadow-emerald-500/20';
      widthPercent = 100;
    } else if (task.status === 'in-progress') {
      barBg = 'bg-gradient-to-r from-indigo-500 to-purple-500';
      barGlow = 'shadow-indigo-500/30';
      widthPercent = info.isOverdue ? 100 : Math.max(25, info.percent);
      if (info.isOverdue) barBg = 'bg-gradient-to-r from-rose-500 to-amber-500';
    } else if (info.isOverdue) {
      barBg = 'bg-rose-500';
      barGlow = 'shadow-rose-500/30';
      widthPercent = 100;
    }

    const row = document.createElement('div');
    row.className = 'grid grid-cols-12 gap-2 items-center bg-slate-900/50 p-3 rounded-2xl border border-slate-800/80 hover:border-slate-700 transition duration-200';

    row.innerHTML = `
      <div class="col-span-3 space-y-1">
        <div class="font-bold text-xs text-slate-100 truncate">${escapeHTML(task.title)}</div>
        <div class="flex items-center gap-2 text-[10px] text-slate-400">
          <span>👤 ${escapeHTML(task.assignee)}</span>
          <span class="text-slate-600">•</span>
          <span class="font-mono">${task.deadline ? task.deadline.replace('T', ' ') : 'No deadline'}</span>
        </div>
      </div>

      <div class="col-span-9 relative flex items-center h-8 bg-slate-950/80 rounded-xl p-1 border border-slate-800/80 overflow-hidden">
        <div class="absolute inset-0 grid grid-cols-6 pointer-events-none opacity-20">
          <div class="border-r border-slate-400"></div>
          <div class="border-r border-slate-400"></div>
          <div class="border-r border-slate-400"></div>
          <div class="border-r border-slate-400"></div>
          <div class="border-r border-slate-400"></div>
          <div></div>
        </div>
        <div class="h-full rounded-lg ${barBg} transition-all duration-500 flex items-center justify-between px-2.5 shadow-lg ${barGlow} relative z-10" style="width:${widthPercent}%">
          <span class="text-[10px] font-bold text-white drop-shadow truncate">
            ${task.status === 'done' ? '✅ Completed' : info.label}
          </span>
          <span class="text-[9px] font-mono text-white/90 font-semibold hidden sm:inline">${widthPercent}%</span>
        </div>
      </div>
    `;

    container.appendChild(row);
  });

  updateTimelineStats();




/* ------------------------------------------------------------
   Calendar — Shared Helpers
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
  return state.tasks.filter(t => {
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

  $('#cal-title').textContent = formatDate(anchor, { month: 'long', year: 'numeric' });
  $('#cal-range').textContent = `${formatDate(monthStart, { month: 'short', day: 'numeric' })} → ${formatDate(monthEnd, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  // Build a 6-week grid starting from the Sunday of the first week
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
            <div class="${cls}" data-date="${day.toISOString()}">
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

  $('#calendar-container').innerHTML = html;
}

/* ------------------------------------------------------------
   Calendar — Week View
   ------------------------------------------------------------ */
function renderWeekView() {
  const anchor = state.calendarAnchor;
  const weekStart = startOfWeek(anchor);
  const weekEnd = endOfWeek(anchor);

  $('#cal-title').textContent = `Week of ${formatDate(weekStart, { month: 'long', day: 'numeric', year: 'numeric' })}`;
  $('#cal-range').textContent = `${formatDate(weekStart, { month: 'short', day: 'numeric' })} → ${formatDate(weekEnd, { month: 'short', day: 'numeric' })}`;

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
                          <div class="text-[9px] opacity-60 mt-0.5">👤 ${escapeHTML(t.assignee.split(' ')[0])}</div>
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

  $('#calendar-container').innerHTML = html;
}

/* ------------------------------------------------------------
   Calendar — Day View
   ------------------------------------------------------------ */
function renderDayView() {
  const anchor = state.calendarAnchor;
  const dayStart = startOfDay(anchor);

  $('#cal-title').textContent = formatDate(anchor, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  $('#cal-range').textContent = isToday(anchor) ? 'Today' : '';

  const tasks = tasksOnDay(anchor);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const now = new Date();
  const showNowLine = isToday(anchor);

  const html = `
    <div class="min-w-[600px]">
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

  $('#calendar-container').innerHTML = html;
}

/* ------------------------------------------------------------
   Calendar — Dispatcher
   ------------------------------------------------------------ */
function renderCalendar() {
  if (state.calendarView === 'day')        renderDayView();
  else if (state.calendarView === 'week')  renderWeekView();
  else                                     renderMonthView();
}

/* ------------------------------------------------------------
   Master Renderer
   ------------------------------------------------------------ */
function renderAll() {
  renderKanban();
  renderCalendar();
}

/* ------------------------------------------------------------
   Task Actions
   ------------------------------------------------------------ */
async function createTask(payload) {
  if (state.isLocalMode) {
    const task = {
      id: uid(),
      ...payload,
      createdAt: new Date().toISOString()
    };
    saveLocalTasks([task, ...state.tasks]);
    showToast('Task created (local)', 'success');
    return;
  }

  try {
    await apiRequest('/tasks', { method: 'POST', body: JSON.stringify(payload) });
    showToast('Task created', 'success');
    await fetchTasks(true);
  } catch (err) {
    showToast(`Failed: ${err.message}`, 'error');
  }
}

async function updateStatus(id, status) {
  if (state.isLocalMode) {
    const updated = state.tasks.map(t => (t.id === id ? { ...t, status } : t));
    saveLocalTasks(updated);
    showToast(`Moved to ${status}`, 'info', 1500);
    return;
  }

  try {
    await apiRequest(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
    showToast(`Moved to ${status}`, 'success', 1500);
    await fetchTasks(true);
  } catch (err) {
    showToast(`Failed: ${err.message}`, 'error');
  }
}

async function deleteTask(id) {
  if (!confirm('Delete this task permanently?')) return;

  if (state.isLocalMode) {
    saveLocalTasks(state.tasks.filter(t => t.id !== id));
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

/* ------------------------------------------------------------
   Event Wiring
   ------------------------------------------------------------ */
function bindEvents() {
  // Template clicks


  // Quick-time buttons
  $$('.quicktime-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const h = parseInt(btn.dataset.quicktime, 10);
      const d = new Date();
      d.setHours(d.getHours() + h);
      $('#task-deadline').value = toLocalISO(d);
    });
  });

  // Refresh
  $('#btn-refresh').addEventListener('click', async () => {
    showToast('Refreshing...', 'info', 1200);
    await fetchTasks();
  });

  // Task form
  $('#task-form').addEventListener('submit', async e => {
    e.preventDefault();
    const title = $('#task-title').value.trim();
    if (!title) return;

    await createTask({
      title,
      assignee: $('#task-assignee').value,
      deadline: $('#task-deadline').value,
      priority: $('#task-priority').value,
      status: 'todo'
    });

    $('#task-title').value = '';
    $('#task-title').focus();
  });

  // Timeline filter

  // Calendar view buttons
  $$('.cal-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.calendarView = btn.dataset.calView;
      $$('.cal-view-btn').forEach(b => {
        b.className = b === btn
          ? 'cal-view-btn px-3 py-1 rounded-lg bg-purple-600 text-white font-medium transition'
          : 'cal-view-btn px-3 py-1 rounded-lg text-slate-400 hover:text-white transition';
      });
      renderCalendar();
    });
  });

  // Calendar navigation
  $('#cal-prev').addEventListener('click', () => shiftCalendar(-1));
  $('#cal-next').addEventListener('click', () => shiftCalendar(1));
  $('#cal-today').addEventListener('click', () => {
    state.calendarAnchor = new Date();
    renderCalendar();
  });

  // Delegated card actions (Kanban)
  document.body.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const { action, id, status } = btn.dataset;
    if (action === 'delete') deleteTask(id);
    else if (action === 'status') updateStatus(id, status);
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      $('#task-title').focus();
    }
    if (e.key === 'Escape') {
      document.activeElement?.blur();
    }
    // Arrow navigation in calendar (only when not typing)
    if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'SELECT') {
      if (e.key === 'ArrowLeft') shiftCalendar(-1);
      if (e.key === 'ArrowRight') shiftCalendar(1);
    }
  });
}

/* ------------------------------------------------------------
   Live Ticker — updates countdown timers every second
   ------------------------------------------------------------ */
let tickerInterval = null;
function startTicker() {
  if (tickerInterval) return;
  tickerInterval = setInterval(() => {
    // Only re-render Kanban + Timeline (cheap), not calendar
    renderKanban();
    
  }, 1000);
}

/* ------------------------------------------------------------
   Bootstrap
   ------------------------------------------------------------ */
async function init() {
  bindEvents();

  // Default deadline: +24h
  const d = new Date();
  d.setHours(d.getHours() + 24);
  $('#task-deadline').value = toLocalISO(d);

  await fetchTasks();

  startTicker();

  // Poll backend every 15s
  setInterval(() => fetchTasks(true), 15000);

  // Re-render calendar hourly to update "now" line
  setInterval(() => {
    if (state.calendarView === 'day') renderCalendar();
  }, 60000);
}

document.addEventListener('DOMContentLoaded', init);