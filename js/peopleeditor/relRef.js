// ===================== МОДЕЛЬ ПОСИЛАННЯ НА ОСОБУ (RelRef) =====================
// Раніше "прив'язка до вже існуючої в дереві людини" робилась через окремий
// тип запису — "якір" (isAnchor). Тепер це властивість САМОГО ПОСИЛАННЯ:
// будь-яке поле зв'язку (батько/мати/чоловік-дружина/дитина) або обирає
// людину з цього ж списку (local), або вказує на людину поза списком
// напряму за її _FSFTID (external) — без окремого запису-заглушки.
//
// RelRef = null | { kind: 'local', localId: string }
//        | { kind: 'external', fsftid: string, label: string }

/** @returns {{kind:'local', localId:string}} */
export function localRef(localId) {
  return { kind: 'local', localId };
}

/** @returns {{kind:'external', fsftid:string, label:string}} */
export function externalRef(fsftid, label = '') {
  return { kind: 'external', fsftid: fsftid.trim(), label: label.trim() };
}

/** Стабільний рядковий ключ посилання — для групування/дедуплікації. Порожньо для null. */
export function refKey(ref) {
  if (!ref) return '';
  return ref.kind === 'local' ? `L:${ref.localId}` : `E:${ref.fsftid.toLowerCase()}`;
}

/** Два посилання вказують на ту саму особу? */
export function isSameRef(a, b) {
  if (!a || !b) return false;
  return refKey(a) === refKey(b);
}

/**
 * Людиночитний підпис посилання для списків/підказок.
 * @param {object|null} ref
 * @param {Array} persons — повний список чернеток (для local-посилань)
 */
export function refLabel(ref, persons) {
  if (!ref) return '';
  if (ref.kind === 'external') return `🔗 ${ref.label || ref.fsftid} (${ref.fsftid})`;
  const p = persons.find(x => x.localId === ref.localId);
  if (!p) return '(видалено з бази)';
  const name = `${p.given || ''} ${p.patronymic || ''} ${p.surname || ''}`.replace(/\s+/g, ' ').trim() || '(без імені)';
  const years = [p.birthDate, p.deathDate].filter(Boolean).join('–');
  return years ? `${name} (${years})` : name;
}
