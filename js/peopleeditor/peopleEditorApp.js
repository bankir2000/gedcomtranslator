// ===================== РЕДАКТОР ЖИВИХ РОДИЧІВ =====================
// Самодостатня сторінка (окреме вікно) — без залежності від CDN, тож, на
// відміну від tree-view.html, могла б кешуватись офлайн; але поки що
// навмисно виключена з Service Worker (той самий підхід, що й для дерева),
// щоб не ускладнювати ще неусталену функцію кешуванням.
import { buildIndex } from '../engine/analysis.js';
import { buildBaseGedcom } from '../engine/baseGedcom.js';

const DRAFT_KEY = 'gedcom_living_base_draft_v1';
const THEME_KEY = 'gedcom_theme';

// ---- Тема (день/ніч) — та сама пара класів/ключ localStorage, що й решта застосунку ----
function initTheme() {
  const isDay = localStorage.getItem(THEME_KEY) === 'day';
  document.body.classList.toggle('day', isDay);
  document.getElementById('themeBtn').textContent = isDay ? '🌙' : '☀️';
}
document.getElementById('themeBtn').addEventListener('click', () => {
  const isDay = document.body.classList.toggle('day');
  localStorage.setItem(THEME_KEY, isDay ? 'day' : 'night');
  document.getElementById('themeBtn').textContent = isDay ? '🌙' : '☀️';
});
initTheme();
document.getElementById('closeBtn').addEventListener('click', () => window.close());

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---- Дані ----
// persons: [{ localId, isAnchor, fsftid, label, given, patronymic, surname,
//              sex, birthDate, birthPlace, deathDate, deathPlace, fatherId, motherId }]
let persons = [];
let nextLocalId = 1;

// Якщо не null — форми зараз у режимі РЕДАГУВАННЯ цього запису (не додавання нового).
let editingAnchorId = null;
let editingPersonId = null;

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data.persons)) persons = data.persons;
    if (Number.isFinite(data.nextLocalId)) nextLocalId = data.nextLocalId;
  } catch (err) {
    console.error('Не вдалося завантажити збережену чернетку:', err);
    showToast('⚠️ Збережена чернетка пошкоджена — починаємо з чистого списку.');
  }
}
function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ persons, nextLocalId }));
  } catch (err) {
    console.error('Не вдалося зберегти чернетку:', err);
    showToast('⚠️ Не вдалося зберегти список у цьому браузері (сховище переповнене чи заблоковане) — після оновлення сторінки список може зникнути.');
  }
}

function personDisplayLabel(p) {
  if (p.isAnchor) return `⚓ ${p.label || p.fsftid || '(якір без назви)'}`;
  const name = `${p.given || ''} ${p.patronymic || ''} ${p.surname || ''}`.replace(/\s+/g, ' ').trim() || '(без імені)';
  const years = [p.birthDate, p.deathDate].filter(Boolean).join('–');
  return years ? `${name} (${years})` : name;
}

function render() {
  renderList();
  renderParentSelects();
  document.getElementById('pe-count').textContent = `${persons.length} ос${persons.length === 1 ? 'оба' : 'іб'} у базі`;
  saveDraft();
}

function renderList() {
  const el = document.getElementById('pe-list');
  if (!persons.length) {
    el.innerHTML = '<div class="empty-hint">Поки що нікого не додано.</div>';
    return;
  }
  el.innerHTML = persons.map(p => {
    const cls = p.isAnchor ? 'pe-anchor' : (p.sex === 'M' ? 'pe-person-m' : p.sex === 'F' ? 'pe-person-f' : '');
    const parents = [];
    if (p.fatherId) parents.push('батько: ' + personDisplayLabel(persons.find(x => x.localId === p.fatherId) || {}));
    if (p.motherId) parents.push('мати: ' + personDisplayLabel(persons.find(x => x.localId === p.motherId) || {}));
    return `
      <div class="pe-person ${cls}">
        <span class="pe-person-main">${esc(personDisplayLabel(p))}</span>
        <span class="pe-person-meta">${p.fsftid && !p.isAnchor ? `FSFTID: ${esc(p.fsftid)} · ` : ''}${esc(parents.join(' · '))}</span>
        <button class="pe-person-edit" data-id="${esc(p.localId)}" title="Редагувати">✏️</button>
        <button class="pe-person-del" data-id="${esc(p.localId)}" title="Видалити">🗑</button>
      </div>`;
  }).join('');
  el.querySelectorAll('.pe-person-edit').forEach(btn => {
    btn.addEventListener('click', () => startEdit(btn.dataset.id));
  });
  el.querySelectorAll('.pe-person-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      // Якщо цю особу вказано батьком/матір'ю в когось іншого — попереджаємо,
      // а не видаляємо мовчки (втратиться зв'язок непомітно для користувача).
      const dependents = persons.filter(p => p.fatherId === id || p.motherId === id);
      if (dependents.length && !confirm(`Цю особу вказано батьком/матір'ю у ${dependents.length} записах. Видалити все одно? (зв'язок просто очиститься)`)) return;
      persons = persons.filter(p => p.localId !== id);
      persons.forEach(p => {
        if (p.fatherId === id) p.fatherId = '';
        if (p.motherId === id) p.motherId = '';
      });
      if (editingAnchorId === id) cancelAnchorEdit();
      if (editingPersonId === id) cancelPersonEdit();
      render();
    });
  });
}

function renderParentSelects() {
  const options = '<option value="">—</option>' + persons.map(p =>
    `<option value="${esc(p.localId)}">${esc(personDisplayLabel(p))}</option>`).join('');
  const fatherSel = document.getElementById('pFather');
  const motherSel = document.getElementById('pMother');
  const prevFather = fatherSel.value, prevMother = motherSel.value;
  fatherSel.innerHTML = options;
  motherSel.innerHTML = options;
  if (persons.some(p => p.localId === prevFather)) fatherSel.value = prevFather;
  if (persons.some(p => p.localId === prevMother)) motherSel.value = prevMother;
}

// Визначає, чи це якір, чи звичайна особа, і скеровує в потрібну форму редагування.
function startEdit(id) {
  const p = persons.find(x => x.localId === id);
  if (!p) return;
  if (p.isAnchor) startAnchorEdit(p); else startPersonEdit(p);
}

// ---- Редагування/додавання якоря ----
function startAnchorEdit(p) {
  editingAnchorId = p.localId;
  document.getElementById('anchorFsftid').value = p.fsftid || '';
  document.getElementById('anchorLabel').value = p.label || '';
  document.getElementById('btn-add-anchor').textContent = '💾 Зберегти зміни';
  document.getElementById('btn-cancel-anchor').style.display = 'inline-flex';
  document.getElementById('anchorFsftid').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function cancelAnchorEdit() {
  editingAnchorId = null;
  document.getElementById('anchorFsftid').value = '';
  document.getElementById('anchorLabel').value = '';
  document.getElementById('btn-add-anchor').textContent = '➕ Додати якір';
  document.getElementById('btn-cancel-anchor').style.display = 'none';
}
document.getElementById('btn-cancel-anchor').addEventListener('click', cancelAnchorEdit);
document.getElementById('btn-add-anchor').addEventListener('click', () => {
  const fsftid = document.getElementById('anchorFsftid').value.trim();
  const label = document.getElementById('anchorLabel').value.trim();
  if (!fsftid) { showToast('Вкажи _FSFTID якоря — без нього об’єднати з основним деревом не вийде.'); return; }

  if (editingAnchorId) {
    const p = persons.find(x => x.localId === editingAnchorId);
    if (p) { p.fsftid = fsftid; p.label = label; }
    cancelAnchorEdit();
    render();
    showToast('Зміни збережено.');
    return;
  }

  persons.push({ localId: 'p' + (nextLocalId++), isAnchor: true, fsftid, label });
  document.getElementById('anchorFsftid').value = '';
  document.getElementById('anchorLabel').value = '';
  render();
  showToast('Якір додано.');
});

// ---- Редагування/додавання живої особи ----
function startPersonEdit(p) {
  editingPersonId = p.localId;
  document.getElementById('pGiven').value = p.given || '';
  document.getElementById('pPatronymic').value = p.patronymic || '';
  document.getElementById('pSurname').value = p.surname || '';
  document.getElementById('pSex').value = p.sex || '';
  document.getElementById('pFsftid').value = p.fsftid || '';
  document.getElementById('pBirthDate').value = p.birthDate || '';
  document.getElementById('pBirthPlace').value = p.birthPlace || '';
  document.getElementById('pDeathDate').value = p.deathDate || '';
  document.getElementById('pDeathPlace').value = p.deathPlace || '';
  renderParentSelects(); // оновити список, перш ніж обирати, щоб сама особа не пропонувалась собі ж
  document.getElementById('pFather').value = p.fatherId || '';
  document.getElementById('pMother').value = p.motherId || '';
  document.getElementById('btn-add-person').textContent = '💾 Зберегти зміни';
  document.getElementById('btn-cancel-person').style.display = 'inline-flex';
  document.getElementById('pGiven').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function cancelPersonEdit() {
  editingPersonId = null;
  ['pGiven', 'pPatronymic', 'pSurname', 'pFsftid', 'pBirthDate', 'pBirthPlace', 'pDeathDate', 'pDeathPlace'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('pSex').value = '';
  document.getElementById('pFather').value = '';
  document.getElementById('pMother').value = '';
  document.getElementById('btn-add-person').textContent = '➕ Додати особу';
  document.getElementById('btn-cancel-person').style.display = 'none';
}
document.getElementById('btn-cancel-person').addEventListener('click', cancelPersonEdit);
document.getElementById('btn-add-person').addEventListener('click', () => {
  let given = document.getElementById('pGiven').value.trim();
  const surname = document.getElementById('pSurname').value.trim();
  if (!given && !surname) { showToast('Вкажи бодай ім’я або прізвище.'); return; }

  // Захист від подвоєння прізвища: якщо в полі "Ім'я" випадково вписали
  // прізвище повторно в кінці (звична звичка писати ім'я одним рядком) —
  // приберемо цей повтор, а не покажемо "Прізвище Прізвище" в дереві.
  if (surname && given) {
    const givenWords = given.split(/\s+/);
    while (givenWords.length && givenWords[givenWords.length - 1].toLowerCase() === surname.toLowerCase()) {
      givenWords.pop();
    }
    given = givenWords.join(' ');
  }

  const fatherId = document.getElementById('pFather').value;
  const motherId = document.getElementById('pMother').value;
  if ((fatherId && fatherId === editingPersonId) || (motherId && motherId === editingPersonId)) {
    showToast('Особа не може бути власним батьком/матір’ю.');
    return;
  }

  const fields = {
    given, surname,
    patronymic: document.getElementById('pPatronymic').value.trim(),
    sex: document.getElementById('pSex').value,
    fsftid: document.getElementById('pFsftid').value.trim(),
    birthDate: document.getElementById('pBirthDate').value.trim(),
    birthPlace: document.getElementById('pBirthPlace').value.trim(),
    deathDate: document.getElementById('pDeathDate').value.trim(),
    deathPlace: document.getElementById('pDeathPlace').value.trim(),
    fatherId, motherId,
  };

  if (editingPersonId) {
    const p = persons.find(x => x.localId === editingPersonId);
    if (p) Object.assign(p, fields);
    cancelPersonEdit();
    render();
    showToast('Зміни збережено.');
    return;
  }

  persons.push({ localId: 'p' + (nextLocalId++), isAnchor: false, ...fields });
  cancelPersonEdit();
  render();
  showToast('Особу додано.');
});

// ---- Очистити все ----
document.getElementById('btn-clear-all').addEventListener('click', () => {
  if (!persons.length) return;
  if (!confirm('Очистити всю базу живих родичів у цьому редакторі? Це не можна скасувати.')) return;
  persons = [];
  nextLocalId = 1;
  cancelAnchorEdit();
  cancelPersonEdit();
  render();
});

// ---- Зберегти як GEDCOM ----
// За проханням: після успішного збереження файл готовий, і список одразу
// очищується — наступна база починається "з чистого аркуша". Сам файл
// лишається на диску як повноцінна резервна копія (і його завжди можна
// підвантажити назад кнопкою "Завантажити базу", якщо треба щось доправити).
document.getElementById('btn-save-base').addEventListener('click', () => {
  if (!persons.length) { showToast('Спочатку додай хоча б одну особу чи якір.'); return; }
  const gedcomText = buildBaseGedcom(persons);
  const blob = new Blob(['\uFEFF' + gedcomText], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'living_base.ged';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);

  persons = [];
  nextLocalId = 1;
  cancelAnchorEdit();
  cancelPersonEdit();
  render();
  showToast('Файл living_base.ged збережено. Список очищено — можна заводити наступних осіб.');
});

// ---- Завантажити базу (.ged) — ЗАМІНЮЄ поточний список, з можливістю
// подальшого редагування/видалення кожного запису. ----
document.getElementById('btn-load-base').addEventListener('click', () => document.getElementById('fileInputBase').click());
document.getElementById('fileInputBase').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    importFromGedcom(text);
    showToast('Базу завантажено.');
  } catch (err) {
    console.error(err);
    showToast('Не вдалося розібрати файл — це точно база, збережена цим редактором?');
  }
  e.target.value = '';
});

function importFromGedcom(text, opts = {}) {
  const { individuals, families } = buildIndex(text);
  if (!opts.silent && persons.length &&
      !confirm('Поточний список у редакторі буде ЗАМІНЕНО вмістом файлу. Продовжити?')) return;

  persons = [];
  nextLocalId = 1;
  cancelAnchorEdit();
  cancelPersonEdit();

  const idRemap = new Map(); // id з файлу -> новий localId у цьому редакторі
  for (const p of individuals.values()) idRemap.set(p.id, 'p' + (nextLocalId++));

  for (const p of individuals.values()) {
    const localId = idRemap.get(p.id);
    if (p.isAnchor) {
      persons.push({ localId, isAnchor: true, fsftid: p.fsftid || '', label: (p.name || '').replace(/\//g, '').trim() });
      continue;
    }
    let fatherId = '', motherId = '';
    const famcId = p.famc[0];
    const fam = famcId ? families.get(famcId) : null;
    if (fam) {
      if (fam.husb && idRemap.has(fam.husb)) fatherId = idRemap.get(fam.husb);
      if (fam.wife && idRemap.has(fam.wife)) motherId = idRemap.get(fam.wife);
    }
    // GIVN за конвенцією застосунку: перше слово — ім'я, решта — по батькові
    // ВАЖЛИВО: прибираємо саме сегмент "/Прізвище/" ЦІЛКОМ (разом із текстом
    // усередині), а не просто символи "/" — інакше прізвище лишається
    // "приклеєним" до по-батькові (напр. "Оксана Олександрівна Добротворська"
    // після .replace(/\//g,'') виглядає як 3 слова "імені", і по-батькові
    // помилково поглинає прізвище — саме це й спричиняло подвоєння).
    const surnameFromName = (p.name.match(/\/([^/]*)\//) || [, ''])[1];
    const givnRaw = p.givn || (p.name || '').replace(/\/[^/]*\//, '').trim();
    const givnParts = givnRaw.split(/\s+/).filter(Boolean);
    const given = givnParts[0] || '';
    let patronymic = givnParts.slice(1).join(' ');
    const surname = p.surn || surnameFromName;
    // Самолікування: якщо файл прийшов зі СТАРОЇ версії редактора (де був
    // баг і прізвище "приклеювалось" до по-батькові) — прибираємо той
    // повтор тут-таки при завантаженні, а не тягнемо биту дату далі.
    if (surname) {
      const patrWords = patronymic.split(/\s+/);
      while (patrWords.length && patrWords[patrWords.length - 1].toLowerCase() === surname.toLowerCase()) {
        patrWords.pop();
      }
      patronymic = patrWords.join(' ');
    }
    persons.push({
      localId, isAnchor: false,
      given,
      patronymic,
      surname,
      sex: p.sex === 'M' || p.sex === 'F' ? p.sex : '',
      fsftid: p.fsftid || '',
      birthDate: p.birt.date || '', birthPlace: p.birt.plac || '',
      deathDate: p.deat.date || '', deathPlace: p.deat.plac || '',
      fatherId, motherId,
    });
  }
  render();
}

loadDraft();
render();

// Якщо редактор відкрито кнопкою "✏️ Редагувати цю базу" з головного вікна —
// там уже лежить вміст файлу в sessionStorage, підхоплюємо його одразу.
try {
  const pending = sessionStorage.getItem('gedcom_living_base_pending_v1');
  if (pending) {
    sessionStorage.removeItem('gedcom_living_base_pending_v1');
    importFromGedcom(pending, { silent: true });
    showToast('Базу підвантажено з головного вікна для редагування.');
  }
} catch { /* немає sessionStorage чи пошкоджені дані — просто ігноруємо */ }
