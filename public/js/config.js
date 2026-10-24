/* ============================================================
   config.js — ثوابت المواد والأعضاء والألوان
   ============================================================ */

export function detectProjectFromURL() {
  const path = window.location.pathname
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .split('/')[0];

  if (!path || path === 'index.html') return 'general';
  return path.toLowerCase().replace(/[^a-z0-9-_]/g, '');
}

// ثابت طوال عمر الصفحة (يتحدد من الـ URL)
export const CURRENT_PROJECT = detectProjectFromURL();

export const PRIORITY_MAP = {
  low:      { color: 'bg-emerald-500', label: 'Low' },
  medium:   { color: 'bg-amber-500',   label: 'Medium' },
  high:     { color: 'bg-orange-500',  label: 'High' },
  critical: { color: 'bg-rose-500',    label: 'Critical' }
};

export const PRIORITY_FILTERS = [
  ['all', 'All'], ['critical', '🔴 Critical'], ['high', '🟠 High'],
  ['medium', '🟡 Medium'], ['low', '🟢 Low']
];

// قائمة إعدادات المواد والأعضاء الخاصين بكل مادة
export const PROJECTS_CONFIG = {
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
    members: ['Omar Alhomidi', 'Jassim Almurrikhi', 'Saad Abdulkadder', 'Abdelrahman Abusleibeh']
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

export function getProjectInfo() {
  return PROJECTS_CONFIG[CURRENT_PROJECT] || {
    name: `المادة: ${CURRENT_PROJECT.toUpperCase()}`,
    members: ['عمر الحميدي', 'عضو عام 1', 'عضو عام 2']
  };
}