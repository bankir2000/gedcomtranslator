// ===================== ПЕРЕВІРКА ЦИКЛІВ У ГРАФІ ЗВ'ЯЗКІВ =====================
// Захищає лише зв'язки МІЖ ОСОБАМИ ЦІЄЇ Ж БАЗИ (local RelRef) — зовнішні
// (external) посилання не можуть створити цикл у межах чернетки, бо ведуть
// на особу поза списком.

/** parentLocalId -> [childLocalId, ...], побудовано з father/mother кожної особи. */
function buildChildrenIndex(persons) {
  const idx = new Map();
  for (const p of persons) {
    for (const ref of [p.father, p.mother]) {
      if (ref && ref.kind === 'local') {
        if (!idx.has(ref.localId)) idx.set(ref.localId, []);
        idx.get(ref.localId).push(p.localId);
      }
    }
  }
  return idx;
}

/** Чи є `descendantId` нащадком (у будь-якому коліні) особи `ancestorId`? */
function isDescendantOf(persons, ancestorId, descendantId) {
  const idx = buildChildrenIndex(persons);
  const stack = [...(idx.get(ancestorId) || [])];
  const seen = new Set();
  while (stack.length) {
    const cur = stack.pop();
    if (cur === descendantId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(idx.get(cur) || []));
  }
  return false;
}

/**
 * Чи можна призначити `parentId` батьком/матір'ю особи `personId`?
 * Заборонено: сама собі, або власний нащадок (це створило б цикл).
 */
export function canSetParent(persons, personId, parentId) {
  if (!parentId) return true;
  if (parentId === personId) return false;
  return !isDescendantOf(persons, personId, parentId);
}

/**
 * Чи можна призначити `childId` дитиною особи `personId`?
 * Дзеркальна перевірка до canSetParent.
 */
export function canSetChild(persons, personId, childId) {
  if (!childId) return true;
  if (childId === personId) return false;
  return !isDescendantOf(persons, childId, personId);
}

/** Чоловік/дружина не може бути самою особою. (Кровне споріднення тут навмисно не перевіряємо — рідкісні генеалогічні випадки на совісті користувача.) */
export function canSetSpouse(personId, spouseId) {
  if (!spouseId) return true;
  return spouseId !== personId;
}
