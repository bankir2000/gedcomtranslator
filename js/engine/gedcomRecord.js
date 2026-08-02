// ===================== ВИТЯГ/ЗАМІНА ОДНОГО ЗАПИСУ (Етап 5) =====================
// Простий, надійний спосіб "редагувати запис": знайти його рядки за 0 @XREF@ TYPE
// до наступного рядка рівня 0, дати відредагувати як текст, і вставити назад на місце.
// Без побудови повноцінного форм-редактора — менше ризику зламати структуру файлу.

export function splitLines(content) {
  return content.split(/\r?\n/);
}

// ===================== ТОЧКОВЕ ОНОВЛЕННЯ ВІДОМИХ ТЕГІВ =====================
// На відміну від replaceRecordBlock (де весь блок задається текстом наново),
// це хірургічно міняє ЛИШЕ перелічені теги рівня 1 (NAME/SEX/BIRT/DEAT/
// _FSFTID), не чіпаючи все інше в записі (FAMC/FAMS/NOTE/SOUR/OCCU тощо) —
// і зберігаючи їх на тому самому місці. Потрібне для структурованої форми
// редагування особи, де форма знає лише про ці конкретні поля.

/** Діапазон [start, end) для ПЕРШОГО тега рівня 1 з даним ім'ям — сам рядок
 * плюс усі його "діти" (рядки глибшого рівня одразу після нього). */
function findTagGroup(lines, tag) {
  for (let i = 1; i < lines.length; i++) { // з 1: lines[0] — це "0 @id@ ТИП"
    const m = lines[i].match(/^1 (\S+)/);
    if (m && m[1] === tag) {
      let end = i + 1;
      while (end < lines.length && /^[2-9]/.test(lines[end])) end++;
      return { start: i, end };
    }
  }
  return null;
}

function removeTagGroup(lines, tag) {
  const g = findTagGroup(lines, tag);
  if (!g) return { lines, insertAt: lines.length };
  return { lines: [...lines.slice(0, g.start), ...lines.slice(g.end)], insertAt: g.start };
}

function setSimpleTag(lines, tag, value) {
  const { lines: without, insertAt } = removeTagGroup(lines, tag);
  if (!value) return without;
  return [...without.slice(0, insertAt), `1 ${tag} ${value}`, ...without.slice(insertAt)];
}

function setDatePlacTag(lines, tag, date, plac) {
  const { lines: without, insertAt } = removeTagGroup(lines, tag);
  if (!date && !plac) return without;
  const block = [`1 ${tag}`];
  if (date) block.push(`2 DATE ${date}`);
  if (plac) block.push(`2 PLAC ${plac}`);
  return [...without.slice(0, insertAt), ...block, ...without.slice(insertAt)];
}

/**
 * @param {string[]} lines — рядки блоку запису (від "0 @id@ INDI" до кінця)
 * @param {{name:string, sex:string, birtDate:string, birtPlac:string, deatDate:string, deatPlac:string, fsftid:string}} fields
 * @returns {string[]} — нові рядки блоку
 */
export function patchIndiFields(lines, fields) {
  let result = [...lines];
  result = setSimpleTag(result, 'NAME', fields.name);
  result = setSimpleTag(result, 'SEX', fields.sex);
  result = setDatePlacTag(result, 'BIRT', fields.birtDate, fields.birtPlac);
  result = setDatePlacTag(result, 'DEAT', fields.deatDate, fields.deatPlac);
  result = setSimpleTag(result, '_FSFTID', fields.fsftid);
  return result;
}

export function getRecordBlock(content, xrefId) {
  const lines = splitLines(content);
  const startRe = new RegExp(`^0 @${xrefId}@ `);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (startRe.test(lines[i])) { start = i; break; }
  }
  if (start === -1) return null;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^0 /.test(lines[i])) { end = i; break; }
  }
  return { start, end, lines: lines.slice(start, end) };
}

export function replaceRecordBlock(content, xrefId, newBlockText) {
  const lines = splitLines(content);
  const block = getRecordBlock(content, xrefId);
  if (!block) return content;
  const newLines = newBlockText.split(/\r?\n/).filter((l, i, arr) => !(i === arr.length - 1 && l === ''));
  const result = [...lines.slice(0, block.start), ...newLines, ...lines.slice(block.end)];
  return result.join('\n');
}
