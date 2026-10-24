/* ============================================================
   deadline.js — حساب المواعيد النهائية والتلوين
   ============================================================ */

export function getDeadlineInfo(task) {
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

export function taskColorClass(task) {
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