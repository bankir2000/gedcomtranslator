// ===================== АВТОМАТИЧНЕ РЕЗЕРВНЕ КОПІЮВАННЯ =====================
// Перед кожним запуском перекладу і при кожному імпорті словника програма
// автоматично зберігає знімок у localStorage. Це рятує роботу, якщо
// щось піде не так (перезапис словника поганим імпортом, помилка перекладу тощо).

const MAX_BACKUPS = 8;
const KEY = 'gedcom_backups_v3';

function loadAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

function saveAll(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    // localStorage переповнений — прибираємо найстаріші і пробуємо ще раз
    if (list.length > 1) {
      list.shift();
      return saveAll(list);
    }
    console.error('Не вдалося зберегти резервну копію:', e);
    return false;
  }
}

/**
 * @param {'translation'|'dict'|'patr'} kind
 * @param {string} label
 * @param {object} payload — довільні дані для відновлення
 */
export function createBackup(kind, label, payload) {
  const list = loadAll();
  list.push({
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    kind,
    label,
    timestamp: new Date().toISOString(),
    payload,
  });
  while (list.length > MAX_BACKUPS) list.shift();
  saveAll(list);
}

export function listBackups() {
  return loadAll().sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function getBackup(id) {
  return loadAll().find(b => b.id === id) || null;
}

export function deleteBackup(id) {
  saveAll(loadAll().filter(b => b.id !== id));
}

// ===================== ПОВНЕ РЕЗЕРВНЕ КОПІЮВАННЯ (усі дані одним файлом) =====================
// Автобекапи вище зберігають лише знімки перед ризикованими операціями і живуть
// у тому самому браузері. Це не рятує, якщо користувач очистить кеш браузера,
// перейде на інший пристрій, або хоче свідомо архівувати свою роботу.
// exportAllData/importAllData дають один портативний JSON-файл з усім станом:
// усі набори словників, словник по-батькові — усе, що потрібно, аби відновити
// роботу «з нуля» на будь-якому пристрої.
const FULL_EXPORT_VERSION = 3; // v2: додано dismissedDuplicates («не дублікати»); v3: додано confirmedDuplicates («дублікати»)

export function exportAllData(dict, patrDict, dismissedDuplicates, confirmedDuplicates) {
  return {
    _app: 'gedcom-translator-pro',
    _exportVersion: FULL_EXPORT_VERSION,
    _exportedAt: new Date().toISOString(),
    dict,
    patrDict,
    dismissedDuplicates: dismissedDuplicates || [],
    confirmedDuplicates: confirmedDuplicates || [],
  };
}

/**
 * Перевіряє мінімальну структуру перед імпортом, щоб не затерти робочі дані
 * випадковим/чужим JSON-файлом. Кидає Error з людяним поясненням, якщо щось не так.
 */
export function validateFullExport(data) {
  if (!data || typeof data !== 'object') throw new Error('Файл пошкоджений або це не JSON.');
  if (data._app !== 'gedcom-translator-pro') throw new Error('Це не файл повного бекапу GEDCOM Translator Pro.');
  if (!Array.isArray(data.dict)) throw new Error('У файлі відсутній довідник (dict).');
  if (!Array.isArray(data.patrDict)) throw new Error('У файлі відсутній словник по-батькові (patrDict).');
  // dismissedDuplicates з'явився у v2 бекапу, confirmedDuplicates — у v3;
  // у старіших файлах їх просто нема, це не помилка, підставляємо порожній список.
  if (!Array.isArray(data.dismissedDuplicates)) data.dismissedDuplicates = [];
  if (!Array.isArray(data.confirmedDuplicates)) data.confirmedDuplicates = [];
  return true;
}
