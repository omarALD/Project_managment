/* ============================================================
   bulk-import.js — الإدخال السريع (JSON / نص)
   ============================================================ */

import { state, hooks } from './state.js';
import { $, $$, toLocalISO, showToast } from './utils.js';
import { getProjectInfo } from './config.js';
import { createTask, fetchTasks } from './tasks.js';

const BULK_PRIORITIES = ['low', 'medium', 'high', 'critical'];
const BULK_STATUSES   = ['todo', 'in-progress', 'done'];

// Returns { mode: 'empty' | 'json' | 'text' | 'invalid', items: [] }
function parseBulkInput(raw) {
  let text = (raw || '').trim();
  if (!text) return { mode: 'empty', items: [] };

  // LLMs often wrap output in ```json fences — strip them
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      return { mode: 'json', items: arr.filter(i => i && typeof i === 'object') };
    }
  } catch {
    if (/^[\[{]/.test(text)) return { mode: 'invalid', items: [] };
  }

  const items = text
    .split('\n')
    .map(l => l.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, ''))
    .filter(Boolean)
    .map(title => ({ title }));
  return { mode: 'text', items };
}

function normalizeBulkItem(item, members) {
  const title = String(item.title || '').trim();
  if (!title) return null;

  const wanted = String(item.assignee || '').trim().toLowerCase();
  const assignee = members.find(m => m.toLowerCase() === wanted) || members[0];

  const priority = BULK_PRIORITIES.includes(item.priority) ? item.priority : 'medium';
  const status   = BULK_STATUSES.includes(item.status) ? item.status : 'todo';

  let deadline = typeof item.deadline === 'string' ? item.deadline.trim() : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(deadline)) deadline += 'T23:59';
  if (!deadline || isNaN(new Date(deadline).getTime())) {
    deadline = toLocalISO(new Date(Date.now() + 24 * 3600000));
  }

  return { title, assignee, priority, status, deadline };
}

async function importBulkTasks(inputText) {
  const { items } = parseBulkInput(inputText);
  const members = getProjectInfo().members;
  const payloads = items.map(i => normalizeBulkItem(i, members)).filter(Boolean);

  if (!payloads.length) {
    showToast('No valid tasks found (each needs a title)', 'error');
    return false;
  }

  let added = 0;
  for (const p of payloads) {            // sequential keeps the original order
    if (await createTask(p, { silent: true })) added++;
  }

  if (state.isLocalMode) hooks.renderAll();
  else await fetchTasks(true);

  const skipped = items.length - payloads.length;
  if (added) {
    showToast(`Successfully added ${added} tasks!${skipped ? ` (${skipped} skipped: no title)` : ''}`, 'success');
  }
  return added > 0;
}

/* ---------- Modal UI ---------- */
function openBulkModal() {
  const modal = $('#bulk-import-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  updateBulkBadge();
  $('#bulk-input').focus();
}

function closeBulkModal() {
  const modal = $('#bulk-import-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  $('#bulk-input').value = '';
  updateBulkBadge();
}

function updateBulkBadge() {
  const badge = $('#bulk-badge');
  const submit = $('#bulk-submit');
  if (!badge || !submit) return;

  const { mode, items } = parseBulkInput($('#bulk-input').value);
  const labels = {
    empty:   'Waiting for input…',
    json:    `JSON (${items.length} task${items.length === 1 ? '' : 's'} detected)`,
    text:    `Plain Text (${items.length} line${items.length === 1 ? '' : 's'})`,
    invalid: 'Invalid Syntax'
  };
  badge.dataset.state = mode;
  badge.textContent = labels[mode];
  submit.disabled = mode === 'empty' || mode === 'invalid' || items.length === 0;
}

export function bindBulkImport() {
  const input = $('#bulk-input');
  if (!input) return;

  $('#btn-bulk')?.addEventListener('click', openBulkModal);
  input.addEventListener('input', updateBulkBadge);

  $$('[data-bulk-close]').forEach(b => b.addEventListener('click', closeBulkModal));
  $('#bulk-import-modal').addEventListener('click', e => {
    if (e.target.id === 'bulk-import-modal') closeBulkModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#bulk-import-modal').classList.contains('hidden')) closeBulkModal();
  });

  $('#bulk-sample-json').addEventListener('click', () => {
    const m = getProjectInfo().members;
    const inHours = h => toLocalISO(new Date(Date.now() + h * 3600000));
    input.value = JSON.stringify([
      { title: 'Set up MongoDB Atlas connection', assignee: m[0],        priority: 'high',     status: 'todo',        deadline: inHours(48) },
      { title: 'Write Milestone 2 Report Draft',  assignee: m[1] || m[0], priority: 'critical', status: 'in-progress', deadline: inHours(72) },
      { title: 'Review Data Flow Diagrams' }
    ], null, 2);
    updateBulkBadge();
  });

  $('#bulk-sample-text').addEventListener('click', () => {
    input.value = [
      'Design database schema',
      'Build login page prototype',
      'Write test cases for API',
      'Prepare final presentation slides'
    ].join('\n');
    updateBulkBadge();
  });

  $('#bulk-submit').addEventListener('click', async () => {
    const btn = $('#bulk-submit');
    btn.disabled = true;
    const ok = await importBulkTasks(input.value);
    if (ok) closeBulkModal();
    else updateBulkBadge();
  });
}