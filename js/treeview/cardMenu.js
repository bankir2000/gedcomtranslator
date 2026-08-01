// ===================== СПЛИВНЕ МЕНЮ КАРТКИ ОСОБИ =====================
// Спільне для обох режимів перегляду (класичне дерево й віяло) — щоб клік
// по картці/сектору відкривав ОДНЕ й те саме меню дій, а не різну поведінку
// залежно від режиму.
let activeMenu = null;
let closeHandlersAttached = false;

function closeCardMenu() {
  if (activeMenu) { activeMenu.remove(); activeMenu = null; }
  if (closeHandlersAttached) {
    document.removeEventListener('click', closeCardMenu, true);
    document.removeEventListener('keydown', onEscape, true);
    closeHandlersAttached = false;
  }
}
function onEscape(e) { if (e.key === 'Escape') closeCardMenu(); }

/**
 * @param {number} x, y — клієнтські координати кліку (event.clientX/clientY)
 * @param {{label:string, onClick:Function}[]} items
 */
export function showCardMenu(x, y, items) {
  closeCardMenu();

  const menu = document.createElement('div');
  menu.className = 'tv-context-menu';
  menu.innerHTML = items.map((it, i) => `<button type="button" data-i="${i}">${it.label}</button>`).join('');
  document.body.appendChild(menu);

  // Не даємо меню вилізти за межі екрана (актуально ближче до країв, особливо на телефоні).
  const rect = menu.getBoundingClientRect();
  const left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  menu.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = items[+btn.dataset.i];
      closeCardMenu();
      item.onClick();
    });
  });

  activeMenu = menu;
  // Клік, що ВІДКРИВ меню, вже встиг спливти на document на цей момент у
  // деяких браузерах — невеликий таймаут гарантує, що ми не закриємо його
  // тим самим кліком, яким відкрили.
  setTimeout(() => {
    document.addEventListener('click', closeCardMenu, true);
    document.addEventListener('keydown', onEscape, true);
    closeHandlersAttached = true;
  }, 0);
}
