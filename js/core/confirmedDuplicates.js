// ===================== «ДУБЛІКАТИ» (групи, підтверджені вручну) =====================
// Дзеркальний до dismissedDuplicates.js модуль: там позначають «це не дублікат»,
// тут — навпаки, «так, це справді один і той самий чоловік/дружина» (щоб
// сформувати з них окремий звіт «Дублікати» і передати в месенджер).
// Ключ групи той самий формат (groupKey з dismissedDuplicates.js) — за
// FSFTID учасників, а не локальними @Ixx@, щоб позначка переживала повторний
// імпорт того самого дерева.
const KEY = 'gedcom_confirmed_dups_v1';

export function loadConfirmed() {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); }
  catch { return new Set(); }
}

export function saveConfirmed(set) {
  localStorage.setItem(KEY, JSON.stringify([...set]));
}

// Для повного бекапу/відновлення — прямий доступ до масиву без обгортки в Set.
export function loadConfirmedArray() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

export function replaceConfirmed(arr) {
  localStorage.setItem(KEY, JSON.stringify(Array.isArray(arr) ? arr : []));
}
