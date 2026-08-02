// ===================== ОБ'ЄДНАННЯ БАЗИ ЖИВИХ РОДИЧІВ З ОСНОВНИМ ФАЙЛОМ =====================
// Базовий файл (створений у редакторі "Живі родичі") містить "якорі" —
// заглушки з _ANCHOR Y та _FSFTID, що позначають, ДЕ саме в основному дереві
// починається гілка живих осіб. Об'єднання:
//  1. Знаходить в основному файлі реальну особу за _FSFTID кожного якоря.
//  2. Переносить усіх "живих" осіб і сім'ї бази в основний файл під новими,
//     гарантовано унікальними id.
//  3. Скрізь, де сім'я бази посилається на якір (HUSB/WIFE/CHIL), підставляє
//     РЕАЛЬНИЙ id з основного файлу — а самому якорю (INDI-запис заглушки)
//     не дає потрапити у фінальний файл, він там не потрібен.
//  4. Реальній особі в основному файлі додає бракуючий рядок FAMS/FAMC —
//     інакше вона сама "не знатиме" про нову сім'ю.
//  5. ЯКЩО базова сім'я частково збігається з УЖЕ ІСНУЮЧОЮ сім'єю в
//     основному файлі (напр. батько й дитина вже є разом в одній сім'ї, але
//     без матері) — НЕ створює паралельну другу сім'ю для тих самих людей, а
//     дописує відсутнє поле (WIFE/HUSB/дату шлюбу/нову дитину) в наявну.
//     Без цього дитина лишалась дитиною ОДРАЗУ в двох FAM-записах, а дерево
//     (яке для швидкості дивиться лише на перший FAMC) продовжувало
//     показувати стару сім'ю без щойно доданого з бази чоловіка/дружини.
import { buildIndex } from './analysis.js';
import { getRecordBlock, replaceRecordBlock } from './gedcomRecord.js';

function maxNumericSuffix(ids) {
  let max = 0;
  for (const id of ids) {
    const m = String(id).match(/(\d+)/);
    if (m) max = Math.max(max, +m[1]);
  }
  return max;
}

/**
 * Шукає серед сімей ОСНОВНОГО файлу ту, куди безпечно долучити нові дані
 * замість створення дубльованої сім'ї. "Безпечно" означає: принаймні один
 * бік подружжя вже ТОЧНО збігається (не просто порожнє поле) — самого лише
 * спільного батька з іншою, вже вказаною дружиною недостатньо, якщо немає
 * спільної дитини, що це підтверджує (батько міг мати кілька шлюбів).
 */
function findExistingFamilyToReuse(mainFamilies, husbReal, wifeReal, chilReal) {
  if (!husbReal && !wifeReal) return null;
  let best = null, bestScore = -1;
  for (const fam of mainFamilies.values()) {
    if (husbReal && fam.husb && fam.husb !== husbReal) continue;
    if (wifeReal && fam.wife && fam.wife !== wifeReal) continue;

    const husbMatch = !!(husbReal && fam.husb === husbReal);
    const wifeMatch = !!(wifeReal && fam.wife === wifeReal);
    if (!husbMatch && !wifeMatch) continue; // жодного підтвердженого збігу — це не та сама сім'я

    const sharedChildren = fam.chil.filter(c => chilReal.includes(c));
    // Кандидат уже має когось на "нашому порожньому" місці (ми не вказали
    // чоловіка/дружину, а в кандидата він/вона є) — об'єднуємо лише якщо
    // це підтверджено спільною дитиною, інакше це ризикує бути ІНШИЙ шлюб.
    const otherSideFilled = (husbMatch && fam.wife && !wifeReal) || (wifeMatch && fam.husb && !husbReal);
    if (otherSideFilled && sharedChildren.length === 0) continue;

    const score = (husbMatch ? 2 : 0) + (wifeMatch ? 2 : 0) + sharedChildren.length;
    if (score > bestScore) { bestScore = score; best = fam; }
  }
  return best;
}

/**
 * @param mainContent  текст основного GEDCOM (оригінал або переклад — байдуже,
 *                     структура однакова, тільки мова полів різна)
 * @param baseContent  текст базового GEDCOM (живі родичі)
 * @returns { mergedContent, addedCount, unmatchedAnchors }
 *          unmatchedAnchors — FSFTID якорів, яких НЕ знайдено в основному
 *          файлі (їхня гілка живих осіб просто не буде прив'язана нікуди —
 *          про це обов'язково попереджаємо користувача).
 */
export function mergeBaseIntoMain(mainContent, baseContent) {
  const main = buildIndex(mainContent);
  const base = buildIndex(baseContent);

  const mainByFsftid = new Map();
  for (const p of main.individuals.values()) {
    if (p.fsftid) mainByFsftid.set(p.fsftid.trim().toLowerCase(), p.id);
  }

  const nextIndiNum = maxNumericSuffix(main.individuals.keys()) + 1;
  const nextFamNum = maxNumericSuffix(main.families.keys()) + 1;

  const idMap = new Map();       // base-id (не якір) -> новий унікальний id (або id ІСНУЮЧОЇ сім'ї, якщо долучили до неї)
  const anchorRealId = new Map(); // base-id якоря -> реальний id в main (або null, якщо не знайдено)
  const unmatchedAnchors = [];

  let indiCounter = nextIndiNum;
  for (const p of base.individuals.values()) {
    if (p.isAnchor) {
      const key = (p.fsftid || '').trim().toLowerCase();
      const realId = key ? mainByFsftid.get(key) : null;
      anchorRealId.set(p.id, realId || null);
      if (!realId) unmatchedAnchors.push(p.fsftid || `без _FSFTID (${p.name || p.id})`);
    } else {
      idMap.set(p.id, `L${indiCounter++}`);
    }
  }
  let famCounter = nextFamNum;
  for (const f of base.families.keys()) idMap.set(f, `LF${famCounter++}`);

  function resolveId(baseId) {
    if (anchorRealId.has(baseId)) return anchorRealId.get(baseId); // може бути null
    return idMap.get(baseId) || null;
  }

  // Рядки, які треба ДОДАТИ до існуючих записів основного файлу (нові FAMS/FAMC,
  // а тепер і долучення до вже наявної сім'ї — той самий механізм).
  const extraLinesForMain = new Map();
  function addExtra(mainId, line) {
    if (!mainId) return;
    if (!extraLinesForMain.has(mainId)) extraLinesForMain.set(mainId, []);
    if (!extraLinesForMain.get(mainId).includes(line)) extraLinesForMain.get(mainId).push(line);
  }

  const famLines = [];
  for (const f of base.families.values()) {
    const husbReal = f.husb ? resolveId(f.husb) : null;
    const wifeReal = f.wife ? resolveId(f.wife) : null;
    const chilReal = [];
    for (const c of f.chil) {
      const r = resolveId(c);
      if (r) chilReal.push(r);
    }
    if (!husbReal && !wifeReal && !chilReal.length) continue; // порожня сім'я (якір не знайдено й дітей нема) — пропускаємо

    const existingFam = findExistingFamilyToReuse(main.families, husbReal, wifeReal, chilReal);
    if (existingFam) {
      // Долучаємо до ІСНУЮЧОЇ сім'ї замість дублювання — той самий id бази
      // тепер веде на неї (resolveId() для цієї f.id поверне саме її id,
      // тож FAMS/FAMC у власних записах осіб нижче підставляться правильно).
      idMap.set(f.id, existingFam.id);
      if (!existingFam.husb && husbReal) { addExtra(existingFam.id, `1 HUSB @${husbReal}@`); addExtra(husbReal, `1 FAMS @${existingFam.id}@`); }
      if (!existingFam.wife && wifeReal) { addExtra(existingFam.id, `1 WIFE @${wifeReal}@`); addExtra(wifeReal, `1 FAMS @${existingFam.id}@`); }
      for (const c of chilReal) {
        if (!existingFam.chil.includes(c)) {
          addExtra(existingFam.id, `1 CHIL @${c}@`);
          addExtra(c, `1 FAMC @${existingFam.id}@`);
        }
      }
      if (!existingFam.marr?.date && !existingFam.marr?.plac && (f.marr?.date || f.marr?.plac)) {
        const marrLines = ['1 MARR'];
        if (f.marr.date) marrLines.push(`2 DATE ${f.marr.date}`);
        if (f.marr.plac) marrLines.push(`2 PLAC ${f.marr.plac}`);
        addExtra(existingFam.id, marrLines.join('\n'));
      }
      continue; // нову сім'ю не створюємо
    }

    const newFamId = idMap.get(f.id);
    if (f.husb && anchorRealId.has(f.husb) && husbReal) addExtra(husbReal, `1 FAMS @${newFamId}@`);
    if (f.wife && anchorRealId.has(f.wife) && wifeReal) addExtra(wifeReal, `1 FAMS @${newFamId}@`);
    for (const c of f.chil) {
      const r = resolveId(c);
      if (r && anchorRealId.has(c)) addExtra(r, `1 FAMC @${newFamId}@`);
    }

    const lines = [`0 @${newFamId}@ FAM`];
    if (husbReal) lines.push(`1 HUSB @${husbReal}@`);
    if (wifeReal) lines.push(`1 WIFE @${wifeReal}@`);
    for (const c of chilReal) lines.push(`1 CHIL @${c}@`);
    if (f.marr?.date || f.marr?.plac) {
      lines.push('1 MARR');
      if (f.marr.date) lines.push(`2 DATE ${f.marr.date}`);
      if (f.marr.plac) lines.push(`2 PLAC ${f.marr.plac}`);
    }
    famLines.push(...lines);
  }

  const indiLines = [];
  let addedCount = 0;
  for (const p of base.individuals.values()) {
    if (p.isAnchor) continue; // якоря в фінальний файл не переносимо — реальна особа вже є в main
    const newId = idMap.get(p.id);
    addedCount++;
    indiLines.push(`0 @${newId}@ INDI`);
    if (p.name) indiLines.push(`1 NAME ${p.name}`);
    if (p.sex) indiLines.push(`1 SEX ${p.sex}`);
    if (p.birt.date || p.birt.plac) {
      indiLines.push('1 BIRT');
      if (p.birt.date) indiLines.push(`2 DATE ${p.birt.date}`);
      if (p.birt.plac) indiLines.push(`2 PLAC ${p.birt.plac}`);
    }
    if (p.deat.date || p.deat.plac) {
      indiLines.push('1 DEAT');
      if (p.deat.date) indiLines.push(`2 DATE ${p.deat.date}`);
      if (p.deat.plac) indiLines.push(`2 PLAC ${p.deat.plac}`);
    }
    if (p.fsftid) indiLines.push(`1 _FSFTID ${p.fsftid}`);
    for (const famcId of p.famc) {
      const r = resolveId(famcId);
      if (r) indiLines.push(`1 FAMC @${r}@`);
    }
    for (const famsId of p.fams) {
      const r = resolveId(famsId);
      if (r) indiLines.push(`1 FAMS @${r}@`);
    }
  }

  // Вставляємо додаткові FAMS/FAMC-рядки (і долучення до наявних сімей) в
  // записи реальних осіб та сімей основного файлу.
  let mergedMain = mainContent;
  for (const [mainId, extraLines] of extraLinesForMain) {
    const block = getRecordBlock(mergedMain, mainId);
    if (!block) continue; // не мало б статись (id саме з main), але про всяк випадок
    const newBlockText = block.lines.concat(extraLines).join('\n');
    mergedMain = replaceRecordBlock(mergedMain, mainId, newBlockText);
  }

  // Вставляємо нові записи (осіб і сімей бази) прямо перед "0 TRLR".
  const newRecordsText = indiLines.concat(famLines).join('\n');
  let result;
  const trlrRe = /\r?\n0 TRLR\s*$/;
  if (trlrRe.test(mergedMain)) {
    result = mergedMain.replace(trlrRe, '\n' + newRecordsText + '\n0 TRLR');
  } else {
    result = mergedMain.replace(/\s*$/, '') + '\n' + newRecordsText + '\n0 TRLR';
  }

  return { mergedContent: result, addedCount, unmatchedAnchors };
}
