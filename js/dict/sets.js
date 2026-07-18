// ===================== ЄДИНИЙ ДОВІДНИК (Pro 17: набори об'єднано в один список) =====================
// До Pro 17 тут були кілька іменованих наборів словників з пріоритетом (Базовий/
// Користувацький/Навчено). За рішенням користувача це ускладнювало роботу без
// реальної користі — тепер є ОДИН плаский список записів {type, ru, uk, ukModern?, gender}.
// type: 'name' | 'surn' | 'place' | 'other'. gender: 'M' | 'F' | '' (не застосовується).
// Записи по-батькові (state.patrDict) залишаються окремим масивом для рушія правил
// (dict/patronymics.js), але відображаються РАЗОМ з цим довідником у вкладці
// «Довідник» як записи типу 'patr' — див. ui/dictUI.js.

import { state } from '../state.js';
import { DEFAULT_DICT } from './defaults.js';

const KEY = 'gedcom_dict_flat_v1';
const OLD_SETS_KEY = 'gedcom_dict_sets_v1'; // формат Pro 2–16 (іменовані набори)
const OLD_FLAT_KEY = 'gedcom_dict'; // формат Pro 2.x (плаский, без gender)

function persist() {
  localStorage.setItem(KEY, JSON.stringify(state.dict));
}

function normalizeEntry(e) {
  return { type: e.type || 'other', ru: e.ru || '', uk: e.uk || '', ukModern: e.ukModern, gender: e.gender || '' };
}

export function initDict() {
  const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (stored && Array.isArray(stored)) {
    state.dict = stored.map(normalizeEntry);
    return;
  }

  // Міграція з попередньої версії з іменованими наборами: об'єднуємо всі УВІМКНЕНІ
  // набори в один список так само, як і раніше комбінувалися для перекладу —
  // «Навчено» має пріоритет, при однаковому ru перемагає перший знайдений.
  const oldSets = JSON.parse(localStorage.getItem(OLD_SETS_KEY) || 'null');
  if (oldSets && Array.isArray(oldSets) && oldSets.length) {
    const ordered = [
      ...oldSets.filter(s => s.source === 'learned' && s.enabled),
      ...oldSets.filter(s => s.source !== 'learned' && s.enabled),
    ];
    const seen = new Map();
    for (const set of ordered) {
      for (const e of set.entries) {
        const key = (e.type || 'other') + '|' + (e.ru || '').toLowerCase();
        if (!seen.has(key)) seen.set(key, normalizeEntry(e));
      }
    }
    state.dict = [...seen.values()];
    persist();
    return;
  }

  // Ще старіша міграція (Pro 2.x, плаский формат без gender)
  const oldFlat = JSON.parse(localStorage.getItem(OLD_FLAT_KEY) || 'null');
  state.dict = (oldFlat && Array.isArray(oldFlat) && oldFlat.length)
    ? oldFlat.map(normalizeEntry)
    : structuredClone(DEFAULT_DICT).map(normalizeEntry);
  persist();
}

export function saveDict() {
  persist();
}

// Повністю замінює довідник (використовується при імпорті повного бекапу).
export function replaceAllDict(newDict) {
  state.dict = Array.isArray(newDict) ? newDict.map(normalizeEntry) : [];
  persist();
}

// Додає записи з імпортованого файлу до наявного довідника (а не замінює його) —
// дублікати (той самий тип + оригінал) оновлюються, решта додається.
export function importEntries(entries) {
  for (const e of entries) {
    const ne = normalizeEntry(e);
    const existing = state.dict.find(x => x.type === ne.type && x.ru.toLowerCase() === ne.ru.toLowerCase());
    if (existing) Object.assign(existing, ne);
    else state.dict.push(ne);
  }
  persist();
}

// Додає (або оновлює) переклад — викликається з вкладки «Непереведені» ("навчання словника")
export function addLearnedEntry(type, ru, uk) {
  const existing = state.dict.find(e => e.type === type && e.ru.toLowerCase() === ru.toLowerCase());
  if (existing) existing.uk = uk;
  else state.dict.push({ type, ru, uk, gender: '' });
  persist();
}

export function buildDictLookup(type) {
  return state.dict
    .filter(e => e.type === type && e.ru && e.uk)
    .sort((a, b) => b.ru.length - a.ru.length);
}

export function buildNameMap(nameMode = 'historical') {
  const entries = buildDictLookup('name');
  const m = {};
  for (const e of entries) m[e.ru.toLowerCase()] = (nameMode === 'modern' && e.ukModern) ? e.ukModern : e.uk;
  return m;
}
