// ===================== ПАНЕЛЬ РЕЗЕРВНИХ КОПІЙ (нове в Pro 3.0) =====================
import { state } from '../state.js';
import { listBackups, getBackup, deleteBackup, exportAllData, validateFullExport, createBackup } from '../core/backup.js';
import { savePatrDict } from '../dict/store.js';
import { replaceAllDict } from '../dict/sets.js';
import { renderDict } from './dictUI.js';
import { goToStep, markReached } from './wizard.js';
import { downloadText, downloadGedcom } from '../core/download.js';
import { loadDismissedArray, replaceDismissed } from '../core/dismissedDuplicates.js';
import { loadConfirmedArray, replaceConfirmed } from '../core/confirmedDuplicates.js';

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const KIND_LABEL = { translation: '📂 Переклад', dict: '📖 Словник', patr: '👤 По-батькові' };

// ===================== НАГАДУВАННЯ ПРО ПОВНИЙ БЕКАП =====================
// Захист саме від "тихої" втрати даних: автобекапи вище живуть у тому самому
// localStorage, що й оригінал, тож "Очистити дані сайту" (або сам браузер) забирає
// їх РАЗОМ. Єдиний надійний захист — файл на диску (у Завантаженнях), якого це не
// зачіпає. Замість покладатись, що користувач сам згадає — застосунок сам нагадує,
// коли давно не було експорту.
const LAST_BACKUP_KEY = 'gedcom_last_full_backup_ts';
const REMINDER_DAYS = 3;

function getLastBackupTs() {
  const v = localStorage.getItem(LAST_BACKUP_KEY);
  return v ? new Date(v) : null;
}
function markBackedUpNow() {
  localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
  renderBackupStatus();
}

export function renderBackupStatus() {
  const box = document.getElementById('lastBackupStatus');
  const badge = document.getElementById('badge-backup');
  if (!box) return;
  const last = getLastBackupTs();

  if (!last) {
    box.style.background = 'rgba(var(--red-rgb),.12)';
    box.style.color = 'var(--red)';
    box.textContent = '⚠️ Жодного повного бекапу ще не було. Якщо очиститься кеш браузера — весь довідник буде втрачено.';
    badge.style.display = 'inline';
    return;
  }

  const days = Math.floor((Date.now() - last.getTime()) / 86400000);
  const dateStr = last.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  if (days >= REMINDER_DAYS) {
    box.style.background = 'rgba(var(--red-rgb),.12)';
    box.style.color = 'var(--orange)';
    box.textContent = `⚠️ Останній повний бекап — ${days} дн. тому (${dateStr}). Рекомендуємо оновити.`;
    badge.style.display = 'inline';
  } else {
    box.style.background = 'rgba(46,160,90,.12)';
    box.style.color = 'var(--green, #2ea05a)';
    box.textContent = `✓ Останній повний бекап: ${dateStr}.`;
    badge.style.display = 'none';
  }
}

export function renderBackups() {
  const list = listBackups();
  const wrap = document.getElementById('backupList');
  const empty = document.getElementById('backupEmpty');
  if (!wrap) return; // панель ще не в DOM (наприклад, index.html не оновлено)
  if (!list.length) { wrap.innerHTML = ''; if (empty) empty.style.display = 'block'; return; }
  if (empty) empty.style.display = 'none';

  wrap.innerHTML = list.map(b => `
    <div class="backup-item">
      <span class="b-time">${fmtTime(b.timestamp)}</span>
      <span class="b-file">${KIND_LABEL[b.kind] || b.kind} · ${esc(b.label)}</span>
      <div class="b-actions">
        <button class="btn btn-ghost btn-sm bkp-restore" data-id="${b.id}">↩ Відновити</button>
        <button class="btn btn-ghost btn-sm bkp-download" data-id="${b.id}">⬇</button>
        <button class="del-btn bkp-del" data-id="${b.id}">🗑</button>
      </div>
    </div>`).join('');

  wrap.querySelectorAll('.bkp-restore').forEach(btn => btn.addEventListener('click', () => restoreBackup(btn.dataset.id)));
  wrap.querySelectorAll('.bkp-download').forEach(btn => btn.addEventListener('click', () => downloadBackup(btn.dataset.id)));
  wrap.querySelectorAll('.bkp-del').forEach(btn => btn.addEventListener('click', () => {
    if (confirm('Видалити цю резервну копію?')) { deleteBackup(btn.dataset.id); renderBackups(); }
  }));
}

function esc(s) { return (s || '').replace(/</g, '&lt;'); }

function restoreBackup(id) {
  const b = getBackup(id);
  if (!b) return;
  if (b.kind === 'translation') {
    if (!confirm(`Відновити файл «${b.payload.fileName}»? Поточний завантажений файл (якщо є) буде замінено.`)) return;
    state.rawContent = b.payload.rawContent;
    state.fileName = b.payload.fileName;
    state.encodingLabel = 'відновлено з бекапу';
    const lines = state.rawContent.split('\n');
    document.getElementById('st-lines').textContent = lines.length;
    document.getElementById('st-persons').textContent = (state.rawContent.match(/0 @[^@]+@ INDI/g) || []).length;
    document.getElementById('st-families').textContent = (state.rawContent.match(/0 @[^@]+@ FAM/g) || []).length;
    document.getElementById('statsBar').style.display = 'grid';
    document.getElementById('dropzone').querySelector('h2').textContent = `✅ ${b.payload.fileName}`;
    document.getElementById('dropzone').querySelector('p').innerHTML = `<span class="enc-badge">відновлено з бекапу ${fmtTime(b.timestamp)}</span>`;
    document.getElementById('btn-step1-next').disabled = false;
    markReached(2);
    goToStep(2); // повертаємось до параметрів, щоб заново запустити переклад на відновленому файлі
  } else if (b.kind === 'patr') {
    if (!confirm('Відновити словник по-батькові до стану перед останнім імпортом?')) return;
    state.patrDict = b.payload.patrDict;
    savePatrDict();
    renderDict();
  } else if (b.kind === 'dict') {
    if (!confirm('Відновити довідник до стану перед останньою зміною?')) return;
    replaceAllDict(b.payload.dict);
    renderDict();
  }
}

// ===================== ПОВНЕ РЕЗЕРВНЕ КОПІЮВАННЯ =====================
// ===================== ОЧИЩЕННЯ ВСІХ ДАНИХ САЙТУ =====================
// Двоетапне підтвердження — це деструктивна дія, яку неможливо скасувати без
// власноруч зробленого файлу «Повний бекап». Чистимо: localStorage (довідник,
// по-батькові, автобекапи, позначки «не дублікати»), Cache Storage (офлайн-кеш
// PWA) і service worker, після чого перезавантажуємо сторінку «з нуля».
export async function clearSiteData() {
  const dictCount = state.dict.length;
  const patrCount = state.patrDict.length;
  const step1 = confirm(
    `Це видалить УСЕ, що застосунок зберіг у цьому браузері:\n\n`
    + `• Довідник — ${dictCount} записів\n`
    + `• Словник по-батькові — ${patrCount} записів\n`
    + `• Усі автобекапи й позначки «не дублікати»\n\n`
    + `Файли на диску (завантажені .ged/.html) це НЕ зачіпає — лише внутрішні дані застосунку.\n\n`
    + `Якщо не зробив(-ла) «Експортувати все» вище — відновити ці дані буде неможливо. Продовжити?`
  );
  if (!step1) return;
  const step2 = confirm('Останнє підтвердження: справді очистити все й почати з чистого аркуша?');
  if (!step2) return;

  try { localStorage.clear(); } catch {}
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch {}
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
  } catch {}

  alert('Дані очищено. Застосунок зараз перезавантажиться.');
  location.reload();
}

export function exportAllBackup() {
  const data = exportAllData(state.dict, state.patrDict, loadDismissedArray(), loadConfirmedArray());
  const stamp = new Date().toISOString().slice(0, 10);
  downloadText(`gedcom-translator-pro_повний-бекап_${stamp}.json`, JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
  markBackedUpNow();
}

export function importAllBackup() {
  document.getElementById('fullImportInput').click();
}

export async function doImportAll(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  let data;
  try {
    data = JSON.parse(await file.text());
    validateFullExport(data);
  } catch (err) {
    alert(`Не вдалося імпортувати файл: ${err.message}`);
    return;
  }

  const entriesCount = data.dict.length;
  const patrCount = data.patrDict.length;
  const dismissedCount = data.dismissedDuplicates.length;
  const confirmedCount = data.confirmedDuplicates.length;
  if (!confirm(
    `Імпортувати повний бекап (${entriesCount} записів довідника, ${patrCount} записів по-батькові`
    + `${dismissedCount ? `, ${dismissedCount} позначок «не дублікати»` : ''}`
    + `${confirmedCount ? `, ${confirmedCount} позначок «дублікати»` : ''})?\n\n`
    + `Це ПОВНІСТЮ замінить поточний довідник у цьому браузері. `
    + `Перед заміною буде автоматично збережено резервну копію поточного стану.`
  )) return;

  // Автобекап поточного стану перед заміною — щоб імпорт можна було відкотити
  createBackup('dict', `Перед імпортом повного бекапу (${data._exportedAt || '?'})`, { dict: state.dict });
  createBackup('patr', `Перед імпортом повного бекапу (${data._exportedAt || '?'})`, { patrDict: state.patrDict });

  replaceAllDict(data.dict);
  state.patrDict = data.patrDict;
  savePatrDict();
  replaceDismissed(data.dismissedDuplicates);
  replaceConfirmed(data.confirmedDuplicates);

  renderDict();
  renderBackups();
  alert('Повний бекап успішно імпортовано.');
  markBackedUpNow();
}

function downloadBackup(id) {
  const b = getBackup(id);
  if (!b) return;
  if (b.kind === 'translation') {
    const filename = (b.payload.fileName || 'backup').replace(/\.[^.]+$/, '') + '_backup.ged';
    downloadGedcom(filename, b.payload.rawContent);
    return;
  }
  const content = JSON.stringify(b.kind === 'patr' ? b.payload.patrDict : b.payload.dict, null, 2);
  const filename = (b.kind === 'patr' ? 'gedcom_patronymics' : 'gedcom_dict') + '_backup.json';
  downloadText(filename, content, 'application/json;charset=utf-8');
}
