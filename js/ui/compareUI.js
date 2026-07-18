// ===================== ВКЛАДКА «ПОРІВНЯННЯ» (Етап 5) =====================
import { state } from '../state.js';
import { detectAndReadFile } from '../core/encoding.js';
import { buildIndex } from '../engine/analysis.js';
import { compareGedcoms } from '../engine/compare.js';
import { downloadText } from '../core/download.js';

let secondContent = '';
let secondFileName = '';
let lastResult = null;

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export function initCompareTab() {
  document.getElementById('cmpFileInput').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    document.getElementById('cmpFileLabel').textContent = '⏳ Визначення кодування…';
    const { text, encoding } = await detectAndReadFile(f);
    secondContent = text;
    secondFileName = f.name;
    document.getElementById('cmpFileLabel').innerHTML = `✅ ${esc(f.name)} <span class="enc-badge">${encoding}</span>`;
    document.getElementById('btn-run-compare').disabled = false;
  });
}

export function runCompare() {
  const primary = state.translatedContent || state.rawContent;
  if (!primary) { alert('Спочатку завантаж основний файл на вкладці «Переклад».'); return; }
  if (!secondContent) { alert('Спочатку обери другий файл для порівняння.'); return; }

  const idxA = buildIndex(primary);
  const idxB = buildIndex(secondContent);
  lastResult = compareGedcoms(idxA, idxB);
  render();
}

function personLine(p) {
  return `@${p.id}@ — ${esc((p.name || '').replace(/\//g, ''))} ${p.birt.date ? `(нар. ${esc(p.birt.date)})` : ''}${p.fsftid ? ` <span class="manual-badge">${esc(p.fsftid)}</span>` : ''}`;
}

function render() {
  const r = lastResult;
  document.getElementById('cmpEmpty').style.display = r ? 'none' : 'block';
  document.getElementById('cmpResults').style.display = r ? 'flex' : 'none';
  if (!r) return;

  document.getElementById('cmp-summary').textContent =
    `Файл A: ${r.totalA} осіб · Файл B (${secondFileName}): ${r.totalB} осіб · Однакових: ${r.identical.length} · Відмінних: ${r.differing.length} · Тільки в A: ${r.onlyInA.length} · Тільки в B: ${r.onlyInB.length}`;

  document.getElementById('cmpOnlyA').innerHTML = r.onlyInA.length
    ? r.onlyInA.slice(0, 200).map(p => `<div class="search-row-main">${personLine(p)}</div>`).join('')
    : '<div class="empty-hint">Немає.</div>';
  document.getElementById('cmpOnlyB').innerHTML = r.onlyInB.length
    ? r.onlyInB.slice(0, 200).map(p => `<div class="search-row-main">${personLine(p)}</div>`).join('')
    : '<div class="empty-hint">Немає.</div>';

  document.getElementById('cmpDiffering').innerHTML = r.differing.length
    ? r.differing.slice(0, 200).map(d => `
        <div class="dup-group">
          <div class="dup-head">${personLine(d.a)} ↔ ${personLine(d.b)}</div>
          ${d.diffs.map(f => `<div class="dup-member">${esc(f.field)}: <span class="ru-part">${esc(f.a)}</span> <span class="arrow">→</span> <span class="uk-part">${esc(f.b)}</span></div>`).join('')}
        </div>`).join('')
    : '<div class="empty-hint">Розбіжностей не знайдено.</div>';
}

export function downloadCompareReport() {
  const r = lastResult;
  if (!r) return;
  const lines = [];
  lines.push('ЗВІТ ПОРІВНЯННЯ GEDCOM');
  lines.push(`Файл A: ${state.fileName || '—'} (${r.totalA} осіб)`);
  lines.push(`Файл B: ${secondFileName} (${r.totalB} осіб)`);
  lines.push(`Дата: ${new Date().toLocaleString('uk-UA')}`);
  lines.push('');
  lines.push(`=== ТІЛЬКИ В A (${r.onlyInA.length}) ===`);
  for (const p of r.onlyInA) lines.push(`@${p.id}@ ${(p.name || '').replace(/\//g, '')} ${p.birt.date ? `(нар. ${p.birt.date})` : ''}`);
  lines.push('');
  lines.push(`=== ТІЛЬКИ В B (${r.onlyInB.length}) ===`);
  for (const p of r.onlyInB) lines.push(`@${p.id}@ ${(p.name || '').replace(/\//g, '')} ${p.birt.date ? `(нар. ${p.birt.date})` : ''}`);
  lines.push('');
  lines.push(`=== ВІДМІННОСТІ (${r.differing.length}) ===`);
  for (const d of r.differing) {
    lines.push(`@${d.a.id}@ ↔ @${d.b.id}@`);
    for (const f of d.diffs) lines.push(`  ${f.field}: "${f.a}" → "${f.b}"`);
  }

  downloadText('gedcom_порівняння.txt', lines.join('\n'));
}
