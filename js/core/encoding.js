// ===================== АВТОВИЗНАЧЕННЯ КОДУВАННЯ =====================
// Старі GEDCOM-файли (RootsMagic, PAF, Family Tree Maker, Древо Жизни) часто
// експортуються не в UTF-8, а в ANSI (Windows-1251) або, рідше, в DOS (CP866).
// Ця функція читає файл як байти і сама вирішує, яким декодером його читати,
// замість того щоб сліпо припускати UTF-8 (як робив старий однофайловий інструмент).

// Читає рядок заголовку GEDCOM (0 HEAD ... 1 CHAR ...), щоб узяти підказку,
// навіть коли основний вміст файлу — не валідний UTF-8.
function peekCharTag(bytes) {
  const headSlice = bytes.slice(0, Math.min(bytes.length, 4000));
  const ascii = new TextDecoder('windows-1251').decode(headSlice);
  const m = ascii.match(/\n?1\s+CHAR\s+(\S+)/i);
  return m ? m[1].toUpperCase() : null;
}

export async function detectAndReadFile(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // 1. BOM-перевірка
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return { text: new TextDecoder('utf-8').decode(bytes.slice(3)), encoding: 'UTF-8 (з BOM)' };
  }
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return { text: new TextDecoder('utf-16le').decode(bytes.slice(2)), encoding: 'UTF-16 LE' };
  }
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return { text: new TextDecoder('utf-16be').decode(bytes.slice(2)), encoding: 'UTF-16 BE' };
  }

  // 2. Спробувати суворий UTF-8 (без BOM) — якщо вдалось, це точно UTF-8
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { text, encoding: 'UTF-8' };
  } catch (e) {
    // не валідний UTF-8 → скоріш за все однобайтове кодування
  }

  // 3. Підказка з самого GEDCOM-заголовка (тег CHAR)
  const hint = peekCharTag(bytes);
  let label = file.name.match(/\.ged$/i) ? 'Windows-1251 (ANSI)' : 'Windows-1251 (припущення)';
  let decoderLabel = 'windows-1251';

  if (hint === 'IBMPC' || hint === 'CP866' || hint === 'OEM_866') {
    decoderLabel = 'cp866';
    label = 'CP866 (DOS)';
  } else if (hint === 'ANSI' || hint === 'ANSEL' || hint === 'MSDOS' || hint === 'WINDOWS-1251') {
    decoderLabel = 'windows-1251';
    label = 'Windows-1251 (ANSI, за тегом CHAR)';
  } else if (hint === 'UTF-8' || hint === 'UTF8' || hint === 'UNICODE') {
    // Заявлено UTF-8, але декодування вище провалилось — файл, ймовірно, пошкоджений.
    // Все одно пробуємо non-fatal UTF-8, це дасть найменш спотворений результат.
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    return { text, encoding: 'UTF-8 (пошкоджені байти замінено)', warning: true };
  }

  try {
    const text = new TextDecoder(decoderLabel).decode(bytes);
    return { text, encoding: label };
  } catch (e) {
    // Останній fallback — non-fatal UTF-8 (замінить биті байти на replacement char)
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    return { text, encoding: 'UTF-8 (fallback, можливі спотворення)', warning: true };
  }
}
