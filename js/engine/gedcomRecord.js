// ===================== ВИТЯГ/ЗАМІНА ОДНОГО ЗАПИСУ (Етап 5) =====================
// Простий, надійний спосіб "редагувати запис": знайти його рядки за 0 @XREF@ TYPE
// до наступного рядка рівня 0, дати відредагувати як текст, і вставити назад на місце.
// Без побудови повноцінного форм-редактора — менше ризику зламати структуру файлу.

export function splitLines(content) {
  return content.split(/\r?\n/);
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
