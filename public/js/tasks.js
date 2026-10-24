/* ============================================================
   tasks.js — جلب / إضافة / تعديل / حذف المهام
   ============================================================ */

import { state, hooks } from './state.js';
import { apiRequest, loadLocalTasks, saveLocalTasks } from './api.js';
import { $, uid, showToast } from './utils.js';

export function updateConnectionStatus(online) {
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

export async function fetchTasks(silent = false) {
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
    hooks.renderAll();
  } catch (err) {
    if (!silent) console.warn('API unreachable, local mode:', err.message);
    state.isLocalMode = true;
    state.tasks = loadLocalTasks().filter(t => t.project === state.currentProject);
    updateConnectionStatus(false);
    hooks.renderAll();
  }
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

  try {
    await apiRequest('/tasks', { method: 'POST', body: JSON.stringify(fullPayload) });
    if (!silent) {
      showToast('Task created', 'success');
      await fetchTasks(true);
    }
    return true;
  } catch (err) {
    showToast(`Failed: ${err.message}`, 'error');
    return false;
  }
}

export async function updateTask(id, changes) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return false;
  const backup = { ...task };

  Object.assign(task, changes);
  hooks.renderAll();

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

  try {
    await apiRequest(`/tasks/${id}`, { method: 'DELETE' });
    showToast('Task deleted', 'success');
    await fetchTasks(true);
  } catch (err) {
    showToast(`Failed: ${err.message}`, 'error');
  }
}