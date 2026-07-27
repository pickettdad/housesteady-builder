/**
 * What a correction is allowed to touch, and what it reads as "before".
 *
 * Two jobs here, both of them doctrine rather than plumbing:
 *
 * 1. THE PRIOR VALUE IS READ FROM STORAGE, NEVER ACCEPTED FROM THE CALLER.
 *    A correction that stored whatever the browser believed was on screen would
 *    record the screen's memory, not the field's. Reading it back here means
 *    "was freeform *receptacle*" is always what the field app actually sent,
 *    even if the page was stale, and it makes the correction chain true by
 *    construction rather than by the front end being careful.
 *
 * 2. NO OVERLAY MAY SET A CONDITION, GRADE OR ADEQUACY FIELD.
 *    Object/Concern Model §7: "Condition: poor" is a professional judgement a
 *    concierge cannot defend and a homeowner may act on. Spec §2 says a
 *    signature claims the record matches the evidence and never condition,
 *    adequacy, age, safety or completeness. `field` is free text, so that rule
 *    needs an actual gate, not a convention.
 */

import type { Db } from '../db/index.js'

/**
 * Field names an overlay may never carry.
 *
 * This is the ONE place in the codebase that fails closed on a word, and it
 * does so because the word is ours, not the field app's. "Fail open on
 * vocabulary" protects the builder from refusing an export over a term the
 * field team just invented; it was never a licence for the desk to invent a
 * grading scale for itself.
 */
export const FORBIDDEN_FIELDS = [
  'condition',
  'grade',
  'grading',
  'adequacy',
  'adequate',
  'rating',
  'rate',
  'score',
  'severity',
  'risk',
  'safety',
  'safe',
  'unsafe',
  'quality',
  'health',
  'lifespan',
  'remaining_life',
  'age',
  'assessment',
  'verdict',
]

const normalize = (field: string): string => field.toLowerCase().replace(/[\s_-]+/g, '')

/** Returns the offending word, or null when the field is acceptable. */
export function forbiddenField(field: string): string | null {
  const f = normalize(field)
  for (const word of FORBIDDEN_FIELDS) {
    const w = normalize(word)
    // Substring rather than equality: `conditionNote`, `overallGrade` and
    // `safety_rating` are all the same move wearing a different name.
    if (f.includes(w)) return word
  }
  return null
}

/**
 * A resolution has no uuid of its own in the v3 manifest — unlike a pin, a zone
 * or a photo, it is identified only by where it sits. So its overlay target id
 * is built from the ids the field DID mint plus the config's own item id, which
 * is stable across re-imports and across visits for the same reason a pin uuid
 * is.
 *
 * Routed to the field session for v4: resolutions should carry their own uuid.
 * Until then this composite is the honest substitute, and it is confined to this
 * function so replacing it later touches one place.
 */
export function resolutionKey(r: {
  scope_kind: string | null
  scope_zone_id: string | null
  scope_pin_id: string | null
  item_id: string
}): string {
  if (r.scope_kind === 'zone') return `zone/${r.scope_zone_id ?? ''}/${r.item_id}`
  if (r.scope_kind === 'pin') return `pin/${r.scope_pin_id ?? ''}/${r.item_id}`
  return `session/${r.item_id}`
}

/** The pin type as one value, because it is corrected as one decision. */
export interface PinTypeValue {
  kind: string | null
  componentType: string | null
  freeformLabel: string | null
}

export interface CorrectableField {
  targetKind: string
  field: string
  /** How the change reads in the trail, e.g. "type". */
  label: string
  /** The value exactly as the field app captured it. Null when never set. */
  read: (db: Db, visitId: string, targetId: string) => unknown
}

/**
 * The fields 2a can correct — and only these.
 *
 * Spec §5.2 is explicit about the boundary: the real v3 export carries NO
 * structured nameplate fields, so there is no make, model or serial to confirm
 * or correct. Those arrive from AI extraction in 2b and the confirm/correct pair
 * applies to them then. What 2a corrects is what the field entered by hand at
 * hour three: component types picked from a list, labels, na reasons and
 * failed-check notes.
 *
 * Adding a field here that the field app does not capture would create a place
 * to type a value that has no evidence behind it, which is the fabrication
 * doctrine §4.4 forbids.
 */
const latestPin = (db: Db, visitId: string, pinId: string) =>
  db
    .prepare(
      `SELECT p.type_kind, p.component_type, p.freeform_label
         FROM pins p JOIN imports i ON i.id = p.import_id
        WHERE p.visit_id = ? AND p.pin_id = ?
        ORDER BY i.imported_at DESC LIMIT 1`,
    )
    .get(visitId, pinId) as
    | { type_kind: string | null; component_type: string | null; freeform_label: string | null }
    | undefined

/**
 * The nameplate fields, added in 2b exactly where 2a said they would arrive.
 *
 * `read` returns null for all of them, always, and that is not a stub. The v3
 * export carries no structured nameplate data, so there is nothing the field
 * captured for these to be a correction *of* — the overlay is the only place
 * the value has ever existed. A chain of acts on one of these therefore reads
 * from null, which is the truth: nobody had written it down before.
 *
 * These are transcription, not interpretation. §0.3: reading `1809A44721` off a
 * plate is reading an image; deducing "manufactured week 9 of 2018" is
 * inference, carries a different honesty label, and is not in this increment.
 *
 * NO CONDITION FIELD, and there never will be one here. `forbiddenField`
 * refuses it, and the object model is explicit that component checklist answers
 * across visits — pass, pass, pass, fail — tell a story a grade cannot, and one
 * the concierge can actually defend.
 */
const nameplateField = (field: string, label: string): CorrectableField => ({
  targetKind: 'pin',
  field,
  label,
  // Never captured in the field, so there is nothing to read. Null is the
  // honest prior value and makes the first acceptance read as setting it.
  read: () => null,
})

export const CORRECTABLE_FIELDS: CorrectableField[] = [
  nameplateField('make', 'make'),
  nameplateField('model', 'model'),
  nameplateField('serial', 'serial number'),
  nameplateField('capacity', 'capacity'),
  // Deliberately narrow wording. Plates print MANUFACTURE dates — 02/25,
  // oct. 2012, 2024/06 — and filing one of those here as an install date is
  // precisely the laundering doctrine 2 forbids. The label is what a reviewer
  // sees in the trail, so it carries the caveat rather than relying on memory.
  nameplateField('installDate', 'install date, only if printed on the plate'),
  {
    targetKind: 'pin',
    field: 'type',
    label: 'type',
    read: (db, visitId, targetId) => {
      const row = latestPin(db, visitId, targetId)
      if (!row) return null
      // A typeless pin reads as a null type, not as a missing entity. The pass
      // exists partly to decide those, so "never typed" must be expressible.
      if (row.type_kind === null && row.component_type === null && row.freeform_label === null) return null
      const value: PinTypeValue = {
        kind: row.type_kind,
        componentType: row.component_type,
        freeformLabel: row.freeform_label,
      }
      return value
    },
  },
  {
    targetKind: 'zone',
    field: 'label',
    label: 'label',
    read: (db, visitId, targetId) => {
      const row = db
        .prepare(
          `SELECT z.label FROM zones z JOIN imports i ON i.id = z.import_id
            WHERE z.visit_id = ? AND z.zone_id = ? ORDER BY i.imported_at DESC LIMIT 1`,
        )
        .get(visitId, targetId) as { label: string | null } | undefined
      return row?.label ?? null
    },
  },
  {
    targetKind: 'resolution',
    field: 'reasonId',
    label: 'reason',
    read: (db, visitId, targetId) => readResolutionColumn(db, visitId, targetId, 'reason_id'),
  },
  {
    targetKind: 'resolution',
    field: 'note',
    label: 'note',
    read: (db, visitId, targetId) => readResolutionColumn(db, visitId, targetId, 'note'),
  },
]

/**
 * Resolutions are addressed by the composite key above, so finding one means
 * scanning the visit's resolutions and matching on it. There are tens per visit,
 * not thousands.
 */
function readResolutionColumn(db: Db, visitId: string, targetId: string, column: 'reason_id' | 'note'): unknown {
  const rows = db
    .prepare(
      `SELECT r.scope_kind, r.scope_zone_id, r.scope_pin_id, r.item_id, r.reason_id, r.note
         FROM resolutions r JOIN imports i ON i.id = r.import_id
        WHERE r.visit_id = ? ORDER BY i.imported_at DESC`,
    )
    .all(visitId) as {
    scope_kind: string | null
    scope_zone_id: string | null
    scope_pin_id: string | null
    item_id: string
    reason_id: string | null
    note: string | null
  }[]
  const hit = rows.find((r) => resolutionKey(r) === targetId)
  if (!hit) return null
  return column === 'reason_id' ? hit.reason_id : hit.note
}

export const findCorrectableField = (targetKind: string, field: string): CorrectableField | undefined =>
  CORRECTABLE_FIELDS.find((f) => f.targetKind === targetKind && f.field === field)
