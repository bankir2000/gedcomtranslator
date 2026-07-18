// ===================== ПОШУК ПО GEDCOM + РЕДАГУВАННЯ ЗАПИСУ (Етап 5) =====================
import { state } from '../state.js';
import { buildIndex } from '../engine/analysis.js';
import { getRecordBlock, replaceRecordBlock, splitLines } from '../engine/gedcomRecord.js';

let cachedIndex = null;
let cachedSource = null;
let editingId = null;

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function activeContent() {
  return state.translatedContent || state.rawContent;
}

function ensureIndex() {
  const source = activeContent();
  if (!source) return null;
  if (cachedSource !== source) {
    cachedIndex = buildIndex(source);
    cachedSource = source;
  }
  return cachedIndex;
}

export function initSearchTab() {
  // Викликається при вході на вкладку — просто гарантує актуальний індекс і показує підказку
  const has = !!activeContent();
  document.getElementById('searchEmpty').style.display = has ? 'none' : 'block';
  document.getElementById('searchControls').style.display = has ? 'flex' : 'none';
}

export function runSearch() {
  const q = document.getElementById('searchQuery').value.trim();
  const mode = document.querySelector('input[name="searchMode"]:checked').value;
  const resultsEl = document.getElementById('searchResults');
  closeEditor();

  if (!q) { resultsEl.innerHTML = ''; document.getElementById('search-count').textContent = ''; return; }
  const qLower = q.toLowerCase();

  if (mode === 'raw') {
    const lines = splitLines(activeContent());
    const results = [];
    let currentRecordId = null, currentRecordType = '';
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const m0 = l.match(/^0 @([^@]+)@ (\S+)/);
      if (m0) { currentRecordId = m0[1]; currentRecordType = m0[2]; }
      if (l.toLowerCase().includes(qLower)) {
        results.push({ lineNum: i + 1, text: l, recordId: currentRecordId, recordType: currentRecordType });
        if (results.length >= 300) break;
      }
    }
    renderRawResults(results, q);
    document.getElementById('search-count').textContent = `${results.length} рядків${results.length >= 300 ? ' (показано перші 300)' : ''}`;
    return;
  }

  const idx = ensureIndex();
  if (!idx) return;
  const hits = [];
  for (const p of idx.individuals.values()) {
    const hay = [p.name, p.givn, p.surn, p.birt.plac, p.deat.plac, p.fsftid].join(' ').toLowerCase();
    if (hay.includes(qLower)) hits.push(p);
    if (hits.length >= 300) break;
  }
  renderPersonResults(hits, idx);
  document.getElementById('search-count').textContent = `${hits.length} осіб${hits.length >= 300 ? ' (показано перші 300)' : ''}`;
}

function renderPersonResults(hits, idx) {
  const el = document.getElementById('searchResults');
  if (!hits.length) { el.innerHTML = '<div class="empty-hint">Нічого не знайдено.</div>'; return; }
  el.innerHTML = hits.map(p => `
    <div class="search-row">
      <div class="search-row-main">
        <b>${esc((p.name || '').replace(/\//g, ''))}</b>
        <span class="search-row-meta">@${p.id}@ ${p.birt.date ? `· нар. ${esc(p.birt.date)}` : ''} ${p.birt.plac ? `· ${esc(p.birt.plac)}` : ''}</span>
      </div>
      <button class="btn btn-ghost btn-sm search-open-btn" data-id="${p.id}">✏️ Відкрити</button>
    </div>`).join('');
  el.querySelectorAll('.search-open-btn').forEach(btn => btn.addEventListener('click', () => openEditor(btn.dataset.id)));
}

function renderRawResults(results, q) {
  const el = document.getElementById('searchResults');
  if (!results.length) { el.innerHTML = '<div class="empty-hint">Нічого не знайдено.</div>'; return; }
  const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
  el.innerHTML = results.map(r => `
    <div class="search-row">
      <div class="search-row-main">
        <span class="diff-line-num">#${r.lineNum}</span>
        ${esc(r.text).replace(re, '<mark>$1</mark>')}
        <span class="search-row-meta">${r.recordId ? `@${r.recordId}@ (${r.recordType})` : ''}</span>
      </div>
      ${r.recordId ? `<button class="btn btn-ghost btn-sm search-open-btn" data-id="${r.recordId}">✏️ Відкрити</button>` : ''}
    </div>`).join('');
  el.querySelectorAll('.search-open-btn').forEach(btn => btn.addEventListener('click', () => openEditor(btn.dataset.id)));
}

function openEditor(id) {
  const block = getRecordBlock(activeContent(), id);
  if (!block) { alert('Запис не знайдено (можливо, файл змінився — повтори пошук).'); return; }
  editingId = id;
  document.getElementById('recordEditor').style.display = 'flex';
  document.getElementById('recordEditorTitle').textContent = `Редагування @${id}@`;
  document.getElementById('recordEditorArea').value = block.lines.join('\n');
  document.getElementById('recordEditor').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function closeEditor() {
  editingId = null;
  document.getElementById('recordEditor').style.display = 'none';
}

export function saveEditor() {
  if (!editingId) return;
  const newText = document.getElementById('recordEditorArea').value;
  const firstLine = newText.split(/\r?\n/)[0] || '';
  if (!new RegExp(`^0 @${editingId}@ `).test(firstLine)) {
    if (!confirm('Перший рядок не схожий на "0 @' + editingId + '@ ..." — структура запису могла злетіти. Все одно зберегти?')) return;
  }

  if (state.translatedContent) {
    state.translatedContent = replaceRecordBlock(state.translatedContent, editingId, newText);
  } else {
    state.rawContent = replaceRecordBlock(state.rawContent, editingId, newText);
  }
  cachedSource = null; // інвалідуємо кеш індексу пошуку
  closeEditor();
  runSearch();
  const note = document.getElementById('searchSaveNote');
  note.style.display = 'block';
  note.textContent = `✅ Запис @${editingId}@ оновлено. Не забудь завантажити файл заново на вкладці «Переклад» або натисни «Завантажити .ged» нижче.`;
  setTimeout(() => { note.style.display = 'none'; }, 6000);
}
