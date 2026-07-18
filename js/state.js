// ===================== СПІЛЬНИЙ СТАН ДОДАТКУ =====================
// Один об'єкт, на який посилаються всі модулі. Властивості мутуються напряму
// (без Redux/бібліотек) — свідомий вибір заради простоти для проєкту одного розробника.
export const state = {
  dict: [],       // Pro 17: єдиний плаский довідник {type, ru, uk, ukModern?, gender}
  patrDict: [],
  rawContent: '',
  translatedContent: '',
  fileName: '',
  encodingLabel: '',
  diffData: [],   // {lineNum, tag, cat, orig, translated}
  untransData: [],// {word, count, contexts, ukInput, tag, unchanged}
  wizardStep: 1,      // Етап 3: покроковий майстер перекладу (1..3)
  wizardMaxReached: 1,
  analysis: null,     // Етап 4: результат runFullAnalysis() — {stats, issues, duplicates, freq}
  analysisSource: '', // 'raw' | 'translated' — що саме було проаналізовано
};
