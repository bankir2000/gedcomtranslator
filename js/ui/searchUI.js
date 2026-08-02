// ===================== ПОШУК ПО GEDCOM + РЕДАГУВАННЯ ЗАПИСУ (Етап 5) =====================
import { state } from '../state.js';
import { buildIndex } from '../engine/analysis.js';
import { getRecordBlock, replaceRecordBlock, splitLines, patchIndiFields } from '../engine/gedcomRecord.js';
import { linkExistingRelation } from '../engine/linkRelation.js';

let editingType = null; // 'INDI' | 'raw' — визначає, яку форму (структуровану чи сирий текст) показати/зберегти

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

export function openEditorById(id) {
  openEditor(id);
}

function personLabel(p) {
  const name = (p.name || '').replace(/\//g, '').trim() || '(без імені)';
  const years = [p.birt.date, p.deat.date].filter(Boolean).join('–');
  return years ? `${name} (${years})` : name;
}

// Тільки для показу — саму форму не робимо редагованою для зв'язків: зміна
// батьків/дітей уже наявної особи зачіпає ЧУЖІ записи (сім'ї), а для цього
// є безпечніший, вже перевірений шлях — кнопки "➕" на дереві.
function relationsSummaryHtml(p, idx) {
  const parts = [];
  const famcId = p.famc[0];
  if (famcId) {
    const fam = idx.families.get(famcId);
    if (fam) {
      const father = fam.husb ? idx.individuals.get(fam.husb) : null;
      const mother = fam.wife ? idx.individuals.get(fam.wife) : null;
      if (father) parts.push(`батько: <b>${esc(personLabel(father))}</b>`);
      if (mother) parts.push(`мати: <b>${esc(personLabel(mother))}</b>`);
    }
  }
  for (const famsId of p.fams) {
    const fam = idx.families.get(famsId);
    if (!fam) continue;
    const spouseId = fam.husb === p.id ? fam.wife : fam.husb;
    if (spouseId) {
      const sp = idx.individuals.get(spouseId);
      if (sp) parts.push(`чоловік/дружина: <b>${esc(personLabel(sp))}</b>${fam.marr?.date ? ` (шлюб: ${esc(fam.marr.date)})` : ''}`);
    }
    for (const cid of fam.chil) {
      const c = idx.individuals.get(cid);
      if (c) parts.push(`дитина: <b>${esc(personLabel(c))}</b>`);
    }
  }
  return parts.length ? parts.join('<br>') : '<span style="color:var(--muted);">Зв\'язків не знайдено.</span>';
}

function openEditor(id) {
  const block = getRecordBlock(activeContent(), id);
  if (!block) { alert('Запис не знайдено (можливо, файл змінився — повтори пошук).'); return; }
  editingId = id;
  document.getElementById('recordEditor').style.display = 'flex';
  document.getElementById('recordEditorTitle').textContent = `Редагування @${id}@`;

  const typeMatch = block.lines[0].match(/^0 @[^@]+@ (\S+)/);
  editingType = (typeMatch && typeMatch[1] === 'INDI') ? 'INDI' : 'raw';

  document.getElementById('recordEditorForm').style.display = editingType === 'INDI' ? 'flex' : 'none';
  document.getElementById('recordEditorRaw').style.display = editingType === 'INDI' ? 'none' : 'flex';

  if (editingType === 'INDI') {
    const idx = ensureIndex();
    const p = idx && idx.individuals.get(id);
    if (!p) { editingType = 'raw'; document.getElementById('recordEditorForm').style.display = 'none'; document.getElementById('recordEditorRaw').style.display = 'flex'; document.getElementById('recordEditorArea').value = block.lines.join('\n'); document.getElementById('recordEditor').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    const givnRaw = p.givn || (p.name || '').replace(/\/[^/]*\//, '').trim();
    const givnParts = givnRaw.split(/\s+/).filter(Boolean);
    const surname = p.surn || (p.name.match(/\/([^/]*)\//) || [, ''])[1];

    document.getElementById('reGiven').value = givnParts[0] || '';
    document.getElementById('rePatronymic').value = givnParts.slice(1).join(' ');
    document.getElementById('reSurname').value = surname;
    document.getElementById('reSex').value = (p.sex === 'M' || p.sex === 'F') ? p.sex : '';
    document.getElementById('reFsftid').value = p.fsftid || '';
    document.getElementById('reBirthDate').value = p.birt.date || '';
    document.getElementById('reBirthPlace').value = p.birt.plac || '';
    document.getElementById('reDeathDate').value = p.deat.date || '';
    document.getElementById('reDeathPlace').value = p.deat.plac || '';
    document.getElementById('reRelationsView').innerHTML = relationsSummaryHtml(p, idx);

    const famcId = p.famc[0];
    const famc = famcId ? idx.families.get(famcId) : null;
    document.getElementById('reAddFatherRow').style.display = (famc && famc.husb) ? 'none' : 'flex';
    document.getElementById('reAddMotherRow').style.display = (famc && famc.wife) ? 'none' : 'flex';
    ['reAddFatherFsftid', 'reAddMotherFsftid', 'reAddSpouseFsftid', 'reAddSpouseMarrDate', 'reAddChildFsftid'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('reLinkError').style.display = 'none';
  } else {
    document.getElementById('recordEditorArea').value = block.lines.join('\n');
  }

  document.getElementById('recordEditor').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function closeEditor() {
  editingId = null;
  editingType = null;
  document.getElementById('recordEditor').style.display = 'none';
}

// Обробляє клік по будь-якій із чотирьох кнопок "➕ додати..." у блоці
// родинних зв'язків — шукає вказану особу за _FSFTID у ЦЬОМУ Ж файлі й
// зв'язує напряму, без окремого запису-чернетки (та сама безпечна логіка
// консолідації сімей, що й при об'єднанні бази).
export function linkRelation(relation) {
  if (!editingId || editingType !== 'INDI') return;
  const errEl = document.getElementById('reLinkError');
  errEl.style.display = 'none';

  const fieldMap = {
    father: 'reAddFatherFsftid', mother: 'reAddMotherFsftid',
    spouse: 'reAddSpouseFsftid', child: 'reAddChildFsftid',
  };
  const fsftid = document.getElementById(fieldMap[relation]).value.trim();
  if (!fsftid) { errEl.textContent = 'Вкажи код _FSFTID.'; errEl.style.display = 'block'; return; }
  const marrDate = relation === 'spouse' ? document.getElementById('reAddSpouseMarrDate').value.trim() : '';

  const content = activeContent();
  const { content: newContent, error } = linkExistingRelation(content, editingId, relation, fsftid, marrDate);
  if (error) { errEl.textContent = error; errEl.style.display = 'block'; return; }

  if (state.translatedContent) state.translatedContent = newContent;
  else state.rawContent = newContent;
  cachedSource = null;

  const savedId = editingId;
  openEditor(savedId); // перевідкриваємо той самий запис — зв'язки й поля оновляться
  const note = document.getElementById('searchSaveNote');
  note.style.display = 'block';
  note.textContent = '✅ Зв’язок додано.';
  setTimeout(() => { note.style.display = 'none'; }, 3000);
}

export function saveEditor() {
  if (!editingId) return;

  let newText;
  if (editingType === 'INDI') {
    const block = getRecordBlock(activeContent(), editingId);
    if (!block) { alert('Запис зник із файлу — повтори пошук.'); return; }

    const given = document.getElementById('reGiven').value.trim();
    const patronymic = document.getElementById('rePatronymic').value.trim();
    const surname = document.getElementById('reSurname').value.trim();
    if (!given && !surname) { alert('Вкажи бодай ім’я або прізвище.'); return; }
    const givn = [given, patronymic].filter(Boolean).join(' ');

    const newLines = patchIndiFields(block.lines, {
      name: `${givn} /${surname}/`,
      sex: document.getElementById('reSex').value,
      birtDate: document.getElementById('reBirthDate').value.trim(),
      birtPlac: document.getElementById('reBirthPlace').value.trim(),
      deatDate: document.getElementById('reDeathDate').value.trim(),
      deatPlac: document.getElementById('reDeathPlace').value.trim(),
      fsftid: document.getElementById('reFsftid').value.trim(),
    });
    newText = newLines.join('\n');
  } else {
    newText = document.getElementById('recordEditorArea').value;
    const firstLine = newText.split(/\r?\n/)[0] || '';
    if (!new RegExp(`^0 @${editingId}@ `).test(firstLine)) {
      if (!confirm('Перший рядок не схожий на "0 @' + editingId + '@ ..." — структура запису могла злетіти. Все одно зберегти?')) return;
    }
  }

  const savedId = editingId;
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
  note.textContent = `✅ Запис @${savedId}@ оновлено. Не забудь завантажити файл заново на вкладці «Переклад» або натисни «Завантажити .ged» нижче.`;
  setTimeout(() => { note.style.display = 'none'; }, 6000);
}
