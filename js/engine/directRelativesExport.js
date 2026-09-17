// ===================== ЕКСПОРТ "ПРЯМИХ РОДИЧІВ" =====================
// Будує окремий GEDCOM-файл лише з прямої лінії відносно обраної кореневої
// особи: кровні предки, кровні нащадки — і чоловіки/дружини кожного з них
// (щоб сім'ї лишались повними), БЕЗ бічної лінії (рідні брати/сестри,
// дядьки/тітки, двоюрідні тощо). Поколінь — без обмеження, скільки є у
// зв'язному графі.
//
// Записи копіюються з ОРИГІНАЛЬНОГО тексту практично без змін (усі теги —
// NOTE, SOUR, OCCU тощо — лишаються як є) — єдине хірургічне втручання:
// з кожної сім'ї прибираються діти, які НЕ потрапили до прямої лінії
// (інакше вони лишились би "битими" CHIL-посиланнями на відсутні записи),
// і з кожної особи прибираються FAMC/FAMS-посилання на сім'ї, які через це
// не увійшли до результату.
import { buildIndex, normalizeSex } from './analysis.js';
import { getRecordBlock } from './gedcomRecord.js';

/**
 * @param {string} content — поточний GEDCOM текст (оригінал або переклад — байдуже)
 * @param {string} rootId — id кореневої особи (напр. "I463")
 * @returns {{ content: string, error: string|null, stats: {individuals:number, families:number} }}
 */
export function buildDirectRelativesGedcom(content, rootId) {
  const { individuals, families } = buildIndex(content);
  if (!individuals.has(rootId)) {
    return { content: '', error: 'Кореневу особу не знайдено у файлі.', stats: null };
  }

  // 1) Кровні предки — вгору по FAMC, без обмеження поколінь.
  const ancestorIds = new Set();
  (function walkUp(id) {
    const p = individuals.get(id);
    for (const famcId of (p?.famc || [])) {
      const fam = families.get(famcId);
      if (!fam) continue;
      for (const parentId of [fam.husb, fam.wife]) {
        if (parentId && !ancestorIds.has(parentId)) {
          ancestorIds.add(parentId);
          walkUp(parentId);
        }
      }
    }
  })(rootId);

  // 2) Кровні нащадки — вниз по FAMS → CHIL, без обмеження поколінь.
  const descendantIds = new Set();
  (function walkDown(id) {
    const p = individuals.get(id);
    for (const famsId of (p?.fams || [])) {
      const fam = families.get(famsId);
      if (!fam) continue;
      for (const childId of fam.chil) {
        if (!descendantIds.has(childId)) {
          descendantIds.add(childId);
          walkDown(childId);
        }
      }
    }
  })(rootId);

  const coreBlood = new Set([rootId, ...ancestorIds, ...descendantIds]);

  // 3) Чоловік/дружина кожної кровної особи — лише термінально (не тягнемо
  // за собою предків чи інших дітей цього чоловіка/дружини поза лінією).
  const spouseIds = new Set();
  for (const id of coreBlood) {
    const p = individuals.get(id);
    for (const famsId of (p?.fams || [])) {
      const fam = families.get(famsId);
      if (!fam) continue;
      const spouseId = fam.husb === id ? fam.wife : (fam.wife === id ? fam.husb : null);
      if (spouseId && !coreBlood.has(spouseId)) spouseIds.add(spouseId);
    }
  }

  const fullSet = new Set([...coreBlood, ...spouseIds]);

  // 4) Сім'ї, де бере участь хоч хтось із набору — з дітьми, обрізаними до
  // перетину з набором (прибирає бічних дітей на предківських сім'ях; на
  // нащадківських сім'ях це фактично нічого не змінює — там усі діти й так
  // кровні нащадки кореня).
  const includedFamIds = new Set();
  const keepChilOf = new Map(); // famId -> Set(childId)
  for (const [famId, fam] of families) {
    if ((fam.husb && fullSet.has(fam.husb)) || (fam.wife && fullSet.has(fam.wife))) {
      includedFamIds.add(famId);
      keepChilOf.set(famId, new Set(fam.chil.filter(c => fullSet.has(c))));
    }
  }

  // 5) Копіюємо оригінальні блоки осіб, прибираючи лише FAMC/FAMS на сім'ї,
  // що не увійшли до результату. Тег SEX ОКРЕМО повертаємо до стандартного
  // GEDCOM-коду (M/F) — якщо джерело перекладене, там записано українське
  // "Ч"/"Ж" (зручно для читання людиною в цьому застосунку, але це вже НЕ
  // валідний GEDCOM-код). Цей файл призначений для інших програм
  // (FamilySearch, RootsMagic тощо) — вони "Ч"/"Ж" не розпізнають і
  // показують стать як невідому, тому тут завжди повертаємо M/F.
  const indiBlocks = [];
  for (const id of fullSet) {
    const block = getRecordBlock(content, id);
    if (!block) continue;
    const lines = block.lines
      .filter(line => {
        const m = line.match(/^1 (FAMC|FAMS) @([^@]+)@/);
        return !m || includedFamIds.has(m[2]);
      })
      .map(line => {
        const m = line.match(/^1 SEX (.*)$/);
        if (!m) return line;
        const normalized = normalizeSex(m[1]);
        return normalized ? `1 SEX ${normalized}` : line;
      });
    indiBlocks.push(lines.join('\n'));
  }

  // 6) Копіюємо оригінальні блоки сімей, прибираючи лише CHIL на осіб, що
  // не увійшли до результату (MARR, DIV та інші поля лишаються як є).
  const famBlocks = [];
  for (const famId of includedFamIds) {
    const block = getRecordBlock(content, famId);
    if (!block) continue;
    const keep = keepChilOf.get(famId);
    const lines = block.lines.filter(line => {
      const m = line.match(/^1 CHIL @([^@]+)@/);
      return !m || keep.has(m[1]);
    });
    famBlocks.push(lines.join('\n'));
  }

  const header = [
    '0 HEAD',
    '1 SOUR gedcom-translator-pro',
    '1 GEDC',
    '2 VERS 5.5.1',
    '2 FORM LINEAGE-LINKED',
    '1 CHAR UTF-8',
    `1 NOTE Пряма лінія (предки, нащадки та їхні чоловіки/дружини) відносно особи @${rootId}@ — без бічної лінії (брати/сестри, дядьки/тітки, двоюрідні).`,
  ];
  const text = [...header, ...indiBlocks, ...famBlocks, '0 TRLR'].join('\n');

  return { content: text, error: null, stats: { individuals: fullSet.size, families: includedFamIds.size } };
}
