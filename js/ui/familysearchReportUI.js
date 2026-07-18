// ===================== ВКЛАДКА «ЗВІТ FAMILYSEARCH» =====================
import { state } from '../state.js';
import { buildReportRows } from '../engine/familysearchReport.js';
import { buildReportHtml } from '../engine/familysearchReportHtml.js';
import { downloadText } from '../core/download.js';

let lastRows = null;
let lastSource = '';

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export function initFsReportTab() {
  const has = !!(state.rawContent);
  document.getElementById('fsrEmpty').style.display = has ? 'none' : 'block';
  document.getElementById('fsrControls').style.display = has ? 'flex' : 'none';
  document.getElementById('fsr-source-translated').disabled = !state.translatedContent;
  if (!state.translatedContent) {
    document.getElementById('fsr-source-translated').parentElement.title = 'Спочатку виконай переклад на вкладці «Переклад»';
  }
}

export function generateFsReport() {
  const source = document.querySelector('input[name="fsrSource"]:checked').value;
  const content = source === 'translated' ? state.translatedContent : state.rawContent;
  if (!content) { alert('Немає даних для обраного джерела.'); return; }

  lastRows = buildReportRows(content);
  lastSource = source;
  renderPreview();
  document.getElementById('fsrPreviewSection').style.display = 'flex';
  document.getElementById('btn-fsr-download').disabled = false;
}

function renderPreview() {
  document.getElementById('fsr-count').textContent = `${lastRows.length} осіб`;
  runFilter();
}

export function runFsrFilter() {
  runFilter();
}

function runFilter() {
  if (!lastRows) return;
  const q = (document.getElementById('fsrSearch').value || '').trim().toLowerCase();
  const filtered = q
    ? lastRows.filter(r => [r.fsftid, r.given, r.patr, r.surn, r.birthDate, r.birthPlace].some(v => (v || '').toLowerCase().includes(q)))
    : lastRows;

  const body = document.getElementById('fsrBody');
  document.getElementById('fsr-visible-count').textContent = `${filtered.length} з ${lastRows.length}`;
  body.innerHTML = filtered.slice(0, 500).map(r => `
    <tr>
      <td>${r.fsftid ? `<a href="https://www.familysearch.org/tree/person/details/${encodeURIComponent(r.fsftid)}" target="_blank" rel="noopener" class="fsftid-badge">${esc(r.fsftid)} ↗</a>` : '<span style="color:var(--muted);">—</span>'}</td>
      <td>${esc(r.given) || '—'}</td>
      <td>${esc(r.patr) || '—'}</td>
      <td>${esc(r.surn) || '—'}</td>
      <td>${esc(r.birthDate) || '—'}</td>
      <td>${esc(r.birthPlace) || '—'}</td>
    </tr>`).join('') + (filtered.length > 500 ? `<tr><td colspan="6" class="empty-hint">…і ще ${filtered.length - 500}. У завантаженому HTML-файлі будуть усі рядки.</td></tr>` : '');
}

export function downloadFsReport() {
  if (!lastRows) return;
  const html = buildReportHtml(lastRows, {
    fileName: state.fileName || 'gedcom',
    source: lastSource,
    generatedAt: new Date().toLocaleString('uk-UA'),
  });
  downloadText((state.fileName || 'gedcom').replace(/\.[^.]+$/, '') + `_familysearch_${lastSource === 'translated' ? 'укр' : 'оригінал'}.html`, html, 'text/html;charset=utf-8');
}
