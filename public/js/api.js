/* ============================================================
   api.js — طلبات السيرفر + LocalStorage فقط
   ============================================================ */

const API_BASE = '/api';

export async function apiRequest(path, options = {}) {
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

/* ---------- LocalStorage Fallback ---------- */
const LS_KEY = 'team_tasks_multi';

export function loadLocalTasks() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalTasks(allTasks) {
  localStorage.setItem(LS_KEY, JSON.stringify(allTasks));
}