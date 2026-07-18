// ===================== МАЙСТЕР ПЕРЕКЛАДУ (Етап 3) =====================
// Замість "все на одному екрані" — три чіткі кроки: Файл → Параметри → Результат.
// Логіка кожного кроку (завантаження, переклад) не змінилась, це лише навігаційний шар.
import { state } from '../state.js';

const STEP_IDS = { 1: 'wizStep1', 2: 'wizStep2', 3: 'wizStep3' };

export function initWizard() {
  document.querySelectorAll('.wiz-step').forEach(btn => {
    btn.addEventListener('click', () => {
      const n = +btn.dataset.step;
      if (n <= state.wizardMaxReached) goToStep(n);
    });
  });
  render();
}

export function goToStep(n) {
  state.wizardStep = n;
  if (n > state.wizardMaxReached) state.wizardMaxReached = n;
  for (const [step, id] of Object.entries(STEP_IDS)) {
    document.getElementById(id).style.display = (+step === n) ? 'flex' : 'none';
  }
  render();
  document.getElementById('panel-translate').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function markReached(n) {
  if (n > state.wizardMaxReached) state.wizardMaxReached = n;
  render();
}

export function resetWizard() {
  state.wizardStep = 1;
  state.wizardMaxReached = 1;
  goToStep(1);
}

function render() {
  document.querySelectorAll('.wiz-step').forEach(btn => {
    const n = +btn.dataset.step;
    btn.classList.toggle('active', n === state.wizardStep);
    btn.classList.toggle('done', n < state.wizardStep || (n <= state.wizardMaxReached && n !== state.wizardStep));
    btn.disabled = n > state.wizardMaxReached;
  });
}
