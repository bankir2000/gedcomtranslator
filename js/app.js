// ===================== ТОЧКА ВХОДУ =====================
import { initDicts } from './dict/store.js';
import { initTheme, toggleTheme } from './ui/theme.js';
import { switchTab } from './ui/tabs.js';
import {
  renderDict, addEntry, exportDict, importDict, doImport,
} from './ui/dictUI.js';
import { testPatronymic, generatePatrDict } from './ui/patrUI.js';
import { testWord, generateWordScan } from './ui/wordScanUI.js';
import { renderPlaceHierarchy } from './ui/placeHierarchyUI.js';
import { renderReview } from './ui/reviewUI.js';
import { addAllUntransToDict } from './ui/untransUI.js';
import { initFileUI, clearFile } from './ui/fileUI.js';
import { runTranslation, downloadResult } from './ui/runTranslation.js';
import { renderBackups, exportAllBackup, importAllBackup, doImportAll, clearSiteData, renderBackupStatus } from './ui/backupUI.js';
import { initWizard, goToStep } from './ui/wizard.js';
import { runAnalysis, downloadAnalysisReport, shareDuplicatesReport, shareConfirmedDuplicatesReport } from './ui/analysisUI.js';
import { runSearch, saveEditor, closeEditor } from './ui/searchUI.js';
import { initCompareTab, runCompare, downloadCompareReport } from './ui/compareUI.js';
import { generateFsReport, downloadFsReport, runFsrFilter } from './ui/familysearchReportUI.js';
import { searchTreePeople, openTreeWindow, refreshTreeSelection } from './ui/treeUI.js';
import { initLivingPeopleUI, refreshMergeControls } from './ui/mergeUI.js';

// ---- Ініціалізація стану ----
initDicts();
initTheme();
initFileUI();
initLivingPeopleUI();
initWizard();
initCompareTab();
renderBackups();
renderBackupStatus();
renderDict();

// ---- Тема ----
document.getElementById('themeBtn').addEventListener('click', toggleTheme);

// ---- Вкладки ----
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ---- Вкладка «Переклад»: навігація майстра ----
document.getElementById('btn-step1-next').addEventListener('click', () => { goToStep(2); refreshMergeControls(); });
document.getElementById('btn-step2-back').addEventListener('click', () => goToStep(1));
document.getElementById('btn-step3-back').addEventListener('click', () => goToStep(2));
document.getElementById('btn-translate').addEventListener('click', async () => { await runTranslation(); refreshMergeControls(); });
document.getElementById('btn-clear').addEventListener('click', clearFile);
document.getElementById('btn-download').addEventListener('click', downloadResult);

// ---- Вкладка «Довідник» ----
document.getElementById('dictSearch').addEventListener('input', renderDict);
document.getElementById('btn-dict-add').addEventListener('click', addEntry);
document.getElementById('btn-dict-import').addEventListener('click', importDict);
document.getElementById('btn-dict-export').addEventListener('click', exportDict);
document.getElementById('dictImportInput').addEventListener('change', doImport);

// ---- Вкладка «По-батькові» ----
document.getElementById('patrTestInput').addEventListener('input', testPatronymic);
document.getElementById('patrTestSex').addEventListener('change', testPatronymic);
document.getElementById('btn-patr-scan').addEventListener('click', generatePatrDict);

// ---- Вкладки «Імена» / «Прізвища» / «Місця» ----
for (const cat of ['name', 'surn', 'place']) {
  document.getElementById(`${cat}TestInput`).addEventListener('input', () => testWord(cat));
}
document.getElementById('btn-name-scan').addEventListener('click', () => generateWordScan('name'));
document.getElementById('btn-surn-scan').addEventListener('click', () => generateWordScan('surn'));
document.getElementById('btn-place-scan').addEventListener('click', () => {
  generateWordScan('place');
  renderPlaceHierarchy();
});

// ---- Вкладка «Перегляд змін» ----
['flt-names', 'flt-surn', 'flt-places', 'flt-dates', 'flt-other', 'flt-auto-only'].forEach(id => {
  document.getElementById(id).addEventListener('change', renderReview);
});
document.getElementById('reviewSearch').addEventListener('input', renderReview);
document.getElementById('btn-review-download').addEventListener('click', downloadResult);

// ---- Вкладка «Непереведені» ----
document.getElementById('btn-untrans-all').addEventListener('click', addAllUntransToDict);

// ---- Вкладка «Аналіз» ----
document.getElementById('btn-run-analysis').addEventListener('click', runAnalysis);
document.getElementById('btn-share-dups').addEventListener('click', shareDuplicatesReport);
document.getElementById('btn-share-confirmed-dups').addEventListener('click', shareConfirmedDuplicatesReport);
document.getElementById('btn-analysis-report').addEventListener('click', downloadAnalysisReport);

// ---- Вкладка «Пошук» ----
document.getElementById('searchQuery').addEventListener('input', runSearch);
document.querySelectorAll('input[name="searchMode"]').forEach(el => el.addEventListener('change', runSearch));
document.getElementById('btn-record-save').addEventListener('click', saveEditor);
document.getElementById('btn-record-cancel').addEventListener('click', closeEditor);

// ---- Повний бекап (усі словники одним файлом) ----
document.getElementById('btn-export-all').addEventListener('click', exportAllBackup);
document.getElementById('btn-import-all').addEventListener('click', importAllBackup);
document.getElementById('fullImportInput').addEventListener('change', doImportAll);
document.getElementById('btn-clear-site-data').addEventListener('click', clearSiteData);

// ---- Вкладка «Порівняння» ----
document.getElementById('btn-run-compare').addEventListener('click', runCompare);
document.getElementById('btn-compare-report').addEventListener('click', downloadCompareReport);

// ---- Вкладка «Звіт FamilySearch» ----
document.getElementById('btn-fsr-generate').addEventListener('click', generateFsReport);
document.getElementById('btn-fsr-download').addEventListener('click', downloadFsReport);
document.getElementById('fsrSearch').addEventListener('input', runFsrFilter);

// ---- Вкладка «Родинне дерево» ----
document.getElementById('treeSearchInput').addEventListener('input', searchTreePeople);
document.getElementById('treeOpenBtn').addEventListener('click', openTreeWindow);
document.getElementById('treeSourceOrig').addEventListener('change', refreshTreeSelection);
document.getElementById('treeSourceTranslated').addEventListener('change', refreshTreeSelection);
