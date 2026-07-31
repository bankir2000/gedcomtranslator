// ===================== РЕДАКТОР ЛЮДЕЙ (довставляння відсутніх у дерево) =====================
// Самодостатня сторінка (окреме вікно) — без залежності від CDN, тож, на
// відміну від tree-view.html, могла б кешуватись офлайн; але поки що
// навмисно виключена з Service Worker (той самий підхід, що й для дерева),
// щоб не ускладнювати ще неусталену функцію кешуванням.
//
// Кожна особа однорідна (немає окремого типу "якір" — див. relRef.js):
// поля зв'язку (father/mother/spouse/children) — це RelRef, що вказує або на
// іншу особу ЦІЄЇ Ж бази (local), або напряму на вже існуючу в основному
// дереві людину за її _FSFTID (external), без окремого запису-заглушки.
import { buildIndex } from '../engine/analysis.js';
import { buildBaseGedcom } from '../engine/baseGedcom.js';
import { localRef, externalRef, refLabel } from './relRef.js';
import { canSetParent, canSetChild, canSetSpouse } from './cycles.js';
import { migrateDraft, CURRENT_DRAFT_VERSION } from './draftMigration.js';
import { closeOrNavigateBack } from '../ui/navUtil.js';
import { downloadGedcom } from '../core/download.js';

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
document.getElementById('closeBtn').addEventListener('click', () => closeOrNavigateBack('index.html'));

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
// persons: [{ localId, given, patronymic, surname, sex, fsftid,
//              birthDate, birthPlace, deathDate, deathPlace,
//              father: RelRef|null, mother: RelRef|null,
//              spouse: RelRef|null, marriageDate, marriagePlace,
//              children: RelRef[] }]
let persons = [];
let nextLocalId = 1;

// Якщо не null — форма зараз у режимі РЕДАГУВАННЯ цього запису (не додавання нового).
let editingPersonId = null;
// Зовнішні (за _FSFTID) діти, додані в поточній чернетці форми, ще не збережені в persons.
let childExtDraft = [];

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const migrated = migrateDraft(parsed);
    persons = migrated.persons;
    nextLocalId = migrated.nextLocalId;
    if ((parsed.version || 1) < CURRENT_DRAFT_VERSION) {
      showToast('Стару чернетку оновлено до нового формату (зв’язки тепер через код FSFTID).');
    }
  } catch (err) {
    console.error('Не вдалося завантажити збережену чернетку:', err);
    showToast('⚠️ Збережена чернетка пошкоджена — починаємо з чистого списку.');
  }
}
function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ version: CURRENT_DRAFT_VERSION, persons, nextLocalId }));
  } catch (err) {
    console.error('Не вдалося зберегти чернетку:', err);
    showToast('⚠️ Не вдалося зберегти список у цьому браузері (сховище переповнене чи заблоковане) — після оновлення сторінки список може зникнути.');
  }
}

function personDisplayLabel(p) {
  const name = `${p.given || ''} ${p.patronymic || ''} ${p.surname || ''}`.replace(/\s+/g, ' ').trim() || '(без імені)';
  const years = [p.birthDate, p.deathDate].filter(Boolean).join('–');
  return years ? `${name} (${years})` : name;
}

function render() {
  renderList();
  renderRelSelects();
  document.getElementById('pe-count').textContent = `${persons.length} ос${persons.length === 1 ? 'оба' : 'іб'} у базі`;
  saveDraft();
}

// Особа X посилається (як батько/мати/чоловік-дружина/дитина) на особу id?
function referencesLocalPerson(p, id) {
  const refIsLocal = (ref) => ref && ref.kind === 'local' && ref.localId === id;
  return refIsLocal(p.father) || refIsLocal(p.mother) || refIsLocal(p.spouse) ||
    (p.children || []).some(refIsLocal);
}

function renderList() {
  const el = document.getElementById('pe-list');
  if (!persons.length) {
    el.innerHTML = '<div class="empty-hint">Поки що нікого не додано.</div>';
    return;
  }
  el.innerHTML = persons.map(p => {
    const cls = p.sex === 'M' ? 'pe-person-m' : p.sex === 'F' ? 'pe-person-f' : '';
    const meta = [];
    if (p.fsftid) meta.push(`FSFTID: ${esc(p.fsftid)}`);
    if (p.father) meta.push('батько: ' + esc(refLabel(p.father, persons)));
    if (p.mother) meta.push('мати: ' + esc(refLabel(p.mother, persons)));
    if (p.spouse) meta.push('чоловік/дружина: ' + esc(refLabel(p.spouse, persons)) + (p.marriageDate ? ` (шлюб: ${esc(p.marriageDate)})` : ''));
    if (p.children && p.children.length) meta.push('діти: ' + p.children.map(c => esc(refLabel(c, persons))).join(', '));
    return `
      <div class="pe-person ${cls}">
        <span class="pe-person-main">${esc(personDisplayLabel(p))}</span>
        <span class="pe-person-meta">${meta.join(' · ')}</span>
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
      const dependents = persons.filter(p => p.localId !== id && referencesLocalPerson(p, id));
      if (dependents.length && !confirm(`Цю особу вказано батьком/матір'ю/чоловіком(дружиною)/дитиною у ${dependents.length} записах. Видалити все одно? (ці зв'язки просто очистяться)`)) return;
      persons = persons.filter(p => p.localId !== id);
      persons.forEach(p => {
        if (p.father && p.father.kind === 'local' && p.father.localId === id) p.father = null;
        if (p.mother && p.mother.kind === 'local' && p.mother.localId === id) p.mother = null;
        if (p.spouse && p.spouse.kind === 'local' && p.spouse.localId === id) { p.spouse = null; p.marriageDate = ''; p.marriagePlace = ''; }
        p.children = (p.children || []).filter(c => !(c.kind === 'local' && c.localId === id));
      });
      if (editingPersonId === id) cancelPersonEdit();
      render();
    });
  });
}

// ---- Заповнення селектів (Батько/Мати/Чоловік-Дружина/Діти) ----
function setOptionsKeepingValue(selectId, candidates) {
  const sel = document.getElementById(selectId);
  const prev = sel.value;
  sel.innerHTML = '<option value="">— не обрано —</option>' +
    candidates.map(p => `<option value="${esc(p.localId)}">${esc(personDisplayLabel(p))}</option>`).join('');
  if (candidates.some(p => p.localId === prev)) sel.value = prev;
}
function setMultiOptionsKeepingSelection(selectId, candidates) {
  const sel = document.getElementById(selectId);
  const prevSelected = new Set(Array.from(sel.selectedOptions).map(o => o.value));
  sel.innerHTML = candidates.map(p => `<option value="${esc(p.localId)}">${esc(personDisplayLabel(p))}</option>`).join('');
  Array.from(sel.options).forEach(o => { if (prevSelected.has(o.value)) o.selected = true; });
}

function renderRelSelects() {
  const editingId = editingPersonId;
  const forParent = persons.filter(p => p.localId !== editingId && (!editingId || canSetParent(persons, editingId, p.localId)));
  const forSpouse = persons.filter(p => p.localId !== editingId);
  const forChild = persons.filter(p => p.localId !== editingId && (!editingId || canSetChild(persons, editingId, p.localId)));

  setOptionsKeepingValue('pFatherLocal', forParent);
  setOptionsKeepingValue('pMotherLocal', forParent);
  setOptionsKeepingValue('pSpouseLocal', forSpouse);
  setMultiOptionsKeepingSelection('pChildrenLocal', forChild);
}

// ---- "Ексклюзивна пара" полів: обрав локальну особу зі списку → чистимо
// поле FSFTID, і навпаки — ввів FSFTID → скидаємо вибір у списку. ----
function wireExclusivePair(selectId, fsftidId, labelId) {
  const sel = document.getElementById(selectId);
  const fs = document.getElementById(fsftidId);
  const lb = document.getElementById(labelId);
  sel.addEventListener('change', () => { if (sel.value) { fs.value = ''; lb.value = ''; } });
  fs.addEventListener('input', () => { if (fs.value.trim()) sel.value = ''; });
}
wireExclusivePair('pFatherLocal', 'pFatherFsftid', 'pFatherLabel');
wireExclusivePair('pMotherLocal', 'pMotherFsftid', 'pMotherLabel');
wireExclusivePair('pSpouseLocal', 'pSpouseFsftid', 'pSpouseLabel');

function readRef(selectId, fsftidId, labelId) {
  const localId = document.getElementById(selectId).value;
  if (localId) return localRef(localId);
  const fsftid = document.getElementById(fsftidId).value.trim();
  if (fsftid) return externalRef(fsftid, document.getElementById(labelId).value.trim());
  return null;
}
function writeRef(ref, selectId, fsftidId, labelId) {
  const sel = document.getElementById(selectId), fs = document.getElementById(fsftidId), lb = document.getElementById(labelId);
  if (!ref) { sel.value = ''; fs.value = ''; lb.value = ''; return; }
  if (ref.kind === 'local') { sel.value = ref.localId; fs.value = ''; lb.value = ''; }
  else { sel.value = ''; fs.value = ref.fsftid; lb.value = ref.label || ''; }
}

function renderChildExtChips() {
  const el = document.getElementById('pChildExtChips');
  el.innerHTML = childExtDraft.map((c, i) =>
    `<span class="pe-chip">🔗 ${esc(c.label || c.fsftid)} (${esc(c.fsftid)})<button data-i="${i}" type="button">✕</button></span>`).join('');
  el.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => { childExtDraft.splice(+b.dataset.i, 1); renderChildExtChips(); });
  });
}
document.getElementById('btn-add-child-ext').addEventListener('click', () => {
  const fsftid = document.getElementById('pChildExtFsftid').value.trim();
  const label = document.getElementById('pChildExtLabel').value.trim();
  if (!fsftid) { showToast('Вкажи _FSFTID дитини, яку хочеш прив’язати.'); return; }
  if (childExtDraft.some(c => c.fsftid.toLowerCase() === fsftid.toLowerCase())) { showToast('Ця дитина вже додана.'); return; }
  childExtDraft.push({ fsftid, label });
  document.getElementById('pChildExtFsftid').value = '';
  document.getElementById('pChildExtLabel').value = '';
  renderChildExtChips();
});

// ---- Синхронізація: коли для особи X обрано дітей (локальних), автоматично
// проставляємо X (і, якщо є, чоловіка/дружину X) як батько/мати цих дітей —
// АЛЕ тільки якщо в дитини це поле ще порожнє (не перезаписуємо мовчки). ----
function syncChildrenParentage(personLocalId, person, childRefs) {
  const selfSlot = person.sex === 'F' ? 'mother' : 'father'; // якщо стать невідома — за замовчуванням "батько"
  const otherSlot = selfSlot === 'father' ? 'mother' : 'father';
  const spouseLocalId = person.spouse && person.spouse.kind === 'local' ? person.spouse.localId : null;
  for (const childRef of childRefs) {
    if (childRef.kind !== 'local') continue;
    const child = persons.find(x => x.localId === childRef.localId);
    if (!child) continue;
    if (!child[selfSlot]) child[selfSlot] = localRef(personLocalId);
    if (spouseLocalId && !child[otherSlot]) child[otherSlot] = localRef(spouseLocalId);
  }
}

// ---- Редагування/додавання особи ----
function startEdit(id) {
  const p = persons.find(x => x.localId === id);
  if (!p) return;
  editingPersonId = id;
  document.getElementById('pGiven').value = p.given || '';
  document.getElementById('pPatronymic').value = p.patronymic || '';
  document.getElementById('pSurname').value = p.surname || '';
  document.getElementById('pSex').value = p.sex || '';
  document.getElementById('pFsftid').value = p.fsftid || '';
  document.getElementById('pBirthDate').value = p.birthDate || '';
  document.getElementById('pBirthPlace').value = p.birthPlace || '';
  document.getElementById('pDeathDate').value = p.deathDate || '';
  document.getElementById('pDeathPlace').value = p.deathPlace || '';
  document.getElementById('pMarriageDate').value = p.marriageDate || '';
  document.getElementById('pMarriagePlace').value = p.marriagePlace || '';

  renderRelSelects(); // оновити списки (з урахуванням заборонених циклів), перш ніж проставляти значення
  writeRef(p.father, 'pFatherLocal', 'pFatherFsftid', 'pFatherLabel');
  writeRef(p.mother, 'pMotherLocal', 'pMotherFsftid', 'pMotherLabel');
  writeRef(p.spouse, 'pSpouseLocal', 'pSpouseFsftid', 'pSpouseLabel');

  const localChildIds = new Set((p.children || []).filter(c => c.kind === 'local').map(c => c.localId));
  Array.from(document.getElementById('pChildrenLocal').options).forEach(o => { o.selected = localChildIds.has(o.value); });
  childExtDraft = (p.children || []).filter(c => c.kind === 'external').map(c => ({ fsftid: c.fsftid, label: c.label }));
  renderChildExtChips();

  document.getElementById('btn-add-person').textContent = '💾 Зберегти зміни';
  document.getElementById('btn-cancel-person').style.display = 'inline-flex';
  document.getElementById('pGiven').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelPersonEdit() {
  editingPersonId = null;
  ['pGiven', 'pPatronymic', 'pSurname', 'pFsftid', 'pBirthDate', 'pBirthPlace', 'pDeathDate', 'pDeathPlace',
    'pMarriageDate', 'pMarriagePlace'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('pSex').value = '';
  writeRef(null, 'pFatherLocal', 'pFatherFsftid', 'pFatherLabel');
  writeRef(null, 'pMotherLocal', 'pMotherFsftid', 'pMotherLabel');
  writeRef(null, 'pSpouseLocal', 'pSpouseFsftid', 'pSpouseLabel');
  Array.from(document.getElementById('pChildrenLocal').options).forEach(o => { o.selected = false; });
  childExtDraft = [];
  renderChildExtChips();
  document.getElementById('btn-add-person').textContent = '➕ Додати людину';
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

  const father = readRef('pFatherLocal', 'pFatherFsftid', 'pFatherLabel');
  const mother = readRef('pMotherLocal', 'pMotherFsftid', 'pMotherLabel');
  const spouse = readRef('pSpouseLocal', 'pSpouseFsftid', 'pSpouseLabel');
  const childrenLocal = Array.from(document.getElementById('pChildrenLocal').selectedOptions).map(o => localRef(o.value));
  const childrenExt = childExtDraft.map(c => externalRef(c.fsftid, c.label));
  const children = [...childrenLocal, ...childrenExt];

  // Захист від циклів (перевіряємо ще раз тут — на додачу до фільтрації в
  // самих select'ах — про всяк випадок, якщо значення прийшло не з UI).
  if (editingPersonId) {
    if (father && father.kind === 'local' && !canSetParent(persons, editingPersonId, father.localId)) { showToast('Обраний батько створив би цикл у дереві (сам собі предок/нащадок).'); return; }
    if (mother && mother.kind === 'local' && !canSetParent(persons, editingPersonId, mother.localId)) { showToast('Обрана мати створила б цикл у дереві (сама собі предок/нащадок).'); return; }
    for (const c of childrenLocal) {
      if (!canSetChild(persons, editingPersonId, c.localId)) { showToast('Одна з обраних дітей створила б цикл у дереві — вибір не збережено для неї.'); return; }
    }
  }
  if (spouse && spouse.kind === 'local' && !canSetSpouse(editingPersonId || '', spouse.localId)) {
    showToast('Особа не може бути власним чоловіком/дружиною.');
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
    father, mother, spouse,
    marriageDate: document.getElementById('pMarriageDate').value.trim(),
    marriagePlace: document.getElementById('pMarriagePlace').value.trim(),
    children,
  };

  let savedPerson;
  if (editingPersonId) {
    const p = persons.find(x => x.localId === editingPersonId);
    if (p) { Object.assign(p, fields); savedPerson = p; }
    syncChildrenParentage(editingPersonId, savedPerson, children);
    cancelPersonEdit();
    render();
    showToast('Зміни збережено.');
    return;
  }

  const localId = 'p' + (nextLocalId++);
  savedPerson = { localId, ...fields };
  persons.push(savedPerson);
  syncChildrenParentage(localId, savedPerson, children);
  cancelPersonEdit();
  render();
  showToast('Людину додано.');
});

// ---- Очистити все ----
document.getElementById('btn-clear-all').addEventListener('click', () => {
  if (!persons.length) return;
  if (!confirm('Очистити всю базу людей у цьому редакторі? Це не можна скасувати.')) return;
  persons = [];
  nextLocalId = 1;
  cancelPersonEdit();
  render();
});

// ---- Зберегти як GEDCOM ----
// За проханням: після успішного збереження файл готовий, і список одразу
// очищується — наступна база починається "з чистого аркуша". Сам файл
// лишається на диску як повноцінна резервна копія (і його завжди можна
// підвантажити назад кнопкою "Завантажити базу", якщо треба щось доправити).
document.getElementById('btn-save-base').addEventListener('click', () => {
  if (!persons.length) { showToast('Спочатку додай хоча б одну людину.'); return; }
  const gedcomText = buildBaseGedcom(persons);
  downloadGedcom('living_base.ged', gedcomText);

  persons = [];
  nextLocalId = 1;
  cancelPersonEdit();
  render();
  showToast('Файл living_base.ged збережено. Список очищено — можна заводити наступних людей.');
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

// Розбирає GEDCOM-файл бази (наш власний формат: реальні особи + автоматично
// згенеровані заглушки _ANCHOR Y для зовнішніх посилань) назад у чернетки.
// Підтримує на кожну особу лише ПЕРШУ сім'ю, де вона чоловік/дружина
// (тобто один шлюб/спискок дітей на людину) — обмеження поточної моделі.
function importFromGedcom(text, opts = {}) {
  const { individuals, families } = buildIndex(text);
  if (!opts.silent && persons.length &&
      !confirm('Поточний список у редакторі буде ЗАМІНЕНО вмістом файлу. Продовжити?')) return;

  persons = [];
  nextLocalId = 1;
  cancelPersonEdit();

  const idRemap = new Map();      // file id (реальна особа) -> новий localId
  const anchorInfo = new Map();   // file id (якір) -> { fsftid, label }
  for (const p of individuals.values()) {
    if (p.isAnchor) anchorInfo.set(p.id, { fsftid: p.fsftid || '', label: (p.name || '').replace(/\//g, '').trim() });
    else idRemap.set(p.id, 'p' + (nextLocalId++));
  }

  function resolveRef(fileId) {
    if (!fileId) return null;
    if (idRemap.has(fileId)) return localRef(idRemap.get(fileId));
    if (anchorInfo.has(fileId)) { const a = anchorInfo.get(fileId); return a.fsftid ? externalRef(a.fsftid, a.label) : null; }
    return null;
  }

  for (const p of individuals.values()) {
    if (p.isAnchor) continue;
    const localId = idRemap.get(p.id);

    let father = null, mother = null;
    const famcId = p.famc[0];
    const famc = famcId ? families.get(famcId) : null;
    if (famc) { father = resolveRef(famc.husb); mother = resolveRef(famc.wife); }

    let spouse = null, marriageDate = '', marriagePlace = '', children = [];
    const famsId = p.fams[0]; // лише перший шлюб — обмеження поточної моделі
    const fams = famsId ? families.get(famsId) : null;
    if (fams) {
      const otherFileId = fams.husb === p.id ? fams.wife : fams.husb;
      spouse = resolveRef(otherFileId);
      marriageDate = fams.marr?.date || '';
      marriagePlace = fams.marr?.plac || '';
      // Локальних дітей не дублюємо тут — їхній зв'язок і так відновлюється
      // через власне FAMC кожної дитини нижче; лишаємо тільки зовнішніх
      // (за _FSFTID), бо в них немає власного запису father/mother у базі.
      children = fams.chil.map(resolveRef).filter(r => r && r.kind === 'external');
    }

    // GIVN за конвенцією застосунку: перше слово — ім'я, решта — по батькові.
    const surnameFromName = (p.name.match(/\/([^/]*)\//) || [, ''])[1];
    const givnRaw = p.givn || (p.name || '').replace(/\/[^/]*\//, '').trim();
    const givnParts = givnRaw.split(/\s+/).filter(Boolean);
    const given = givnParts[0] || '';
    let patronymic = givnParts.slice(1).join(' ');
    const surname = p.surn || surnameFromName;
    if (surname) {
      const patrWords = patronymic.split(/\s+/);
      while (patrWords.length && patrWords[patrWords.length - 1].toLowerCase() === surname.toLowerCase()) {
        patrWords.pop();
      }
      patronymic = patrWords.join(' ');
    }

    persons.push({
      localId, given, patronymic, surname,
      sex: p.sex === 'M' || p.sex === 'F' ? p.sex : '',
      fsftid: p.fsftid || '',
      birthDate: p.birt.date || '', birthPlace: p.birt.plac || '',
      deathDate: p.deat.date || '', deathPlace: p.deat.plac || '',
      father, mother, spouse, marriageDate, marriagePlace, children,
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

// Якщо редактор відкрито кнопкою "➕" на картці в перегляді дерева — там уже
// лежить запит "додай мені {rel}" із _FSFTID тієї особи. Підхоплюємо й
// одразу проставляємо відповідне поле зв'язку в порожній формі нової людини.
const ADD_RELATIVE_KEY = 'gedcom_people_add_relative_v1';
try {
  const raw = sessionStorage.getItem(ADD_RELATIVE_KEY);
  if (raw) {
    sessionStorage.removeItem(ADD_RELATIVE_KEY);
    applyAddRelativePrefill(JSON.parse(raw));
  }
} catch { /* биті дані в sessionStorage — просто ігноруємо, форма лишається порожньою */ }

function applyAddRelativePrefill(req) {
  cancelPersonEdit(); // чистий старт форми
  const ref = externalRef(req.fsftid, req.label || '');
  const RELATION_LABELS = { father: 'батька', mother: 'матір', spouse: 'чоловіка/дружину', child: 'дитину' };

  if (req.rel === 'father' || req.rel === 'mother') {
    // Нова людина стає БАТЬКОМ/МАТІР'Ю цільової особи -> цільова особа
    // потрапляє в список "Діти" нової людини (як зовнішнє посилання).
    childExtDraft = [{ fsftid: req.fsftid, label: req.label || '' }];
    renderChildExtChips();
    document.getElementById('pSex').value = req.rel === 'father' ? 'M' : 'F';
  } else if (req.rel === 'spouse') {
    writeRef(ref, 'pSpouseLocal', 'pSpouseFsftid', 'pSpouseLabel');
  } else if (req.rel === 'child') {
    // Нова людина стає ДИТИНОЮ цільової особи -> проставляємо цільову особу
    // як батька чи матір, залежно від її статі (за замовчуванням — батько).
    if (req.targetSex === 'F') writeRef(ref, 'pMotherLocal', 'pMotherFsftid', 'pMotherLabel');
    else writeRef(ref, 'pFatherLocal', 'pFatherFsftid', 'pFatherLabel');
  }

  document.getElementById('pGiven').focus();
  const relLabel = RELATION_LABELS[req.rel] || req.rel;
  showToast(`Заповни ім'я — цю людину буде додано як ${relLabel} для «${req.label || req.fsftid}».`);
}
