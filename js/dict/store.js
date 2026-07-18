import { state } from '../state.js';
import { DEFAULT_PATR_DICT } from './defaults.js';
import { initDict, buildDictLookup as buildDictLookupImpl, buildNameMap as buildNameMapImpl } from './sets.js';
import { parseRuPatronymic } from './patronymics.js';

export function initDicts() {
  initDict(); // Pro 17: єдиний плаский довідник (мігрує старі формати, якщо були)

  let patrDict = JSON.parse(localStorage.getItem('gedcom_patr') || 'null');
  if (!patrDict) patrDict = structuredClone(DEFAULT_PATR_DICT);
  state.patrDict = patrDict;
  savePatrDict();
}

export function savePatrDict() {
  localStorage.setItem('gedcom_patr', JSON.stringify(state.patrDict));
}

// Додає (або оновлює) переклад по-батькові з вкладки «Непереведені» — стать вгадуємо
// за суфіксом слова (якщо воно розпізнається як по-батькові), інакше типово чоловіча.
export function addLearnedPatr(ru, uk) {
  const parsed = parseRuPatronymic(ru);
  const sex = parsed?.sex || 'M';
  const existing = state.patrDict.find(e => e.ru.toLowerCase() === ru.toLowerCase());
  if (existing) { existing.uk = uk; existing.sex = sex; }
  else state.patrDict.push({ ru, uk, sex, learned: true });
  savePatrDict();
}

// Бере дані з єдиного довідника (Pro 17)
export function buildDictLookup(type) {
  return buildDictLookupImpl(type);
}

export function buildNameMap(nameMode = 'historical') {
  return buildNameMapImpl(nameMode);
}
