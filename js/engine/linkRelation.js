// ===================== ЗВ'ЯЗУВАННЯ ДВОХ УЖЕ ІСНУЮЧИХ ОСІБ =====================
// На відміну від mergeBase.js (де одна сторона — це НОВА людина з окремого
// базового файлу), тут ОБИДВІ особи вже є в ОДНОМУ й тому самому файлі —
// просто ще не зв'язані. Використовується структурованою формою редагування
// запису (вкладка "Пошук"), коли додають батька/матір/чоловіка-дружину/
// дитину за кодом _FSFTID напряму, без окремого запису-чернетки.
import { buildIndex } from './analysis.js';
import { getRecordBlock, replaceRecordBlock } from './gedcomRecord.js';
import { maxNumericSuffix, findExistingFamilyToReuse } from './mergeBase.js';

/**
 * @param {string} content — поточний GEDCOM текст (оригінал або переклад)
 * @param {string} personId — id особи, яку редагують (напр. "I467")
 * @param {'father'|'mother'|'spouse'|'child'} relation
 * @param {string} targetFsftid — код особи, яку приєднуємо
 * @param {string} [marriageDate] — лише для relation === 'spouse'
 * @param {string} [marriagePlace]
 * @returns {{ content: string, error: string|null }}
 */
export function linkExistingRelation(content, personId, relation, targetFsftid, marriageDate = '', marriagePlace = '') {
  const idx = buildIndex(content);
  const person = idx.individuals.get(personId);
  if (!person) return { content, error: 'Особу не знайдено у файлі — можливо, він змінився. Повтори пошук.' };

  const fsftidKey = (targetFsftid || '').trim().toLowerCase();
  if (!fsftidKey) return { content, error: 'Вкажи код _FSFTID.' };
  let targetId = null;
  for (const p of idx.individuals.values()) {
    if ((p.fsftid || '').trim().toLowerCase() === fsftidKey) { targetId = p.id; break; }
  }
  if (!targetId) return { content, error: `Особу з кодом ${targetFsftid} не знайдено у файлі — переконайся, що код правильний і вона вже там є.` };
  if (targetId === personId) return { content, error: 'Не можна вказати саму цю особу.' };

  let husbReal = null, wifeReal = null, chilReal = [];
  if (relation === 'father') { husbReal = targetId; chilReal = [personId]; }
  else if (relation === 'mother') { wifeReal = targetId; chilReal = [personId]; }
  else if (relation === 'spouse') {
    if (person.sex === 'F') { wifeReal = personId; husbReal = targetId; }
    else { husbReal = personId; wifeReal = targetId; }
  } else if (relation === 'child') {
    if (person.sex === 'F') wifeReal = personId; else husbReal = personId;
    chilReal = [targetId];
  } else {
    return { content, error: 'Невідомий тип зв’язку.' };
  }

  // Захист від явних циклів (не можна зробити нащадка власним предком).
  const childrenIndex = new Map(); // parentId -> [childId, ...]
  for (const p of idx.individuals.values()) {
    const famcId = p.famc[0];
    if (!famcId) continue;
    const fam = idx.families.get(famcId);
    if (!fam) continue;
    if (fam.husb) { if (!childrenIndex.has(fam.husb)) childrenIndex.set(fam.husb, []); childrenIndex.get(fam.husb).push(p.id); }
    if (fam.wife) { if (!childrenIndex.has(fam.wife)) childrenIndex.set(fam.wife, []); childrenIndex.get(fam.wife).push(p.id); }
  }
  function isDescendantOf(ancestorId, maybeDescId) {
    const seen = new Set();
    const stack = [...(childrenIndex.get(ancestorId) || [])];
    while (stack.length) {
      const cur = stack.pop();
      if (cur === maybeDescId) return true;
      if (seen.has(cur)) continue;
      seen.add(cur);
      stack.push(...(childrenIndex.get(cur) || []));
    }
    return false;
  }
  if ((relation === 'father' || relation === 'mother') && isDescendantOf(personId, targetId)) {
    return { content, error: 'Це створило б цикл у дереві — обрана особа вже є нащадком цієї.' };
  }
  if (relation === 'child' && isDescendantOf(targetId, personId)) {
    return { content, error: 'Це створило б цикл у дереві — ця особа вже є нащадком обраної.' };
  }

  const extraLinesFor = new Map();
  function addExtra(id, line) {
    if (!extraLinesFor.has(id)) extraLinesFor.set(id, []);
    if (!extraLinesFor.get(id).includes(line)) extraLinesFor.get(id).push(line);
  }

  const existingFam = findExistingFamilyToReuse(idx.families, husbReal, wifeReal, chilReal);
  const famLinesToAppend = [];
  let newFamId = null;

  if (existingFam) {
    if (!existingFam.husb && husbReal) { addExtra(existingFam.id, `1 HUSB @${husbReal}@`); addExtra(husbReal, `1 FAMS @${existingFam.id}@`); }
    if (!existingFam.wife && wifeReal) { addExtra(existingFam.id, `1 WIFE @${wifeReal}@`); addExtra(wifeReal, `1 FAMS @${existingFam.id}@`); }
    for (const c of chilReal) {
      if (!existingFam.chil.includes(c)) { addExtra(existingFam.id, `1 CHIL @${c}@`); addExtra(c, `1 FAMC @${existingFam.id}@`); }
    }
    if (!existingFam.marr?.date && !existingFam.marr?.plac && (marriageDate || marriagePlace)) {
      const marrLines = ['1 MARR'];
      if (marriageDate) marrLines.push(`2 DATE ${marriageDate}`);
      if (marriagePlace) marrLines.push(`2 PLAC ${marriagePlace}`);
      addExtra(existingFam.id, marrLines.join('\n'));
    }
  } else {
    newFamId = `LF${maxNumericSuffix(idx.families.keys()) + 1}`;
    if (husbReal) addExtra(husbReal, `1 FAMS @${newFamId}@`);
    if (wifeReal) addExtra(wifeReal, `1 FAMS @${newFamId}@`);
    for (const c of chilReal) addExtra(c, `1 FAMC @${newFamId}@`);

    const lines = [`0 @${newFamId}@ FAM`];
    if (husbReal) lines.push(`1 HUSB @${husbReal}@`);
    if (wifeReal) lines.push(`1 WIFE @${wifeReal}@`);
    for (const c of chilReal) lines.push(`1 CHIL @${c}@`);
    if (marriageDate || marriagePlace) {
      lines.push('1 MARR');
      if (marriageDate) lines.push(`2 DATE ${marriageDate}`);
      if (marriagePlace) lines.push(`2 PLAC ${marriagePlace}`);
    }
    famLinesToAppend.push(...lines);
  }

  let result = content;
  for (const [id, extraLines] of extraLinesFor) {
    const block = getRecordBlock(result, id);
    if (!block) continue;
    result = replaceRecordBlock(result, id, block.lines.concat(extraLines).join('\n'));
  }
  if (famLinesToAppend.length) {
    const trlrRe = /\r?\n0 TRLR\s*$/;
    result = trlrRe.test(result)
      ? result.replace(trlrRe, '\n' + famLinesToAppend.join('\n') + '\n0 TRLR')
      : result.replace(/\s*$/, '') + '\n' + famLinesToAppend.join('\n') + '\n0 TRLR';
  }

  return { content: result, error: null };
}
