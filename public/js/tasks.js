/* ============================================================
   tasks.js — جلب / إضافة / تعديل / حذف المهام
   ============================================================ */

import { state, hooks } from './state.js';
import { apiRequest, loadLocalTasks, saveLocalTasks } from './api.js';
import { uid, showToast } from './utils.js';

let lastSig = null;     // بصمة آخر بيانات رُسمت (لتجنب إعادة الرسم بلا تغيير)
let fetchSeq = 0;       // لتجاهل الردود المتأخرة/القديمة
let pending = 0;        // عدد التعديلات الجارية (نوقف الـ polling خلالها)

export async function fetchTasks(silent = false) {
  if (silent && pending > 0) return; // تعديل جارٍ: لا نكتب بيانات قديمة فوق الواجهة

  const seq = ++fetchSeq;
  let tasks;
  let local = false;

  try {
    if (
      window.location.protocol === 'blob:' ||
      !window.location.origin ||
      window.location.origin === 'null'
    ) {
      throw new Error('Local-only environment');
    }
    const data = await apiRequest(`/tasks?project=${encodeURIComponent(state.currentProject)}`);
    tasks = Array.isArray(data) ? data : [];
  } catch (err) {
    if (silent && state.tasks.length) return; // انقطاع عابر: نبقي المهام الحالية كما هي
    if (!silent) console.warn('API unreachable, local mode:', err.message);
    local = true;
    tasks = loadLocalTasks().filter(t => t.project === state.currentProject);
  }

  // رد قديم أو بدأ تعديل أثناء الانتظار → نتجاهله
  if (seq !== fetchSeq || (silent && pending > 0)) return;

  state.isLocalMode = local;

  const sig = (local ? 'L' : 'R') + JSON.stringify(tasks);
  if (silent && sig === lastSig) return; // لا تغيير → لا رسم
  lastSig = sig;

  state.tasks = tasks;
  hooks.renderAll(); // الرسم خارج try حتى لا يُحسب خطأ الرسم كأنه انقطاع API
}

export async function createTask(payload, { silent = false } = {}) {
  const fullPayload = { ...payload, project: state.currentProject };

  if (state.isLocalMode) {
    const task = { id: uid(), ...fullPayload, createdAt: new Date().toISOString() };
    saveLocalTasks([task, ...loadLocalTasks()]);
    state.tasks = [task, ...state.tasks];
    if (!silent) {
      hooks.renderAll();
      showToast('Task created', 'success');
    }
    return true;
  }

  pending++;
  try {
    const created = await apiRequest('/tasks', { method: 'POST', body: JSON.stringify(fullPayload) });
    if (!silent) {
      showToast('Task created', 'success');
      if (created && created.id) {
        state.tasks = [created, ...state.tasks]; // ظهور فوري بدون جلب كل المهام
        hooks.renderAll();
      } else {
        pending--; // نسمح للجلب بالمرور
        try { await fetchTasks(true); } finally { pending++; }
      }
    }
    return true;
  } catch (err) {
    showToast(`Failed: ${err.message}`, 'error');
    return false;
  } finally {
    pending--;
  }
}

export async function updateTask(id, changes) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return false;
  const backup = { ...task };

  Object.assign(task, changes);
  hooks.renderAll();

  pending++;
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
    hooks.renderAll();
    showToast(`Failed: ${err.message}`, 'error');
    return false;
  } finally {
    pending--;
  }
}

export async function updateStatus(id, status) {
  const task = state.tasks.find(t => t.id === id);
  if (!task || task.status === status) return;
  if (await updateTask(id, { status })) showToast(`Moved to ${status}`, 'success', 1500);
}

export async function deleteTask(id) {
  if (!confirm('Delete this task permanently?')) return;

  if (state.isLocalMode) {
    saveLocalTasks(loadLocalTasks().filter(t => t.id !== id));
    state.tasks = state.tasks.filter(t => t.id !== id);
    hooks.renderAll();
    showToast('Task deleted', 'info');
    return;
  }

  // Optimistic: نحذفها من الواجهة فوراً ونتراجع عند الفشل
  const idx = state.tasks.findIndex(t => t.id === id);
  if (idx === -1) return;
  const removed = state.tasks[idx];
  state.tasks = state.tasks.filter(t => t.id !== id);
  hooks.renderAll();

  pending++;
  try {
    await apiRequest(`/tasks/${id}`, { method: 'DELETE' });
    showToast('Task deleted', 'success');
  } catch (err) {
    state.tasks = [...state.tasks.slice(0, idx), removed, ...state.tasks.slice(idx)];
    hooks.renderAll();
    showToast(`Failed: ${err.message}`, 'error');
  } finally {
    pending--;
  }
}