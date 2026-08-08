import { translitRuUk, escapeRe } from '../core/translit.js';
import { needsTranslit, hasRussianChars } from '../core/language.js';
import { isPatronymic, translatePatronymic, translatePatronimicsInString } from '../dict/patronymics.js';

export const VALUE_MAP = {'М':'Ч','M':'Ч','Ж':'Ж','F':'Ж','женат':'одружений','женат.':'одружений','замужем':'одружена','замужем.':'одружена','разведен':'розлучений','разведена':'розлучена','вдовец':'вдівець','вдова':'вдова','холост':'неодружений','не замужем':'незаміжня','православный':'православний','православная':'православна','католик':'католик','католичка':'католичка','крещение':'хрещення','венчание':'вінчання','погребение':'поховання','похороны':'похорони','рождение':'народження','смерть':'смерть','брак':'шлюб'};

export function applyDictToValue(val, entries, nameMode = 'historical') {
  for (const e of entries) {
    const uk = (nameMode === 'modern' && e.ukModern) ? e.ukModern : e.uk;
    const re = new RegExp('(?<![а-яёА-ЯЁіїєґІЇЄҐa-zA-Z])' + escapeRe(e.ru) + '(?![а-яёА-ЯЁіїєґІЇЄҐa-zA-Z])', 'g');
    val = val.replace(re, uk);
  }
  return val;
}

function safeTranslit(word) {
  if (!needsTranslit(word)) return word;
  return translitRuUk(word);
}
function safeTranslitStr(str) {
  return str.split(/(\s+)/).map(t => /^\s+$/.test(t) ? t : safeTranslit(t)).join('');
}

// Режим прізвищ: не перекладати / лише транслітерувати / лише за словником.
// «За словником» свідомо НЕ здогадується для невідомих прізвищ — офіційне прізвище
// не можна "виправляти" граматично (Жорновой не повинен самовільно стати Жорновий).
// Повертає { val, method } — method потрібен, щоб вкладка «Перегляд змін» могла
// позначити ненадійні (авто-транслітеровані) заміни окремим бейджем.
function applySurname(val, dictEntries, surnameMode) {
  if (surnameMode === 'none') return { val, method: null };
  if (surnameMode === 'translit') return { val: translitRuUk(val), method: 'translit' };
  const nv = applyDictToValue(val, dictEntries.surn);
  return { val: nv, method: nv !== val ? 'dict' : null };
}

export function translateLine(line, opts, dictEntries, currentSex) {
  const m = line.match(/^(\d+ \S+)(?: (.*))?$/);
  if (!m) return { line, count: 0, sex: currentSex, methods: [] };
  const prefix = m[1];
  let val = m[2] || '';
  const tag = prefix.split(' ').pop();
  let changed = 0;
  let sex = currentSex;
  // Набір методів, застосованих до цього рядка: 'dict' | 'translit' | 'patr' | 'value'.
  // 'translit' сигналізує "результат не перевірений словником, варто перевірити вручну".
  const methods = new Set();

  if (tag === 'SEX') {
    const s = val.trim().toUpperCase();
    if (s === 'M' || s === 'М') sex = 'M';
    else if (s === 'F' || s === 'Ж') sex = 'F';
    const mapped = VALUE_MAP[val] || VALUE_MAP[val.toLowerCase()];
    if (mapped && mapped !== val) { val = mapped; changed++; methods.add('value'); }
  }

  if (['MARR', 'RELI', 'TYPE'].includes(tag)) {
    const mapped = VALUE_MAP[val] || VALUE_MAP[val.toLowerCase()];
    if (mapped && mapped !== val) { val = mapped; changed++; methods.add('value'); }
  }

  // DATE свідомо НЕ чіпаємо: це стандартизоване машинозчитуване поле GEDCOM
  // (назви місяців там фіксовані специфікацією, не текст для читання людиною),
  // а не текст для перекладу — переклад назв місяців ламає сумісність з іншими
  // генеалогічними програмами, які парсять цей формат.

  // ABBR/TITL (скорочена й повна назва джерела) навмисно ДОДАНО сюди, а не
  // лише "чисті" геотеги: у цьому типі експорту назви джерел часто містять
  // місце прямо в тексті ("Україна, Черкаська губ., сповідні відомості..."),
  // і словник місць застосовується substring-пошуком — тож коректно
  // спрацює й тут, навіть якщо це не єдиний вміст поля.
  const placeTagRe = /^(PLAC|CITY|STAE|CTRY|ADDR|ADR1|ADR2|ABBR|TITL)$/;
  if (opts.places && val && placeTagRe.test(tag)) {
    const orig = val;
    val = applyDictToValue(val, dictEntries.place);
    const isCitationTag = tag === 'ABBR' || tag === 'TITL';
    if (opts.translitAuto && !isCitationTag && val === orig) { const t = safeTranslitStr(val); if (t !== val) { val = t; changed++; methods.add('translit'); } }
    else if (val !== orig) { changed++; methods.add('dict'); }
  }

  if ((opts.names || opts.patr) && val && tag === 'GIVN') {
    const orig = val;
    const tokens = val.split(/\s+/);
    const translated = tokens.map(tok => {
      if (opts.patr && isPatronymic(tok)) { const t = translatePatronymic(tok, sex, opts.nameMode); if (t !== tok) methods.add('patr'); return t; }
      if (opts.names) {
        const t = applyDictToValue(tok, dictEntries.name, opts.nameMode);
        if (t !== tok) methods.add('dict');
        // Немає збігу в словнику — лишаємо токен як є (без автотранслітерації).
        // Він з'явиться у «Непереведених», де переклад можна додати вручну.
        return t;
      }
      return tok;
    });
    val = translated.join(' ');
    if (val !== orig) changed++;
  }

  if (opts.patr && val && tag === '_PATR') {
    const orig = val;
    val = translatePatronimicsInString(val, sex, opts.nameMode);
    if (val !== orig) { methods.add('patr'); changed++; }
    // Без автотранслітерації: якщо суфікс/корінь не розпізнано, translatePatronimicsInString
    // повертає слово незмінним — воно потрапить у «Непереведені» замість сумнівної здогадки.
  }

if (opts.surn && val && (tag === 'SURN' || tag === 'NSFX')) {
    // NSFX у цьому типі експорту нерідко несе друге/вуличне прізвище — застосовуємо
    // той самий словник прізвищ, що й до SURN.
    const orig = val;
    const r = applySurname(val, dictEntries, opts.surnameMode);
    val = r.val;
    if (r.method) methods.add(r.method);
    if (val !== orig) changed++;
  }

  if (opts.names && val && tag === 'NPFX') {
    // NPFX у цьому типі експорту виявився "звалищем" різного: соціальні терміни
    // (селянин, міщанин), повні імена, і навіть по-батькові (Трофимова, Онисимов).
    // Тому обробляємо потокенно тим самим набором правил, що й GIVN.
    const orig = val;
    const tokens = val.split(/\s+/);
    const translated = tokens.map(tok => {
      if (opts.patr && isPatronymic(tok)) { const t = translatePatronymic(tok, sex, opts.nameMode); if (t !== tok) methods.add('patr'); return t; }
      const t = applyDictToValue(tok, [...dictEntries.name, ...dictEntries.surn, ...dictEntries.other], opts.nameMode);
      if (t !== tok) methods.add('dict');
      return t;
    });
    val = translated.join(' ');
    if (val !== orig) changed++;
  }

  if ((opts.names || opts.surn || opts.patr) && val && tag === 'NAME') {
    const orig = val;
    val = val.replace(/\/([^/]*)\//, (_, s) => {
      if (!opts.surn) return `/${s}/`;
      const r = applySurname(s, dictEntries, opts.surnameMode);
      if (r.method) methods.add(r.method);
      return `/${r.val}/`;
    });
    val = val.replace(/^([^/]+)/, part => {
      const tokens = part.trim().split(/\s+/);
      const tr = tokens.map(tok => {
        if (opts.patr && isPatronymic(tok)) { const t = translatePatronymic(tok, sex, opts.nameMode); if (t !== tok) methods.add('patr'); return t; }
        if (opts.names) {
          const t = applyDictToValue(tok, dictEntries.name, opts.nameMode);
          if (t !== tok) methods.add('dict');
          return t;
        }
        return tok;
      });
      return tr.join(' ') + (part.endsWith(' ') ? ' ' : '');
    });
    if (val !== orig) changed++;
  }

  if (opts.notes && val && ['NOTE', 'TEXT', 'CONC', 'CONT'].includes(tag)) {
    const orig = val;
    val = applyDictToValue(val, [...dictEntries.name, ...dictEntries.surn, ...dictEntries.place, ...dictEntries.other], opts.nameMode);
    if (opts.translitAuto && val === orig) { const t = safeTranslitStr(val); if (t !== val) { val = t; changed++; methods.add('translit'); } }
    else if (val !== orig) { changed++; methods.add('dict'); }
  }

  const newLine = val ? `${prefix} ${val}` : prefix;
  return { line: newLine, count: changed, sex, methods: [...methods] };
}

const NAME_TAGS = new Set(['GIVN', 'NAME', '_MARNM', 'NICK', '_PATR', 'NPFX']);
const SURN_TAGS = new Set(['SURN', 'NSFX']);
const PLACE_TAGS = new Set(['PLAC', 'CITY', 'STAE', 'CTRY', 'ADDR', 'ADR1', 'ADR2']);
const DATE_TAGS = new Set(['DATE']);

export function tagCategory(tag) {
  if (NAME_TAGS.has(tag)) return 'names';
  if (SURN_TAGS.has(tag)) return 'surn';
  if (PLACE_TAGS.has(tag)) return 'places';
  if (DATE_TAGS.has(tag)) return 'dates';
  return 'other';
}

export function highlightDiff(orig, translated, escHtml) {
  const ow = orig.split(/(\s+)/);
  const tw = translated.split(/(\s+)/);
  let html = '';
  for (let i = 0; i < tw.length; i++) {
    if (ow[i] === tw[i]) html += escHtml(tw[i]);
    else html += `<span class="diff-hl">${escHtml(tw[i] || '')}</span>`;
  }
  return html;
}

export function collectUntranslated(lines, origLines) {
  // Прибирає розділові знаки з країв слова (кома, крапка, дужки, лапки тощо),
  // інакше в списку з'являються "слова" на кшталт "Кирилівка," замість "Кирилівка".
  const stripPunct = w => w.replace(/^[^а-яёА-ЯЁіІїЇєЄ]+|[^а-яёА-ЯЁіІїЇєЄ]+$/g, '');

  // Прохід 1: для кожної особи (@I..@) знаходимо її _FSFTID, незалежно від того,
  // де саме в записі цей рядок стоїть (до чи після NAME/GIVN).
  const fsftidById = new Map();
  {
    let curId = null;
    for (const line of lines) {
      const m0 = line.match(/^0 @([^@]+)@ INDI/);
      if (m0) { curId = m0[1]; continue; }
      if (/^0 /.test(line)) { curId = null; continue; }
      const mf = line.match(/^1 _FSFTID (.+)$/);
      if (mf && curId) fsftidById.set(curId, mf[1].trim());
    }
  }

  // Прохід 2: той самий обхід, що й вище, але тепер знаємо fsftid одразу для кожного рядка.
  const fsftidOf = (() => {
    let curId = null;
    const perLine = new Array(lines.length);
    for (let i = 0; i < lines.length; i++) {
      const m0 = lines[i].match(/^0 @([^@]+)@ INDI/);
      if (m0) curId = m0[1];
      else if (/^0 /.test(lines[i])) curId = null;
      perLine[i] = curId ? (fsftidById.get(curId) || null) : null;
    }
    return i => perLine[i];
  })();

  const wordMap = new Map();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\d+ (\S+) (.+)$/);
    if (!m) continue;
    const tag = m[1].split(' ').pop();
    const val = m[2];
    if (!/[а-яёА-ЯЁіІїЇєЄ]/.test(val)) continue;
    // Для NAME окремо визначаємо, яка частина слова походить із /прізвища/ —
    // це важливо для дефолтного типу в "Непереведених" (щоб прізвище всередині
    // складеного NAME не пропонувалось як "Ім'я" за замовчуванням).
    let surnamePart = '';
    if (tag === 'NAME') { const sm = val.match(/\/([^/]*)\//); if (sm) surnamePart = sm[1]; }
    const words = val.replace(/\//g, ' ').split(/\s+/);
    for (let w of words) {
      w = stripPunct(w);
      if (w.length < 2) continue;
      if (!hasRussianChars(w)) continue;
      const key = w.toLowerCase();
      const effectiveTag = (tag === 'NAME' && surnamePart.includes(w)) ? 'SURN' : tag;
      if (!wordMap.has(key)) wordMap.set(key, { word: w, count: 0, contexts: [], tag: effectiveTag });
      const entry = wordMap.get(key);
      entry.count++;
      if (entry.contexts.length < 3) entry.contexts.push({ line: origLines[i], fsftid: fsftidOf(i) });
    }
  }
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === origLines[i] && /[а-яёА-ЯЁ]/.test(lines[i])) {
      const m = lines[i].match(/^\d+ (\S+) (.+)$/);
      if (!m) continue;
      const tag = m[1].split(' ').pop();
      // SURN і NSFX виключено навмисно: більшість українських прізвищ (-енко, -ук, -ко, -ій тощо)
      // ідентичні в обох мовах, і незмінність тут — правильний результат, а не помилка.
      // NSFX у цьому типі експорту нерідко містить друге/вуличне прізвище — та сама логіка.
      const skip = new Set(['HEAD', 'SOUR', 'DEST', 'DATE', 'GEDC', 'CHAR', 'SUBM', 'FILE', 'VERS', 'CORP', 'ADDR', 'NOTE', 'CONC', 'CONT', 'TEXT', 'SURN', 'NSFX']);
      if (skip.has(tag)) continue;
      let val = m[2];
      if (tag === 'NAME') {
        // У "1 NAME Ім'я /Прізвище/" перевіряємо тільки ім'я — прізвище в /слешах/
        // з тієї ж причини, що й вище для SURN.
        val = val.replace(/\/[^/]*\//, ' ');
      }
      const words = val.replace(/\//g, ' ').split(/\s+/);
      for (let w of words) {
        w = stripPunct(w);
        if (w.length < 2) continue;
        // Тут флагуємо лише слова з ЯВНИМИ російськими маркерами (ё/ы/э/ъ), а не будь-яку
        // спільну кирилицю — інакше в список потрапляють уже коректні українські слова
        // (Ганна, Михайло тощо), які просто не мають окремих російських чи українських літер.
        if (!hasRussianChars(w)) continue;
        const key = w.toLowerCase(); // той самий ключ, що й у проході 1 — інакше те саме слово дублюється в списку двічі
        if (!wordMap.has(key)) wordMap.set(key, { word: w, count: 0, contexts: [], tag, unchanged: true });
        const entry = wordMap.get(key);
        entry.count++;
        if (entry.contexts.length < 3) entry.contexts.push({ line: lines[i], fsftid: fsftidOf(i) });
      }
    }
  }
  return [...wordMap.values()].sort((a, b) => b.count - a.count);
}
