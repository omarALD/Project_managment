/* ============================================================
   edit-modal.js — نافذة تعديل المهمة
   ============================================================ */

import { state } from './state.js';
import { $, escapeHTML, showToast } from './utils.js';
import { getProjectInfo } from './config.js';
import { updateTask } from './tasks.js';

export function openEditModal(id) {
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

export function closeEditModal() {
  const modal = $('#edit-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

export function bindEditModal() {
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
}