// ===================== МІГРАЦІЯ СТАРИХ ЧЕРНЕТОК (v1 → v2) =====================
// v1 (стара версія редактора): persons мають або isAnchor:true (+ fsftid, label),
//   або звичайні поля з fatherId/motherId — рядковий localId іншої особи в базі.
// v2 (поточна версія): окремого типу "якір" немає. Кожна особа має
//   father/mother/spouse/children як RelRef (local або external), плюс
//   marriageDate/marriagePlace. Посилання на колишній "якір" перетворюється
//   на external RelRef {fsftid, label}.
import { localRef, externalRef } from './relRef.js';

export const CURRENT_DRAFT_VERSION = 2;

/**
 * @param {{version?:number, persons:Array, nextLocalId:number}} raw
 * @returns {{persons:Array, nextLocalId:number}}
 */
export function migrateDraft(raw) {
  const version = raw.version || 1;
  if (version >= CURRENT_DRAFT_VERSION) {
    return { persons: raw.persons || [], nextLocalId: raw.nextLocalId || 1 };
  }
  return migrateV1toV2(raw.persons || [], raw.nextLocalId || 1);
}

function migrateV1toV2(oldPersons, nextLocalId) {
  const anchors = new Map(); // старий localId якоря -> { fsftid, label }
  for (const p of oldPersons) {
    if (p.isAnchor) anchors.set(p.localId, { fsftid: p.fsftid || '', label: p.label || '' });
  }

  function toRef(oldLocalId) {
    if (!oldLocalId) return null;
    if (anchors.has(oldLocalId)) {
      const a = anchors.get(oldLocalId);
      return a.fsftid ? externalRef(a.fsftid, a.label) : null;
    }
    return localRef(oldLocalId);
  }

  const persons = [];
  for (const p of oldPersons) {
    if (p.isAnchor) continue; // якорі як окремі записи більше не існують
    persons.push({
      localId: p.localId,
      given: p.given || '',
      patronymic: p.patronymic || '',
      surname: p.surname || '',
      sex: p.sex || '',
      fsftid: p.fsftid || '',
      birthDate: p.birthDate || '',
      birthPlace: p.birthPlace || '',
      deathDate: p.deathDate || '',
      deathPlace: p.deathPlace || '',
      father: toRef(p.fatherId),
      mother: toRef(p.motherId),
      spouse: null,
      marriageDate: '',
      marriagePlace: '',
      children: [],
    });
  }
  return { persons, nextLocalId };
}
