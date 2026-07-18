// ===================== ДОВІДНИК: ЄДИНА ТАБЛИЦЯ (Pro 17) =====================
// Показує РАЗОМ записи єдиного довідника (state.dict: імена/прізвища/місця/інше)
// і записи по-батькові (state.patrDict), позначені типом «По-батькові». Це лише
// об'єднаний ПЕРЕГЛЯД і редагування "в одному місці" — по-батькові фізично й далі
// зберігаються в state.patrDict (їх використовує окремий рушій правил-суфіксів
// на вкладці «По-батькові»), а решта — в state.dict. Редагування в цій таблиці
// пише напряму в потрібне сховище, тож дані завжди лишаються синхронізованими.
import { state } from '../state.js';
import { saveDict, importEntries } from '../dict/sets.js';
import { savePatrDict } from '../dict/store.js';
import { downloadText } from '../core/download.js';

const typeLabel = { name: "Ім'я", surn: 'Прізвище', place: 'Місце', other: 'Інше', patr: 'По-батькові' };
const TYPE_OPTIONS = ['name', 'patr', 'surn', 'place', 'other'];
const GENDER_LABEL = { M: 'Ч', F: 'Ж', '': '—' };

function esc(s) { return (s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

// Об'єднаний масив рядків для відображення. Кожен рядок пам'ятає, звідки він
// узятий (_src: 'dict' | 'patr') і його індекс у відповідному масиві, щоб правки
// можна було записати назад у правильне сховище.
function combinedRows() {
  const dictRows = state.dict.map((e, i) => ({
    type: e.type, ru: e.ru, uk: e.uk, gender: e.gender || '', _src: 'dict', _idx: i,
  }));
  const patrRows = state.patrDict.map((e, i) => ({
    type: 'patr', ru: e.ru, uk: e.uk, gender: e.sex || '', _src: 'patr', _idx: i,
  }));
  return [...dictRows, ...patrRows];
}

// ---------- ТАБЛИЦЯ ЗАПИСІВ ----------
export function renderDict() {
  const searchEl = document.getElementById('dictSearch');
  const q = (searchEl?.value || '').toLowerCase();
  const body = document.getElementById('dictBody');

  const rows = combinedRows()
    .sort((a, b) => TYPE_OPTIONS.indexOf(a.type) - TYPE_OPTIONS.indexOf(b.type)) // сортування за типом; сортування стабільне, тож порядок додавання всередині типу зберігається
    .filter(e => !q || e.ru.toLowerCase().includes(q) || e.uk.toLowerCase().includes(q));
  document.getElementById('dictEmpty').style.display = rows.length ? 'none' : 'block';
  document.getElementById('dictEmpty').textContent = q ? 'Нічого не знайдено.' : 'Довідник порожній.';
  document.getElementById('dictCount').textContent = `${rows.length} з ${state.dict.length + state.patrDict.length}`;

  body.innerHTML = rows.map((e, ri) => `<tr>
      <td><select class="type-sel" data-ri="${ri}" data-field="type">
        ${TYPE_OPTIONS.map(t => `<option value="${t}"${e.type === t ? ' selected' : ''}>${typeLabel[t]}</option>`).join('')}
      </select></td>
      <td><input value="${esc(e.ru)}" data-ri="${ri}" data-field="ru"></td>
      <td><input value="${esc(e.uk)}" data-ri="${ri}" data-field="uk"></td>
      <td><select class="type-sel" data-ri="${ri}" data-field="gender">
        ${['', 'M', 'F'].map(g => `<option value="${g}"${e.gender === g ? ' selected' : ''}>${GENDER_LABEL[g]}</option>`).join('')}
      </select></td>
      <td><button class="del-btn" data-ri="${ri}">🗑</button></td>
    </tr>`).join('');

  // Зберігаємо поточний набір рядків, щоб обробники подій знали, куди писати
  const currentRows = rows;

  body.querySelectorAll('select,input').forEach(el => {
    el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
      const ri = +el.dataset.ri, field = el.dataset.field;
      setField(currentRows[ri], field, el.value);
      if (field === 'type') renderDict(); // тип змінився — можливе переміщення dict↔patr, треба перемалювати
    });
  });
  body.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', () => delRow(currentRows[+btn.dataset.ri]));
  });
}

function setField(row, field, value) {
  if (field === 'type' && (row.type === 'patr') !== (value === 'patr')) {
    moveRow(row, value);
    return;
  }
  if (row._src === 'patr') {
    const target = state.patrDict[row._idx];
    if (field === 'gender') target.sex = value;
    else if (field === 'ru' || field === 'uk') target[field] = value;
    savePatrDict();
  } else {
    const target = state.dict[row._idx];
    target[field] = value;
    saveDict();
  }
}

// Переносить запис між state.dict і state.patrDict, коли користувач змінює
// тип на/з «По-батькові» у випадаючому списку.
function moveRow(row, newType) {
  if (row._src === 'dict') {
    const [entry] = state.dict.splice(row._idx, 1);
    state.patrDict.push({ ru: entry.ru, uk: entry.uk, sex: entry.gender || 'M' });
    saveDict();
    savePatrDict();
  } else {
    const [entry] = state.patrDict.splice(row._idx, 1);
    state.dict.push({ type: newType, ru: entry.ru, uk: entry.uk, gender: entry.sex || '' });
    savePatrDict();
    saveDict();
  }
}

function delRow(row) {
  if (!confirm(`Видалити «${row.ru}»?`)) return;
  if (row._src === 'patr') {
    state.patrDict.splice(row._idx, 1);
    savePatrDict();
  } else {
    state.dict.splice(row._idx, 1);
    saveDict();
  }
  renderDict();
}

export function addEntry() {
  // На початок списку (не в кінець) — при сортуванні за типом «Ім'я» йде першим,
  // тож новий запис завжди опиняється першим рядком таблиці й одразу видно перехід.
  state.dict.unshift({ type: 'name', ru: '', uk: '', gender: '' });
  saveDict();
  renderDict();
  const rows = document.querySelectorAll('#dictBody tr');
  if (rows.length) rows[0].querySelectorAll('input')[0].focus();
}

// ---------- ІМПОРТ/ЕКСПОРТ ----------
export function exportDict() {
  downloadText('gedcom_dict.json', JSON.stringify(state.dict, null, 2), 'application/json;charset=utf-8');
}

export function importDict() {
  document.getElementById('dictImportInput').click();
}

export function doImport(e) {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!Array.isArray(data)) throw new Error();
      // Записи з файлу ДОДАЮТЬСЯ до існуючого довідника (дублікати за типом+оригіналом
      // оновлюються), а не замінюють його — набори більше не потрібні для розділення джерел.
      importEntries(data);
      renderDict();
    } catch {
      alert('Помилка: невалідний JSON (очікується масив записів {type, ru, uk, gender}).');
    }
  };
  r.readAsText(f);
  e.target.value = '';
}
