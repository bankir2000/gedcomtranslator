// ===================== ПОБУДОВА РОДИННОГО ДЕРЕВА (граф для family-chart) =====================
import { yearOf } from './analysis.js';

// Захист від патологічних випадків: службові "заповнювачі невідомого предка" у
// експортах FamilySearch іноді фігурують як батько/мати в СОТНЯХ різних сімей —
// без обмеження одна така особа могла б роздути граф на тисячі вузлів і підвісити
// вкладку з деревом (особливо на планшеті зі слабшим CPU/пам'яттю). Це НЕ художнє
// обмеження глибини чи поколінь — дерево тепер саме розгортається й згортається
// інтерактивно у в'юері (family-chart), а не будується заздалегідь по рівнях.
// Ліміти навмисно дуже високі ("по максимуму") — це лише запобіжник від
// зациклення/помилкового графа, а не практичне обмеження для звичайної родини.
const MAX_FANOUT = 200;        // макс. шлюбів чи дітей в одній сім'ї, що враховуються
const MAX_TOTAL_NODES = 5000;  // макс. загальна кількість осіб в одному графі дерева

// Знаходить особу за _FSFTID (пріоритет) або за локальним @Ixx@ id як запасний варіант.
export function findPersonByFsftid(individuals, query) {
  const q = query.trim().replace(/^@|@$/g, '');
  if (!q) return null;
  for (const p of individuals.values()) {
    if (p.fsftid && p.fsftid.toLowerCase() === q.toLowerCase()) return p;
  }
  return individuals.get(q) || null;
}

// Пошук кандидатів за частковим збігом FSFTID або імені — для UI-автопідказки.
export function searchPeople(individuals, query, limit = 20) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results = [];
  for (const p of individuals.values()) {
    const name = (p.name || '').replace(/\//g, '').toLowerCase();
    const fsftid = (p.fsftid || '').toLowerCase();
    if (fsftid.includes(q) || name.includes(q)) {
      results.push(p);
      if (results.length >= limit) break;
    }
  }
  return results;
}

export function personLabel(p) {
  if (!p) return '(немає даних)';
  const name = (p.name || '').replace(/\//g, '').trim() || '(без імені)';
  const by = yearOf(p.birt?.date);
  const dy = yearOf(p.deat?.date);
  const years = (by || dy) ? ` (${by ?? '?'}–${dy ?? ''})` : '';
  return name + years;
}

// Роздільні поля (ім'я / рік народження / рік смерті) — потрібні для
// багаторядкової картки в дереві (ім'я і кожна дата на своєму рядку,
// а не все в один рядок через кому).
function personName(p) {
  return (p.name || '').replace(/\//g, '').trim() || '(без імені)';
}

/**
 * Будує граф родини навколо rootId — у форматі, який приймає бібліотеку
 * family-chart: масив вузлів { id, data:{...}, rels:{parents,spouses,children} }.
 *
 * Важливо: попередня версія тягнула ВСІХ зв'язаних людей без обмежень
 * (включно з дітьми братів/сестер предків, шлюбами тих дітей і т.д.) — вийшов
 * не "родовід", а суцільний зв'язний граф всього файлу. family-chart вміє
 * акуратно малювати лінії лише для чіткого дерева "предки/нащадки" від
 * головної особи — для бокових гілок, до яких немає прямого шляху вгору чи
 * вниз від кореня, лінії просто не малювалися (картки показувались, а
 * з'єднання — ні).
 *
 * Тому тепер структура обходу навмисно направлена:
 *  - Висхідна лінія (предки): предок → його батьки → і так до кінця. На
 *    кожному рівні додаються подружжя предка й РІДНІ брати/сестри предка
 *    (щоб бачити повний ряд, як на "еталонному" дереві), але в цих братів/
 *    сестер НЕ розгортаються власні шлюби/діти — інакше дерево знову
 *    розповзається вшир на далеких бокових родичів.
 *  - Низхідна лінія (нащадки): від кореня і від рідних братів/сестер кореня —
 *    тут, навпаки, розгортається повністю (діти, їхні шлюби, їхні діти і
 *    так далі), бо це саме ті гілки, які хочеться бачити цілими.
 *
 * rootId завжди опиняється ПЕРШИМ елементом масиву — family-chart за
 * замовчуванням бере перший елемент даних як стартову/головну особу дерева.
 */
export function buildFamilyGraph(individuals, families, rootId, opts = {}) {
  const maxNodes = opts.maxNodes ?? MAX_TOTAL_NODES;
  const maxFanout = opts.maxFanout ?? MAX_FANOUT;

  const nodes = new Map(); // id -> вузол у форматі family-chart
  let truncated = false;

  function ensureNode(id) {
    if (nodes.has(id)) return nodes.get(id);
    if (nodes.size >= maxNodes) { truncated = true; return null; }
    const p = individuals.get(id);
    if (!p) return null;
    const node = {
      id: p.id,
      data: {
        'first name': personName(p),
        birthYear: yearOf(p.birt?.date) || '',
        deathYear: yearOf(p.deat?.date) || '',
        gender: p.sex === 'M' ? 'M' : (p.sex === 'F' ? 'F' : ''),
        fsftid: p.fsftid || '',
      },
      rels: { parents: [], spouses: [], children: [] },
    };
    nodes.set(id, node);
    return node;
  }

  function linkParentChild(parentId, childId) {
    const parentNode = nodes.get(parentId);
    const childNode = nodes.get(childId);
    // family-chart падає з помилкою "child has more than 1 parent", якщо в
    // дитини виявляється більше 2 записів батьків. У реальних GEDCOM-файлах
    // (особливо великих, зібраних з FamilySearch) трапляються неузгодженості
    // між FAM.CHIL і INDI.FAMC — тому на всяк випадок жорстко обмежуємо: не
    // більше 2 батьків на особу, замість падіння всього дерева.
    if (childNode && !childNode.rels.parents.includes(parentId) && childNode.rels.parents.length < 2) {
      childNode.rels.parents.push(parentId);
    }
    if (parentNode && !parentNode.rels.children.includes(childId)) parentNode.rels.children.push(childId);
  }

  function linkSpouses(aId, bId) {
    const a = nodes.get(aId);
    const b = nodes.get(bId);
    if (a && !a.rels.spouses.includes(bId)) a.rels.spouses.push(bId);
    if (b && !b.rels.spouses.includes(aId)) b.rels.spouses.push(aId);
  }

  // Додає батьків особи (створює їх як вузли, лінкує) — повертає саму сім'ю
  // (famc), щоб можна було далі дістати з неї братів/сестер.
  function linkParentsOf(id) {
    const p = individuals.get(id);
    const famcId = p?.famc[0];
    const famc = famcId ? families.get(famcId) : null;
    if (!famc) return null;
    for (const parentId of [famc.husb, famc.wife]) {
      if (parentId && ensureNode(parentId)) linkParentChild(parentId, id);
    }
    return famc;
  }

  // Додає рідних братів/сестер особи (та сама famc) — без подальшого
  // заглиблення в їхні шлюби чи дітей.
  function linkSiblingsOf(id, famc) {
    if (!famc) return;
    for (const sibId of famc.chil.slice(0, maxFanout)) {
      if (sibId === id) continue;
      if (ensureNode(sibId)) {
        if (famc.husb) linkParentChild(famc.husb, sibId);
        if (famc.wife) linkParentChild(famc.wife, sibId);
      }
    }
  }

  // Додає всіх подружжів особи (створює вузли, лінкує).
  function linkSpousesOf(id) {
    const p = individuals.get(id);
    if (!p) return;
    for (const famId of (p.fams || []).slice(0, maxFanout)) {
      const fam = families.get(famId);
      if (!fam) continue;
      const spouseId = fam.husb === id ? fam.wife : (fam.wife === id ? fam.husb : null);
      if (spouseId && ensureNode(spouseId)) linkSpouses(id, spouseId);
    }
  }

  // Додає дітей особи в усіх її шлюбах (створює вузли, лінкує обох батьків
  // з кожної сім'ї — а не лише саму особу) — повертає список доданих id
  // дітей, щоб можна було рухатись далі вниз по дереву.
  function linkChildrenOf(id) {
    const p = individuals.get(id);
    if (!p) return [];
    const added = [];
    for (const famId of (p.fams || []).slice(0, maxFanout)) {
      const fam = families.get(famId);
      if (!fam) continue;
      if (fam.chil.length > maxFanout) truncated = true;
      for (const childId of fam.chil.slice(0, maxFanout)) {
        if (ensureNode(childId)) {
          if (fam.husb) linkParentChild(fam.husb, childId);
          if (fam.wife) linkParentChild(fam.wife, childId);
          added.push(childId);
        }
      }
    }
    return added;
  }

  const root = ensureNode(rootId);
  if (!root) return { nodes: [], count: 0, truncated: false };

  linkSpousesOf(rootId);
  const rootFamc = linkParentsOf(rootId);
  linkSiblingsOf(rootId, rootFamc);

  // ---- Висхідна лінія: предки, покоління за поколінням ----
  let ancestorFrontier = rootFamc ? [rootFamc.husb, rootFamc.wife].filter(Boolean) : [];
  const seenAncestors = new Set();
  while (ancestorFrontier.length && nodes.size < maxNodes) {
    const next = [];
    for (const id of ancestorFrontier) {
      if (seenAncestors.has(id)) continue;
      seenAncestors.add(id);
      linkSpousesOf(id);
      const famc = linkParentsOf(id);
      linkSiblingsOf(id, famc);
      if (famc) { if (famc.husb) next.push(famc.husb); if (famc.wife) next.push(famc.wife); }
    }
    ancestorFrontier = next;
  }

  // ---- Низхідна лінія: нащадки кореня й рідних братів/сестер кореня ----
  const rootSiblingIds = rootFamc ? rootFamc.chil.filter(id => id !== rootId) : [];
  let descendantFrontier = [rootId, ...rootSiblingIds];
  const seenDescendants = new Set();
  while (descendantFrontier.length && nodes.size < maxNodes) {
    const next = [];
    for (const id of descendantFrontier) {
      if (seenDescendants.has(id)) continue;
      seenDescendants.add(id);
      linkSpousesOf(id);
      next.push(...linkChildrenOf(id));
    }
    descendantFrontier = next;
  }

  return { nodes: Array.from(nodes.values()), count: nodes.size, truncated };
}
