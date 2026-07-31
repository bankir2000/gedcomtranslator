// ===================== ВІКНО РОДИННОГО ДЕРЕВА (family-chart) =====================
// Ця сторінка отримує дані виключно через sessionStorage (їх кладе туди
// js/ui/treeUI.js перед відкриттям вікна) — жодних власних імпортів рушія
// перекладача тут немає, вікно повністю самодостатнє.
//
// Бібліотека тягнеться з CDN (+esm-збірка jsDelivr вже включає d3 як
// залежність) — це свідомий вибір: офлайн-кешування цього вікна в Service
// Worker навмисно НЕ зроблено, дерево працює лише за наявності інтернету.
import * as f3 from 'https://cdn.jsdelivr.net/npm/family-chart@0.9.0/+esm';
import { renderFanChart } from './fanChart.js?v=7';
import { openPageOrNavigate, closeOrNavigateBack } from '../ui/navUtil.js';

const FS_BASE = 'https://www.familysearch.org/tree/person/details/';
const STORAGE_KEY = 'gedcom_tree_graph_v1';
const THEME_KEY = 'gedcom_theme';

let mode = 'tree'; // 'tree' | 'fan'
let fanGenerations = 6;
let currentRootId = null;
let nodesById = new Map();
let f3ChartInstance = null;

// Скільки поколінь вгору/вниз від кореня показувати одразу розгорнутими —
// решта згорнута за замовчуванням (розгортається кліком на "+" гілки).
// Саме відсутність цього обмеження й спричиняла накладання карток одна на
// одну, коли в дереві були тисячі осіб.
const INITIAL_ANCESTRY_DEPTH = 4;
const INITIAL_PROGENY_DEPTH = 4;

// ---- Тема (день/ніч) — та сама пара класів/ключ localStorage, що й в основному вікні ----
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

// ---- Шкала масштабування в шапці ----
// family-chart не документує окремий API для програмного зуму, але зум/пан
// реалізовано через d3-zoom, який слухає події "wheel" прямо на своєму <svg>.
// Тому кнопки +/− і повзунок просто симулюють колесо миші над центром
// дерева — це той самий механізм, що й реальна прокрутка/пінч.
function dispatchZoomWheel(deltaY) {
  const svg = container.querySelector('svg');
  if (!svg) return;
  const rect = container.getBoundingClientRect();
  svg.dispatchEvent(new WheelEvent('wheel', {
    deltaY,
    bubbles: true,
    cancelable: true,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
  }));
}

document.getElementById('zoomInBtn').addEventListener('click', () => dispatchZoomWheel(-120));
document.getElementById('zoomOutBtn').addEventListener('click', () => dispatchZoomWheel(120));

let lastZoomSliderValue = 0;
const zoomSlider = document.getElementById('treeZoomSlider');
zoomSlider.addEventListener('input', () => {
  const value = Number(zoomSlider.value);
  const diff = value - lastZoomSliderValue;
  lastZoomSliderValue = value;
  dispatchZoomWheel(-diff * 45);
});

// Контейнер дерева має починатись рівно під тулбаром — вимірюємо його реальну
// висоту (він може переноситись на 2 рядки на вузьких екранах) замість
// вгаданого числа в CSS, інакше бібліотека рахує розміри неправильно і
// частина дерева (зокрема лінії зв'язків) виявляється відрізаною.
function syncContainerTop() {
  const toolbar = document.getElementById('treeViewToolbar');
  const h = toolbar.offsetHeight;
  document.getElementById('treeChartContainer').style.top = h + 'px';
  document.getElementById('treeViewEmpty').style.paddingTop = h + 'px';
}
syncContainerTop();
window.addEventListener('resize', syncContainerTop);

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Підстраховка до CSS-фіксу: підтверджено діагностикою, що <svg> бібліотеки
// family-chart створюється без атрибутів width/height — виставляємо їх
// напряму, про всяк випадок, якщо якісь внутрішні розрахунки бібліотеки
// читають саме атрибути, а не обчислений CSS-розмір. mode-aware: у режимі
// "віяло" тут свій власний <svg> (з width:100%/height:100% у CSS), і його
// чіпати не треба — раніше ця функція була вкладена в renderTreeMode і
// реєструвалась заново при КОЖНОМУ перемиканні режимів, накопичуючи
// обробники resize, які могли зіпсувати розмір SVG віяла.
function syncSvgSize() {
  if (mode !== 'tree') return;
  const svg = container.querySelector('svg');
  if (!svg) return;
  const rect = container.getBoundingClientRect();
  svg.setAttribute('width', String(rect.width));
  svg.setAttribute('height', String(rect.height));
}
window.addEventListener('resize', syncSvgSize);

let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// Дістає наш об'єкт data:{...} з того, що family-chart передає в колбек кліку —
// точна форма "d" в TreeDatum документацією не деталізується, тож перевіряємо
// кілька правдоподібних рівнів вкладеності замість покладатись на один.
function extractPersonData(d) {
  const candidates = [d, d && d.data, d && d.data && d.data.data];
  for (const c of candidates) {
    if (c && typeof c === 'object' && ('fsftid' in c || 'first name' in c)) return c;
  }
  return null;
}

// ---- Завантаження даних, підготовлених основним вікном ----
let payload = null;
try {
  payload = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
} catch { /* пошкоджені дані — трактуємо як відсутні */ }

const container = document.getElementById('treeChartContainer');
const emptyEl = document.getElementById('treeViewEmpty');

function showFatalError(err) {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;top:58px;left:0;right:0;background:#ffe;color:#900;' +
    'font:12px monospace;padding:10px;white-space:pre-wrap;z-index:999;max-height:50vh;overflow:auto;' +
    'border-bottom:2px solid #900;';
  box.textContent = '❌ Помилка під час побудови дерева:\n' + (err && err.stack ? err.stack : String(err));
  document.body.appendChild(box);
}
window.addEventListener('error', (e) => showFatalError(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => showFatalError(e.reason));

if (!payload || !Array.isArray(payload.nodes) || !payload.nodes.length) {
  emptyEl.style.display = 'flex';
  container.style.display = 'none';
} else {
  try {
    initChart(payload);
  } catch (err) {
    showFatalError(err);
  }
}

function initChart(data) {
  document.getElementById('rootPersonLabel').textContent = data.rootLabel || '';
  document.getElementById('nodeCount').textContent = `${data.count} ос. у дереві`;
  if (data.truncated) document.getElementById('truncatedBadge').style.display = 'inline-block';

  currentRootId = data.rootId;
  nodesById = new Map(data.nodes.map(n => [n.id, n]));

  // Пошук і діагностику готуємо одразу — незалежно від того, який режим
  // (дерево/віяло) активний і чи впаде він з помилкою на конкретних даних.
  initSearch(data);
  initDebugPanel();
  initModeToggle(data);

  renderCurrentMode(data);
}

function renderCurrentMode(data) {
  document.getElementById('treeFanGenWrap').style.display = mode === 'fan' ? 'flex' : 'none';
  document.getElementById('treeZoomWrap').style.display = mode === 'fan' ? 'none' : 'flex';
  document.getElementById('debugBtn').style.display = mode === 'fan' ? 'none' : 'inline-flex';
  document.getElementById('fanHint').style.display = mode === 'fan' ? 'block' : 'none';

  if (mode === 'tree') {
    renderTreeMode(data);
  } else {
    renderFanMode();
  }
}

// ---- Режим "Дерево" (family-chart) ----
function renderTreeMode(data) {
  container.innerHTML = '';

  // Індекс "id -> вузол" для цього графа — потрібен, щоб на картці визначити,
  // яких зв'язків (батько/мати) ще бракує (дивимось стать уже прив'язаних
  // rels.parents), не запитуючи це в самої бібліотеки.
  const nodeIndex = new Map(data.nodes.map(n => [n.id, n]));

  // ---- Сам граф: family-chart сам малює чоловіка/дружину поруч, дітей під
  // ними, батьків зверху. setAncestryDepth/setProgenyDepth обмежують, скільки
  // поколінь показано розгорнутими одразу (решта — за іконкою "+" на гілці) —
  // без цього з тисячами осіб у графі картки накладались одна на одну.
  //
  // setCardXSpacing/setCardYSpacing — додаткові відступи між картками
  // (за замовчуванням вони йшли впритул одна до одної при густому дереві).
  const f3Chart = f3.createChart('#treeChartContainer', data.nodes)
    .setAncestryDepth(INITIAL_ANCESTRY_DEPTH)
    .setProgenyDepth(INITIAL_PROGENY_DEPTH)
    .setCardXSpacing(270)
    .setCardYSpacing(260);
  f3ChartInstance = f3Chart;

  // Замість вбудованого шаблону картки (він виявився ненадійним — рамка
  // не показувалась) малюємо картку повністю самі: ім'я окремим рядком,
  // рік народження (★) і смерті (✝) — кожен на своєму рядку, рамка й фон —
  // звичайний CSS, який ми повністю контролюємо.
  const f3Card = f3Chart.setCardHtml()
    .setCardDim({ width: 210, height: 155 });

  f3Card.setCardInnerHtmlCreator((d) => {
    const person = extractPersonData(d) || {};
    const isMain = !!(d && d.data && d.data.main);
    const genderClass = person.gender === 'M' ? 'tv-card-m' : (person.gender === 'F' ? 'tv-card-f' : 'tv-card-u');
    const lines = [];
    if (person.birthYear) lines.push(`★ ${esc(String(person.birthYear))}`);
    if (person.deathYear) lines.push(`✝ ${esc(String(person.deathYear))}`);
    if (person.marriageYear) lines.push(`💍 ${esc(String(person.marriageYear))}`);

    // ---- Кнопки "➕ додати родича" — лише якщо в цієї особи є власний
    // _FSFTID (інакше нема на що спертись зовнішнім посиланням у редакторі
    // "Люди") і лише для дійсно відсутнього батька/матері; чоловіка/дружину
    // й дитину можна додати завжди (шлюбів і дітей може бути кілька). ----
    let addButtons = '';
    if (person.fsftid) {
      const node = nodeIndex.get(d.data.id);
      const parents = (node?.rels?.parents || []).map(id => nodeIndex.get(id)).filter(Boolean);
      const hasFather = parents.some(p => p.data.gender === 'M');
      const hasMother = parents.some(p => p.data.gender === 'F');
      const btns = [];
      if (!hasFather) btns.push(['father', '👨', 'Додати батька']);
      if (!hasMother) btns.push(['mother', '👩', 'Додати матір']);
      btns.push(['spouse', '💍', 'Додати чоловіка/дружину']);
      btns.push(['child', '🧒', 'Додати дитину']);
      addButtons = `<div class="tv-card-add">${btns.map(([rel, icon, title]) =>
        `<button type="button" class="tv-add-btn" data-rel="${rel}" title="${esc(title)}">➕${icon}</button>`
      ).join('')}</div>`;
    }

    return `
      <div class="tv-card ${genderClass}${isMain ? ' tv-card-main' : ''}">
        <div class="tv-card-name">${esc(person['first name'] || '(без імені)')}</div>
        ${lines.map(l => `<div class="tv-card-line">${l}</div>`).join('')}
        ${addButtons}
      </div>
    `;
  });

  // ---- Клік по картці особи -> FamilySearch за _FSFTID, АБО, якщо клікнули
  // саме кнопку "➕", відкриваємо редактор "Люди" з готовим зв'язком. ----
  f3Card.setOnCardClick((e, d) => {
    const addBtn = e.target.closest && e.target.closest('.tv-add-btn');
    if (addBtn) {
      e.stopPropagation();
      const person = extractPersonData(d);
      openAddRelative(addBtn.dataset.rel, person);
      return;
    }
    const person = extractPersonData(d);
    const fsftid = person && person.fsftid;
    if (fsftid) {
      openPageOrNavigate(FS_BASE + encodeURIComponent(fsftid));
    } else {
      showToast('У цієї особи немає _FSFTID у файлі — перехід на FamilySearch неможливий.');
    }
  });

  f3Chart.updateTree({ initial: true, tree_position: 'fit' });
  syncSvgSize();
}

// Передає запит "додай мені {rel}" у редактор "Люди" через sessionStorage —
// той сам підхоплює його при завантаженні (той самий місток, що вже
// використовується для передачі бази на редагування).
const ADD_RELATIVE_KEY = 'gedcom_people_add_relative_v1';
function openAddRelative(rel, person) {
  if (!person || !person.fsftid) {
    showToast('У цієї особи немає _FSFTID — додати родича через дерево не можна.');
    return;
  }
  const label = (person['first name'] || '').trim();
  try {
    sessionStorage.setItem(ADD_RELATIVE_KEY, JSON.stringify({
      rel, fsftid: person.fsftid, label, targetSex: person.gender || '',
    }));
  } catch {
    showToast('Не вдалося передати дані в редактор.');
    return;
  }
  openPageOrNavigate('people-editor.html');
}

// ---- Режим "Віяло" (fanChart.js — власна реалізація на D3, family-chart
// такого типу діаграми не підтримує ні в безкоштовній, ні в платній версії) ----
function renderFanMode() {
  f3ChartInstance = null;
  renderFanChart(container, nodesById, currentRootId, fanGenerations, {
    onTap: (node) => {
      if (!node) return;
      currentRootId = node.id;
      const d = node.data || {};
      const years = [d.birthYear, d.deathYear].filter(Boolean).join('–');
      document.getElementById('rootPersonLabel').textContent = years ? `${d['first name'] || ''} (${years})` : (d['first name'] || '');
      renderFanMode();
    },
    onLongPress: (node) => {
      const fsftid = node?.data?.fsftid;
      if (fsftid) {
        openPageOrNavigate(FS_BASE + encodeURIComponent(fsftid));
      } else {
        showToast('У цієї особи немає _FSFTID у файлі — перехід на FamilySearch неможливий.');
      }
    },
  });
}

function initModeToggle() {
  const btn = document.getElementById('modeToggleBtn');
  btn.addEventListener('click', () => {
    mode = mode === 'tree' ? 'fan' : 'tree';
    btn.textContent = mode === 'tree' ? '🌀 Віяло' : '📊 Дерево';
    renderCurrentMode({ nodes: [...nodesById.values()] });
  });

  const genSlider = document.getElementById('fanGenSlider');
  const genValue = document.getElementById('fanGenValue');
  genSlider.addEventListener('input', () => {
    fanGenerations = Number(genSlider.value);
    genValue.textContent = String(fanGenerations);
    if (mode === 'fan') renderFanMode();
  });
}

function initDebugPanel() {
  const btn = document.getElementById('debugBtn');
  let panel = null;

  function collectInfo() {
    const svg = container.querySelector('svg');
    const containerRect = container.getBoundingClientRect();
    const lines = ['Контейнер #treeChartContainer:',
      `  getBoundingClientRect: ${JSON.stringify(containerRect)}`,
      `  scrollWidth/Height: ${container.scrollWidth} / ${container.scrollHeight}`,
      ''];
    if (!svg) {
      lines.push('❌ svg-елемент не знайдено всередині контейнера.');
    } else {
      const rect = svg.getBoundingClientRect();
      lines.push('Знайдений <svg>:');
      lines.push(`  width attr: ${svg.getAttribute('width')}, height attr: ${svg.getAttribute('height')}`);
      lines.push(`  viewBox attr: ${svg.getAttribute('viewBox')}`);
      lines.push(`  style.width: ${svg.style.width}, style.height: ${svg.style.height}`);
      lines.push(`  getBoundingClientRect: ${JSON.stringify(rect)}`);
      const paths = svg.querySelectorAll('path');
      lines.push(`  кількість <path> (лінії зв'язків): ${paths.length}`);
      let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
      paths.forEach(p => {
        try {
          const b = p.getBBox();
          minY = Math.min(minY, b.y); maxY = Math.max(maxY, b.y + b.height);
          minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x + b.width);
        } catch { /* деякі path можуть не мати getBBox у прихованому стані */ }
      });
      lines.push(`  діапазон Y усіх path (у координатах svg): ${minY} … ${maxY}`);
      lines.push(`  діапазон X усіх path (у координатах svg): ${minX} … ${maxX}`);

      // Знайти зовнішню трансформовану групу (там, де лежать самі картки й лінії)
      const g = svg.querySelector('g');
      if (g) {
        const gRect = g.getBoundingClientRect();
        lines.push('');
        lines.push('Перша <g> всередині svg:');
        lines.push(`  transform attr: ${g.getAttribute('transform')}`);
        lines.push(`  getBoundingClientRect: ${JSON.stringify(gRect)}`);
      }
    }

    const cards = container.querySelectorAll('.tv-card');
    lines.push('');
    lines.push(`Кількість відмальованих карток (.tv-card): ${cards.length}`);

    return lines.join('\n');
  }

  btn.addEventListener('click', () => {
    if (panel) { panel.remove(); panel = null; return; }
    panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;top:58px;left:0;right:0;bottom:0;background:rgba(0,0,0,.92);' +
      'color:#0f0;font:11px monospace;padding:10px;white-space:pre-wrap;z-index:998;overflow:auto;';
    panel.textContent = collectInfo();
    document.body.appendChild(panel);
  });
}
// ---- Пошук іншої особи в межах уже завантаженого графа ----
// Весь зв'язний граф родини вже лежить у пам'яті (nodesById), тож для
// переходу достатньо: у режимі "дерево" — задокументований updateMainId(),
// у режимі "віяло" — просто перерендерити з новим currentRootId.
function initSearch(data) {
  const input = document.getElementById('treeViewSearch');
  const resultsEl = document.getElementById('treeViewSearchResults');

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { resultsEl.innerHTML = ''; return; }
    const found = data.nodes.filter(n => {
      const label = (n.data['first name'] || '').toLowerCase();
      const fsftid = (n.data.fsftid || '').toLowerCase();
      return label.includes(q) || fsftid.includes(q);
    }).slice(0, 20);
    resultsEl.innerHTML = found.length
      ? found.map(n => `<div class="tree-search-item" data-id="${esc(n.id)}"><b>${esc(n.data['first name'])}</b>${n.data.fsftid ? ` <span class="manual-badge">${esc(n.data.fsftid)}</span>` : ''}</div>`).join('')
      : '<div class="empty-hint">Нікого не знайдено.</div>';
    resultsEl.querySelectorAll('.tree-search-item').forEach(elx => {
      elx.addEventListener('click', () => {
        const id = elx.dataset.id;
        currentRootId = id;
        const node = nodesById.get(id);
        if (node) document.getElementById('rootPersonLabel').textContent = node.data['first name'];
        resultsEl.innerHTML = '';
        input.value = '';
        if (mode === 'tree' && f3ChartInstance) {
          f3ChartInstance.updateMainId(id);
          f3ChartInstance.updateTree({ tree_position: 'main_to_middle' });
        } else if (mode === 'fan') {
          renderFanMode();
        }
      });
    });
  });

  document.addEventListener('click', (e) => {
    if (!resultsEl.contains(e.target) && e.target !== input) resultsEl.innerHTML = '';
  });
}
