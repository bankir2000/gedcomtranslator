// ===================== "ЖИВІ РОДИЧІ" — РЕДАКТОР І ОБ'ЄДНАННЯ =====================
import { state } from '../state.js';
import { mergeBaseIntoMain } from '../engine/mergeBase.js';
import { buildIndex, validateStructure } from '../engine/analysis.js';
import { openPageOrNavigate } from './navUtil.js';
import { downloadGedcom } from '../core/download.js';

// Запам'ятовуємо, у ЯКИЙ саме файл щойно домержили (оригінал чи переклад) —
// щоб кнопка "Зберегти об'єднаний файл" зберігала саме його, а не будь-що.
let lastMergeTarget = null; // 'original' | 'translated' | null

let baseFileContent = '';
let baseFileName = '';

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export function initLivingPeopleUI() {
  document.getElementById('btn-open-people-editor').addEventListener('click', () => {
    // Спершу пробуємо нову вкладку; якщо середовище (напр. Android WebView
    // без підтримки кількох вікон) мовчки цього не підтримує — переходимо
    // на редактор у цій самій вкладці (openPageOrNavigate сама розбереться).
    openPageOrNavigate('people-editor.html');
  });

  document.getElementById('btn-choose-base-file').addEventListener('click', () => {
    document.getElementById('baseFileInput').click();
  });

  document.getElementById('baseFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      baseFileContent = await file.text();
      baseFileName = file.name;
      document.getElementById('baseFileLabel').textContent = `✅ ${file.name}`;
      document.getElementById('baseFileLabel').style.color = 'var(--green)';
      document.getElementById('btn-edit-base').style.display = 'inline-flex';
      lastMergeTarget = null;
      document.getElementById('btn-save-merged').style.display = 'none';
      refreshMergeControls();
    } catch (err) {
      console.error(err);
      document.getElementById('baseFileLabel').textContent = '⚠️ Не вдалося прочитати файл';
      document.getElementById('baseFileLabel').style.color = 'var(--red)';
    }
  });

  document.getElementById('btn-edit-base').addEventListener('click', () => {
    // Передаємо вміст бази редактору через sessionStorage (він сам розпізнає
    // цей ключ при завантаженні й підвантажить осіб у список з можливістю
    // редагування — так само, якби це зробили кнопкою "Завантажити базу" в
    // самому редакторі, просто без зайвого кліку).
    try {
      sessionStorage.setItem('gedcom_living_base_pending_v1', baseFileContent);
    } catch { /* не критично — просто відкриється порожній редактор */ }
    openPageOrNavigate('people-editor.html');
  });

  document.getElementById('btn-do-merge').addEventListener('click', doMerge);
  document.getElementById('btn-save-merged').addEventListener('click', saveMergedFile);
}

// Показує/оновлює доступність елементів керування об'єднанням — викликається
// і після вибору файлу бази, і після завантаження/перекладу основного файлу
// (тому експортується — app.js кличе це й після завершення перекладу).
export function refreshMergeControls() {
  const hasMain = !!(state.rawContent);
  const hasBase = !!baseFileContent;
  const hasTranslated = !!state.translatedContent;

  document.getElementById('mergeTargetRow').style.display = hasBase ? 'flex' : 'none';
  const translatedLabel = document.getElementById('mergeTargetTranslatedLabel');
  const translatedRadio = document.getElementById('mergeTargetTranslated');
  translatedRadio.disabled = !hasTranslated;
  translatedLabel.style.opacity = hasTranslated ? '1' : '.5';
  if (!hasTranslated) document.getElementById('mergeTargetOrig').checked = true;

  document.getElementById('btn-do-merge').disabled = !(hasMain && hasBase);
}

function doMerge() {
  if (!baseFileContent) return;
  const useTranslated = document.getElementById('mergeTargetTranslated').checked && state.translatedContent;
  const targetContent = useTranslated ? state.translatedContent : state.rawContent;
  if (!targetContent) { showResult('⚠️ Спочатку завантаж основний GEDCOM файл.', true); return; }

  let outcome;
  try {
    outcome = mergeBaseIntoMain(targetContent, baseFileContent);
  } catch (err) {
    console.error('Помилка об’єднання:', err);
    showResult('⚠️ Не вдалося об’єднати файли — перевір, що обраний файл справді база, збережена редактором людей.', true);
    return;
  }

  const { mergedContent, addedCount, unmatchedAnchors } = outcome;
  if (useTranslated) state.translatedContent = mergedContent;
  else state.rawContent = mergedContent;
  lastMergeTarget = useTranslated ? 'translated' : 'original';
  document.getElementById('btn-save-merged').style.display = 'inline-flex';

  // Оновлюємо статистику на кроці 1, як після звичайного завантаження файлу
  const lines = mergedContent.split('\n');
  document.getElementById('st-lines').textContent = lines.length;
  document.getElementById('st-persons').textContent = (mergedContent.match(/0 @[^@]+@ INDI/g) || []).length;
  document.getElementById('st-families').textContent = (mergedContent.match(/0 @[^@]+@ FAM/g) || []).length;
  document.getElementById('statsBar').style.display = 'grid';

  let msg = `✅ Додано ${addedCount} осіб у ${useTranslated ? 'перекладений файл' : 'оригінал'}.`;
  if (unmatchedAnchors.length) {
    msg += `<br>⚠️ Не знайдено в основному файлі ${unmatchedAnchors.length} якір(ів) — їхні гілки додані без прив'язки: ${unmatchedAnchors.map(esc).join(', ')}`;
  }

  // Швидка перевірка цілісності одразу після об'єднання — щоб биті посилання
  // (якщо раптом трапились) було видно тут, а не лише окремим переходом
  // у вкладку «Аналіз».
  const { individuals: mIndi, families: mFam, duplicateIds } = buildIndex(mergedContent);
  const mergeIssues = validateStructure(mIndi, mFam, duplicateIds).filter(i => i.level === 'error');
  let hasErrors = unmatchedAnchors.length > 0;
  if (mergeIssues.length) {
    hasErrors = true;
    msg += `<br>⛔ Перевірка цілісності знайшла ${mergeIssues.length} проблем(и) у результаті — перевір вкладку «Аналіз» → «Перевірка структури» перед збереженням.`;
  }
  showResult(msg, hasErrors);
}

function showResult(html, isWarning) {
  const el = document.getElementById('mergeResult');
  el.style.color = isWarning ? 'var(--orange)' : 'var(--green)';
  el.innerHTML = html;
}

// Зберігає саме той файл, у який щойно домержили людей (оригінал або
// переклад) — читаємо його з state.* у момент кліку (не з кешованої
// змінної), щоб завжди зберегти найсвіжіший вміст.
function saveMergedFile() {
  if (!lastMergeTarget) return;
  const content = lastMergeTarget === 'translated' ? state.translatedContent : state.rawContent;
  if (!content) { showResult('⚠️ Немає що зберігати — спробуй об’єднати ще раз.', true); return; }
  const base = (state.fileName || 'gedcom').replace(/\.[^.]+$/, '');
  const suffix = lastMergeTarget === 'translated' ? '_ukr_обʼєднано.ged' : '_обʼєднано.ged';
  downloadGedcom(base + suffix, content);
}
