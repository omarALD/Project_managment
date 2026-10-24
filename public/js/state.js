/* ============================================================
   state.js — حالة التطبيق + hooks لكسر الاستيراد الدائري
   ============================================================ */

import { CURRENT_PROJECT } from './config.js';

export const state = {
  tasks: [],
  visible: [],
  taskMap: new Map(),
  assigneeFilter: 'all',
  priorityFilter: 'all',
  search: '',
  dragId: null,
  isLocalMode: false,
  calendarView: window.matchMedia('(max-width: 767px)').matches ? 'day' : 'week',
  calendarAnchor: new Date(),
  mobileTab: 'todo',
  currentProject: CURRENT_PROJECT
};

// app.js يعبّي renderAll عند التشغيل؛ باقي الملفات تستدعيها بدون استيراد app.js
export const hooks = {
  renderAll: () => {}
};