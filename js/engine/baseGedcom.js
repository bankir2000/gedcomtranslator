// ===================== ПОБУДОВА "БАЗОВОГО" GEDCOM (живі родичі) =====================
// Перетворює масив чернеток осіб (з редактора "Живі родичі") у валідний
// GEDCOM-текст. Особи бувають двох видів:
//  - "якір" (isAnchor: true) — заглушка-прив'язка до вже існуючої особи в
//    основному файлі: несе лише _FSFTID (+ довідкову назву для самого
//    редактора) і спеціальний тег _ANCHOR Y. Батька/матір такій особі
//    вказувати не можна — вона сама є "коренем" для гілки живих нащадків.
//  - звичайна жива особа — ім'я, стать, дати/місця (необов'язково),
//    посилання на батька/матір (localId інших осіб у цьому ж списку,
//    включно з якорями).
//
// Сім'ї визначаються автоматично: усі діти з однаковою парою (батько,мати)
// потрапляють в одну сім'ю. Один із батьків може бути невідомий (порожній).
export function buildBaseGedcom(persons) {
  const lines = [
    '0 HEAD',
    '1 SOUR gedcom-translator-pro',
    '1 GEDC',
    '2 VERS 5.5.1',
    '2 FORM LINEAGE-LINKED',
    '1 CHAR UTF-8',
    '1 NOTE Базовий файл живих родичів (gedcom-translator-pro) — для об’єднання з основним GEDCOM за _FSFTID.',
  ];

  const famKeyOf = p => `${p.fatherId || ''}|${p.motherId || ''}`;
  const famMap = new Map(); // key -> { fatherId, motherId, childIds: [] }
  for (const p of persons) {
    if (p.isAnchor) continue; // якір нічиєю дитиною в цій базі бути не може
    if (!p.fatherId && !p.motherId) continue;
    const key = famKeyOf(p);
    if (!famMap.has(key)) famMap.set(key, { fatherId: p.fatherId || '', motherId: p.motherId || '', childIds: [] });
    famMap.get(key).childIds.push(p.localId);
  }

  const indiId = new Map();
  let indiNum = 1;
  for (const p of persons) indiId.set(p.localId, `I${indiNum++}`);

  const famId = new Map();
  let famNum = 1;
  for (const key of famMap.keys()) famId.set(key, `F${famNum++}`);

  const famsOf = new Map(); // localId -> [key,...] (де ця особа — батько/мати)
  const famcOf = new Map(); // localId -> key (де ця особа — дитина)
  for (const [key, fam] of famMap) {
    if (fam.fatherId) { if (!famsOf.has(fam.fatherId)) famsOf.set(fam.fatherId, []); famsOf.get(fam.fatherId).push(key); }
    if (fam.motherId) { if (!famsOf.has(fam.motherId)) famsOf.set(fam.motherId, []); famsOf.get(fam.motherId).push(key); }
    for (const c of fam.childIds) famcOf.set(c, key);
  }

  for (const p of persons) {
    const id = indiId.get(p.localId);
    lines.push(`0 @${id}@ INDI`);
    if (p.isAnchor) {
      if (p.label) lines.push(`1 NAME ${p.label}`);
      if (p.fsftid) lines.push(`1 _FSFTID ${p.fsftid}`);
      lines.push('1 _ANCHOR Y');
    } else {
      // Конвенція застосунку: GIVN/NAME = "Ім'я По-батькові" одним полем
      // (перше слово завжди ім'я, решта — по батькові) — так само, як інші
      // звіти й переклад цього застосунку розбирають імена.
      const givn = [p.given, p.patronymic].map(s => (s || '').trim()).filter(Boolean).join(' ');
      const nameVal = `${givn} /${(p.surname || '').trim()}/`;
      lines.push(`1 NAME ${nameVal}`);
      if (p.sex) lines.push(`1 SEX ${p.sex}`);
      if (p.birthDate || p.birthPlace) {
        lines.push('1 BIRT');
        if (p.birthDate) lines.push(`2 DATE ${p.birthDate}`);
        if (p.birthPlace) lines.push(`2 PLAC ${p.birthPlace}`);
      }
      if (p.deathDate || p.deathPlace) {
        lines.push('1 DEAT');
        if (p.deathDate) lines.push(`2 DATE ${p.deathDate}`);
        if (p.deathPlace) lines.push(`2 PLAC ${p.deathPlace}`);
      }
      if (p.fsftid) lines.push(`1 _FSFTID ${p.fsftid}`);
    }
    const fc = famcOf.get(p.localId);
    if (fc) lines.push(`1 FAMC @${famId.get(fc)}@`);
    for (const fs of (famsOf.get(p.localId) || [])) lines.push(`1 FAMS @${famId.get(fs)}@`);
  }

  for (const [key, fam] of famMap) {
    const id = famId.get(key);
    lines.push(`0 @${id}@ FAM`);
    if (fam.fatherId) lines.push(`1 HUSB @${indiId.get(fam.fatherId)}@`);
    if (fam.motherId) lines.push(`1 WIFE @${indiId.get(fam.motherId)}@`);
    for (const c of fam.childIds) lines.push(`1 CHIL @${indiId.get(c)}@`);
  }

  lines.push('0 TRLR');
  return lines.join('\n');
}
