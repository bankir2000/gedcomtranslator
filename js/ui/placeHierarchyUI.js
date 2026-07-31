// ===================== ІЄРАРХІЯ МІСЦЬ — ВІДОБРАЖЕННЯ (вкладка «Місця») =====================
import { state } from '../state.js';
import { buildPlaceHierarchy } from '../engine/placeHierarchy.js';

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

// Рекурсивний підрахунок: скільки всього вузлів і скільки з них перекладені —
// для короткого підсумку нагорі ("47 із 62 місць перекладено").
function countAll(nodes) {
  let total = 0, translated = 0;
  for (const n of nodes) {
    total++;
    if (n.translated) translated++;
    const sub = countAll(n.children);
    total += sub.total;
    translated += sub.translated;
  }
  return { total, translated };
}

function renderNode(node, depth) {
  const hasChildren = node.children.length > 0;
  const statusHtml = node.translated
    ? `<span style="color:var(--green);">✅ ${esc(node.uk)}</span>`
    : `<span style="color:var(--red);">❌ немає в словнику</span>`;
  const childrenHtml = hasChildren
    ? `<div class="ph-children">${node.children.map(c => renderNode(c, depth + 1)).join('')}</div>`
    : '';
  return `
    <div class="ph-node" style="margin-left:${depth * 18}px;">
      <span class="ph-toggle"${hasChildren ? ' data-toggle="1"' : ''}>${hasChildren ? '▾' : '·'}</span>
      <span class="ph-name">${esc(node.name)}</span>
      <span style="font-size:.72rem;color:var(--muted);"> (${node.count}×)</span>
      — ${statusHtml}
      ${childrenHtml}
    </div>`;
}

export function renderPlaceHierarchy() {
  const el = document.getElementById('placeHierarchyTree');
  if (!el) return;
  if (!state.rawContent) {
    el.innerHTML = '<span style="color:var(--muted);">Завантаж файл і натисни «Скан файлу».</span>';
    return;
  }

  const placeDictEntries = state.dict.filter(e => e.type === 'place');
  const { roots, conflicts } = buildPlaceHierarchy(state.rawContent, placeDictEntries);

  if (!roots.length) {
    el.innerHTML = '<span style="color:var(--muted);">Місць не знайдено у файлі.</span>';
    return;
  }

  const { total, translated } = countAll(roots);
  const pct = total ? Math.round((translated / total) * 100) : 0;

  let html = `<div style="margin-bottom:10px;font-size:.82rem;">
    <b>${translated} із ${total}</b> місць перекладено (${pct}%)
  </div>`;

  if (conflicts.length) {
    html += `<div style="margin-bottom:10px;font-size:.75rem;color:var(--orange);">
      ⚠️ Для ${conflicts.length} місц${conflicts.length === 1 ? 'я' : 'ь'} у файлі трапляються різні "батьківські" рівні
      (обрано найчастіший варіант) — можливо, варто перевірити вручну: ${conflicts.slice(0, 5).map(c => esc(c.child)).join(', ')}${conflicts.length > 5 ? '…' : ''}
    </div>`;
  }

  html += roots.map(r => renderNode(r, 0)).join('');
  el.innerHTML = html;

  el.querySelectorAll('.ph-toggle[data-toggle]').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const childrenDiv = toggle.parentElement.querySelector(':scope > .ph-children');
      if (!childrenDiv) return;
      const collapsed = childrenDiv.style.display === 'none';
      childrenDiv.style.display = collapsed ? '' : 'none';
      toggle.textContent = collapsed ? '▾' : '▸';
    });
  });
}
