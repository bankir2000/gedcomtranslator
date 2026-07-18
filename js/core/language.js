// ===================== МОВА СЛОВА =====================
// Суто українські літери (яких немає в російській)
export const UK_ONLY = /[іІїЇєЄґҐ]/;
// Суто російські літери (яких немає в українській)
export const RU_ONLY = /[ёЁыЫэЭъЪ]/;

// Повертає: 'uk' | 'ru' | 'common' (спільна кирилиця без маркерів)
export function detectLang(word) {
  if (UK_ONLY.test(word)) return 'uk';   // є і/ї/є/ґ → точно українське
  if (RU_ONLY.test(word)) return 'ru';   // є ё/ы/э/ъ → точно російське
  return 'common';                        // спільна кирилиця — невизначено
}

// Чи потрібно транслітерувати слово?
export function needsTranslit(word) {
  if (!word || !/[а-яёА-ЯЁіІїЇєЄ]/.test(word)) return false; // немає кирилиці
  const lang = detectLang(word);
  if (lang === 'uk') return false;   // вже українське — не чіпати
  if (lang === 'ru') return true;    // точно російське — транслітерувати
  return true; // 'common' — транслітерація безпечна (результат = вхід для спільних літер)
}

export function hasRussianChars(s) {
  return RU_ONLY.test(s);
}
