// ===================== ПЕРЕГЛЯД ЗМІН (DIFF) =====================
import { state } from '../state.js';
import { highlightDiff } from '../engine/translate.js';

export function escHtml(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export function renderReview() {
  const body = document.getElementById('diffBody');
  const empty = document.getElementById('diffEmpty');
  if (!state.diffData.length) { body.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  const fNames = document.getElementById('flt-names').checked;
  const fSurn = document.getElementById('flt-surn').checked;
  const fPlaces = document.getElementById('flt-places').checked;
  const fDates = document.getElementById('flt-dates').checked;
  const fOther = document.getElementById('flt-other').checked;
  const fAutoOnly = document.getElementById('flt-auto-only')?.checked;
  const q = (document.getElementById('reviewSearch').value || '').toLowerCase();

  const catFilter = { names: fNames, surn: fSurn, places: fPlaces, dates: fDates, other: fOther };

  const filtered = state.diffData.filter(d => {
    if (!catFilter[d.cat]) return false;
    if (fAutoOnly && !d.auto) return false;
    if (q && !d.orig.toLowerCase().includes(q) && !d.translated.toLowerCase().includes(q)) return false;
    return true;
  });

  const autoCount = state.diffData.filter(d => d.auto).length;
  document.getElementById('review-count').textContent =
    `${filtered.length} рядків` + (autoCount ? ` · ${autoCount} потребують перевірки (авто)` : '');

  body.innerHTML = filtered.map(d => `<tr>
    <td class="diff-line-num">${d.lineNum}</td>
    <td class="diff-tag">${escHtml(d.tag)}</td>
    <td class="diff-orig">${escHtml(d.orig)}</td>
    <td class="diff-new">${highlightDiff(d.orig, d.translated, escHtml)}${d.auto ? ' <span class="auto-badge" title="Автотранслітерація — не підтверджено словником, перевір вручну">авто</span>' : ''}</td>
  </tr>`).join('');
}
