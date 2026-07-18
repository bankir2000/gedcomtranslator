// ===================== ГЕНЕРАТОР САМОДОСТАТНЬОГО HTML-ЗВІТУ =====================
function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function buildReportHtml(rows, meta) {
  const trs = rows.map(r => `
    <tr>
      <td>${r.fsftid ? `<a href="https://www.familysearch.org/tree/person/details/${encodeURIComponent(r.fsftid)}" target="_blank" rel="noopener">${esc(r.fsftid)} ↗</a>` : '—'}</td>
      <td>${esc(r.given) || '—'}</td>
      <td>${esc(r.patr) || '—'}</td>
      <td>${esc(r.surn) || '—'}</td>
      <td>${esc(r.birthDate) || '—'}</td>
      <td>${esc(r.birthPlace) || '—'}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Звіт FamilySearch — ${esc(meta.fileName || 'GEDCOM')}</title>
<style>
  :root { --border:#d8dce6; --head:#f4f6fb; --accent:#2c5fe8; --muted:#6b7290; --hover:#eef2ff; }
  * { box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; margin:0; padding:20px; background:#fff; color:#1a1d2e; }
  h1 { font-size:1.25rem; margin:0 0 4px; }
  .meta { color:var(--muted); font-size:.85rem; margin-bottom:16px; }
  .controls { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:14px; position:sticky; top:0; background:#fff; padding:10px 0; z-index:10; border-bottom:1px solid var(--border); }
  #search { flex:1; min-width:220px; padding:8px 12px; border:1px solid var(--border); border-radius:8px; font-size:.9rem; }
  .col-filter { width:130px; padding:6px 8px; border:1px solid var(--border); border-radius:6px; font-size:.78rem; }
  #rowCount { color:var(--muted); font-size:.82rem; white-space:nowrap; }
  table { width:100%; border-collapse:collapse; font-size:.85rem; }
  th, td { padding:7px 10px; border-bottom:1px solid var(--border); text-align:left; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:280px; }
  th { background:var(--head); position:sticky; top:57px; cursor:pointer; user-select:none; z-index:5; }
  th:hover { background:var(--hover); }
  th .arrow { color:var(--accent); font-size:.7rem; margin-left:3px; }
  tr:hover td { background:var(--hover); }
  a { color:var(--accent); text-decoration:none; font-weight:600; }
  a:hover { text-decoration:underline; }
  .filters-row th { position:sticky; top:93px; background:#fff; padding:4px 8px; }
  @media (max-width:720px) {
    td, th { max-width:140px; }
  }
</style>
</head>
<body>
  <h1>📇 Звіт FamilySearch</h1>
  <div class="meta">Файл: ${esc(meta.fileName || '—')} · Джерело: ${meta.source === 'translated' ? 'перекладений (укр)' : 'оригінал'} · Сформовано: ${esc(meta.generatedAt)} · Осіб: ${rows.length}</div>

  <div class="controls">
    <input type="text" id="search" placeholder="🔎 Пошук по всіх колонках…">
    <span id="rowCount"></span>
  </div>

  <table id="reportTable">
    <thead>
      <tr>
        <th data-col="0">_FSFTID <span class="arrow"></span></th>
        <th data-col="1">Ім'я <span class="arrow"></span></th>
        <th data-col="2">По-батькові <span class="arrow"></span></th>
        <th data-col="3">Прізвище <span class="arrow"></span></th>
        <th data-col="4">Дата народження <span class="arrow"></span></th>
        <th data-col="5">Місце народження <span class="arrow"></span></th>
      </tr>
      <tr class="filters-row">
        <th><input class="col-filter" data-col="0" placeholder="фільтр…"></th>
        <th><input class="col-filter" data-col="1" placeholder="фільтр…"></th>
        <th><input class="col-filter" data-col="2" placeholder="фільтр…"></th>
        <th><input class="col-filter" data-col="3" placeholder="фільтр…"></th>
        <th><input class="col-filter" data-col="4" placeholder="фільтр…"></th>
        <th><input class="col-filter" data-col="5" placeholder="фільтр…"></th>
      </tr>
    </thead>
    <tbody>${trs}</tbody>
  </table>

<script>
(function() {
  const table = document.getElementById('reportTable');
  const tbody = table.tBodies[0];
  const allRows = [...tbody.rows];
  const search = document.getElementById('search');
  const colFilters = [...document.querySelectorAll('.col-filter')];
  const rowCount = document.getElementById('rowCount');
  let sortState = { col: null, dir: 1 };

  function applyFilters() {
    const q = search.value.trim().toLowerCase();
    const perCol = colFilters.map(f => f.value.trim().toLowerCase());
    let visible = 0;
    for (const row of allRows) {
      const cells = [...row.cells].map(c => c.textContent.toLowerCase());
      const matchesGlobal = !q || cells.some(t => t.includes(q));
      const matchesCols = perCol.every((v, i) => !v || cells[i].includes(v));
      const show = matchesGlobal && matchesCols;
      row.style.display = show ? '' : 'none';
      if (show) visible++;
    }
    rowCount.textContent = visible + ' з ' + allRows.length;
  }

  search.addEventListener('input', applyFilters);
  colFilters.forEach(f => f.addEventListener('input', applyFilters));

  table.querySelectorAll('thead tr:first-child th').forEach(th => {
    th.addEventListener('click', () => {
      const col = +th.dataset.col;
      sortState.dir = sortState.col === col ? -sortState.dir : 1;
      sortState.col = col;
      table.querySelectorAll('thead tr:first-child .arrow').forEach(a => a.textContent = '');
      th.querySelector('.arrow').textContent = sortState.dir === 1 ? '▲' : '▼';
      const sorted = allRows.slice().sort((a, b) => {
        const av = a.cells[col].textContent, bv = b.cells[col].textContent;
        return av.localeCompare(bv, 'uk', { numeric: true }) * sortState.dir;
      });
      sorted.forEach(r => tbody.appendChild(r));
    });
  });

  applyFilters();
})();
</script>
</body>
</html>`;
}
