// ===================== ЗАПУСК ПЕРЕКЛАДУ =====================
import { state } from '../state.js';
import { buildDictLookup } from '../dict/store.js';
import { translateLine, tagCategory, collectUntranslated } from '../engine/translate.js';
import { updateUntransBadge, updateChangeBadge } from './untransUI.js';
import { createBackup } from '../core/backup.js';
import { renderBackups } from './backupUI.js';
import { goToStep, markReached } from './wizard.js';
import { downloadText } from '../core/download.js';

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
  state.diffData = [];

  const CHUNK = 500;
  for (let i = 0; i < total; i += CHUNK) {
    const end = Math.min(i + CHUNK, total);
    for (let j = i; j < end; j++) {
      const line = lines[j];

      if (/^0 _EVDEF\b/.test(line)) { inEvdef = true; result.push(line); continue; }
      if (inEvdef && /^0 /.test(line)) inEvdef = false;
      if (inEvdef) { result.push(line); continue; }

      if (/0 @[^@]+@ INDI/.test(line)) currentSex = '';
      const { line: tLine, count, sex, methods } = translateLine(line, opts, dictEntries, currentSex);
      currentSex = sex;
      result.push(tLine);
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

  state.translatedContent = result.join('\n');
  fill.style.width = '100%';

  state.untransData = collectUntranslated(result, lines);
  updateUntransBadge();
  updateChangeBadge(state.diffData.length);

  log(`✅ Оброблено ${total} рядків, замін: ${totalReplaced}`, 'ok');
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
  downloadText(state.fileName.replace(/\.[^.]+$/, '') + '_ukr.ged', fixed);
}
