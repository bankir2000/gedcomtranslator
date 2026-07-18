// ===================== НЕПЕРЕВЕДЕНІ СЛОВА =====================
import { state } from '../state.js';
import { addLearnedEntry } from '../dict/sets.js';
import { addLearnedPatr } from '../dict/store.js';
import { escHtml } from './reviewUI.js';

export function renderUntrans() {
  const body = document.getElementById('untransBody');
  const empty = document.getElementById('untransEmpty');
  if (!state.untransData.length) { body.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  body.innerHTML = state.untransData.map((e, i) => {
    const ctx0 = e.contexts[0];
    const ctxLine = (ctx0 && ctx0.line) || '';
    // Збираємо УСІ унікальні _FSFTID серед збережених контекстів (до 3) —
    // щоб завжди можна було звіритись з FamilySearch напряму з цього списку.
    const fsftids = [...new Set(e.contexts.map(c => c && c.fsftid).filter(Boolean))];
    const fsftidHtml = fsftids.length
      ? fsftids.map(id => `<a href="https://www.familysearch.org/tree/person/details/${encodeURIComponent(id)}" target="_blank" rel="noopener" class="fsftid-badge">${escHtml(id)} ↗</a>`).join(' ')
      : '<span style="color:var(--muted);font-size:.75rem;">—</span>';
    return `<tr>
    <td><span class="word-ru">${escHtml(e.word)}</span></td>
    <td><span class="count-badge">${e.count}×</span></td>
    <td><div class="ctx-line" title="${escHtml(ctxLine)}">${escHtml(ctxLine) || '—'}</div></td>
    <td>${fsftidHtml}</td>
    <td><input class="untrans-input" id="uinput-${i}" placeholder="Переклад…" value="${escHtml(e.ukInput || '')}"></td>
    <td><select class="type-sel" id="utype-${i}">
      <option value="name">Ім'я</option>
      <option value="patr">По-батькові</option>
      <option value="surn">Прізвище</option>
      <option value="place">Місце</option>
      <option value="other">Інше</option>
    </select></td>
    <td>
      <button class="btn btn-ghost btn-sm untrans-add-btn" data-idx="${i}">+ До словника</button>
      <button class="btn btn-ghost btn-sm untrans-same-btn" data-idx="${i}" title="Українською пишеться так само, як і російською — додати як є">= Однаково</button>
    </td>
  </tr>`;
  }).join('');

  body.querySelectorAll('.untrans-add-btn').forEach(btn => {
    btn.addEventListener('click', () => addUntransToDict(+btn.dataset.idx));
  });
  body.querySelectorAll('.untrans-same-btn').forEach(btn => {
    btn.addEventListener('click', () => addSameUntransToDict(+btn.dataset.idx));
  });
}

function saveEntry(type, ru, uk) {
  if (type === 'patr') addLearnedPatr(ru, uk);
  else addLearnedEntry(type, ru, uk);
}

function addUntransToDict(i) {
  const uk = document.getElementById(`uinput-${i}`).value.trim();
  const type = document.getElementById(`utype-${i}`).value;
  if (!uk) { alert('Введи переклад!'); return; }
  const ru = state.untransData[i].word;
  saveEntry(type, ru, uk);
  state.untransData[i].ukInput = uk;
  state.untransData.splice(i, 1);
  updateUntransBadge();
  renderUntrans();
}

// «= Однаково» — підтверджує, що слово пишеться однаково в обох мовах
// (типово для частини прізвищ і топонімів), і одразу вносить його в довідник як є,
// без потреби вручну передруковувати те саме слово в поле перекладу.
function addSameUntransToDict(i) {
  const type = document.getElementById(`utype-${i}`).value;
  const ru = state.untransData[i].word;
  saveEntry(type, ru, ru);
  state.untransData[i].ukInput = ru;
  state.untransData.splice(i, 1);
  updateUntransBadge();
  renderUntrans();
}

export function addAllUntransToDict() {
  let added = 0;
  state.untransData.forEach((_, i) => {
    const inp = document.getElementById(`uinput-${i}`);
    const sel = document.getElementById(`utype-${i}`);
    if (!inp || !sel) return;
    const uk = inp.value.trim();
    if (!uk) return;
    const ru = state.untransData[i].word;
    saveEntry(sel.value, ru, uk);
    added++;
  });
  if (added) {
    state.untransData = state.untransData.filter((_, i) => !document.getElementById(`uinput-${i}`)?.value.trim());
    updateUntransBadge();
    renderUntrans();
  }
}

export function updateUntransBadge() {
  const b = document.getElementById('badge-untrans');
  if (state.untransData.length) { b.style.display = 'inline'; b.textContent = state.untransData.length; }
  else b.style.display = 'none';
  document.getElementById('untrans-count').textContent = `${state.untransData.length} слів`;
}

export function updateChangeBadge(n) {
  const b = document.getElementById('badge-changes');
  if (n) { b.style.display = 'inline'; b.textContent = n; } else b.style.display = 'none';
}
