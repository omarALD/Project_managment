/* ============================================================
   calendar.js — التقويم (يوم / أسبوع / شهر)
   ============================================================ */

import { state } from './state.js';
import {
  $, $$, escapeHTML, formatDate, isToday,
  startOfDay, endOfDay, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, addDays
} from './utils.js';
import { getDeadlineInfo, taskColorClass } from './deadline.js';

function tasksOnDay(date) {
  const dayStart = startOfDay(date).getTime();
  const dayEnd = endOfDay(date).getTime();
  return state.visible.filter(t => {
    if (!t.deadline) return false;
    const ts = new Date(t.deadline).getTime();
    return ts >= dayStart && ts <= dayEnd;
  });
}

/* ---------- Month ---------- */
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
            'cal-cell', 'bg-slate-900/40', 'border', 'border-slate-800/60',
            'rounded-xl', 'p-1.5', 'flex', 'flex-col', 'gap-1',
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

/* ---------- Week ---------- */
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
            'bg-slate-900/40', 'border', 'border-slate-800/60', 'rounded-2xl',
            'p-3', 'min-h-[280px]', 'flex', 'flex-col', 'gap-2',
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

/* ---------- Day ---------- */
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

/* ---------- Dispatcher ---------- */
let calendarKey = '';

export function renderCalendar(force = false) {
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

/* ---------- Navigation ---------- */
export function shiftCalendar(direction) {
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

/* ---------- View buttons ---------- */
const CAL_BTN_ACTIVE = 'cal-view-btn px-3 py-1 rounded-lg bg-purple-600 text-white font-medium transition';
const CAL_BTN_IDLE   = 'cal-view-btn px-3 py-1 rounded-lg text-slate-400 hover:text-white transition';

export function syncCalViewButtons() {
  $$('.cal-view-btn').forEach(b => {
    b.className = b.dataset.calView === state.calendarView ? CAL_BTN_ACTIVE : CAL_BTN_IDLE;
  });
}

export function bindCalendarEvents() {
  $$('.cal-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.calendarView = btn.dataset.calView;
      syncCalViewButtons();
      renderCalendar();
    });
  });

  $('#cal-prev')?.addEventListener('click', () => shiftCalendar(-1));
  $('#cal-next')?.addEventListener('click', () => shiftCalendar(1));
  $('#cal-today')?.addEventListener('click', () => {
    state.calendarAnchor = new Date();
    renderCalendar();
  });
}