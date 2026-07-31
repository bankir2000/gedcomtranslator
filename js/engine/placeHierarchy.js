// ===================== ІЄРАРХІЯ МІСЦЬ (виведена з даних файлу) =====================
// Не окрема модель, яку користувач веде вручну, а СТРУКТУРА, яку ми
// автоматично виводимо з реальних значень PLAC/CITY/... у завантаженому
// файлі: якщо десь трапляється "Кирилівка, Звенигородський повіт, Київська
// губернія", це означає (для цього файлу), що в Кирилівки "батько" —
// Звенигородський повіт, а в нього — Київська губернія. Мета — не точніший
// переклад (він і так працює через словник), а МОЖЛИВІСТЬ побачити словник
// деревом і одразу помітити, для яких рівнів перекладу ще бракує.
import { applyDictToValue } from './translate.js';

const PLACE_TAGS = new Set(['PLAC', 'CITY', 'STAE', 'CTRY', 'ADDR', 'ADR1', 'ADR2']);

/**
 * @param {string} rawContent
 * @param {Array} placeDictEntries — dictEntries.place (та сама структура, що й у перекладачі)
 * @returns {{ roots: Array, totalNodes: number, conflicts: Array<{child:string, parents:string[]}> }}
 * Кожен вузол: { name, count, translated, uk, children: [...] }
 */
export function buildPlaceHierarchy(rawContent, placeDictEntries) {
  const counts = new Map();          // текст компонента -> скільки разів зустрівся (у будь-якій позиції)
  const parentVotes = new Map();     // дитина -> Map(батько -> скільки разів саме така пара трапилась)

  const lines = rawContent.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\d+ (\S+)(?: (.*))?$/);
    if (!m || !PLACE_TAGS.has(m[1])) continue;
    const parts = (m[2] || '').split(',').map(s => s.trim()).filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      counts.set(parts[i], (counts.get(parts[i]) || 0) + 1);
    }
    for (let i = 0; i < parts.length - 1; i++) {
      const child = parts[i], parent = parts[i + 1];
      if (!parentVotes.has(child)) parentVotes.set(child, new Map());
      const votes = parentVotes.get(child);
      votes.set(parent, (votes.get(parent) || 0) + 1);
    }
  }

  // Для кожної дитини обираємо найчастішого "батька"; якщо є суперечність
  // (другий варіант набрав щонайменше половину голосів лідера) — фіксуємо
  // як конфлікт, але однаково будуємо дерево за більшістю, щоб воно
  // лишалось однозначним.
  const resolvedParent = new Map();
  const conflicts = [];
  for (const [child, votes] of parentVotes) {
    const sorted = [...votes.entries()].sort((a, b) => b[1] - a[1]);
    resolvedParent.set(child, sorted[0][0]);
    if (sorted.length > 1 && sorted[1][1] >= sorted[0][1] * 0.5) {
      conflicts.push({ child, parents: sorted.map(([p]) => p) });
    }
  }

  // Захист від циклів — географічні дані такими не бувають, але про всяк
  // випадок (биті/дивні значення PLAC не повинні підвісити побудову дерева).
  function isAncestor(candidate, name, depth = 0) {
    if (depth > 25) return true;
    if (candidate === name) return true;
    const p = resolvedParent.get(candidate);
    return p ? isAncestor(p, name, depth + 1) : false;
  }

  const nodeOf = new Map();
  function getNode(name) {
    if (!nodeOf.has(name)) {
      nodeOf.set(name, { name, count: counts.get(name) || 0, uk: '', translated: false, children: [] });
    }
    return nodeOf.get(name);
  }
  for (const name of counts.keys()) getNode(name);

  for (const node of nodeOf.values()) {
    const translatedVal = applyDictToValue(node.name, placeDictEntries || []);
    if (translatedVal !== node.name) { node.uk = translatedVal; node.translated = true; }
  }

  const roots = [];
  for (const [name, node] of nodeOf) {
    const parentName = resolvedParent.get(name);
    if (parentName && parentName !== name && !isAncestor(parentName, name)) {
      getNode(parentName).children.push(node);
    } else {
      roots.push(node);
    }
  }

  function sortTree(nodes) {
    nodes.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'uk'));
    nodes.forEach(n => sortTree(n.children));
  }
  sortTree(roots);

  return { roots, totalNodes: nodeOf.size, conflicts };
}
