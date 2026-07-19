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
// persons: [{ localId, isAnchor, fsftid, label, given, surname, sex,
//              birthDate, birthPlace, deathDate, deathPlace, fatherId, motherId }]
let persons = [];
let nextLocalId = 1;

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data.persons)) persons = data.persons;
    if (Number.isFinite(data.nextLocalId)) nextLocalId = data.nextLocalId;
  } catch { /* пошкоджена чернетка — просто починаємо з чистого місця */ }
}
function saveDraft() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ persons, nextLocalId })); } catch { /* сховище переповнене — не критично, це лише чернетка */ }
}

function personDisplayLabel(p) {
  if (p.isAnchor) return `⚓ ${p.label || p.fsftid || '(якір без назви)'}`;
  const name = `${p.given || ''} ${p.surname || ''}`.trim() || '(без імені)';
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
        <button class="pe-person-del" data-id="${esc(p.localId)}" title="Видалити">🗑</button>
      </div>`;
  }).join('');
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

// ---- Додавання якоря ----
document.getElementById('btn-add-anchor').addEventListener('click', () => {
  const fsftid = document.getElementById('anchorFsftid').value.trim();
  const label = document.getElementById('anchorLabel').value.trim();
  if (!fsftid) { showToast('Вкажи _FSFTID якоря — без нього об’єднати з основним деревом не вийде.'); return; }
  persons.push({ localId: 'p' + (nextLocalId++), isAnchor: true, fsftid, label });
  document.getElementById('anchorFsftid').value = '';
  document.getElementById('anchorLabel').value = '';
  render();
  showToast('Якір додано.');
});

// ---- Додавання живої особи ----
document.getElementById('btn-add-person').addEventListener('click', () => {
  const given = document.getElementById('pGiven').value.trim();
  const surname = document.getElementById('pSurname').value.trim();
  if (!given && !surname) { showToast('Вкажи бодай ім’я або прізвище.'); return; }
  persons.push({
    localId: 'p' + (nextLocalId++),
    isAnchor: false,
    given, surname,
    sex: document.getElementById('pSex').value,
    fsftid: document.getElementById('pFsftid').value.trim(),
    birthDate: document.getElementById('pBirthDate').value.trim(),
    birthPlace: document.getElementById('pBirthPlace').value.trim(),
    deathDate: document.getElementById('pDeathDate').value.trim(),
    deathPlace: document.getElementById('pDeathPlace').value.trim(),
    fatherId: document.getElementById('pFather').value,
    motherId: document.getElementById('pMother').value,
  });
  ['pGiven', 'pSurname', 'pFsftid', 'pBirthDate', 'pBirthPlace', 'pDeathDate', 'pDeathPlace'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('pSex').value = '';
  render();
  showToast('Особу додано.');
});

// ---- Очистити все ----
document.getElementById('btn-clear-all').addEventListener('click', () => {
  if (!persons.length) return;
  if (!confirm('Очистити всю базу живих родичів у цьому редакторі? Це не можна скасувати.')) return;
  persons = [];
  nextLocalId = 1;
  render();
});

// ---- Зберегти як GEDCOM ----
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
  showToast('Базу збережено у файл living_base.ged.');
});

// ---- Завантажити базу (.ged) — розбираємо назад у список для редагування ----
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

function importFromGedcom(text) {
  const { individuals, families } = buildIndex(text);
  if (persons.length && !confirm('Це додасть осіб із файлу до вже наявного списку в редакторі (не замінить його). Продовжити?')) return;

  // famc(id) -> сім'я, щоб дістати father/motherId кожної не-якірної особи
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
    persons.push({
      localId, isAnchor: false,
      given: p.givn || (p.name || '').replace(/\//g, '').split(' ')[0] || '',
      surname: p.surn || (p.name.match(/\/([^/]*)\//) || [, ''])[1],
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
