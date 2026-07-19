// ===================== ВКЛАДКИ =====================
import { renderDict } from './dictUI.js';
import { renderReview } from './reviewUI.js';
import { renderUntrans } from './untransUI.js';
import { renderAnalysisTab } from './analysisUI.js';
import { initSearchTab } from './searchUI.js';
import { initFsReportTab } from './familysearchReportUI.js';
import { initTreeTab } from './treeUI.js';
import { refreshMergeControls } from './mergeUI.js';

const TAB_IDS = ['translate', 'living', 'dict', 'names', 'patr', 'surnames', 'places', 'review', 'untrans', 'analysis', 'search', 'compare', 'fsreport', 'tree'];

export function switchTab(t) {
  document.querySelectorAll('.tab').forEach((b, i) => b.classList.toggle('active', TAB_IDS[i] === t));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + t).classList.add('active');
  if (t === 'living') refreshMergeControls();
  if (t === 'dict') renderDict();
  if (t === 'review') renderReview();
  if (t === 'untrans') renderUntrans();
  if (t === 'analysis') renderAnalysisTab();
  if (t === 'search') initSearchTab();
  if (t === 'fsreport') initFsReportTab();
  if (t === 'tree') initTreeTab();
}
