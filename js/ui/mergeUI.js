// ===================== "ЖИВІ РОДИЧІ" — РЕДАКТОР І ОБ'ЄДНАННЯ =====================
import { state } from '../state.js';
import { mergeBaseIntoMain } from '../engine/mergeBase.js';

let baseFileContent = '';
let baseFileName = '';

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export function initLivingPeopleUI() {
  document.getElementById('btn-open-people-editor').addEventListener('click', () => {
    // НАВМИСНО без іменованого вікна (той самий урок, що й з деревом) —
    // завжди нова вкладка, щоб випадково не влізти в чужу стару вкладку.
    window.open('people-editor.html', '_blank');
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
      refreshMergeControls();
    } catch (err) {
      console.error(err);
      document.getElementById('baseFileLabel').textContent = '⚠️ Не вдалося прочитати файл';
      document.getElementById('baseFileLabel').style.color = 'var(--red)';
    }
  });

  document.getElementById('btn-do-merge').addEventListener('click', doMerge);
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
    showResult('⚠️ Не вдалося об’єднати файли — перевір, що обраний файл справді база, збережена редактором живих родичів.', true);
    return;
  }

  const { mergedContent, addedCount, unmatchedAnchors } = outcome;
  if (useTranslated) state.translatedContent = mergedContent;
  else state.rawContent = mergedContent;

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
  showResult(msg, unmatchedAnchors.length > 0);
}

function showResult(html, isWarning) {
  const el = document.getElementById('mergeResult');
  el.style.color = isWarning ? 'var(--orange)' : 'var(--green)';
  el.innerHTML = html;
}
