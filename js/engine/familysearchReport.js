// ===================== ЗВІТ FAMILYSEARCH: ПІДГОТОВКА ДАНИХ =====================
import { buildIndex } from './analysis.js';

// GIVN нерідко містить одразу "Ім'я По-батькові" одним рядком через пробіл. У генеалогічних
// записах порядок практично завжди фіксований: спочатку ім'я, потім по-батькові — тому
// НАДІЙНІШЕ покладатись на ПОЗИЦІЮ слова, ніж розпізнавати кожне слово окремо за суфіксом.
// Розпізнавання за суфіксом (looksLikePatronymic) ламається щоразу, коли саме ІМ'Я випадково
// закінчується так само, як архаїчне по-батькові (Харитина, Фотина, Іустин) — тоді ім'я
// хибно йде в колонку "По-батькові", а колонка "Ім'я" лишається порожньою.
// Тому: перше слово — завжди ім'я; решта (одне чи кілька) — по-батькові.
function splitGivenPatronymic(givnRaw) {
  const tokens = (givnRaw || '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { given: '', patr: '' };
  if (tokens.length === 1) return { given: tokens[0], patr: '' };
  return { given: tokens[0], patr: tokens.slice(1).join(' ') };
}

// Якщо GIVN/SURN окремо не заповнені (файл має лише NAME "Ім'я /Прізвище/"),
// беремо їх звідти як запасний варіант.
function deriveNameParts(p) {
  let givnRaw = p.givn || '';
  let surnRaw = p.surn || '';
  if (!givnRaw && !surnRaw && p.name) {
    const m = p.name.match(/^([^/]*)\/([^/]*)\//);
    if (m) { givnRaw = m[1].trim(); surnRaw = m[2].trim(); }
    else givnRaw = p.name.replace(/\//g, '').trim();
  } else if (!givnRaw && p.name) {
    const m = p.name.match(/^([^/]*)\//);
    if (m) givnRaw = m[1].trim();
  }
  return { givnRaw, surnRaw };
}

// Ім'я особи для показу як "чоловік/дружина" у колонці шлюбу —
// той самий формат NAME без похилих рисок, що й у дереві (personLabel).
function spouseDisplayName(sp) {
  if (!sp) return '';
  return (sp.name || '').replace(/\//g, '').trim();
}

// Один запис FAM = один шлюб/союз. Особа може мати кілька FAMS (кілька
// шлюбів) — тому повертаємо МАСИВ, а не одне значення, і компонуємо
// підсумок окремо (buildMarriageSummary), щоб виклик, якому потрібні лише
// сирі дані (наприклад, майбутній експорт по одному шлюбу на рядок), міг
// оминути готовий текстовий підсумок.
function collectMarriages(p, families, individuals) {
  const list = [];
  for (const famId of p.fams) {
    const fam = families.get(famId);
    if (!fam) continue;
    const spouseId = fam.husb === p.id ? fam.wife : (fam.wife === p.id ? fam.husb : null);
    const spouse = spouseId ? individuals.get(spouseId) : null;
    list.push({
      date: (fam.marr && fam.marr.date) || '',
      plac: (fam.marr && fam.marr.plac) || '',
      spouseName: spouseDisplayName(spouse),
    });
  }
  // Сортуємо за роком шлюбу (без дати — в кінець), щоб перший шлюб завжди
  // йшов першим у звіті незалежно від порядку FAMS у вихідному файлі.
  list.sort((a, b) => (yearOf(a.date) || 9999) - (yearOf(b.date) || 9999));
  return list;
}

function yearOf(dateStr) {
  const m = (dateStr || '').match(/(\d{3,4})\s*$/) || (dateStr || '').match(/(\d{3,4})/);
  return m ? +m[1] : null;
}

// Готові тексти для ТРЬОХ окремих комірок таблиці (чоловік/дружина, дата,
// місце) замість одного об'єднаного підсумку — так кожна колонка сортується
// й фільтрується окремо. При кількох шлюбах кожен запис — на ОКРЕМОМУ РЯДКУ
// (розділювач '\n', разом з CSS white-space:pre-line у звіті це й дає ячейці
// «розтягнутись» на стільки рядків, скільки шлюбів), і нумеруємо ОДНАКОВО в
// усіх трьох колонках (1) ...\n2) ...), щоб N-й рядок в одній колонці
// відповідав N-му рядку в двох інших навіть якщо десь дата чи місце порожні.
function joinMarriageField(marriages, pick) {
  if (!marriages || marriages.length === 0) return '';
  const multi = marriages.length > 1;
  return marriages
    .map((m, i) => {
      const v = pick(m) || '—';
      return multi ? `${i + 1}) ${v}` : v;
    })
    .join('\n');
}

export function buildMarriageSummary(marriages) {
  return {
    spouses: joinMarriageField(marriages, m => m.spouseName),
    dates: joinMarriageField(marriages, m => m.date),
    places: joinMarriageField(marriages, m => m.plac),
  };
}

export function buildReportRows(content) {
  const { individuals, families } = buildIndex(content);
  const rows = [];
  for (const p of individuals.values()) {
    const { givnRaw, surnRaw } = deriveNameParts(p);
    const { given, patr } = splitGivenPatronymic(givnRaw);
    const marriages = collectMarriages(p, families, individuals);
    const { spouses, dates, places } = buildMarriageSummary(marriages);
    rows.push({
      id: p.id,
      fsftid: p.fsftid || '',
      given,
      patr,
      surn: surnRaw,
      birthDate: p.birt.date || '',
      birthPlace: p.birt.plac || '',
      marriages,
      marriageSpouses: spouses,
      marriageDates: dates,
      marriagePlaces: places,
      deathDate: p.deat.date || '',
      deathPlace: p.deat.plac || '',
    });
  }
  // Сортуємо за прізвищем, потім іменем — просто зручніше гортати звіт
  rows.sort((a, b) => a.surn.localeCompare(b.surn, 'uk') || a.given.localeCompare(b.given, 'uk'));
  return rows;
}

// Звіт «є ім'я і прізвище, а по-батькові — нема» — ЗАВЖДИ на основі
// оригінального тексту файлу (не перекладеного), щоб бачити прогалини в
// первинних даних. Той самий поділ given/patr/surn, що й у звіті FamilySearch.
export function buildMissingPatronymicReport(content) {
  const { individuals } = buildIndex(content);
  const rows = [];
  for (const p of individuals.values()) {
    const { givnRaw, surnRaw } = deriveNameParts(p);
    const { given, patr } = splitGivenPatronymic(givnRaw);
    if (given && surnRaw && !patr) {
      rows.push({
        id: p.id,
        fsftid: p.fsftid || '',
        given,
        surn: surnRaw,
        birthDate: p.birt.date || '',
        birthPlace: p.birt.plac || '',
      });
    }
  }
  rows.sort((a, b) => a.surn.localeCompare(b.surn, 'uk') || a.given.localeCompare(b.given, 'uk'));
  return rows;
}
