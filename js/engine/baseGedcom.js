// ===================== ПОБУДОВА "БАЗОВОГО" GEDCOM (вкладка "Люди") =====================
// Перетворює масив чернеток осіб редактора у валідний GEDCOM-текст.
//
// Кожна особа тепер однорідна (немає окремого типу "якір") — поля зв'язку
// (father/mother/spouse/children) є RelRef: або 'local' (інша особа з цього ж
// списку), або 'external' (уже існуюча в основному дереві людина, за її
// _FSFTID). Для кожного унікального external-посилання тут автоматично
// створюється одна заглушка-INDI з тегом _ANCHOR Y (дедуплікація за fsftid) —
// саме її потім знаходить `mergeBaseIntoMain` в основному файлі.
//
// Сім'ї (FAM) будуються з трьох джерел одночасно (і об'єднуються, якщо
// збігається пара батьків):
//   1) явний шлюб (person.spouse) — так пара потрапляє у файл, НАВІТЬ якщо
//      спільних дітей немає;
//   2) father/mother кожної дитини;
//   3) явний список children на батьківській формі (потрібен головно для
//      зовнішніх дітей — у них немає власного father/mother запису тут).
import { refKey, localRef } from '../peopleeditor/relRef.js';

function unionMapKey(refA, refB) {
  const a = refA ? refKey(refA) : '';
  const b = refB ? refKey(refB) : '';
  return [a, b].sort().join('~');
}

function sexOfRef(ref, byLocalId) {
  if (!ref || ref.kind !== 'local') return '';
  return byLocalId.get(ref.localId)?.sex || '';
}

/** Визначає, хто HUSB, а хто WIFE, за статтю (якщо відома); інакше лишає порядок як є. */
function assignHusbWife(refA, refB, byLocalId) {
  if (sexOfRef(refA, byLocalId) === 'F') return [refB, refA];
  return [refA, refB];
}

export function buildBaseGedcom(persons) {
  const byLocalId = new Map(persons.map(p => [p.localId, p]));

  // ---- Крок 1: зібрати всі сім'ї (унії) з трьох джерел ----
  const unions = new Map(); // key -> { refA, refB, marriageDate, marriagePlace, children: Map<key, ref> }
  function getOrCreateUnion(refA, refB) {
    if (!refA && !refB) return null;
    const key = unionMapKey(refA, refB);
    if (!unions.has(key)) {
      unions.set(key, { refA, refB, marriageDate: '', marriagePlace: '', children: new Map() });
    } else {
      const u = unions.get(key);
      if (!u.refA && refA) u.refA = refA;
      if (!u.refB && refB) u.refB = refB;
    }
    return unions.get(key);
  }
  function addChild(union, ref) {
    if (!union || !ref) return;
    union.children.set(refKey(ref), ref);
  }

  for (const p of persons) {
    if (p.spouse) {
      const u = getOrCreateUnion(localRef(p.localId), p.spouse);
      if (p.marriageDate && !u.marriageDate) u.marriageDate = p.marriageDate;
      if (p.marriagePlace && !u.marriagePlace) u.marriagePlace = p.marriagePlace;
    }
  }
  for (const p of persons) {
    if (p.father || p.mother) {
      addChild(getOrCreateUnion(p.father, p.mother), localRef(p.localId));
    }
  }
  for (const p of persons) {
    for (const childRef of (p.children || [])) {
      addChild(getOrCreateUnion(localRef(p.localId), p.spouse), childRef);
    }
  }

  // ---- Крок 2: GEDCOM id для реальних осіб бази ----
  const indiId = new Map();
  let indiNum = 1;
  for (const p of persons) indiId.set(p.localId, `I${indiNum++}`);

  // ---- Крок 3: дедупліковані якорі-заглушки для зовнішніх посилань ----
  const externalAnchors = new Map(); // fsftid.toLowerCase() -> { gedId, label, original }
  function anchorIdFor(ref) {
    const key = ref.fsftid.toLowerCase();
    if (!externalAnchors.has(key)) {
      externalAnchors.set(key, { gedId: `I${indiNum++}`, label: ref.label || '', original: ref.fsftid });
    } else if (ref.label && !externalAnchors.get(key).label) {
      externalAnchors.get(key).label = ref.label;
    }
    return externalAnchors.get(key).gedId;
  }
  function gedcomIdOf(ref) {
    if (!ref) return null;
    return ref.kind === 'local' ? indiId.get(ref.localId) : anchorIdFor(ref);
  }

  // ---- Крок 4: FAM-записи ----
  const famsOfLocal = new Map(); // localId -> [famGedId, ...]
  const famcOfLocal = new Map(); // localId -> famGedId
  const famLines = [];
  let famNum = 1;
  for (const u of unions.values()) {
    if (!u.refA && !u.refB && !u.children.size) continue; // порожня — пропускаємо
    const gid = `F${famNum++}`;
    const [husbRef, wifeRef] = assignHusbWife(u.refA, u.refB, byLocalId);
    const husbId = gedcomIdOf(husbRef);
    const wifeId = gedcomIdOf(wifeRef);
    if (husbRef?.kind === 'local') {
      if (!famsOfLocal.has(husbRef.localId)) famsOfLocal.set(husbRef.localId, []);
      famsOfLocal.get(husbRef.localId).push(gid);
    }
    if (wifeRef?.kind === 'local') {
      if (!famsOfLocal.has(wifeRef.localId)) famsOfLocal.set(wifeRef.localId, []);
      famsOfLocal.get(wifeRef.localId).push(gid);
    }

    const lines = [`0 @${gid}@ FAM`];
    if (husbId) lines.push(`1 HUSB @${husbId}@`);
    if (wifeId) lines.push(`1 WIFE @${wifeId}@`);
    for (const childRef of u.children.values()) {
      const cid = gedcomIdOf(childRef);
      if (!cid) continue;
      lines.push(`1 CHIL @${cid}@`);
      if (childRef.kind === 'local') famcOfLocal.set(childRef.localId, gid);
    }
    if (u.marriageDate || u.marriagePlace) {
      lines.push('1 MARR');
      if (u.marriageDate) lines.push(`2 DATE ${u.marriageDate}`);
      if (u.marriagePlace) lines.push(`2 PLAC ${u.marriagePlace}`);
    }
    famLines.push(...lines);
  }

  // ---- Крок 5: INDI-записи реальних осіб ----
  const indiLines = [];
  for (const p of persons) {
    const id = indiId.get(p.localId);
    indiLines.push(`0 @${id}@ INDI`);
    const givn = [p.given, p.patronymic].map(s => (s || '').trim()).filter(Boolean).join(' ');
    indiLines.push(`1 NAME ${givn} /${(p.surname || '').trim()}/`);
    if (p.sex) indiLines.push(`1 SEX ${p.sex}`);
    if (p.birthDate || p.birthPlace) {
      indiLines.push('1 BIRT');
      if (p.birthDate) indiLines.push(`2 DATE ${p.birthDate}`);
      if (p.birthPlace) indiLines.push(`2 PLAC ${p.birthPlace}`);
    }
    if (p.deathDate || p.deathPlace) {
      indiLines.push('1 DEAT');
      if (p.deathDate) indiLines.push(`2 DATE ${p.deathDate}`);
      if (p.deathPlace) indiLines.push(`2 PLAC ${p.deathPlace}`);
    }
    if (p.fsftid) indiLines.push(`1 _FSFTID ${p.fsftid}`);
    const famc = famcOfLocal.get(p.localId);
    if (famc) indiLines.push(`1 FAMC @${famc}@`);
    for (const fams of (famsOfLocal.get(p.localId) || [])) indiLines.push(`1 FAMS @${fams}@`);
  }

  // ---- Крок 6: якорі-заглушки для зовнішніх осіб ----
  const anchorLines = [];
  for (const a of externalAnchors.values()) {
    anchorLines.push(`0 @${a.gedId}@ INDI`);
    if (a.label) anchorLines.push(`1 NAME ${a.label}`);
    anchorLines.push(`1 _FSFTID ${a.original}`);
    anchorLines.push('1 _ANCHOR Y');
  }

  const lines = [
    '0 HEAD',
    '1 SOUR gedcom-translator-pro',
    '1 GEDC',
    '2 VERS 5.5.1',
    '2 FORM LINEAGE-LINKED',
    '1 CHAR UTF-8',
    '1 NOTE Файл людей, доданих вручну для довставляння у дерево (gedcom-translator-pro) — об’єднується з основним GEDCOM за _FSFTID.',
    ...indiLines,
    ...anchorLines,
    ...famLines,
    '0 TRLR',
  ];
  return lines.join('\n');
}
