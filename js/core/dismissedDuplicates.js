// ===================== «НЕ ДУБЛІКАТИ» (перевірені вручну групи) =====================
// Ключ групи — відсортований список FSFTID учасників (а не локальних @Ixx@, які
// перегенеровуються при кожному новому експорті з FamilySearch) — так позначка
// переживає повторний імпорт того самого дерева.
const KEY = 'gedcom_dismissed_dups_v1';

export function groupKey(g) {
  return g.members.map(m => m.fsftid || `@${m.id}@`).sort().join('|');
}

export function loadDismissed() {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); }
  catch { return new Set(); }
}

export function saveDismissed(set) {
  localStorage.setItem(KEY, JSON.stringify([...set]));
}

// Для повного бекапу/відновлення — прямий доступ до масиву без обгортки в Set.
export function loadDismissedArray() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

export function replaceDismissed(arr) {
  localStorage.setItem(KEY, JSON.stringify(Array.isArray(arr) ? arr : []));
}
