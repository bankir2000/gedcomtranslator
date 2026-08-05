// ===================== ІМЕНА / ПРІЗВИЩА / МІСЦЯ: ТЕСТЕР + СКАН =====================
// Той самий UI-патерн, що й на вкладці «По-батькові», але без рушія правил —
// тут або слово вже є в довіднику ("ручний"), або його нема і треба ввести переклад.
import { state } from '../state.js';
import { addLearnedEntry } from '../dict/sets.js';
import { scanCategory, CATEGORY_CONFIG, buildWordFsftidIndex } from '../engine/wordScan.js';
import { openPageOrNavigate } from './navUtil.js';

const FS_BASE = 'https://www.familysearch.org/tree/person/details/';

let wordIndexCache = null;
let wordIndexSource = null;
function getWordIndex() {
  const source = state.rawContent;
  if (!source) return new Map();
  if (wordIndexSource !== source) {
    wordIndexCache = buildWordFsftidIndex(source);
    wordIndexSource = source;
  }
  return wordIndexCache;
}

function esc(s) { return (s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

function findInDict(cat, word) {
  const dictType = CATEGORY_CONFIG[cat].dictType;
  const lo = word.toLowerCase();
  return state.dict.find(e => e.type === dictType && e.ru.toLowerCase() === lo);
}

// ---------- ТЕСТЕР ----------
export function testWord(cat) {
  const val = document.getElementById(`${cat}TestInput`).value.trim();
  const res = document.getElementById(`${cat}TestResult`);
  if (!val) { res.innerHTML = ''; return; }
  const entry = findInDict(cat, val);
  if (entry) {
    res.innerHTML = `<span class="pair"><span class="ru-part">${esc(val)}</span><span class="arrow">→</span><span class="uk-part">${esc(entry.uk)}</span><span class="manual-badge">у довіднику</span></span>`;
  } else {
    res.innerHTML = `<span class="pair"><span class="ru-part">${esc(val)}</span><span class="arrow">→</span><span style="color:var(--red);font-size:.75rem;">немає в довіднику — додай через скан файлу нижче або на вкладці «Довідник»</span></span>`;
  }
}

// ---------- СКАН ФАЙЛУ ----------
export function generateWordScan(cat) {
  if (!state.rawContent) { alert('Спочатку завантаж GEDCOM файл на вкладці «Переклад»'); return; }
  const found = scanCategory(state.rawContent, cat);
  const el = document.getElementById(`${cat}AutoList`);
  const label = CATEGORY_CONFIG[cat].label;

  if (found.size === 0) {
    el.innerHTML = `<span style="color:var(--muted)">«${label}» не знайдено у файлі.</span>`;
    return;
  }

  const wordIndex = getWordIndex();
  let html = '';
  for (const [ru, count] of [...found.entries()].sort((a, b) => b[1] - a[1])) {
    const fsftid = wordIndex.get(ru.trim().toLowerCase());
    const fsBtn = fsftid
      ? `<button class="fs-link-btn word-scan-fs-btn" data-fsftid="${esc(fsftid)}" title="Приклад людини з цим словом у файлі — перейти на FamilySearch">🔗</button>`
      : '';
    const entry = findInDict(cat, ru);
    if (entry) {
      html += `<div class="pair" style="margin:3px 0;">`
        + `<span class="ru-part">${esc(ru)}</span><span class="arrow">→</span>`
        + `<span class="manual-badge">ручний: ${esc(entry.uk)}</span>`
        + ` <span style="color:var(--muted);font-size:.75rem;">(${count}×)</span>`
        + fsBtn
        + `</div>`;
      continue;
    }
    html += `<div class="pair" style="margin:3px 0;flex-wrap:wrap;">`
      + `<span class="ru-part">${esc(ru)}</span><span class="arrow">→</span>`
      + `<span style="color:var(--red);font-size:.72rem;">немає в довіднику</span>`
      + ` <span style="color:var(--muted);font-size:.75rem;">(${count}×)</span>`
      + fsBtn
      + `<input type="text" class="search-input word-scan-input" data-ru="${esc(ru)}" data-cat="${cat}" placeholder="Правильний переклад…" style="width:160px;margin-left:6px;">`
      + `<button class="btn btn-ghost word-scan-save-btn" data-ru="${esc(ru)}" data-cat="${cat}" style="padding:2px 8px;font-size:.72rem;">+ до словника (${label})</button>`
      + `</div>`;
  }
  el.innerHTML = html;
  el.querySelectorAll('.word-scan-fs-btn').forEach(btn => {
    btn.addEventListener('click', () => openPageOrNavigate(FS_BASE + encodeURIComponent(btn.dataset.fsftid)));
  });
  el.querySelectorAll('.word-scan-save-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ru = btn.dataset.ru, c = btn.dataset.cat;
      const input = el.querySelector(`.word-scan-input[data-ru="${CSS.escape(ru)}"][data-cat="${CSS.escape(c)}"]`);
      const uk = (input?.value || '').trim();
      if (!uk) { alert('Введи переклад перед додаванням у словник.'); return; }
      addLearnedEntry(CATEGORY_CONFIG[c].dictType, ru, uk);
      generateWordScan(c); // перемальовує список — рядок одразу покаже позначку "ручний"
    });
  });
}
