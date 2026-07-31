// ===================== ЗАПУСК ПЕРЕКЛАДУ =====================
import { state } from '../state.js';
import { buildDictLookup } from '../dict/store.js';
import { translateLine, tagCategory, collectUntranslated } from '../engine/translate.js';
import { inferSexFromWord } from '../dict/patronymics.js';
import { updateUntransBadge, updateChangeBadge } from './untransUI.js';
import { createBackup } from '../core/backup.js';
import { renderBackups } from './backupUI.js';
import { goToStep, markReached } from './wizard.js';
import { downloadText, downloadGedcom } from '../core/download.js';

export async function runTranslation() {
  if (!state.rawContent) return;
  markReached(3);
  goToStep(3); // покажи крок "Результат", де живуть прогрес і прев'ю
  const opts = {
    names: document.getElementById('opt-names').checked,
    surnameMode: document.querySelector('input[name="surnameMode"]:checked').value,
    patr: document.getElementById('opt-patr').checked,
    places: document.getElementById('opt-places').checked,
    notes: document.getElementById('opt-notes').checked,
    translitAuto: document.getElementById('opt-translitAuto').checked,
    nameMode: document.querySelector('input[name="nameMode"]:checked').value,
    autoSex: document.getElementById('opt-autoSex').checked,
  };
  opts.surn = opts.surnameMode !== 'none'; // для сумісності з рештою логіки (NAME/NPFX перевіряють opts.surn)

  document.getElementById('progressSection').style.display = 'block';
  document.getElementById('previewSection').style.display = 'none';
  const logBox = document.getElementById('logBox');
  const fill = document.getElementById('progFill');
  logBox.innerHTML = '';

  function log(msg, cls = '') { logBox.innerHTML += `<div class="${cls}">${msg}</div>`; logBox.scrollTop = logBox.scrollHeight; }

  // Автобекап оригіналу ПЕРЕД перекладом (Етап 1 вимога)
  createBackup('translation', `${state.fileName} (${state.encodingLabel || '?'})`, {
    fileName: state.fileName,
    rawContent: state.rawContent,
  });
  renderBackups();

  log('⏳ Підготовка довідників…');
  const dictEntries = {
    name: buildDictLookup('name'),
    surn: buildDictLookup('surn'),
    place: buildDictLookup('place'),
    other: buildDictLookup('other'),
  };
  log(`📖 Імена: ${dictEntries.name.length}, Прізвища: ${dictEntries.surn.length}, Місця: ${dictEntries.place.length}, По-батькові: ${state.patrDict.length}`, 'ok');
  const evdefCount = (state.rawContent.match(/^0 _EVDEF\b/mg) || []).length;
  if (evdefCount) log(`⏭ Пропущено ${evdefCount} блоків _EVDEF (шаблони RootsMagic)`);

  const lines = state.rawContent.split(/\r?\n/);
  const total = lines.length;
  const result = [];
  let totalReplaced = 0;
  let currentSex = '';
  let inEvdef = false;
  let autoSexAdded = 0;
  state.diffData = [];

  // ---- Буфер поточного INDI-запису — потрібен, щоб (за увімкненої опції)
  // дописати відсутній тег SEX одразу після NAME, коли весь запис уже
  // перекладено і точно відомо, що SEX у ньому справді не було. ----
  let inIndiRecord = false;
  let recordBuffer = [];
  let sawSexTag = false;
  let inferredSex = null;
  let nameInsertIdx = -1; // індекс у recordBuffer одразу ПІСЛЯ якого вставляти SEX

  function flushRecord() {
    if (inIndiRecord && opts.autoSex && !sawSexTag && inferredSex) {
      const insertAt = nameInsertIdx >= 0 ? nameInsertIdx + 1 : 1; // після NAME, або одразу після "0 @id@ INDI"
      recordBuffer.splice(insertAt, 0, `1 SEX ${inferredSex}`);
      totalReplaced++;
      autoSexAdded++;
    }
    for (const l of recordBuffer) result.push(l);
    recordBuffer = [];
    sawSexTag = false;
    inferredSex = null;
    nameInsertIdx = -1;
  }

  // Стать ЛИШЕ з граматики по-батькові у СИРОМУ (ще не перекладеному) рядку —
  // саме тому оригінальні (російські) суфікси розпізнаються надійно.
  function detectSexFromOriginalLine(tag, origVal) {
    if (!origVal) return null;
    const text = tag === 'NAME' ? origVal.replace(/\/[^/]*\//, ' ') : origVal;
    for (const tok of text.trim().split(/\s+/)) {
      const s = inferSexFromWord(tok);
      if (s) return s;
    }
    return null;
  }

  const CHUNK = 500;
  for (let i = 0; i < total; i += CHUNK) {
    const end = Math.min(i + CHUNK, total);
    for (let j = i; j < end; j++) {
      const line = lines[j];

      if (/^0 _EVDEF\b/.test(line)) { flushRecord(); inIndiRecord = false; inEvdef = true; result.push(line); continue; }
      if (inEvdef && /^0 /.test(line)) inEvdef = false;
      if (inEvdef) { result.push(line); continue; }

      const isIndiStart = /^0 @[^@]+@ INDI/.test(line);
      if (isIndiStart) {
        flushRecord(); // закриваємо попередній запис (можливо, дописавши SEX)
        inIndiRecord = true;
        currentSex = '';
      } else if (/^0 /.test(line)) {
        flushRecord();
        inIndiRecord = false;
      }

      const { line: tLine, count, sex, methods } = translateLine(line, opts, dictEntries, currentSex);
      currentSex = sex;

      if (inIndiRecord) {
        const m0 = line.match(/^\d+ (\S+)(?: (.*))?$/);
        const tag0 = m0 ? m0[1].split(' ').pop() : '';
        const origVal0 = m0 ? (m0[2] || '') : '';
        if (tag0 === 'SEX') sawSexTag = true;
        if (!inferredSex && ['GIVN', 'NAME', '_PATR', 'NPFX'].includes(tag0)) {
          const detected = detectSexFromOriginalLine(tag0, origVal0);
          if (detected) inferredSex = detected;
        }
        if (tag0 === 'NAME' && nameInsertIdx === -1) nameInsertIdx = recordBuffer.length;
        recordBuffer.push(tLine);
      } else {
        result.push(tLine);
      }

      totalReplaced += count;
      if (tLine !== line) {
        const m = line.match(/^\d+ (\S+)(?: (.*))?$/);
        const tag = m ? m[1].split(' ').pop() : '';
        const origVal = m ? m[2] || '' : line;
        const newM = tLine.match(/^\d+ \S+(?: (.*))?$/);
        const newVal = newM ? newM[1] || '' : tLine;
        // auto = серед методів є ненадійна автотранслітерація (не підтверджена словником) —
        // такі рядки варто перевірити вручну перед публікацією результату.
        const auto = (methods || []).includes('translit');
        state.diffData.push({ lineNum: j + 1, tag, cat: tagCategory(tag), orig: origVal, translated: newVal, auto });
      }
    }
    fill.style.width = `${Math.round(end / total * 100)}%`;
    await new Promise(r => setTimeout(r, 0));
  }
  flushRecord(); // останній запис у файлі (на випадок файлу без "0 TRLR" у кінці)

  state.translatedContent = result.join('\n');
  fill.style.width = '100%';

  state.untransData = collectUntranslated(result, lines);
  updateUntransBadge();
  updateChangeBadge(state.diffData.length);

  log(`✅ Оброблено ${total} рядків, замін: ${totalReplaced}`, 'ok');
  if (autoSexAdded) log(`🚻 Дописано тег SEX за по-батькові для ${autoSexAdded} осіб`, 'ok');
  if (state.untransData.length) log(`⚠️ Непереведених слів: ${state.untransData.length} — перевір вкладку «Непереведені»`, 'warn');
  document.getElementById('st-replaced').textContent = totalReplaced;
  document.getElementById('previewArea').value = result.slice(0, 100).join('\n') + (result.length > 100 ? '\n…' : '');
  document.getElementById('previewSection').style.display = 'block';
}

export function downloadResult() {
  if (!state.translatedContent) return;
  // Файл завжди зберігається в UTF-8, незалежно від вихідного кодування —
  // тож виправляємо тег CHAR у GEDCOM-заголовку, щоб він не вводив в оману інші програми.
  const fixed = state.translatedContent.replace(/^(\d+ CHAR )(\S+)/m, '$1UTF-8');
  downloadGedcom(state.fileName.replace(/\.[^.]+$/, '') + '_ukr.ged', fixed);
}
