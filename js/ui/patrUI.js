// ===================== ПО-БАТЬКОВІ: ТЕСТЕР + СКАН =====================
// Ручний редактор по-батькові прибрано (Pro 25) — ті самі записи (state.patrDict)
// тепер редагуються у вкладці «Довідник» (тип «По-батькові»), щоб не тримати той
// самий словник у двох місцях одночасно. Тут лишились лише інструменти, яких
// більше ніде нема: тестер правил і автосканування поточного файлу.
import { state } from '../state.js';
import { savePatrDict } from '../dict/store.js';
import { parseRuPatronymic, isPatronymic, translatePatronymic } from '../dict/patronymics.js';

function esc(s) { return (s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

export function testPatronymic() {
  const val = document.getElementById('patrTestInput').value.trim();
  const sex = document.getElementById('patrTestSex').value;
  const res = document.getElementById('patrTestResult');
  if (!val) { res.innerHTML = ''; return; }
  const result = translatePatronymic(val, sex);
  const parsed = parseRuPatronymic(val);
  const src = parsed
    ? (state.patrDict.some(e => e.ru.toLowerCase() === val.toLowerCase()) ? '<span class="manual-badge">ручний</span>' : '<span class="auto-badge">авто</span>')
    : '<span style="color:var(--red);font-size:.75rem;">не розпізнано як по-батькові</span>';
  res.innerHTML = `<span class="pair"><span class="ru-part">${val}</span><span class="arrow">→</span><span class="uk-part">${result}</span>${src}</span>`;
}

export function generatePatrDict() {
  if (!state.rawContent) { alert('Спочатку завантаж GEDCOM файл на вкладці «Переклад»'); return; }
  const found = new Map();
  const lines = state.rawContent.split(/\r?\n/);
  for (const line of lines) {
    const tagMatch = line.match(/^\d+ (GIVN|NAME|_PATR)\s+(.+)$/);
    if (!tagMatch) continue;
    const [, tag, rawVal] = tagMatch;
    // У NAME "Ім'я По-батькові /Прізвище/" — по-батькові трапляється лише ДО прізвища.
    // Те, що між слешами, це прізвище (напр. "Жорнова"), і скан не повинен його чіпати —
    // інакше прізвища, що граматично збігаються з архаїчним по-батькові (закінчення
    // -ов/-ева тощо), хибно потрапляють у список "знайдених по-батькові".
    const text = tag === 'NAME' ? rawVal.split('/')[0] : rawVal;
    const words = text.trim().split(/\s+/);
    for (const w of words) {
      if (isPatronymic(w)) {
        if (!found.has(w)) {
          const auto = translatePatronymic(w);
          const manual = state.patrDict.find(e => e.ru.toLowerCase() === w.toLowerCase());
          found.set(w, { count: 0, auto, manual: manual?.uk });
        }
        found.get(w).count++;
      }
    }
  }

  const el = document.getElementById('patrAutoList');
  if (found.size === 0) {
    el.innerHTML = '<span style="color:var(--muted)">По-батькові не знайдено у файлі.</span>';
    return;
  }

  let html = '';
  for (const [ru, info] of [...found.entries()].sort((a, b) => b[1].count - a[1].count)) {
    if (info.manual) {
      html += `<div class="pair" style="margin:3px 0;">`
        + `<span class="ru-part">${esc(ru)}</span><span class="arrow">→</span>`
        + `<span class="manual-badge">ручний: ${esc(info.manual)}</span>`
        + ` <span style="color:var(--muted);font-size:.75rem;">(${info.count}×)</span>`
        + `</div>`;
      continue;
    }
    // Якщо корінь імені не знайдено в довіднику, translatePatronymic повертає слово
    // НЕЗМІННИМ (не вгадує) — тобто info.auto тут НЕ переклад, а сигнал "не розпізнано".
    // Показуємо це явно, а не як звичайний "авто"-результат, щоб не ввести в оману.
    const unresolved = info.auto.toLowerCase() === ru.toLowerCase();
    const badge = unresolved
      ? `<span style="color:var(--red);font-size:.72rem;">корінь імені не в довіднику — введи переклад вручну</span>`
      : `<span class="auto-badge">авто: ${esc(info.auto)}</span>`;
    html += `<div class="pair" style="margin:3px 0;flex-wrap:wrap;">`
      + `<span class="ru-part">${esc(ru)}</span><span class="arrow">→</span>`
      + badge
      + ` <span style="color:var(--muted);font-size:.75rem;">(${info.count}×)</span>`
      + `<input type="text" class="search-input patr-scan-input" data-ru="${esc(ru)}" value="${unresolved ? '' : esc(info.auto)}" placeholder="Правильний переклад…" style="width:160px;margin-left:6px;">`
      + `<button class="btn btn-ghost patr-scan-save-btn" data-ru="${esc(ru)}" style="padding:2px 8px;font-size:.72rem;">+ до словника (По-батькові)</button>`
      + `</div>`;
  }
  el.innerHTML = html;
  el.querySelectorAll('.patr-scan-save-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ru = btn.dataset.ru;
      const input = el.querySelector(`.patr-scan-input[data-ru="${CSS.escape(ru)}"]`);
      const uk = (input?.value || '').trim();
      if (!uk) { alert('Введи переклад перед додаванням у словник.'); return; }
      addPatrFromScan(ru, uk);
    });
  });
}

function addPatrFromScan(ru, uk) {
  const parsed = parseRuPatronymic(ru);
  // Позначаємо learned:true — це "навчання словника" для по-батькові:
  // наступного разу це по-батькові вже буде у ручному списку з пріоритетом.
  state.patrDict.push({ ru, uk, sex: parsed?.sex || 'M', learned: true });
  savePatrDict();
  generatePatrDict(); // перемальовує список сканування — рядок одразу покаже позначку "ручний"
}
