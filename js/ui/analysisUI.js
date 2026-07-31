// ===================== ВКЛАДКА «АНАЛІЗ» (Етап 4) =====================
import { state } from '../state.js';
import { runFullAnalysis } from '../engine/analysis.js';
import { downloadText } from '../core/download.js';
import { buildDuplicatesReportHtml } from '../engine/duplicatesReportHtml.js';
import { groupKey, loadDismissed, saveDismissed } from '../core/dismissedDuplicates.js';
import { loadConfirmed, saveConfirmed } from '../core/confirmedDuplicates.js';
import { buildMissingPatronymicReport } from '../engine/familysearchReport.js';

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
let lastDups = null;
let showDismissed = false;
let showConfirmed = false;

function dismissGroup(key) {
  const set = loadDismissed();
  set.add(key);
  saveDismissed(set);
  // взаємовиключні позначки: якщо групу щойно визнали "не дублікат",
  // прибираємо з неї попередню позначку "дублікат", якщо вона була
  const confirmedSet = loadConfirmed();
  if (confirmedSet.delete(key)) saveConfirmed(confirmedSet);
  renderDuplicates(lastDups);
}
function restoreGroup(key) {
  const set = loadDismissed();
  set.delete(key);
  saveDismissed(set);
  renderDuplicates(lastDups);
}
function confirmGroup(key) {
  const set = loadConfirmed();
  set.add(key);
  saveConfirmed(set);
  // взаємовиключні позначки: якщо групу щойно визнали дублікатом,
  // прибираємо з неї попередню позначку "не дублікат", якщо вона була
  const dismissedSet = loadDismissed();
  if (dismissedSet.delete(key)) saveDismissed(dismissedSet);
  renderDuplicates(lastDups);
}
function unconfirmGroup(key) {
  const set = loadConfirmed();
  set.delete(key);
  saveConfirmed(set);
  renderDuplicates(lastDups);
}

export function runAnalysis() {
  const source = state.translatedContent || state.rawContent;
  if (!source) { alert('Спочатку завантаж GEDCOM файл на вкладці «Переклад».'); return; }
  state.analysisSource = state.translatedContent ? 'translated' : 'raw';

  const btn = document.getElementById('btn-run-analysis');
  btn.disabled = true;
  btn.textContent = '⏳ Аналізую…';

  // Даємо браузеру перемалювати кнопку перед важким синхронним проходом по файлу
  setTimeout(() => {
    state.analysis = runFullAnalysis(source);
    // Цей звіт — ЗАВЖДИ з оригіналу (рос.), незалежно від того, який файл
    // аналізує решта вкладки: цікаві саме помилки в первинних даних.
    state.analysis.missingPatronymic = state.rawContent ? buildMissingPatronymicReport(state.rawContent) : [];
    btn.disabled = false;
    btn.textContent = '🔄 Аналізувати ще раз';
    render();
  }, 30);
}

export function renderAnalysisTab() {
  render();
}

function render() {
  const a = state.analysis;
  document.getElementById('analysisEmpty').style.display = a ? 'none' : 'block';
  document.getElementById('analysisResults').style.display = a ? 'flex' : 'none';
  if (!a) return;

  document.getElementById('analysis-source-label').textContent =
    state.analysisSource === 'translated' ? '📗 перекладеного файлу' : '📄 оригіналу (ще не перекладено)';

  renderHealthScore(a.health);
  renderStats(a.stats);
  renderIssues(a.issues);
  renderMissingPatronymic(a.missingPatronymic || []);
  renderDuplicates(a.duplicates);
  renderTreeBreaks(a.treeBreaks);
  renderFrequencies(a.freq);

  const errCount = a.issues.filter(i => i.level === 'error').length;
  const badge = document.getElementById('badge-analysis');
  if (errCount) { badge.style.display = 'inline'; badge.textContent = errCount; } else badge.style.display = 'none';
}

// Композитна оцінка (0-100): 35% повнота (дата народження + _FSFTID),
// 25% зв'язність (частка осіб, не ізольованих від дерева), 40% узгодженість
// (структурні помилки/попередження зі "Перевірки структури" — саме тому вона
// важить найбільше: биті посилання шкідливіші за прогалини в датах).
function renderHealthScore(h) {
  const el = document.getElementById('healthScoreBox');
  const color = h.score >= 90 ? 'var(--green)' : h.score >= 75 ? 'var(--accent)' : h.score >= 55 ? 'var(--orange)' : 'var(--red)';
  el.innerHTML = `
    <div style="font-size:2.4rem;font-weight:800;color:${color};line-height:1;">${h.score}</div>
    <div style="flex:1;min-width:180px;">
      <div style="font-weight:700;color:${color};">${esc(h.label)}</div>
      <div style="font-size:.78rem;color:var(--muted);margin-top:4px;">
        Повнота: ${h.completeness}% · Зв'язність: ${h.connectivity}% · Узгодженість: ${h.consistency}%
      </div>
    </div>
  `;
}

function renderStats(s) {
  const el = document.getElementById('statsGrid');
  const rows = [
    ['Осіб', s.totalIndividuals], ['Сімей', s.totalFamilies],
    ['Чоловіків', s.male], ['Жінок', s.female],
    ['З датою народження', s.withBirth], ['З датою смерті', s.withDeath],
    ['Ізольованих (без сім\'ї)', s.isolated],
    ['З FamilySearch ID (_FSFTID)', s.withFsftid],
    ['Діапазон років', s.yearRange ? `${s.yearRange[0]}–${s.yearRange[1]}` : '—'],
    ['Середня тривалість життя', s.avgLifespan ? `${s.avgLifespan} р.` : '—'],
  ];
  el.innerHTML = rows.map(([lbl, val]) => `<div class="stat"><div class="num">${val}</div><div class="lbl">${lbl}</div></div>`).join('');
}

function renderIssues(issues) {
  const el = document.getElementById('issuesList');
  document.getElementById('issues-count').textContent = `${issues.length} проблем`;
  if (!issues.length) { el.innerHTML = '<div class="empty-hint">Структурних проблем не знайдено. 👍</div>'; return; }
  el.innerHTML = issues.slice(0, 300).map(i => `
    <div class="issue-row issue-${i.level}">
      <span class="issue-badge">${i.level === 'error' ? '⛔' : '⚠️'}</span>
      <span class="issue-msg">${esc(i.message)}</span>
      <span class="issue-ref">${esc(i.ref)}</span>
    </div>`).join('') + (issues.length > 300 ? `<div class="empty-hint">…і ще ${issues.length - 300}. Завантаж повний звіт нижче.</div>` : '');
}

// Звіт про ймовірні орфографічні помилки — ЗАВЖДИ рахується з оригіналу
// (рос.), незалежно від того, який файл аналізує решта вкладки.
// Звіт «є ім'я і прізвище, а по-батькові нема» — теж ЗАВЖДИ з оригіналу.
function renderMissingPatronymic(rows) {
  const el = document.getElementById('missingPatrList');
  const countEl = document.getElementById('missing-patr-count');
  if (!el) return;
  countEl.textContent = rows.length ? `${rows.length} осіб` : 'усі заповнені';
  if (!rows.length) {
    el.innerHTML = '<div class="empty-hint">У всіх, хто має ім\'я й прізвище, заповнене й по-батькові. 👍</div>';
    return;
  }
  el.innerHTML = rows.slice(0, 300).map(r => `
    <div class="dup-member">
      <b>${esc(r.given)} ${esc(r.surn)}</b>
      ${r.birthDate ? ` · нар. ${esc(r.birthDate)}` : ''}${r.birthPlace ? `, ${esc(r.birthPlace)}` : ''}
      ${r.fsftid ? ` · ${fsftidLink(r.fsftid)}` : ''}
      <span style="color:var(--muted);"> (@${esc(r.id)}@)</span>
    </div>`).join('') + (rows.length > 300 ? `<div class="empty-hint">…і ще ${rows.length - 300}.</div>` : '');
}


async function shareHtmlReport(html, filename, shareTitle) {
  // Web Share API (Android/iOS Chrome тощо) — відкриває системне вікно "Поділитися",
  // де користувач одразу обирає месенджер (WhatsApp, Telegram, ...). Ділимось ФАЙЛОМ,
  // а не голим текстом, бо в месенджерах є ліміт довжини тексту, а файл — ні.
  const file = new File(['\uFEFF' + html], filename, { type: 'text/html;charset=utf-8' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: shareTitle });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return; // користувач сам скасував — це не помилка
    }
  }
  // Фолбек для десктопу / браузерів без підтримки Web Share: просто завантажити файл.
  downloadText(filename, html, 'text/html;charset=utf-8');
}

export async function shareDuplicatesReport() {
  const dismissed = loadDismissed();
  const dups = (lastDups || []).filter(g => !dismissed.has(groupKey(g)));
  if (!dups.length) { alert('Немає дублікатів для передачі.'); return; }
  const html = buildDuplicatesReportHtml(dups, { fileName: state.fileName || 'gedcom', generatedAt: new Date().toLocaleString('uk-UA') });
  const filename = (state.fileName || 'gedcom').replace(/\.[^.]+$/, '') + '_дублікати.html';
  await shareHtmlReport(html, filename, 'Ймовірні дублікати GEDCOM');
}

// Окремий звіт лише з груп, вручну підтверджених кнопкою «🔴 Дублікати» — на
// відміну від shareDuplicatesReport() (який передає ВСІ ще не переглянуті
// групи), тут лише те, що людина сама перевірила й підтвердила як реальний
// дублікат.
export async function shareConfirmedDuplicatesReport() {
  const confirmed = loadConfirmed();
  const dups = (lastDups || []).filter(g => confirmed.has(groupKey(g)));
  if (!dups.length) { alert('Немає підтверджених дублікатів для передачі. Спочатку познач потрібні групи кнопкою «🔴 Дублікати».'); return; }
  const html = buildDuplicatesReportHtml(dups, {
    fileName: state.fileName || 'gedcom',
    generatedAt: new Date().toLocaleString('uk-UA'),
    title: 'Дублікати',
  });
  const filename = (state.fileName || 'gedcom').replace(/\.[^.]+$/, '') + '_підтверджені_дублікати.html';
  await shareHtmlReport(html, filename, 'Дублікати GEDCOM');
}

function dupGroupCard(g, uiState) {
  // uiState: 'active' | 'confirmed' | 'dismissed'
  const key = groupKey(g);
  let actionButtons;
  if (uiState === 'dismissed') {
    actionButtons = `<button class="btn btn-ghost btn-sm dup-restore-btn" data-key="${esc(key)}">↩ Повернути</button>`;
  } else if (uiState === 'confirmed') {
    actionButtons = `<button class="btn btn-ghost btn-sm dup-unconfirm-btn" data-key="${esc(key)}">↩ Повернути</button>`;
  } else {
    actionButtons = `
      <div class="dup-actions">
        <button class="btn btn-ghost btn-sm dup-dismiss-btn" data-key="${esc(key)}">✓ Не дублікати</button>
        <button class="btn btn-danger btn-sm dup-confirm-btn" data-key="${esc(key)}">🔴 Дублікати</button>
      </div>`;
  }
  return `
    <div class="dup-group${g.distinctFsftid ? ' dup-group-benign' : ''}${uiState === 'dismissed' ? ' dup-group-dismissed' : ''}${uiState === 'confirmed' ? ' dup-group-confirmed' : ''}">
      <div class="dup-head">
        <span>Впевненість: <b>${esc(g.confidence)}</b> · ${g.members.length} записів</span>
        ${actionButtons}
      </div>
      ${g.members.map(m => `<div class="dup-member">@${m.id}@ — ${esc((m.name || '').replace(/\//g, ''))} ${m.birt.date ? `(нар. ${esc(m.birt.date)})` : ''} ${fsftidLink(m.fsftid)}</div>`).join('')}
    </div>`;
}

function renderDuplicates(dups) {
  lastDups = dups;
  const el = document.getElementById('dupsList');
  const confirmedEl = document.getElementById('dupsConfirmedList');
  const dismissedEl = document.getElementById('dupsDismissedList');
  const dismissed = loadDismissed();
  const confirmed = loadConfirmed();

  const active = dups.filter(g => !dismissed.has(groupKey(g)) && !confirmed.has(groupKey(g)));
  const confirmedInFile = dups.filter(g => confirmed.has(groupKey(g)));
  const dismissedInFile = dups.filter(g => dismissed.has(groupKey(g)));

  const benign = active.filter(g => g.distinctFsftid).length;
  const actionable = active.length - benign;
  document.getElementById('dups-count').textContent =
    `${actionable} до перевірки${benign ? ` · ${benign} ймовірно різні люди` : ''}`
    + (confirmedInFile.length ? ` · ${confirmedInFile.length} позначено як дублікати` : '')
    + (dismissedInFile.length ? ` · ${dismissedInFile.length} позначено як не дублікати` : '');
  document.getElementById('btn-share-dups').style.display = active.length ? 'inline-flex' : 'none';
  document.getElementById('btn-share-confirmed-dups').style.display = confirmedInFile.length ? 'inline-flex' : 'none';

  // Список підтверджених «дублікати» — окремий блок під кнопкою-перемикачем.
  const confirmToggleBtn = document.getElementById('btn-toggle-confirmed-dups');
  confirmToggleBtn.style.display = confirmedInFile.length ? 'inline-flex' : 'none';
  confirmToggleBtn.textContent = showConfirmed ? '🙈 Сховати дублікати' : `🔴 Показати дублікати (${confirmedInFile.length})`;
  confirmToggleBtn.onclick = () => { showConfirmed = !showConfirmed; renderDuplicates(lastDups); };

  confirmedEl.style.display = showConfirmed ? 'flex' : 'none';
  confirmedEl.innerHTML = showConfirmed
    ? (confirmedInFile.length
        ? `<div class="empty-hint" style="text-align:left;">Позначені як «дублікати» (${confirmedInFile.length}):</div>`
          + confirmedInFile.map(g => dupGroupCard(g, 'confirmed')).join('')
        : '<div class="empty-hint">Немає позначених як «дублікати».</div>')
    : '';

  // Список позначених «не дублікати» — ОКРЕМИЙ блок під кнопкою-перемикачем,
  // а не змішаний із основним списком до перевірки.
  const toggleBtn = document.getElementById('btn-toggle-dismissed-dups');
  toggleBtn.style.display = dismissedInFile.length ? 'inline-flex' : 'none';
  toggleBtn.textContent = showDismissed ? '🙈 Сховати позначені' : `👁 Показати позначені (${dismissedInFile.length})`;
  toggleBtn.onclick = () => { showDismissed = !showDismissed; renderDuplicates(lastDups); };

  dismissedEl.style.display = showDismissed ? 'flex' : 'none';
  dismissedEl.innerHTML = showDismissed
    ? (dismissedInFile.length
        ? `<div class="empty-hint" style="text-align:left;">Позначені як «не дублікати» (${dismissedInFile.length}):</div>`
          + dismissedInFile.map(g => dupGroupCard(g, 'dismissed')).join('')
        : '<div class="empty-hint">Немає позначених як «не дублікати».</div>')
    : '';

  if (!active.length) {
    el.innerHTML = '<div class="empty-hint">Ймовірних дублікатів не знайдено.</div>';
  } else {
    el.innerHTML = active.slice(0, 150).map(g => dupGroupCard(g, 'active')).join('')
      + (active.length > 150 ? `<div class="empty-hint">…і ще ${active.length - 150}. Завантаж повний звіт нижче.</div>` : '');
  }

  el.querySelectorAll('.dup-dismiss-btn').forEach(btn => btn.addEventListener('click', () => dismissGroup(btn.dataset.key)));
  el.querySelectorAll('.dup-confirm-btn').forEach(btn => btn.addEventListener('click', () => confirmGroup(btn.dataset.key)));
  confirmedEl.querySelectorAll('.dup-unconfirm-btn').forEach(btn => btn.addEventListener('click', () => unconfirmGroup(btn.dataset.key)));
  dismissedEl.querySelectorAll('.dup-restore-btn').forEach(btn => btn.addEventListener('click', () => restoreGroup(btn.dataset.key)));
}


function fsftidLink(id) {
  return id ? `<a href="https://www.familysearch.org/tree/person/details/${encodeURIComponent(id)}" target="_blank" rel="noopener" class="fsftid-badge">${esc(id)} ↗</a>` : '<span style="color:var(--muted);">—</span>';
}

function renderTreeBreaks(tb) {
  const el = document.getElementById('treeBreaksList');
  const withFsftid = tb.items.filter(i => i.fsftid);
  document.getElementById('treebreaks-count').textContent =
    `${tb.items.length} межових осіб${tb.familyGaps.length ? ` · ${tb.familyGaps.length} розірваних сімейних зв'язків` : ''}`;

  const copyBtn = document.getElementById('btn-copy-fsftids');
  copyBtn.style.display = withFsftid.length ? 'inline-flex' : 'none';
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(withFsftid.map(i => i.fsftid).join('\n'))
      .then(() => { copyBtn.textContent = '✓ Скопійовано'; setTimeout(() => copyBtn.textContent = '📋 Копіювати список FSFTID', 1500); });
  };

  if (!tb.items.length && !tb.familyGaps.length) {
    el.innerHTML = '<div class="empty-hint">Обривів не знайдено — дерево виглядає суцільним у межах цього файлу. 👍</div>';
    return;
  }

  let html = '';
  if (tb.items.length) {
    html += `<div style="font-size:.78rem;color:var(--muted);margin-bottom:8px;">
      Дорослі особи (18+) з повним ПІБ, чий рік народження (1800–${new Date().getFullYear()}) відомий точно
      або визначається з непрямих даних, і в яких немає зв'язку з батьками — тобто саме тут варто шукати далі.
    </div>`;
    html += tb.items.slice(0, 300).map(i => `
      <div class="dup-member">
        ${fsftidLink(i.fsftid)} — ${esc(i.name)} (нар. ${i.birthYear}${i.birthYearEstimated ? ', оцінка' : ''})
      </div>`).join('');
    if (tb.items.length > 300) html += `<div class="empty-hint">…і ще ${tb.items.length - 300}. Завантаж повний звіт нижче.</div>`;
  }
  if (tb.familyGaps.length) {
    html += `<div class="section-head" style="margin-top:14px;font-size:.85rem;">Розірвані сімейні зв'язки</div>`;
    html += tb.familyGaps.slice(0, 100).map(g => `
      <div class="dup-member">
        Сім'я @${esc(g.famId)}@ — відсутня у файлі особа (${esc(g.role)}, @${esc(g.missingId)}@)
        ${g.knownFsftid ? `<div style="color:var(--muted);font-size:.78rem;">Шукати через ${g.role === 'чоловік' ? 'дружину' : g.role === 'дружина' ? 'чоловіка' : 'батьків'}: ${esc(g.knownName)} ${fsftidLink(g.knownFsftid)}</div>` : ''}
      </div>`).join('');
  }
  el.innerHTML = html;
}

function freqBars(entries, max) {
  const top = entries[0]?.[1] || 1;
  return entries.map(([name, count]) => `
    <div class="freq-row">
      <span class="freq-name">${esc(name)}</span>
      <div class="freq-bar-track"><div class="freq-bar-fill" style="width:${Math.max(4, count / top * 100)}%"></div></div>
      <span class="freq-count">${count}</span>
    </div>`).join('');
}

function renderFrequencies(freq) {
  document.getElementById('freq-uniq-surn').textContent = freq.uniqueSurnames;
  document.getElementById('freq-uniq-givn').textContent = freq.uniqueGivens;
  document.getElementById('freq-uniq-plac').textContent = freq.uniquePlaces;
  document.getElementById('freqSurnames').innerHTML = freqBars(freq.surnames);
  document.getElementById('freqGivens').innerHTML = freqBars(freq.givens);
  document.getElementById('freqPlaces').innerHTML = freqBars(freq.places);
}

export function downloadAnalysisReport() {
  const a = state.analysis;
  if (!a) return;
  const s = a.stats;
  const lines = [];
  lines.push(`ЗВІТ АНАЛІЗУ GEDCOM`);
  lines.push(`Файл: ${state.fileName || '—'}`);
  lines.push(`Джерело аналізу: ${state.analysisSource === 'translated' ? 'перекладений файл' : 'оригінал'}`);
  lines.push(`Дата звіту: ${new Date().toLocaleString('uk-UA')}`);
  lines.push('');
  lines.push('=== СТАТИСТИКА ===');
  lines.push(`Осіб: ${s.totalIndividuals} | Сімей: ${s.totalFamilies}`);
  lines.push(`Чоловіків: ${s.male} | Жінок: ${s.female} | Стать невідома: ${s.unknownSex}`);
  lines.push(`З датою народження: ${s.withBirth} | З датою смерті: ${s.withDeath}`);
  lines.push(`Діапазон років: ${s.yearRange ? s.yearRange.join('–') : '—'}`);
  lines.push(`Середня тривалість життя: ${s.avgLifespan ?? '—'}`);
  lines.push(`Ізольованих осіб (без жодної сім'ї): ${s.isolated}`);
  lines.push(`З FamilySearch ID (_FSFTID): ${s.withFsftid}`);
  lines.push('');
  lines.push(`=== ПЕРЕВІРКА СТРУКТУРИ (${a.issues.length}) ===`);
  for (const i of a.issues) lines.push(`[${i.level === 'error' ? 'ПОМИЛКА' : 'ПОПЕРЕДЖЕННЯ'}] ${i.ref}: ${i.message}`);
  lines.push('');
  {
    const dismissed = loadDismissed();
    const dismissedCount = a.duplicates.filter(g => dismissed.has(groupKey(g))).length;
    lines.push(`=== ЙМОВІРНІ ДУБЛІКАТИ (${a.duplicates.length} груп, з них ${dismissedCount} позначено як «не дублікати») ===`);
    for (const g of a.duplicates) {
      const mark = dismissed.has(groupKey(g)) ? ' [НЕ ДУБЛІКАТИ — перевірено вручну]' : '';
      lines.push(`-- впевненість: ${g.confidence}${mark} --`);
      for (const m of g.members) lines.push(`  @${m.id}@ ${(m.name || '').replace(/\//g, '')} ${m.birt.date ? `(нар. ${m.birt.date})` : ''}`);
    }
  }
  lines.push('');
  lines.push(`=== ОБРИВИ ДЕРЕВА (${a.treeBreaks.items.length} межових осіб, ${a.treeBreaks.familyGaps.length} розірваних зв'язків) ===`);
  for (const i of a.treeBreaks.items) lines.push(`${i.fsftid || '(без FSFTID)'} — ${i.name} (нар. ${i.birthYear}${i.birthYearEstimated ? ', оцінка' : ''})`);
  if (a.treeBreaks.familyGaps.length) {
    lines.push('\nРозірвані сімейні зв\'язки:');
    for (const g of a.treeBreaks.familyGaps) lines.push(`  Сім'я @${g.famId}@: відсутня особа (${g.role}, @${g.missingId}@)${g.knownFsftid ? ` — шукати через ${g.knownName} (${g.knownFsftid})` : ''}`);
  }
  lines.push('');
  lines.push(`=== ЧАСТОТНИЙ АНАЛІЗ (ПОВНІ СПИСКИ) ===`);
  lines.push(`Унікальних прізвищ: ${a.freq.uniqueSurnames}, імен: ${a.freq.uniqueGivens}, місць: ${a.freq.uniquePlaces}`);
  lines.push(`\nУсі прізвища (${a.freq.allSurnames.length}):`);
  for (const [n, c] of a.freq.allSurnames) lines.push(`  ${n}: ${c}`);
  lines.push(`\nУсі імена (${a.freq.allGivens.length}):`);
  for (const [n, c] of a.freq.allGivens) lines.push(`  ${n}: ${c}`);
  lines.push(`\nУсі населені пункти (${a.freq.allPlaces.length}):`);
  for (const [n, c] of a.freq.allPlaces) lines.push(`  ${n}: ${c}`);

  downloadText((state.fileName || 'gedcom').replace(/\.[^.]+$/, '') + '_звіт.txt', lines.join('\n'));
}
