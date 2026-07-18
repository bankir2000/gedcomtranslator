// ===================== ОРФОГРАФІЧНІ ПОМИЛКИ (ім'я / по-батькові / прізвище) =====================
// Працює ЗАВЖДИ з оригінальним (нередагованим) текстом файлу — щоб бачити
// помилки в первинних даних, а не наслідки перекладу. Два незалежні джерела
// підозри, які застосовуються РАЗОМ:
//  1. Прості правила без довідника — явні ознаки друкарської помилки
//     (латиниця серед кирилиці, цифра в імені, потрійні літери тощо).
//  2. Звірка з довідником застосунку: якщо слово НЕ є точним збігом з жодним
//     відомим правильним ім'ям/по-батькові/прізвищем, але дуже близьке
//     (1-3 літери різниці, залежно від довжини) до одного з них — це,
//     ймовірно, описка вже відомого слова.
import { scanCategory } from './wordScan.js';

// ---- Відстань Левенштейна (без зовнішніх бібліотек — рядки короткі, тож продуктивність не проблема) ----
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

const CYRILLIC_RE = /[а-яґєіїА-ЯҐЄІЇ]/;
const LATIN_RE = /[a-zA-Z]/;
const DIGIT_RE = /\d/;
const TRIPLE_LETTER_RE = /(.)\1\1/; // та сама літера підряд 3+ рази
const BAD_CHARS_RE = /[^а-яґєіїА-ЯҐЄІЇa-zA-Z'’ʼ-]/; // усе, крім букв/апострофа/дефіса

function ruleBasedIssues(word) {
  const issues = [];
  if (LATIN_RE.test(word)) issues.push(CYRILLIC_RE.test(word) ? 'латинські літери серед кириличних' : 'записано латиницею');
  if (DIGIT_RE.test(word)) issues.push('містить цифру');
  if (TRIPLE_LETTER_RE.test(word)) issues.push('літера повторюється 3+ рази підряд');
  if (BAD_CHARS_RE.test(word)) issues.push('незвичний символ');
  if (word.length >= 2 && /^[а-яґєіїa-z]/.test(word)) issues.push('починається з малої літери');
  return issues;
}

// Максимально допустима відстань для "це, ймовірно, описка" — залежить від
// довжини слова: для коротких слів навіть 1 літера різниці вже істотна.
function maxTypoDistance(len) {
  if (len <= 4) return 1;
  if (len <= 8) return 2;
  return 3;
}

// Знаходить найближчий запис довідника для слова (лише якщо це НЕ точний
// збіг і відстань в межах порогу).
function findClosestDictMatch(word, dictWords) {
  const wl = word.toLowerCase();
  if (dictWords.has(wl)) return null; // точний збіг — усе гаразд
  const maxDist = maxTypoDistance(wl.length);
  let best = null, bestDist = Infinity;
  for (const dw of dictWords) {
    if (Math.abs(dw.length - wl.length) > maxDist) continue; // швидкий відсів
    const d = levenshtein(wl, dw);
    if (d > 0 && d <= maxDist && d < bestDist) { bestDist = d; best = dw; }
  }
  return best;
}

// По-батькові рахуємо окремо від wordScan.scanCategory('name') — там вони
// свідомо ВИКЛЮЧЕНІ з категорії "ім'я" (isPatronymic-фільтр). Той самий принцип
// позиції слова, що й в engine/familysearchReport.js: перший токен GIVN/NAME —
// завжди ім'я, решта — по-батькові.
function scanPatronymicWords(rawContent) {
  const found = new Map();
  const bump = w => { if (w) found.set(w, (found.get(w) || 0) + 1); };
  for (const line of rawContent.split(/\r?\n/)) {
    const m = line.match(/^\d+ (\S+)(?: (.*))?$/);
    if (!m) continue;
    const tag = m[1];
    const rawVal = m[2] || '';
    if (!rawVal) continue;
    let givnRaw = '';
    if (tag === 'GIVN') givnRaw = rawVal;
    else if (tag === 'NAME') givnRaw = rawVal.split('/')[0];
    else continue;
    const tokens = givnRaw.trim().split(/\s+/).filter(Boolean);
    for (const w of tokens.slice(1)) bump(w);
  }
  return found;
}

/**
 * Будує звіт про ймовірні орфографічні помилки. rawContent — ЗАВЖДИ
 * оригінальний текст файлу (не перекладений). dict — єдиний довідник
 * застосунку (state.dict, записи type 'name'/'surn'), patrDict — довідник
 * по-батькові (state.patrDict).
 */
export function buildSpellingReport(rawContent, dict, patrDict) {
  const results = [];

  const dictWords = {
    name: new Set(dict.filter(e => e.type === 'name' && e.ru).map(e => e.ru.toLowerCase())),
    surn: new Set(dict.filter(e => e.type === 'surn' && e.ru).map(e => e.ru.toLowerCase())),
    patr: new Set((patrDict || []).filter(e => e.ru).map(e => e.ru.toLowerCase())),
  };

  function check(word, count, dictKey, label) {
    const issues = ruleBasedIssues(word);
    const suggestion = findClosestDictMatch(word, dictWords[dictKey]);
    if (suggestion) issues.push(`схоже на «${suggestion}»`);
    if (issues.length) results.push({ category: label, word, count, issues });
  }

  for (const [word, count] of scanCategory(rawContent, 'name')) check(word, count, 'name', "Ім'я");
  for (const [word, count] of scanCategory(rawContent, 'surn')) check(word, count, 'surn', 'Прізвище');
  for (const [word, count] of scanPatronymicWords(rawContent)) check(word, count, 'patr', 'По-батькові');

  results.sort((a, b) => b.count - a.count);
  return results;
}
