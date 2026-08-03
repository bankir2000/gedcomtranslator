// ===================== ПАРСЕР СТРУКТУРИ + АНАЛІЗ (Етап 4) =====================
import { isPatronymic } from '../dict/patronymics.js';

// Значення SEX буквально різне залежно від мови: оригінал зазвичай 'M'/'F'
// (іноді кирилична 'М' замість латинської — трапляється в деяких експортах),
// перекладений файл — уже 'Ч'/'Ж' (чоловіча/жіноча). Усе, що нижче за
// текстом залежить від статі (колір карток дерева, підбір терміна
// спорідненості, перевірка "стать не переплутана"), звіряється рівно з
// 'M'/'F' — тож нормалізуємо ОДРАЗУ тут, а не в кожному місці окремо.
function normalizeSex(raw) {
  const s = (raw || '').trim().toUpperCase();
  if (s === 'M' || s === 'М' || s === 'Ч') return 'M'; // 'М' тут кирилична
  if (s === 'F' || s === 'Ж') return 'F';
  return '';
}

// Один прохід по файлу будує індекс осіб і сімей з усіма зв'язками.
// Заразом фіксує дублікати XREF-ідентифікаторів (@I5@ двічі в файлі тощо) —
// без цього другий запис із тим самим id просто МОВЧКИ перезаписав би перший
// у Map (втрата даних, яку інакше ніде не видно).
export function buildIndex(rawContent) {
  const lines = rawContent.split(/\r?\n/);
  const individuals = new Map();
  const families = new Map();
  const seenIds = new Map(); // id -> тип першого запису з таким id
  const duplicateIds = []; // { id, type } — записи, що повторили вже зайнятий id
  let cur = null;
  let event = null;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) continue;
    const m = line.match(/^(\d+)\s+(.*)$/);
    if (!m) continue;
    const level = +m[1];
    const rest = m[2];

    if (level === 0) {
      const m0 = rest.match(/^@([^@]+)@\s+(\S+)$/);
      event = null;
      if (m0) {
        const [, id, tag] = m0;
        if (seenIds.has(id)) duplicateIds.push({ id, type: tag });
        else seenIds.set(id, tag);
        if (tag === 'INDI') {
          cur = { type: 'INDI', id, name: '', givn: '', surn: '', sex: '', birt: {}, deat: {}, famc: [], fams: [], fsftid: '', isAnchor: false };
          individuals.set(id, cur);
        } else if (tag === 'FAM') {
          cur = { type: 'FAM', id, husb: null, wife: null, chil: [], marr: {} };
          families.set(id, cur);
        } else {
          cur = null;
        }
      } else {
        cur = null; // HEAD, TRLR тощо
      }
      continue;
    }

    if (!cur) continue;
    const m1 = rest.match(/^(\S+)(?:\s+(.*))?$/);
    if (!m1) continue;
    const tag = m1[1];
    const val = m1[2] || '';

    if (cur.type === 'INDI') {
      if (level === 1) {
        event = null;
        if (tag === 'NAME') cur.name = val;
        else if (tag === 'SEX') cur.sex = normalizeSex(val);
        else if (tag === 'BIRT') event = 'birt';
        else if (tag === 'DEAT') event = 'deat';
        else if (tag === 'FAMC') cur.famc.push(val.replace(/@/g, ''));
        else if (tag === 'FAMS') cur.fams.push(val.replace(/@/g, ''));
        else if (tag === '_FSFTID') cur.fsftid = val.trim();
        else if (tag === '_ANCHOR') cur.isAnchor = val.trim().toUpperCase() === 'Y';
      } else if (level === 2) {
        if (event && tag === 'DATE') cur[event].date = val;
        else if (event && tag === 'PLAC') cur[event].plac = val;
        else if (tag === 'GIVN') cur.givn = val;
        else if (tag === 'SURN') cur.surn = val;
      }
    } else if (cur.type === 'FAM') {
      if (level === 1) {
        event = null;
        if (tag === 'HUSB') cur.husb = val.replace(/@/g, '');
        else if (tag === 'WIFE') cur.wife = val.replace(/@/g, '');
        else if (tag === 'CHIL') cur.chil.push(val.replace(/@/g, ''));
        else if (tag === 'MARR') event = 'marr';
      } else if (level === 2 && event === 'marr') {
        if (tag === 'DATE') cur.marr.date = val;
        else if (tag === 'PLAC') cur.marr.plac = val;
      }
    }
  }
  return { individuals, families, duplicateIds };
}

export function yearOf(dateStr) {
  if (!dateStr) return null;
  const m = dateStr.match(/(\d{3,4})\s*$/) || dateStr.match(/(\d{3,4})/);
  return m ? +m[1] : null;
}

// ---------- СТАТИСТИКА ----------
export function computeStats(individuals, families) {
  let male = 0, female = 0, unknownSex = 0;
  let withBirth = 0, withDeath = 0, withBoth = 0, isolated = 0, withFsftid = 0;
  let minYear = Infinity, maxYear = -Infinity;
  let lifespanSum = 0, lifespanCount = 0;

  for (const p of individuals.values()) {
    const s = (p.sex || '').toUpperCase();
    if (s === 'M' || s === 'М' || s === 'Ч') male++;
    else if (s === 'F' || s === 'Ж') female++;
    else unknownSex++;

    if (p.fsftid) withFsftid++;

    const by = yearOf(p.birt.date);
    const dy = yearOf(p.deat.date);
    if (by) { withBirth++; minYear = Math.min(minYear, by); maxYear = Math.max(maxYear, by); }
    if (dy) { withDeath++; minYear = Math.min(minYear, dy); maxYear = Math.max(maxYear, dy); }
    if (by && dy) { withBoth++; if (dy >= by && dy - by < 130) { lifespanSum += (dy - by); lifespanCount++; } }
    if (p.famc.length === 0 && p.fams.length === 0) isolated++;
  }

  return {
    totalIndividuals: individuals.size,
    totalFamilies: families.size,
    male, female, unknownSex,
    withBirth, withDeath, withBoth,
    isolated, withFsftid,
    yearRange: isFinite(minYear) ? [minYear, maxYear] : null,
    avgLifespan: lifespanCount ? Math.round(lifespanSum / lifespanCount) : null,
  };
}

// ---------- ЄДИНА ОЦІНКА ЯКОСТІ ФАЙЛУ ("Tree Health Score") ----------
// Ідея — не наша: подібний композитний бал є в кількох незалежних онлайн-
// валідаторах GEDCOM (напр. GEDminer: повнота/джерела/узгодженість). Ми не
// відстежуємо джерела (SOUR/цитати) взагалі, тож рахуємо з того, що реально
// вимірюємо в цьому застосунку: повнота дат і _FSFTID, зв'язність дерева
// (яка частка осіб узагалі приєднана до когось) і узгодженість (структурні
// помилки/попередження з validateStructure).
export function computeHealthScore(stats, issues) {
  const total = stats.totalIndividuals || 0;
  if (!total) return { score: 0, label: 'Немає даних', completeness: 0, connectivity: 0, consistency: 0 };

  const completeness = (stats.withBirth / total + stats.withFsftid / total) / 2;
  const connectivity = 1 - (stats.isolated / total);
  const errorCount = issues.filter(i => i.level === 'error').length;
  const warnCount = issues.filter(i => i.level === 'warning').length;
  const consistency = Math.max(0, 1 - (errorCount * 2 + warnCount) / total);

  const score = Math.round(100 * (0.35 * completeness + 0.25 * connectivity + 0.40 * consistency));
  const label = score >= 90 ? 'Відмінно' : score >= 75 ? 'Добре' : score >= 55 ? 'Задовільно' : 'Потребує уваги';

  return {
    score, label,
    completeness: Math.round(completeness * 100),
    connectivity: Math.round(connectivity * 100),
    consistency: Math.round(consistency * 100),
  };
}


export function validateStructure(individuals, families, duplicateIds = []) {
  const issues = [];
  const add = (level, message, ref) => issues.push({ level, message, ref });

  // Дублікат XREF-ідентифікатора — це не "просто попередження": другий запис
  // із тим самим @id@ МОВЧКИ перезаписав перший при розборі файлу (і в цьому
  // застосунку, і в будь-якому іншому, що читає GEDCOM у Map/словник за id).
  // Дані першого запису фактично втрачені — виправляти треба у вихідному
  // файлі (перенумерувати один із конфліктних id), а не тут.
  for (const d of duplicateIds) {
    add('error', `Повторний ідентифікатор @${d.id}@ (${d.type}) — другий запис перезаписав перший, дані втрачено`, `@${d.id}@`);
  }
  // Особу показуємо за її _FSFTID (це те, що реально шукають у FamilySearch).
  // Внутрішній локальний @I..@ показуємо лише як запасний варіант, якщо _FSFTID відсутній.
  const indiRef = p => p.fsftid ? `(${p.fsftid})` : `@${p.id}@`;

  // Групуємо за _FSFTID заздалегідь — знадобиться і для конфліктів, і для дублікатів.
  const byFsftid = new Map();
  for (const p of individuals.values()) {
    if (!p.fsftid) continue;
    if (!byFsftid.has(p.fsftid)) byFsftid.set(p.fsftid, []);
    byFsftid.get(p.fsftid).push(p);
  }
  // Якщо в одного FamilySearch ID різні прізвище/ім'я/рік народження в межах цього файлу —
  // це майже напевно помилка імпорту/об'єднання, а не просто "схожі люди".
  for (const [fsftid, group] of byFsftid) {
    if (group.length < 2) continue;
    const surns = new Set(group.map(p => (p.surn || '').trim().toLowerCase()));
    const givns = new Set(group.map(p => (p.givn || '').trim().toLowerCase()));
    const years = new Set(group.map(p => yearOf(p.birt.date)).filter(Boolean));
    if (surns.size > 1 || givns.size > 1 || years.size > 1) {
      add('error', `Однаковий _FSFTID (${fsftid}) у ${group.length} записів, але дані різняться — ймовірна помилка об'єднання`, group.map(p => `@${p.id}@`).join(', '));
    }
  }

  for (const p of individuals.values()) {
    if (!p.name || !p.name.replace(/\//g, '').trim()) add('error', `Особа без імені`, indiRef(p));
    const by = yearOf(p.birt.date), dy = yearOf(p.deat.date);
    if (by && dy && dy < by) add('error', `Дата смерті раніша за дату народження`, indiRef(p));
    for (const fid of p.famc) {
      if (!families.has(fid)) add('error', `FAMC посилається на неіснуючу сім'ю @${fid}@`, indiRef(p));
      else if (!families.get(fid).chil.includes(p.id)) add('warning', `Особа вказує FAMC на @${fid}@, але сім'я не має її серед дітей`, indiRef(p));
    }
    for (const fid of p.fams) {
      if (!families.has(fid)) add('error', `FAMS посилається на неіснуючу сім'ю @${fid}@`, indiRef(p));
      else {
        const f = families.get(fid);
        if (f.husb !== p.id && f.wife !== p.id) add('warning', `Особа вказує FAMS на @${fid}@, але не записана там чоловіком/дружиною`, indiRef(p));
      }
    }
  }

  for (const f of families.values()) {
    if (f.husb && !individuals.has(f.husb)) add('error', `HUSB посилається на неіснуючу особу @${f.husb}@`, `@${f.id}@`);
    if (f.wife && !individuals.has(f.wife)) add('error', `WIFE посилається на неіснуючу особу @${f.wife}@`, `@${f.id}@`);
    // Стать не переплутана: у HUSB очікується чоловіча, у WIFE — жіноча
    // (той самий принцип, що й у "Check and Repair" в Gramps). Якщо стать
    // невідома (SEX відсутній) — мовчимо, тут судити нема з чого.
    const husbP = f.husb && individuals.get(f.husb);
    const wifeP = f.wife && individuals.get(f.wife);
    if (husbP && husbP.sex === 'F') add('warning', `У ролі HUSB записана особа жіночої статі`, indiRef(husbP));
    if (wifeP && wifeP.sex === 'M') add('warning', `У ролі WIFE записана особа чоловічої статі`, indiRef(wifeP));
    for (const cid of f.chil) {
      if (!individuals.has(cid)) add('error', `CHIL посилається на неіснуючу особу @${cid}@`, `@${f.id}@`);
    }
    if (!f.husb && !f.wife && f.chil.length === 0) add('warning', `Порожня сім'я (немає ні подружжя, ні дітей)`, `@${f.id}@`);
  }

  return issues.sort((a, b) => (a.level === 'error' ? 0 : 1) - (b.level === 'error' ? 0 : 1));
}

// Позиційний розбір ПІБ — та сама логіка, що й у звіті FamilySearch: перше
// слово GIVN — ім'я, решта — по батькові; якщо GIVN/SURN окремо не заповнені,
// беремо їх із NAME "Ім'я По-батькові /Прізвище/".
function nameParts(p) {
  let givnRaw = p.givn || '';
  let surnRaw = p.surn || '';
  if (!givnRaw && p.name) {
    const m = p.name.match(/^([^/]*)\//);
    givnRaw = m ? m[1].trim() : p.name.replace(/\//g, '').trim();
  }
  if (!surnRaw && p.name) {
    const m = p.name.match(/\/([^/]*)\//);
    if (m) surnRaw = m[1].trim();
  }
  const tokens = givnRaw.trim().split(/\s+/).filter(Boolean);
  return { given: tokens[0] || '', patronymic: tokens.slice(1).join(' '), surname: surnRaw };
}

// Коли точної дати народження нема, пробуємо оцінити рік із непрямих ознак —
// за спаданням надійності: наймолодша дитина (типовий вік батьківства ~25),
// дата шлюбу (типовий вік одруження ~23), рік народження подружжя (умовно
// ровесники), дата смерті (середня тривалість життя ~65 років).
function estimateBirthYear(p, individuals, families) {
  const childYears = [];
  for (const famId of p.fams) {
    const f = families.get(famId);
    if (!f) continue;
    for (const cid of f.chil) {
      const c = individuals.get(cid);
      const cy = c && yearOf(c.birt.date);
      if (cy) childYears.push(cy);
    }
  }
  if (childYears.length) return Math.min(...childYears) - 25;

  for (const famId of p.fams) {
    const f = families.get(famId);
    const my = f && yearOf(f.marr && f.marr.date);
    if (my) return my - 23;
  }

  for (const famId of p.fams) {
    const f = families.get(famId);
    if (!f) continue;
    const spouseId = f.husb === p.id ? f.wife : (f.wife === p.id ? f.husb : null);
    const spouse = spouseId && individuals.get(spouseId);
    const sy = spouse && yearOf(spouse.birt.date);
    if (sy) return sy;
  }

  const dy = yearOf(p.deat.date);
  if (dy) return dy - 65;

  return null;
}

// ---------- ОБРИВИ ДЕРЕВА (межі завантаженої частини) ----------
// Мета: показати РІВНО ті точки, звідки можна дозавантажити ще на FamilySearch,
// замість перевіряти вручну чи перезавантажувати все дерево.
// Дві категорії:
//  1) "items" — конкретні ОСОБИ з підтвердженим _FSFTID, у яких дерево обривається:
//     або в них узагалі немає запису про батьків (FAMC), або FAMC є, але вказує
//     на сім'ю, якої в файлі нема (розірваний імпорт). У кожному разі _FSFTID цієї
//     особи — точна адреса, з якої на FamilySearch продовжувати докачування.
//  2) "familyGaps" — сім'ї, де одного з учасників (чоловіка/дружини/дитини) немає
//     у файлі. Свого _FSFTID у відсутньої людини по визначенню нема (її запису
//     немає взагалі), тому як орієнтир даємо _FSFTID того з подружжя, хто Є у файлі.
export function findTreeBreaks(individuals, families) {
  // Звіт показує лише осіб, які ОДНОЧАСНО відповідають усім 4 умовам:
  //  1. Заповнені ім'я, по батькові й прізвище.
  //  2. Рік народження (точний або оцінений з непрямих даних) — 1800..поточний рік.
  //  3. Особі виповнилось 18 років (на момент смерті чи на сьогодні).
  //  4. Немає зв'язку з батьками (FAMC) — тобто саме тут "обривається" гілка вгору.
  // Мета — не просто "усі без батьків", а конкретний, придатний для
  // подальшого генеалогічного пошуку список: реальні дорослі люди historичної
  // доби з достатньо повним записом, а не немовлята чи записи-заглушки.
  const items = [];
  const currentYear = new Date().getFullYear();

  for (const p of individuals.values()) {
    if (p.famc.length > 0) continue; // умова 4

    const { given, patronymic, surname } = nameParts(p);
    if (!given || !patronymic || !surname) continue; // умова 1

    const exactBirth = yearOf(p.birt.date);
    const birthYear = exactBirth || estimateBirthYear(p, individuals, families);
    if (!birthYear || birthYear < 1800 || birthYear > currentYear) continue; // умова 2

    const deathYear = yearOf(p.deat.date);
    const age = (deathYear || currentYear) - birthYear;
    if (age < 18) continue; // умова 3

    items.push({
      id: p.id,
      fsftid: p.fsftid || '',
      name: (p.name || '').replace(/\//g, '').trim() || '(без імені)',
      birthYear,
      birthYearEstimated: !exactBirth,
    });
  }
  items.sort((a, b) => (a.birthYear || 9999) - (b.birthYear || 9999));

  // Розірвані посилання (FAM вказує на особу, якої взагалі немає у файлі) —
  // це інший тип проблеми (биті дані, а не "тут дерево закінчується"), і він
  // вже окремо ловиться в "Перевірці структури". Тут лишаємо тільки для
  // зручності — щоб одразу бачити, кого шукати, коли саме сім'я розірвана.
  const familyGaps = [];
  const gapRow = (f, role, missingId) => {
    const knownId = role === 'чоловік' ? f.wife : role === 'дружина' ? f.husb : null;
    const known = knownId ? individuals.get(knownId) : null;
    familyGaps.push({
      famId: f.id, role, missingId,
      knownName: known ? (known.name || '').replace(/\//g, '').trim() : '',
      knownFsftid: known?.fsftid || '',
    });
  };
  for (const f of families.values()) {
    if (f.husb && !individuals.has(f.husb)) gapRow(f, 'чоловік', f.husb);
    if (f.wife && !individuals.has(f.wife)) gapRow(f, 'дружина', f.wife);
    for (const cid of f.chil) if (!individuals.has(cid)) gapRow(f, 'дитина', cid);
  }

  return { items, familyGaps };
}

// ---------- ПОШУК ДУБЛІКАТІВ ----------
export function findDuplicates(individuals) {
  const byFsftid = new Map();
  const strong = new Map(); // прізвище+ім'я+рік народження
  const weak = new Map();   // прізвище+ім'я (без року)

  for (const p of individuals.values()) {
    if (p.fsftid) {
      if (!byFsftid.has(p.fsftid)) byFsftid.set(p.fsftid, []);
      byFsftid.get(p.fsftid).push(p);
    }

    const surn = (p.surn || '').trim().toLowerCase();
    const givn = (p.givn || '').trim().toLowerCase();
    if (!surn && !givn) continue;
    const by = yearOf(p.birt.date);

    const wKey = `${surn}|${givn}`;
    if (!weak.has(wKey)) weak.set(wKey, []);
    weak.get(wKey).push(p);

    if (by) {
      const sKey = `${surn}|${givn}|${by}`;
      if (!strong.has(sKey)) strong.set(sKey, []);
      strong.get(sKey).push(p);
    }
  }

  // Найвищий рівень: однаковий _FSFTID = це буквально та сама людина у FamilySearch,
  // просто продубльована локально під різними @I..@. Найнадійніший сигнал з усіх.
  const fsftidGroups = [...byFsftid.values()].filter(g => g.length > 1)
    .map(g => ({ confidence: 'дуже висока (однаковий FamilySearch ID)', members: g }));
  const fsftidIds = new Set(fsftidGroups.flatMap(g => g.members.map(m => m.id)));

  const strongGroups = [...strong.values()].filter(g => g.length > 1 && !g.every(p => fsftidIds.has(p.id)))
    .map(g => tagByFsftid(g, 'висока'));

  const strongIds = new Set(strongGroups.flatMap(g => g.members.map(m => m.id)));
  const weakGroups = [...weak.values()].filter(g => g.length > 1 && !g.every(p => strongIds.has(p.id) || fsftidIds.has(p.id)))
    .map(g => tagByFsftid(g, 'середня'));

  const all = [...fsftidGroups, ...strongGroups, ...weakGroups];
  return all.sort((a, b) => (a.distinctFsftid ? 1 : 0) - (b.distinctFsftid ? 1 : 0));
}

// Якщо всі члени групи (зібраної за прізвище+ім'я[+рік]) мають РІЗНІ _FSFTID —
// це майже напевно різні реальні люди з FamilySearch, а не помилка дублювання,
// просто збіг імені/року в одному селі. Позначаємо це прямо, щоб не змушувати
// вручну перевіряти кожну таку групу.
function tagByFsftid(members, baseConfidence) {
  const ids = members.map(m => m.fsftid).filter(Boolean);
  const allHaveFsftid = ids.length === members.length;
  const allDistinct = new Set(ids).size === ids.length;
  if (allHaveFsftid && allDistinct && ids.length > 1) {
    return { confidence: `${baseConfidence} → ймовірно РІЗНІ люди (різні _FSFTID)`, members, distinctFsftid: true };
  }
  return { confidence: baseConfidence, members, distinctFsftid: false };
}

// ---------- ЧАСТОТНИЙ АНАЛІЗ ----------
export function analyzeFrequencies(individuals, families) {
  const surnames = new Map(), givens = new Map(), places = new Map();
  const bump = (map, key) => { if (!key) return; map.set(key, (map.get(key) || 0) + 1); };

  for (const p of individuals.values()) {
    bump(surnames, (p.surn || '').trim());
    // GIVN у цих експортах часто містить "Ім'я По-батькові" одним полем (напр. "Іван Петрович").
    // По-батькові — не ім'я, тож не рахуємо його в частоті імен, інакше "Петрович"/"Іванівна"
    // тощо засмічують топ найпопулярніших "імен".
    for (const g of (p.givn || '').trim().split(/\s+/)) { if (!isPatronymic(g)) bump(givens, g); }
    bump(places, (p.birt.plac || '').trim());
    bump(places, (p.deat.plac || '').trim());
  }
  for (const f of families.values()) bump(places, (f.marr.plac || '').trim());
  places.delete('');

  const sortAll = map => [...map.entries()].sort((a, b) => b[1] - a[1]);
  const allSurnames = sortAll(surnames), allGivens = sortAll(givens), allPlaces = sortAll(places);
  return {
    // Топ-25 — для наочного графіка на екрані (більше рядків нечитабельно як бар-чарт).
    surnames: allSurnames.slice(0, 25), givens: allGivens.slice(0, 25), places: allPlaces.slice(0, 25),
    // Повні списки — для завантажуваного звіту й вкладки, де потрібні саме ВСІ унікальні значення.
    allSurnames, allGivens, allPlaces,
    uniqueSurnames: surnames.size, uniqueGivens: givens.size, uniquePlaces: places.size,
  };
}

export function runFullAnalysis(rawContent) {
  const { individuals, families, duplicateIds } = buildIndex(rawContent);
  const stats = computeStats(individuals, families);
  const issues = validateStructure(individuals, families, duplicateIds);
  return {
    stats,
    issues,
    health: computeHealthScore(stats, issues),
    duplicates: findDuplicates(individuals),
    freq: analyzeFrequencies(individuals, families),
    treeBreaks: findTreeBreaks(individuals, families),
    individuals, families,
  };
}
