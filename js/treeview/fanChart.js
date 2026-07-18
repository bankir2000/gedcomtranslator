// ===================== ВІЯЛОВЕ ДЕРЕВО (fan chart) =====================
// family-chart (бібліотека для звичайного дерева) не підтримує такий тип
// діаграми — ні безкоштовна, ні преміум-версія. Тому тут власна реалізація
// на "голому" D3 (d3-shape arc + d3-zoom).
//
// Корінь — по центру. ВЕРХНЯ половина — прямі предки (батько/мати на
// кожному кроці, класична бінарна структура ahnentafel). НИЖНЯ половина —
// нащадки (діти/онуки і т.д., довільна кількість дітей на людину, тому це
// вже не бінарний, а "сонячний" (sunburst) поділ — кожній дитині дістається
// рівна частка батьківського сектору).
//
// Кути одразу в системі d3.arc(): 0 = "12 годин" (вгору), зростає ЗА
// годинниковою стрілкою. Верх: від -90° до +90° (через 0°/вгору).
// Низ: від +90° до +270° (через 180°/вниз).
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

const TOP_START = -Math.PI / 2;
const TOP_END = Math.PI / 2;
const BOTTOM_START = Math.PI / 2;
const BOTTOM_END = Math.PI * 1.5;

// ---- Предки: фіксована бінарна структура (батько/мати на кожному кроці) ----
// level[0] = [сам корінь], level[1] = [батько, мати], level[2] = 4 прабатьки...
// Відсутній предок — null (порожній сектор).
function buildAncestorWedges(nodesById, rootId, generations) {
  const result = [];
  let prevLevel = [nodesById.get(rootId) || null];
  for (let g = 1; g <= generations; g++) {
    const step = (TOP_END - TOP_START) / (2 ** g);
    const nextLevel = [];
    prevLevel.forEach((person, i) => {
      const parents = person?.rels?.parents || [];
      const father = parents[0] ? (nodesById.get(parents[0]) || null) : null;
      const mother = parents[1] ? (nodesById.get(parents[1]) || null) : null;
      nextLevel.push(father, mother);
    });
    nextLevel.forEach((node, i) => {
      const a0 = TOP_START + i * step;
      const a1 = a0 + step;
      if (node) result.push({ node, gen: g, a0, a1 });
    });
    prevLevel = nextLevel;
  }
  return result;
}

// ---- Нащадки: довільна кількість дітей -> кожній дитині рівна частка
// батьківського сектору (рекурсивний "sunburst"-поділ). ----
function buildDescendantWedges(nodesById, rootId, generations) {
  const result = [];
  function recurse(id, gen, a0, a1) {
    if (gen > generations) return;
    const node = nodesById.get(id);
    if (!node) return;
    if (gen > 0) result.push({ node, gen, a0, a1 });
    const childIds = (node.rels && node.rels.children) || [];
    if (!childIds.length || gen === generations) return;
    const step = (a1 - a0) / childIds.length;
    childIds.forEach((cid, i) => recurse(cid, gen + 1, a0 + i * step, a0 + (i + 1) * step));
  }
  recurse(rootId, 0, BOTTOM_START, BOTTOM_END);
  return result;
}

function personNameYears(node) {
  if (!node) return { name: '', years: '' };
  const d = node.data || {};
  const name = d['first name'] || '';
  const years = [d.birthYear, d.deathYear].filter(Boolean).join('–');
  return { name, years };
}

// Обрізає ОДНЕ слово, якщо воно саме по собі задовге для рядка.
function truncateWord(word, maxChars) {
  if (word.length <= maxChars) return word;
  return word.slice(0, Math.max(1, maxChars - 1)) + '…';
}

// Розбиває підпис на рядки під реальну ширину кільця (до maxLines штук).
// Двофазний підхід (навмисно простий, щоб не повторити попередній баг, коли
// перевірка "чи потрібні три крапки" рахувалась ДО обрізання зайвих рядків
// і підпис іноді обривався без "…", виглядаючи поламаним):
//  1) пакуємо слова в рядки БЕЗ жодного обмеження кількості рядків;
//  2) якщо вийшло більше, ніж дозволено — залишаємо перші maxLines і
//     додаємо "…" до останнього з них.
function wrapText(label, arcLenPx, fontSizePx, maxLines = 2) {
  const avgCharPx = fontSizePx * 0.53;
  const maxChars = Math.max(0, Math.floor((arcLenPx * 0.9) / avgCharPx));
  if (maxChars < 3 || !label) return [];
  maxLines = Math.max(1, maxLines);

  const words = label.split(' ').filter(Boolean).map(w => truncateWord(w, maxChars));

  const allLines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      allLines.push(current);
      current = word;
    }
  }
  if (current) allLines.push(current);

  if (allLines.length <= maxLines) return allLines;
  const kept = allLines.slice(0, maxLines);
  kept[kept.length - 1] = kept[kept.length - 1].replace(/[,\s…]+$/, '') + '…';
  return kept;
}

function attachTapHold(selection, getNode, { onTap, onLongPress }) {
  let timer = null;
  let firedLongPress = false;
  let startX = 0, startY = 0;

  selection
    .style('cursor', 'pointer')
    .on('pointerdown', function (event) {
      firedLongPress = false;
      startX = event.clientX; startY = event.clientY;
      clearTimeout(timer);
      timer = setTimeout(() => {
        firedLongPress = true;
        onLongPress(getNode(this, event));
      }, 550);
    })
    .on('pointerup', function (event) {
      clearTimeout(timer);
      if (firedLongPress) return;
      const dx = Math.abs(event.clientX - startX);
      const dy = Math.abs(event.clientY - startY);
      if (dx < 8 && dy < 8) onTap(getNode(this, event));
    })
    .on('pointerleave', () => clearTimeout(timer))
    .on('pointercancel', () => clearTimeout(timer));
}

/**
 * Малює віялову діаграму (предки зверху, нащадки знизу) у container.
 * @param container    DOM-елемент (вміст очищується)
 * @param nodesById     Map(id -> вузол family-chart формату)
 * @param rootId         з кого починати (центр)
 * @param generations    скільки поколінь в кожен бік (той самий повзунок)
 * @param callbacks      { onTap(node), onLongPress(node) }
 */
export function renderFanChart(container, nodesById, rootId, generations, callbacks) {
  container.innerHTML = '';
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 600;
  const centerX = width / 2;
  const centerY = height / 2;

  const rootRadius = 46; // радіус центрального кола-кореня
  const maxRadius = Math.max(120, Math.min(centerY - 16, centerX - 16, 620));
  const ringWidth = Math.max(26, (maxRadius - rootRadius) / Math.max(1, generations));

  const svg = d3.select(container).append('svg')
    .attr('width', '100%').attr('height', '100%')
    .style('touch-action', 'none');

  const zoomLayer = svg.append('g');
  const chartGroup = zoomLayer.append('g').attr('transform', `translate(${centerX},${centerY})`);

  const zoom = d3.zoom().scaleExtent([0.25, 4])
    .on('zoom', (event) => zoomLayer.attr('transform', event.transform));
  svg.call(zoom);
  // Масштабуємо навколо ЦЕНТРУ віяла (centerX,centerY), а не навколо (0,0)
  // лівого верхнього кута SVG — інакше при zoom<1 корінь "з'їжджає" вбік
  // (саме це й спричиняло видимий перекіс усього віяла).
  const initialScale = 0.85;
  svg.call(zoom.transform, d3.zoomIdentity
    .translate(centerX, centerY).scale(initialScale).translate(-centerX, -centerY));

  const arcGen = d3.arc();

  function drawWedge(entry) {
    const { node, gen, a0, a1 } = entry;
    const innerR = rootRadius + (gen - 1) * ringWidth;
    const outerR = rootRadius + gen * ringWidth;
    const midA = (a0 + a1) / 2;
    const midR = (innerR + outerR) / 2;

    const wedgeGroup = chartGroup.append('g').attr('class', 'fan-wedge');
    const genderFill = node.data?.gender === 'M' ? 'rgba(45,95,168,.35)'
      : node.data?.gender === 'F' ? 'rgba(168,61,99,.35)' : 'var(--surface2)';
    wedgeGroup.append('path')
      .attr('d', arcGen({ innerRadius: innerR, outerRadius: outerR, startAngle: a0, endAngle: a1 }))
      .attr('fill', genderFill)
      .attr('stroke', 'var(--border)').attr('stroke-width', 1);

    // Текст — РАДІАЛЬНО (вздовж лінії від центру назовні), а не вздовж дуги:
    // так підпис має простір за шириною КІЛЬЦЯ (ringWidth — приблизно та сама
    // величина на кожному поколінні), а не за дедалі вужчою дугою на далеких
    // поколіннях. Для "дальньої" половини кола текст додатково розвертаємо на
    // 180°, інакше він був би догори ногами (правило працює однаково і для
    // верхньої половини — предків, і для нижньої — нащадків).
    const midDeg = midA * (180 / Math.PI);
    const normDeg = ((midDeg % 360) + 360) % 360;
    const flip = normDeg >= 180;
    const fontSize = gen <= 2 ? 11 : gen <= 4 ? 9.5 : 8;
    // dy для кожного наступного рядка зсуває текст уздовж ДУГИ (бо рядок і
    // так радіальний), тому кількість рядків, які реально влазять без
    // наліз on сусідній сектор, залежить від дугової ширини на найвужчому
    // (внутрішньому) краю сектора.
    const innerArcWidth = (a1 - a0) * innerR;
    const maxTotalLines = Math.min(3, Math.max(1, Math.floor(innerArcWidth / (fontSize * 1.15))));
    const { name, years } = personNameYears(node);
    const nameLines = wrapText(name, ringWidth, fontSize, Math.min(2, maxTotalLines));
    let lines = nameLines;
    if (years && nameLines.length < maxTotalLines) {
      const yearsLines = wrapText(years, ringWidth, fontSize, 1);
      lines = nameLines.concat(yearsLines);
    }
    if (lines.length) {
      const lineHeightEm = 1.1;
      const textEl = wedgeGroup.append('text')
        .attr('transform', `rotate(${midDeg - 90}) translate(${midR},0) rotate(${flip ? 180 : 0})`)
        .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
        .attr('fill', 'var(--text)').style('font', `${fontSize}px sans-serif`);
      lines.forEach((line, i) => {
        const tspan = textEl.append('tspan')
          .attr('x', 0)
          .attr('dy', i === 0 ? `${-(lines.length - 1) * lineHeightEm / 2}em` : `${lineHeightEm}em`)
          .text(line);
        if (i >= nameLines.length) tspan.style('opacity', '.72');
      });
    }
    attachTapHold(wedgeGroup, () => node, callbacks);
  }

  // ---- корінь ----
  const rootNode = nodesById.get(rootId);
  const rootGroup = chartGroup.append('g');
  rootGroup.append('circle')
    .attr('r', rootRadius)
    .attr('fill', 'var(--surface)').attr('stroke', 'var(--red)').attr('stroke-width', 2.5);
  const rootInfo = personNameYears(rootNode);
  const rootNameLines = wrapText(rootInfo.name || '?', rootRadius * 1.7, 11, 2);
  const rootYearsLines = rootInfo.years ? wrapText(rootInfo.years, rootRadius * 1.7, 11, 1) : [];
  const rootLines = rootNameLines.concat(rootYearsLines);
  const rootText = rootGroup.append('text')
    .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
    .attr('fill', 'var(--text)').style('font', '700 11px sans-serif');
  rootLines.forEach((line, i) => {
    const tspan = rootText.append('tspan')
      .attr('x', 0)
      .attr('dy', i === 0 ? `${-(rootLines.length - 1) * 1.15 / 2}em` : '1.15em')
      .text(line);
    if (i >= rootNameLines.length) tspan.style('opacity', '.72');
  });
  if (rootNode) attachTapHold(rootGroup, () => rootNode, callbacks);

  // ---- предки (верх) ----
  buildAncestorWedges(nodesById, rootId, generations).forEach(drawWedge);
  // ---- нащадки (низ) ----
  buildDescendantWedges(nodesById, rootId, generations).forEach(drawWedge);
}
