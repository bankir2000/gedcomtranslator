// ===================== ЗАВАНТАЖЕННЯ ФАЙЛІВ =====================
// Blob зі своїм MIME-типом (charset=utf-8) коректно декодується самим браузером
// під час завантаження, але це НЕ зберігається у файлі на диску — це лише підказка
// для завантажувача. Коли файл потім відкривають в іншій програмі (Notepad,
// файловий менеджер на телефоні тощо), вона вгадує кодування сама і без явного
// UTF-8 BOM на початку файлу нерідко вгадує неправильно — звідси "ієрогліфи"
// замість кирилиці. Тому для будь-якого текстового файлу, що завантажується
// користувачем, ЗАВЖДИ додаємо BOM (\uFEFF) на початок вмісту.
export function downloadText(filename, content, mime = 'text/plain;charset=utf-8') {
  const withBom = content.charCodeAt(0) === 0xFEFF ? content : '\uFEFF' + content;
  const blob = new Blob([withBom], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
