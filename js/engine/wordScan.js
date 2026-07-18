// ===================== СКАН ФАЙЛУ: ІМЕНА / ПРІЗВИЩА / МІСЦЯ =====================
// Той самий принцип, що й автосканування по-батькові: пройтись по завантаженому
// файлу, зібрати всі унікальні слова конкретної категорії з лічильником, і показати
// користувачу — вже перекладено (є в довіднику) чи ще ні (потребує ручного вводу).
// На відміну від по-батькові тут немає "правила" — лише довідник, тож стан лише
// двійковий: "ручний" (є в довіднику) або "немає" (треба ввести).
import { isPatronymic } from '../dict/patronymics.js';

const PLACE_TAGS = new Set(['PLAC', 'CITY', 'STAE', 'CTRY', 'ADDR', 'ADR1', 'ADR2']);

export const CATEGORY_CONFIG = {
  name: { dictType: 'name', label: "Ім'я" },
  surn: { dictType: 'surn', label: 'Прізвище' },
  place: { dictType: 'place', label: 'Місце' },
};

/**
 * Сканує сирий GEDCOM-текст і повертає Map(слово -> кількість входжень) для заданої
 * категорії ('name' | 'surn' | 'place').
 */
export function scanCategory(rawContent, cat) {
  const found = new Map();
  const bump = w => { if (w) found.set(w, (found.get(w) || 0) + 1); };
  const lines = rawContent.split(/\r?\n/);

  for (const line of lines) {
    const m = line.match(/^\d+ (\S+)(?: (.*))?$/);
    if (!m) continue;
    const tag = m[1];
    const rawVal = m[2] || '';
    if (!rawVal) continue;

    if (cat === 'name') {
      if (tag === 'GIVN' || tag === 'NPFX') {
        for (const w of rawVal.trim().split(/\s+/)) if (!isPatronymic(w)) bump(w);
      } else if (tag === 'NAME') {
        // У "Ім'я По-батькові /Прізвище/" імена — лише токени ДО прізвища (і не по-батькові).
        const givenPart = rawVal.split('/')[0];
        for (const w of givenPart.trim().split(/\s+/)) if (w && !isPatronymic(w)) bump(w);
      }
    } else if (cat === 'surn') {
      if (tag === 'SURN' || tag === 'NSFX') {
        for (const w of rawVal.trim().split(/\s+/)) bump(w);
      } else if (tag === 'NAME') {
        const mm = rawVal.match(/\/([^/]*)\//);
        if (mm) for (const w of mm[1].trim().split(/\s+/)) bump(w);
      }
    } else if (cat === 'place') {
      if (PLACE_TAGS.has(tag)) {
        // Місця — здебільшого словосполучення через кому ("Кирилівка, Звенигородський
        // повіт, Київська губернія"), тому ділимо по комі, а не по пробілу як імена —
        // щоб зберегти назву населеного пункту/регіону цілою фразою.
        for (const part of rawVal.split(',')) { const w = part.trim(); if (w) bump(w); }
      }
    }
  }
  return found;
}
