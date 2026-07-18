// ===================== ПОРІВНЯННЯ ДВОХ GEDCOM (Етап 5) =====================
import { yearOf } from './analysis.js';

function keyFor(p) {
  if (p.fsftid) return 'fs:' + p.fsftid;
  const surn = (p.surn || '').trim().toLowerCase();
  const givn = (p.givn || '').trim().toLowerCase();
  const by = yearOf(p.birt.date);
  if (!surn && !givn) return null;
  return `ng:${surn}|${givn}|${by || '?'}`;
}

function fieldDiffs(a, b) {
  const diffs = [];
  const cmp = (label, va, vb) => { if ((va || '') !== (vb || '')) diffs.push({ field: label, a: va || '—', b: vb || '—' }); };
  cmp('Ім\'я', (a.name || '').replace(/\//g, ''), (b.name || '').replace(/\//g, ''));
  cmp('Стать', a.sex, b.sex);
  cmp('Дата народження', a.birt.date, b.birt.date);
  cmp('Місце народження', a.birt.plac, b.birt.plac);
  cmp('Дата смерті', a.deat.date, b.deat.date);
  cmp('Місце смерті', a.deat.plac, b.deat.plac);
  return diffs;
}

export function compareGedcoms(idxA, idxB) {
  const mapA = new Map(), mapB = new Map();
  for (const p of idxA.individuals.values()) {
    const k = keyFor(p);
    if (!k) continue;
    if (!mapA.has(k)) mapA.set(k, []);
    mapA.get(k).push(p);
  }
  for (const p of idxB.individuals.values()) {
    const k = keyFor(p);
    if (!k) continue;
    if (!mapB.has(k)) mapB.set(k, []);
    mapB.get(k).push(p);
  }

  const onlyInA = [], onlyInB = [], differing = [], identical = [];

  for (const [k, listA] of mapA) {
    const listB = mapB.get(k);
    if (!listB) { onlyInA.push(...listA); continue; }
    const n = Math.min(listA.length, listB.length);
    for (let i = 0; i < n; i++) {
      const diffs = fieldDiffs(listA[i], listB[i]);
      if (diffs.length) differing.push({ a: listA[i], b: listB[i], diffs });
      else identical.push({ a: listA[i], b: listB[i] });
    }
    if (listA.length > n) onlyInA.push(...listA.slice(n));
    if (listB.length > n) onlyInB.push(...listB.slice(n));
  }
  for (const [k, listB] of mapB) {
    if (!mapA.has(k)) onlyInB.push(...listB);
  }

  return {
    onlyInA, onlyInB, differing, identical,
    totalA: idxA.individuals.size, totalB: idxB.individuals.size,
  };
}
