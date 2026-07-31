// ===================== SERVICE WORKER (Етап 5 — PWA офлайн) =====================
// Стратегія: network-first для всього "оболонки" застосунку (HTML/CSS/JS) —
// коли є інтернет, завжди береться свіжа версія і кладеться в кеш (авто-оновлення
// без ручного скидання кешу), а коли інтернету нема — віддається те, що в кеші.
// Це той самий підхід, що і в інших польових PWA (мережа-спочатку для автооновлень).

const CACHE_VERSION = 'gedcom-pro-v33';

const PRECACHE_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/app.js',
  './js/state.js',
  './js/core/backup.js',
  './js/core/download.js',
  './js/core/dismissedDuplicates.js',
  './js/core/confirmedDuplicates.js',
  './js/ui/mergeUI.js',
  './js/ui/navUtil.js',
  './js/core/encoding.js',
  './js/core/language.js',
  './js/core/translit.js',
  './js/dict/defaults.js',
  './js/dict/patronymics.js',
  './js/dict/sets.js',
  './js/dict/store.js',
  './js/engine/analysis.js',
  './js/engine/translate.js',
  './js/engine/gedcomRecord.js',
  './js/engine/compare.js',
  './js/engine/familysearchReport.js',
  './js/engine/familysearchReportHtml.js',
  './js/engine/duplicatesReportHtml.js',
  './js/engine/wordScan.js',
  './js/engine/spellCheck.js',
  './js/engine/baseGedcom.js',
  './js/engine/mergeBase.js',
  './js/engine/familyTree.js',
  './js/ui/analysisUI.js',
  './js/ui/backupUI.js',
  './js/ui/dictUI.js',
  './js/ui/fileUI.js',
  './js/ui/patrUI.js',
  './js/ui/wordScanUI.js',
  './js/ui/reviewUI.js',
  './js/ui/runTranslation.js',
  './js/ui/tabs.js',
  './js/ui/theme.js',
  './js/ui/untransUI.js',
  './js/ui/wizard.js',
  './js/ui/searchUI.js',
  './js/ui/compareUI.js',
  './js/ui/familysearchReportUI.js',
  './js/ui/treeUI.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache =>
      // addAll провалиться повністю, якщо бракує хоч одного файлу — тому підстраховуємось
      Promise.allSettled(PRECACHE_FILES.map(f => cache.add(f)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Сторінка дерева (tree-view.html, tree-test.html і все з js/treeview/ та
  // css/tree-view.css) навмисно НЕ кешується Service Worker'ом — вона й так
  // потребує інтернету (тягне бібліотеку з CDN), тож немає сенсу її кешувати,
  // а будь-яке втручання SW тут тільки заважає бачити свіжі зміни під час
  // розробки. Пропускаємо ці запити повз SW — браузер обробляє їх сам,
  // напряму мережею. Редактор живих родичів (people-editor.html) сюди ж —
  // це ще нова, нестабільна функція, простіше без кешування під час
  // доопрацювань (хоча CDN їй і не потрібен).
  const url = new URL(req.url);
  if (/(^|\/)tree-view\.html$/.test(url.pathname) ||
      /(^|\/)tree-test\.html$/.test(url.pathname) ||
      /(^|\/)people-editor\.html$/.test(url.pathname) ||
      url.pathname.includes('/js/treeview/') ||
      url.pathname.includes('/js/peopleeditor/') ||
      /(^|\/)css\/tree-view\.css$/.test(url.pathname) ||
      /(^|\/)css\/people-editor\.css$/.test(url.pathname)) {
    return;
  }

  event.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE_VERSION).then(cache => cache.put(req, copy)).catch(() => {});
      return res;
    }).catch(() =>
      caches.match(req).then(cached => cached || caches.match('./index.html'))
    )
  );
});
