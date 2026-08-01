// ===================== СТУПІНЬ СПОРІДНЕНОСТІ (відносно кореня дерева) =====================
// Стандартний генеалогічний алгоритм: BFS вгору по батьках від КОЖНОЇ з
// двох осіб до спільних предків; пара (скільки поколінь вгору від кореня,
// скільки вниз від цільової особи) до НАЙБЛИЖЧОГО спільного предка
// однозначно визначає термін спорідненості.
//
// Обсяг — лише КРЕВНА спорідненість (через rels.parents/children), плюс
// прямий чоловік/дружина кореня. Повноцінні "свояцькі" ланцюги (споріднення
// через шлюб з обох боків, на кшталт "дружина двоюрідного дядька") свідомо
// не рахуємо — коректне відмінювання складених термінів (родовий відмінок
// на кількох словах одразу) для цього недостатньо надійне.

const COUSIN_WORDS = {
  2: { m: 'двоюрідний', f: 'двоюрідна' },
  3: { m: 'троюрідний', f: 'троюрідна' },
  4: { m: 'четвероюрідний', f: 'четвероюрідна' },
  5: { m: "п'ятиюрідний", f: "п'ятиюрідна" },
  6: { m: 'шестиюрідний', f: 'шестиюрідна' },
  7: { m: 'семиюрідний', f: 'семиюрідна' },
  8: { m: 'восьмиюрідний', f: 'восьмиюрідна' },
  9: { m: "дев'ятиюрідний", f: "дев'ятиюрідна" },
  10: { m: 'десятиюрідний', f: 'десятиюрідна' },
};
/** Прикметникова форма ступеня кузенства, узгоджена в роді з іменником (брат/сестра, дідусь/бабуся...).
 * Стать невідома -> чоловіча форма за замовчуванням (стандартна нейтральна форма в українській). */
function cousinWord(n, sex) {
  const w = COUSIN_WORDS[n];
  const form = sex === 'F' ? 'f' : 'm';
  return w ? w[form] : `${n}-юрідний${sex === 'F' ? 'а' : ''}`;
}

/** M/F -> потрібне слово; невідома стать -> "чоловічий/жіночий варіант через похилу риску". */
function bySex(sex, male, female, neutral) {
  return sex === 'M' ? male : sex === 'F' ? female : (neutral || `${male}/${female}`);
}

/** BFS вгору по rels.parents: id предка -> мінімальна кількість поколінь до нього. */
function ancestorDistances(nodeIndex, startId, maxDepth = 14) {
  const dist = new Map([[startId, 0]]);
  let frontier = [startId];
  for (let d = 1; d <= maxDepth && frontier.length; d++) {
    const next = [];
    for (const id of frontier) {
      const node = nodeIndex.get(id);
      for (const pid of (node?.rels?.parents || [])) {
        if (!dist.has(pid)) { dist.set(pid, d); next.push(pid); }
      }
    }
    frontier = next;
  }
  return dist;
}

/**
 * @param {number} up — поколінь від кореня ВГОРУ до спільного предка
 * @param {number} down — поколінь від цільової особи ВГОРУ до того самого спільного предка
 * @param {string} sex — 'M' | 'F' | '' (стать цільової особи)
 * @returns {string|null}
 */
function kinshipTerm(up, down, sex) {
  if (up === 0 && down === 0) return null; // сама коренева особа

  if (up === 0) { // TARGET — нащадок кореня
    if (down === 1) return bySex(sex, 'син', 'дочка', 'дитина');
    if (down === 2) return bySex(sex, 'онук', 'онука');
    return bySex(sex, `${'пра'.repeat(down - 3)}правнук`, `${'пра'.repeat(down - 3)}правнучка`);
  }
  if (down === 0) { // TARGET — предок кореня
    if (up === 1) return bySex(sex, 'батько', 'мати');
    if (up === 2) return bySex(sex, 'дідусь', 'бабуся');
    return bySex(sex, `${'пра'.repeat(up - 3)}прадідусь`, `${'пра'.repeat(up - 3)}прабабуся`);
  }

  const minGen = Math.min(up, down);
  const removed = Math.abs(up - down);

  if (minGen === 1) {
    // Лінія "рідний брат/сестра предка" — дядько/тітка (вгору) чи небіж/небога (вниз)
    if (removed === 0) return bySex(sex, 'брат', 'сестра');
    if (up > down) {
      return removed === 1
        ? bySex(sex, 'дядько', 'тітка')
        : `${cousinWord(removed, sex)} ${bySex(sex, 'дідусь', 'бабуся')}`;
    }
    return removed === 1
      ? bySex(sex, 'небіж', 'небога')
      : `${cousinWord(removed, sex)} ${bySex(sex, 'онук', 'онука')}`;
  }

  // Двоюрідні/троюрідні/... брати-сестри, за потреби — "у N-му коліні"
  const base = `${cousinWord(minGen, sex)} ${bySex(sex, 'брат', 'сестра')}`;
  return removed === 0 ? base : `${base} у ${removed}-му коліні`;
}

/**
 * Визначає спорідненість targetId відносно rootId.
 * @param {Map} nodeIndex — id -> вузол графа (той самий, що й для карток дерева)
 * @param {string} rootId
 * @param {string} targetId
 * @param {string} targetSex — 'M' | 'F' | ''
 * @returns {string|null} — українська назва зв'язку, або null (сама коренева особа
 *   чи кревного зв'язку не знайдено в межах видимого графа)
 */
export function describeKinship(nodeIndex, rootId, targetId, targetSex) {
  if (!rootId || !targetId || rootId === targetId) return null;

  const rootNode = nodeIndex.get(rootId);
  if ((rootNode?.rels?.spouses || []).includes(targetId)) {
    return bySex(targetSex, 'чоловік', 'дружина');
  }

  const rootAnc = ancestorDistances(nodeIndex, rootId);
  const targetAnc = ancestorDistances(nodeIndex, targetId);

  let best = null;
  for (const [commonId, up] of rootAnc) {
    if (targetAnc.has(commonId)) {
      const down = targetAnc.get(commonId);
      if (!best || up + down < best.up + best.down) best = { up, down };
    }
  }
  return best ? kinshipTerm(best.up, best.down, targetSex) : null;
}
