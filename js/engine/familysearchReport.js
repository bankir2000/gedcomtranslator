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

export function buildReportRows(content) {
  const { individuals } = buildIndex(content);
  const rows = [];
  for (const p of individuals.values()) {
    const { givnRaw, surnRaw } = deriveNameParts(p);
    const { given, patr } = splitGivenPatronymic(givnRaw);
    rows.push({
      id: p.id,
      fsftid: p.fsftid || '',
      given,
      patr,
      surn: surnRaw,
      birthDate: p.birt.date || '',
      birthPlace: p.birt.plac || '',
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
