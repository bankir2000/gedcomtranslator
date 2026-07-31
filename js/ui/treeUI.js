// ===================== ВКЛАДКА «РОДИННЕ ДЕРЕВО» =====================
// Сама вкладка тепер лише обирає особу-«корінь» дерева. Побудова й показ
// дерева відбувається в окремому вікні/вкладці (tree-view.html) на основі
// бібліотеки family-chart — там і живе логіка масштабування, згортання/
// розгортання гілок та переходу на FamilySearch по кліку.
import { state } from '../state.js';
import { buildIndex } from '../engine/analysis.js';
import { searchPeople, buildFamilyGraph, personLabel } from '../engine/familyTree.js';
import { openPageOrNavigate } from './navUtil.js';

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

let cachedOrig = null, cachedOrigSource = null;
let cachedTranslated = null, cachedTranslatedSource = null;
let currentPersonId = null;

function getIndex() {
  const useTranslated = document.querySelector('input[name="treeSource"]:checked')?.value === 'translated';
  if (useTranslated) {
    if (!state.translatedContent) return null;
    if (cachedTranslatedSource !== state.translatedContent) {
      cachedTranslated = buildIndex(state.translatedContent);
      cachedTranslatedSource = state.translatedContent;
    }
    return cachedTranslated;
  }
  if (!state.rawContent) return null;
  if (cachedOrigSource !== state.rawContent) {
    cachedOrig = buildIndex(state.rawContent);
    cachedOrigSource = state.rawContent;
  }
  return cachedOrig;
}

// «Пам'ятає розташування в дереві» — остання обрана особа й джерело зберігаються
// в localStorage і відновлюються при поверненні на вкладку (навіть після
// перезавантаження сторінки).
const LAST_POSITION_KEY = 'gedcom_tree_last_position_v1';
const GRAPH_STORAGE_KEY = 'gedcom_tree_graph_v1';

function saveLastPosition() {
  const source = document.querySelector('input[name="treeSource"]:checked')?.value || 'original';
  localStorage.setItem(LAST_POSITION_KEY, JSON.stringify({ id: currentPersonId, source }));
}

function restoreLastPosition() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_POSITION_KEY) || 'null');
    if (!saved || !saved.id) return;
    if (saved.source === 'translated' && state.translatedContent) {
      document.getElementById('treeSourceTranslated').checked = true;
    }
    currentPersonId = saved.id;
  } catch { /* пошкоджений запис — ігноруємо, почнемо з чистого місця */ }
}

export function initTreeTab() {
  const has = !!(state.rawContent || state.translatedContent);
  document.getElementById('treeEmpty').style.display = has ? 'none' : 'block';
  document.getElementById('treeControls').style.display = has ? 'block' : 'none';
  const translatedRadio = document.getElementById('treeSourceTranslated');
  translatedRadio.disabled = !state.translatedContent;
  document.getElementById('treeSourceTranslatedLabel').style.opacity = state.translatedContent ? '1' : '.5';
  if (!state.translatedContent) document.getElementById('treeSourceOrig').checked = true;
  if (!currentPersonId) restoreLastPosition();
  renderSelectedPerson();
}

export function searchTreePeople() {
  const q = document.getElementById('treeSearchInput').value.trim();
  const resultsEl = document.getElementById('treeSearchResults');
  const idx = getIndex();
  if (!idx) { resultsEl.innerHTML = ''; return; }
  if (!q) { resultsEl.innerHTML = ''; return; }

  const found = searchPeople(idx.individuals, q, 25);
  if (!found.length) { resultsEl.innerHTML = '<div class="empty-hint">Нікого не знайдено.</div>'; return; }
  resultsEl.innerHTML = found.map(p => {
    const name = esc((p.name || '').replace(/\//g, '').trim()) || '(без імені)';
    return `<div class="tree-search-item" data-id="${esc(p.id)}">
      <b>${name}</b> ${p.fsftid ? `<span class="manual-badge">${esc(p.fsftid)}</span>` : '<span class="muted">без FSFTID</span>'}
    </div>`;
  }).join('');
  resultsEl.querySelectorAll('.tree-search-item').forEach(el => {
    el.addEventListener('click', () => selectTreePerson(el.dataset.id));
  });
}

export function selectTreePerson(id) {
  currentPersonId = id;
  document.getElementById('treeSearchResults').innerHTML = '';
  document.getElementById('treeSearchInput').value = '';
  saveLastPosition();
  renderSelectedPerson();
}

export function refreshTreeSelection() {
  renderSelectedPerson();
}

function renderSelectedPerson() {
  const box = document.getElementById('treeSelectedPerson');
  const openBtn = document.getElementById('treeOpenBtn');
  if (!box || !openBtn) return;
  if (!currentPersonId) {
    box.innerHTML = '<span class="muted">Особу ще не обрано — знайди її вище.</span>';
    openBtn.disabled = true;
    return;
  }
  const idx = getIndex();
  const person = idx ? idx.individuals.get(currentPersonId) : null;
  if (!person) {
    box.innerHTML = '<span class="muted">Особу не знайдено в обраному джерелі (можливо, файл змінився) — обери іншу.</span>';
    openBtn.disabled = true;
    return;
  }
  box.innerHTML = `Корінь дерева: <b>${esc(personLabel(person))}</b>` +
    (person.fsftid ? ` <span class="manual-badge">${esc(person.fsftid)}</span>` : ' <span class="muted">без FSFTID</span>');
  openBtn.disabled = false;
}

// Формує граф родини навколо обраної особи й відкриває його в окремій
// вкладці (tree-view.html). Дані передаються через sessionStorage.
//
// НАВМИСНО без іменованого вікна (window.open(url, 'якесь-ім'я')): якщо
// вкладку з тим самим іменем користувач потім вручну перевів на щось зовсім
// інше (інший локальний проєкт на тому ж порту), window.name цієї вкладки
// НЕ скидається — і наступний клік "Відкрити дерево" знаходив би ту стару
// вкладку за іменем і намагався завантажити дерево туди замість нової
// вкладки. Тому щоразу відкриваємо нову — трохи більше вкладок назбирається
// при повторних кліках, зате жодного шансу випадково влізти в чужу вкладку.
export function openTreeWindow() {
  if (!currentPersonId) return;
  const idx = getIndex();
  if (!idx) return;
  const person = idx.individuals.get(currentPersonId);
  if (!person) return;

  const graph = buildFamilyGraph(idx.individuals, idx.families, currentPersonId);
  const payload = {
    nodes: graph.nodes,
    count: graph.count,
    truncated: graph.truncated,
    rootId: currentPersonId,
    rootLabel: personLabel(person),
    generatedAt: Date.now(),
  };

  try {
    sessionStorage.setItem(GRAPH_STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    alert('Не вдалося підготувати дані для дерева — ймовірно, воно завелике для збереження в цій вкладці браузера. Спробуй обрати особу з меншою кількістю пов’язаних родичів.');
    return;
  }

  openPageOrNavigate('tree-view.html');
}
