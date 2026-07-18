import { state } from '../state.js';
import { buildNameMap } from './store.js';

// Слова, що граматично ВИГЛЯДАЮТЬ як архаїчна присвійна форма по-батькові
// (закінчення -ов/-ева/-ин/-ина тощо), але насправді є звичайними іменами.
// Без цього списку такі імена (якщо стоять у GIVN самі, без окремого по-батькові)
// помилково проганялися б через логіку по-батькові й псувались би.
// Список свідомо неповний — розширюй за потреби, коли трапиться нова колізія.
export const KNOWN_GIVEN_EXCEPTIONS = new Set([
  'параскева', 'параскевия', 'королева',                       // -ева
  'мартин', 'устин', 'юстин', 'иустин',                        // -ин (чоловічі)
  'христина', 'антонина', 'ирина', 'ириина', 'марина', 'полина', 'регина', 'валентина',
  'акилина', 'агрипина', 'галина', 'екатерина', 'мокрина', 'харитина', 'фотина',
  'иустина', 'юстина', 'устина',                                // -ина (жіночі)
]);

// Suffix rules: detect Russian patronymic → extract root → apply Ukrainian suffix
export function parseRuPatronymic(word) {
  const w = word.trim();
  const wl = w.toLowerCase();
  if (KNOWN_GIVEN_EXCEPTIONS.has(wl)) return null;

  const fSuffix = ['овична','евична','ёвична','овна','евна','ёвна','ьевна','ична','инична'];
  const mSuffix = ['ович','евич','ёвич','ьич','ич'];
  const ancientM = ['иев','еев','оев','аев','ьев','иов','еов','оов','аов','ьов',
                    'иїв','єїв','ієв','єв','ов', 'ев', 'ин', 'ын'];
  // Архаїчна жіноча форма («Парасковия Гаврилова» = «дочка Гаврила», «Лукина» =
  // «дочка Луки») — той самий присвійний патерн, що й ancientM, але для жінок.
  // «-ин/-ина» ДУЖЕ неоднозначний суфікс (Ірина, Марина, Христина — звичайні імена
  // з тим самим закінченням), тому такі слова обов'язково звіряються з
  // KNOWN_GIVEN_EXCEPTIONS вище, перш ніж потрапити сюди.
  const ancientF = ['ова','ева','ёва', 'ина', 'ына'];

  for (const s of fSuffix) {
    if (wl.endsWith(s)) return { root: w.slice(0, w.length - s.length), suffix: s, sex: 'F', ancient: false };
  }
  for (const s of mSuffix) {
    if (wl.endsWith(s)) return { root: w.slice(0, w.length - s.length), suffix: s, sex: 'M', ancient: false };
  }
  // Мінімум 5 літер (а не 6) — короткі архаїчні форми теж трапляються реально:
  // Сав+ов=Савов (5), Тит+ов=Титов (5), Іль+їн~Ілиін (5). Менше 5 не пускаємо —
  // такий короткий корінь (1-2 літери) дає забагато випадкових збігів.
  if (w.length >= 5) {
    for (const s of ancientM) {
      if (wl.endsWith(s)) return { root: w.slice(0, w.length - s.length), suffix: s, sex: 'M', ancient: true };
    }
    for (const s of ancientF) {
      if (wl.endsWith(s)) return { root: w.slice(0, w.length - s.length), suffix: s, sex: 'F', ancient: true };
    }
  }
  return null;
}

// Українські суфікси по-батькові — потрібні, коли аналізується вже ПЕРЕКЛАДЕНИЙ
// файл: parseRuPatronymic вище розпізнає лише РОСІЙСЬКІ форми ("Иванович"), тож
// "Іванович"/"Іванівна" (уже перекладені) інакше проходили б як звичайні "імена"
// — зокрема псуючи рейтинг імен у вкладці «Аналіз». На відміну від російських
// архаїчних суфіксів (-ин/-ина, -ов/-ева), українські -ів/-івна практично ніколи
// не збігаються зі звичайними іменами, тож окремий список винятків тут не потрібен.
const UK_PATR_SUFFIXES = ['ович', 'івна', 'ївна', 'ів', 'їв'];
function isUkPatronymic(word) {
  const wl = word.trim().toLowerCase();
  return UK_PATR_SUFFIXES.some(s => wl.length > s.length + 2 && wl.endsWith(s));
}

export function isPatronymic(word) {
  const lo = word.trim().toLowerCase();
  // Ручний словник по-батькові має найвищий пріоритет — якщо слово там є явно,
  // це вже підтверджене по-батькові.
  if (state.patrDict.some(e => e.ru.toLowerCase() === lo)) return true;
  // Якщо слово вже є звичайним іменем у довіднику імен — це ім'я, а не по-батькові,
  // навіть якщо воно граматично збігається з архаїчним суфіксом (Харитина, Фотина,
  // Іустин — усі звичайні імена, що випадково закінчуються на "-ин(а)"/"-ов(а)").
  // Довідник імен — надійніший сигнал, ніж суфіксний патерн, і сам собою росте
  // з часом, тому такі колізії саморозв'язуються в міру наповнення словника.
  if (buildNameMap()[lo]) return false;
  return parseRuPatronymic(word) !== null || isUkPatronymic(word);
}

// Шукає корінь імені в довіднику. Повертає null (а НЕ транслітерацію "навгад"),
// якщо кореня немає в довіднику — по-батькові з невідомим коренем краще лишити
// неперекладеним і показати у «Непереведених», ніж видати сумнівний результат.
function translateRoot(root, nameMap) {
  const lo = root.toLowerCase();
  if (nameMap[lo]) {
    const uk = nameMap[lo];
    return root[0] === root[0].toUpperCase() ? uk[0].toUpperCase() + uk.slice(1) : uk;
  }
  // root+'й' покриває імена на -ей (Тимофей, Сергей, Матфей): суфікс по-батькові
  // з'їдає сполучну голосну разом з "й", тож корінь треба доповнити назад для пошуку в словнику.
  // root+'й' покриває регулярні суфікси на іменах -ей (Тимофей+евич); root+'ей' покриває
  // "древній" суфікс -еев, який відрізає на одну літеру більше (Матф+еев, а не Матфе+ев).
  const stems = [root, root.replace(/й$/, ''), root.replace(/ь$/, ''), root + 'й', root + 'ей', root + 'ий'];
  for (const st of stems) {
    if (nameMap[st.toLowerCase()]) {
      const uk = nameMap[st.toLowerCase()];
      return st[0] === st[0].toUpperCase() ? uk[0].toUpperCase() + uk.slice(1) : uk;
    }
  }
  return null;
}

function nameToPatrRoot(ukName) {
  const n = ukName.trim();
  const exceptions = { 'Ілля':'Ілл','Микола':'Микол','Кузьма':'Кузьм','Лука':'Лук','Сава':'Сав','Фома':'Фом' };
  if (exceptions[n]) return exceptions[n];
  // Імена на «-ій» (Сергій, Матвій, Тимофій) НЕ обрізаємо тут — чоловіча форма додає
  // суфікс до повного імені (Сергійович), а жіноча має особливе злиття й+і→ї,
  // яке обробляє makeUkPatr нижче. Обрізання тут давало неправильне "Матвівна" замість "Матвіївна".
  if (n.endsWith('ій')) return n;
  if (n.endsWith('о')) return n.slice(0, -1);
  if (n.endsWith('ь')) return n.slice(0, -1);
  return n;
}

function makeUkPatr(ukRoot, sex) {
  const r = ukRoot;
  if (sex === 'M') return r + 'ович';
  // й+і зливаються в ї: Сергій+івна -> Сергіївна (а не "Сергійівна")
  if (r.endsWith('ій')) return r.slice(0, -1) + 'ївна';
  return r + 'івна';
}

// ПРИНЦИП: жодного вгадування. Якщо суфікс не розпізнано АБО корінь імені відсутній
// у довіднику — слово лишається як є (незмінним), а не «майже правильно» транслітерується.
// Незмінене слово потрапляє у вкладку «Непереведені», де його видно й можна виправити.
export function translatePatronymic(word, sex, nameMode = 'historical') {
  const w = word.trim();
  if (!w) return w;

  const lo = w.toLowerCase();
  for (const e of state.patrDict) {
    if (e.ru.toLowerCase() === lo && (!e.sex || e.sex === sex || !sex)) return e.uk;
  }
  for (const e of state.patrDict) {
    if (e.ru.toLowerCase() === lo) return e.uk;
  }

  const parsed = parseRuPatronymic(w);
  if (!parsed) return w; // суфікс не розпізнано — не вгадуємо, лишаємо як є

  const nameMap = buildNameMap(nameMode);
  const ukName = translateRoot(parsed.root, nameMap);
  if (ukName === null) return w; // корінь імені невідомий довіднику — так само не вгадуємо
  const patrRoot = nameToPatrRoot(ukName);

  if (parsed.ancient) {
    // «Древня» присвійна форма (Гаврилов «син Гаврила» / Гаврилова «дочка Гаврила») —
    // той самий патерн, що й в українській (Тарасів/Тарасівна): корінь імені + «-ів»/«-івна».
    // Для коренів на «-ій» (Матвій, Тимофій) — те саме злиття й+і→ї, що й у makeUkPatr:
    // Матвій -> Матвіїв (не «Матвійів»).
    if (patrRoot.endsWith('ій')) {
      return patrRoot.slice(0, -1) + (parsed.sex === 'F' ? 'ївна' : 'їв');
    }
    const suffix = parsed.sex === 'F' ? 'івна' : 'ів';
    return patrRoot + suffix;
  }

  return makeUkPatr(patrRoot, parsed.sex || sex || 'M');
}

export function translatePatronimicsInString(val, sex, nameMode = 'historical') {
  return val.split(/(\s+)/).map(token => {
    if (/^\s+$/.test(token)) return token;
    if (isPatronymic(token)) return translatePatronymic(token, sex, nameMode);
    return token;
  }).join('');
}
