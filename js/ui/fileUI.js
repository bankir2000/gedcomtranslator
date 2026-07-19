// ===================== ЗАВАНТАЖЕННЯ ФАЙЛУ =====================
import { state } from '../state.js';
import { detectAndReadFile } from '../core/encoding.js';
import { markReached, resetWizard } from './wizard.js';
import { refreshMergeControls } from './mergeUI.js';

let dropzone;

export function initFileUI() {
  dropzone = document.getElementById('dropzone');
  dropzone.addEventListener('click', () => document.getElementById('fileInput').click());
  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('drag');
    const f = e.dataTransfer.files[0];
    if (f) loadFile(f);
  });
  document.getElementById('fileInput').addEventListener('change', e => {
    if (e.target.files[0]) loadFile(e.target.files[0]);
  });
}

const MAX_SIZE_BYTES = 80 * 1024 * 1024; // 80 МБ — з запасом для дуже великих дерев, але захищає від випадкового вибору не того файлу

export async function loadFile(f) {
  if (!/\.(ged|txt)$/i.test(f.name)) {
    if (!confirm(`«${f.name}» не схожий на GEDCOM-файл (очікується .ged). Все одно спробувати завантажити?`)) return;
  }
  if (f.size > MAX_SIZE_BYTES) {
    if (!confirm(`Файл дуже великий (${(f.size / 1024 / 1024).toFixed(1)} МБ). Обробка може зайняти багато часу й памʼяті браузера. Продовжити?`)) return;
  }

  state.fileName = f.name;
  dropzone.querySelector('h2').textContent = `⏳ Визначення кодування…`;

  let text, encoding, warning;
  try {
    ({ text, encoding, warning } = await detectAndReadFile(f));
  } catch (err) {
    console.error('Помилка читання файлу:', err);
    dropzone.querySelector('h2').textContent = '⚠️ Не вдалося прочитати файл';
    dropzone.querySelector('p').textContent = 'Файл пошкоджений або має незвичне кодування. Спробуй інший файл або конвертуй його в UTF-8 заздалегідь.';
    state.fileName = '';
    return;
  }
  state.rawContent = text;
  state.encodingLabel = encoding;

  const lines = state.rawContent.split('\n');
  document.getElementById('st-lines').textContent = lines.length;
  document.getElementById('st-persons').textContent = (state.rawContent.match(/0 @[^@]+@ INDI/g) || []).length;
  document.getElementById('st-families').textContent = (state.rawContent.match(/0 @[^@]+@ FAM/g) || []).length;
  document.getElementById('statsBar').style.display = 'grid';
  document.getElementById('progressSection').style.display = 'none';
  document.getElementById('previewSection').style.display = 'none';

  dropzone.querySelector('h2').textContent = `✅ ${f.name}`;
  const encBadgeColor = warning ? 'color:var(--orange);' : '';
  dropzone.querySelector('p').innerHTML = `${(f.size / 1024).toFixed(1)} КБ`
    + ` <span class="enc-badge" style="${encBadgeColor}">${encoding}</span>`;

  // Файл готовий — розблоковуємо крок 2 майстра, але не перестрибуємо туди самі
  document.getElementById('btn-step1-next').disabled = false;
  markReached(2);
  refreshMergeControls();
}

export function clearFile() {
  state.rawContent = '';
  state.translatedContent = '';
  state.fileName = '';
  state.encodingLabel = '';
  ['statsBar', 'progressSection', 'previewSection'].forEach(id => document.getElementById(id).style.display = 'none');
  dropzone.querySelector('h2').textContent = 'Завантаж GEDCOM файл';
  dropzone.querySelector('p').textContent = 'Перетягни .ged або натисни для вибору';
  document.getElementById('fileInput').value = '';
  document.getElementById('btn-step1-next').disabled = true;
  resetWizard();
  refreshMergeControls();
}
