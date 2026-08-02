/**
 * Recorded values, for `answer.*` conditions — Increment 4 §4, claiming
 * Increment 3 §1f.
 *
 * **The builder owns this class permanently**, because the field app can never
 * evaluate half the inputs: a radon result arrives three months later, a permit
 * date comes from a document. So the builder holds every answer — field, lab,
 * document — evaluates the condition, and the resulting item rides back as a
 * carried item in the session plan. No new field machinery.
 *
 * ---
 *
 * ## Both of §1f's live cases are unexercisable, and for DIFFERENT reasons
 *
 * That distinction is the whole reason this module reports rather than merely
 * returning a map. Measured against field config v1.2.1:
 *
 * | Case | Why it cannot run |
 * |---|---|
 * | `answer.fc.width > 5` | **The item exists** — `fc.width`, `satisfy: measure`, `unit: mm`. **No export has ever recorded a value.** Eleven `measure` items are declared; none has fired. |
 * | `answer.utl.drain-material-id in (clay, orangeburg)` | **The item does not exist in this config at all**, and neither does `satisfy: choice` — the whole kind arrives at a later master. |
 *
 * *Built and never fired* and *the vocabulary is not here yet* are different
 * states, and an empty map cannot tell them apart. Both are reported by name.
 *
 * ---
 *
 * ## The wire shape, OBSERVED 2026-07-31 — and the refusal is what found it
 *
 * This module used to say the shape had never been observed, and it read the
 * *structure* rather than guessing a field name: a lone scalar in `evidence`
 * yields the value, several scalars is ambiguity and is refused.
 *
 * **The first real walk arrived and the refusal did exactly its job.** Two
 * `evidence` objects, and the reader reported rather than guessed:
 *
 * ```jsonc
 * "liv.egress-sill"    { "value": "26", "unit": "in" }   // REFUSED — two scalars
 * "att.access-honesty" { "value": "no access" }          // read, carrier evidence.value
 * ```
 *
 * A guessed `evidence.value` would have been *right* — and would have been a
 * lucky guess that nobody could tell from a checked fact. The refusal named
 * `unit, value` in a warning, which is how the shape became known.
 *
 * So `evidence.value` is now read **because it was observed, not because it was
 * assumed**, and `evidence.unit` beside it is the declared unit of the reading.
 * The structural fallback stays for a key this build has not met.
 *
 * **`value` is a STRING even when it is a number** — `"26"`, not `26`. Kept
 * verbatim: doctrine 1 says imports are stored as they arrived, and the
 * evaluator already orders a numeric string. Coercing here would make the stored
 * value disagree with the manifest over nothing.
 *
 * **n = 1 for `measure`.** One measured value in one export. This is the shape
 * seen, not the shape guaranteed — the Manifest Contract still does not name the
 * field, and that remains a change request.
 */

import type { Db } from '../db/index.js'

export interface AnswerValue {
  itemId: string
  /** **Verbatim.** `"26"` stays a string; the evaluator orders a numeric string. */
  value: string | number | boolean
  /** Which field of the resolution carried it. Recorded because n = 1 for `measure`. */
  carrier: string
  /** `evidence.unit` — what the reading was taken in, where the export says. */
  unit: string | null
  /** The item's own declared unit, from the config. Compared, never substituted. */
  declaredUnit: string | null
  importId: string
  at: string
}

export interface Answers {
  /** Keyed by item id, latest wins — the same rule as every other answer here. */
  values: Map<string, unknown>
  found: AnswerValue[]
  /** Every `evidence` key seen carrying a scalar, with how often. The wire shape, learned. */
  carriersSeen: Map<string, number>
  /** Resolutions against a value-bearing item whose evidence held more than one scalar. */
  ambiguous: string[]
  /** The report — always, not only when empty. */
  note: string
  warnings: string[]
}

/** `satisfy` kinds that record a value rather than a state. */
const VALUE_BEARING = new Set(['measure', 'choice'])

/** What the config says about one value-recording item. */
interface ValueItem { satisfy: string; unit: string | null }

/**
 * Every recorded value on this property, keyed by item id.
 *
 * Latest wins, by import order — the most recent answer is the answer, the same
 * rule `propertyEvidence` applies everywhere else.
 */
export function answersForProperty(db: Db, propertyId: string): Answers {
  const warnings: string[] = []

  // Which items record a value at all, from the newest config — §1j, the newest
  // import's config is the current definition.
  const newest = db
    .prepare('SELECT snapshot FROM config_snapshots c JOIN imports i ON i.id = c.import_id ' +
      'WHERE i.property_id = ? ORDER BY i.imported_at DESC, i.id DESC LIMIT 1')
    .get(propertyId) as { snapshot: string } | undefined

  const valueBearing = new Map<string, ValueItem>()
  if (newest) {
    let snap: Record<string, unknown> = {}
    try {
      snap = JSON.parse(newest.snapshot) as Record<string, unknown>
    } catch {
      warnings.push('this property\'s newest config snapshot will not parse, so no item is known to record a value')
    }
    const collect = (items: unknown): void => {
      if (!Array.isArray(items)) return
      for (const raw of items) {
        const i = raw as { id?: unknown; satisfy?: unknown }
        if (typeof i?.id === 'string' && typeof i.satisfy === 'string' && VALUE_BEARING.has(i.satisfy)) {
          const unit = (i as { unit?: unknown }).unit
          valueBearing.set(i.id, { satisfy: i.satisfy, unit: typeof unit === 'string' ? unit : null })
        }
      }
    }
    for (const key of ['baseLists', 'zoneLists', 'componentLists']) {
      const lists = snap[key]
      if (Array.isArray(lists)) for (const entry of lists) collect((entry as { items?: unknown }).items)
    }
    collect(snap.sessionItems)
  }

  const rows = db
    .prepare(
      `SELECT r.item_id, r.kind, r.result, r.evidence, r.import_id, i.imported_at
         FROM resolutions r JOIN imports i ON i.id = r.import_id
        WHERE r.property_id = ? ORDER BY i.imported_at, r.id`,
    )
    .all(propertyId) as {
    item_id: string; kind: string | null; result: string | null; evidence: string | null
    import_id: string; imported_at: string
  }[]

  const values = new Map<string, unknown>()
  const found: AnswerValue[] = []
  const carriersSeen = new Map<string, number>()
  const ambiguous: string[] = []
  let resolutionsAgainstValueItems = 0
  let naAgainstValueItems = 0

  for (const r of rows) {
    if (!valueBearing.has(r.item_id)) continue

    /**
     * **An `na` against a measure item is not a failed measurement.**
     *
     * Caught by a test against the real export: `int.moisture-suspect` is
     * `satisfy: measure` and the reference export resolves it
     * `na / none-present` — *no moisture suspected*, a confirmed absence, which
     * CLAUDE.md §5 counts as a substantive finding rather than a hole.
     *
     * Counting it as an attempt that yielded nothing made the report say *"the
     * reader is failing"* about a visit where nothing was measured because
     * there was nothing to measure. Two different states with one symptom, which
     * is the shape this module exists to keep apart — so the denominator counts
     * only resolutions that could plausibly have carried a value.
     */
    if (r.kind === 'na') { naAgainstValueItems += 1; continue }
    resolutionsAgainstValueItems += 1

    // Read the STRUCTURE, not a field name. See the module note: the wire shape
    // has never been observed and a guessed key is a reader that cannot fail.
    let evidence: Record<string, unknown> = {}
    try {
      evidence = r.evidence ? (JSON.parse(r.evidence) as Record<string, unknown>) : {}
    } catch {
      evidence = {}
    }
    const scalars = Object.entries(evidence).filter(([, v]) =>
      typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')

    /**
     * **`evidence.value` — observed 2026-07-31, on both a `measure` and a
     * `choice`.** Read by name now that the name is known; the structural
     * fallback below still covers a key this build has not met.
     */
    const named = scalars.find(([k]) => k === 'value')
    if (named) {
      const [, value] = named
      const unit = typeof evidence.unit === 'string' ? evidence.unit : null
      carriersSeen.set('evidence.value', (carriersSeen.get('evidence.value') ?? 0) + 1)
      values.set(r.item_id, value)
      found.push({
        itemId: r.item_id,
        value: value as string | number | boolean,
        carrier: 'evidence.value',
        unit,
        declaredUnit: valueBearing.get(r.item_id)?.unit ?? null,
        importId: r.import_id,
        at: r.imported_at,
      })
      continue
    }

    if (scalars.length === 1) {
      const [key, value] = scalars[0]!
      carriersSeen.set(`evidence.${key}`, (carriersSeen.get(`evidence.${key}`) ?? 0) + 1)
      values.set(r.item_id, value)
      found.push({
        itemId: r.item_id,
        value: value as string | number | boolean,
        carrier: `evidence.${key}`,
        unit: typeof evidence.unit === 'string' ? evidence.unit : null,
        declaredUnit: valueBearing.get(r.item_id)?.unit ?? null,
        importId: r.import_id,
        at: r.imported_at,
      })
      continue
    }

    if (scalars.length > 1) {
      // Not resolved by picking one. Which key is the value is exactly the
      // question this module refuses to guess at.
      ambiguous.push(`${r.item_id} (${scalars.map(([k]) => k).sort().join(', ')})`)
      continue
    }

    // `result` as a last resort, and only when it is a number. A `result` of
    // `pass` is a state, not a value, and reading it as one would make every
    // passed check an answer.
    if (r.result !== null && /^-?\d+(\.\d+)?$/.test(r.result.trim())) {
      carriersSeen.set('result', (carriersSeen.get('result') ?? 0) + 1)
      values.set(r.item_id, Number(r.result))
      found.push({
        itemId: r.item_id,
        value: Number(r.result),
        carrier: 'result',
        unit: null,
        declaredUnit: valueBearing.get(r.item_id)?.unit ?? null,
        importId: r.import_id,
        at: r.imported_at,
      })
    }
  }

  /**
   * **A reading in one unit against an item declared in another.**
   *
   * Master Table H: `fc.width` declares `mm`, `liv.egress-sill` declares `in`,
   * and three moisture items declare **no unit at all** because the owner does
   * not own a moisture meter yet — %WME, %MC and relative 0–100 are different
   * scales and a wrong declaration corrupts the series.
   *
   * So a mismatch is reported and **never converted.** Converting would put a
   * number in the record that no instrument produced, and the honest failure is
   * a person looking at two units rather than software quietly picking one.
   */
  const mismatched = found.filter((f) => f.unit && f.declaredUnit && f.unit !== f.declaredUnit)
  if (mismatched.length > 0) {
    warnings.push(
      `${mismatched.length} reading(s) were recorded in a unit the config does not declare for that item: ` +
        `${mismatched.map((f) => `${f.itemId} recorded in ${f.unit}, declared ${f.declaredUnit}`).join('; ')}. ` +
        'Reported and NOT converted — a converted number is one no instrument produced.',
    )
  }
  const unitless = found.filter((f) => f.unit && !f.declaredUnit)
  if (unitless.length > 0) {
    warnings.push(
      `${unitless.length} reading(s) carry a unit the config declares none for: ` +
        `${unitless.map((f) => `${f.itemId} (${f.unit})`).join('; ')}. Master Table H leaves three ` +
        'moisture items unitless deliberately, pending a moisture meter — a reading arriving with a unit ' +
        'anyway is worth seeing rather than absorbing.',
    )
  }

  if (ambiguous.length > 0) {
    warnings.push(
      `${ambiguous.length} resolution(s) against a value-recording item carry more than one scalar in ` +
        `\`evidence\` — ${ambiguous.slice(0, 5).join('; ')}${ambiguous.length > 5 ? '; …' : ''}. ` +
        'Which one is the recorded value is the question this reader refuses to guess at, so none was ' +
        'taken. The Manifest Contract does not name the field; the first real measure export should.',
    )
  }

  /**
   * The report, always — rule 7 at the module level.
   *
   * An empty map looks identical whether the config declares no value-recording
   * items, declares some that nobody has answered, or the reader is looking in
   * the wrong place. Three different things, three different sentences.
   */
  const note = valueBearing.size === 0
    ? 'this property\'s config declares no `measure` or `choice` item, so there is no recorded value for ' +
      'an `answer.*` condition to read — the operators are unexercised rather than empty'
    : resolutionsAgainstValueItems === 0
      ? `${valueBearing.size} item(s) record a value in this config and none has ever been measured` +
        (naAgainstValueItems > 0
          ? ` (${naAgainstValueItems} resolved \`na\` — a confirmed absence, not a failed reading)`
          : '') +
        '. Observed Addendum §6: the year-over-year comparison backbone is entirely unexercised, so this ' +
        'is the export being thin rather than the reader being wrong.'
      : found.length === 0
        ? `${resolutionsAgainstValueItems} resolution(s) exist against value-recording items and none ` +
          'yielded a value. That is the reader failing, not the data being absent — the wire shape of a ' +
          'recorded value has never been observed and this is where it would show.'
        : `${found.length} value(s) read from ${[...carriersSeen].map(([c, n]) => `${c} (${n})`).join(', ')}. ` +
          'The carrier is recorded because the Manifest Contract does not name it.'

  if (valueBearing.size > 0 && resolutionsAgainstValueItems > 0 && found.length === 0) {
    warnings.push(note)
  }

  return { values, found, carriersSeen, ambiguous, note, warnings }
}
