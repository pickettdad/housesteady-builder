/**
 * Building the question pass 2 asks — Amendment 11 §C pass 2, the pure half.
 *
 * **The keystone pass, and the smallest one.** Seven of the eight confident
 * wrong classes measured on one real room die here: `PP20B-20` is a sediment
 * cartridge and not a reverse-osmosis system, `45MHP2` is a 3 GPD chemical
 * metering pump and not a well pump, `600545B` is a captive-air pressure tank
 * and not a propane tank. **Every one of them is killed by resolving a string
 * against a source, in a text-only call costing a fraction of a cent.**
 *
 * ---
 *
 * ## ⚑ Count the evidence, not the column
 *
 * **The input is any text that identifies a product, at any specificity — never
 * a model field.** That correction has a measured origin: the room record's
 * `Franklin Water Treatment FWPS20B20 polypropylene cartridge` carries a
 * part-number-shaped string in its *product name*, and a count of populated
 * `model` fields scored it as nothing to resolve. **A measurement that changes
 * when a substring moves between two fields was never measuring the pipeline.**
 *
 * So the query is built by scanning **every field on a label**, whatever the
 * field is called.
 *
 * ## Specificity is a gradient and never a gate
 *
 * **Pass 2 does not decline to run for want of a model number. It reports how
 * specific the answer could be.**
 *
 * | what the label carries | resolves to | share of the worked room |
 * |---|---|---:|
 * | model **and** serial | the **unit**, often with its date of manufacture | 11 |
 * | model, no serial | the **product line** | 5 |
 * | brand and product name | the **family** | 6 |
 * | **all 22 plate-confirmed objects have something to resolve** | | **22 of 34** |
 *
 * *`Siemens EQ Loadcentre, Type 1` resolves to a family of load centres rather
 * than a catalogue number — **and a family is a real answer.** It is enough to
 * know the object is an electrical distribution panel and not a water treatment
 * vessel, which is the error class this pass exists to kill.*
 */

import { fieldKey, isManufacturerField, isModelField, type FieldClaim } from './surfaces.js'

/** How precisely the text can identify a product. Reported, never a gate. */
export type Specificity = 'unit' | 'line' | 'family' | 'none'

export interface LookupQuery {
  /** The label this came from. One query per label, because a label is one thing. */
  readingId: string
  mediaId: string
  surface: string
  /** What is actually asked. Verbatim fragments, joined — never paraphrased. */
  text: string
  specificity: Specificity
  /** Why it is that specific, in words, for the person reading the report. */
  why: string
  /** The fields that built it, so a resolution can be traced to its evidence. */
  from: { field: string; value: string }[]
  /**
   * The model-shaped strings on this label, on their own.
   *
   * ⚑ **Binder 6b needs these and `text` cannot supply them.** §8a rule 2 —
   * *a source for the wrong model is not a source* — compares the model on a
   * page against the model on the plate, and `text` is every field joined. The
   * classification already happens a few lines below; this stops it being
   * thrown away and re-guessed by whoever needs it next.
   *
   * Usually one. Two means the label prints a model and a part number and a
   * person picks; none means this plate names no model, which is itself the
   * answer to *why can this resolution never be `Documented`*.
   */
  models: string[]
}

/**
 * Does this string look like a manufacturer's part or model number?
 *
 * **Deliberately crude and deliberately here rather than in a prompt.** It mixes
 * letters and digits, is long enough to mean something, and is not a bare year
 * or measurement. It exists so a part number sitting in a product *name* is
 * found — the Franklin case — and its failure mode is including a little too
 * much, which costs nothing because the query is text.
 */
export function partNumberShaped(s: string): boolean {
  const t = s.trim()
  if (t.length < 4 || t.length > 40) return false
  if (!/[A-Za-z]/.test(t) || !/[0-9]/.test(t)) return false
  if (/^(19|20)\d\d$/.test(t)) return false
  // A measurement is not a part number: `20 micron`, `75 psig`, `120 gallons`.
  //
  // ⚑ **The range form matters and was found by testing the negatives.**
  // `40-60 psig` is one of the WellMate's three drawdown columns, and reading it
  // as a part number would send a pressure range to a product lookup — from the
  // very plate whose empty cells this pipeline exists to preserve.
  if (/^\d+(\.\d+)?([-–]\d+(\.\d+)?)?\s*(micron|psig?|psi|gal|gallons?|l|litres?|v|volts?|a|amps?|w|watts?|hz|mm|cm|in|")$/i.test(t)) {
    return false
  }
  // One internal space is allowed, because plates print them: `UT-450 CE`,
  // `G9-50SDE-30 250`. A measurement with a unit reads the same way and is
  // already excluded above, which is why that check runs first.
  const token = String.raw`[A-Za-z0-9][A-Za-z0-9\-/.#]*`
  return new RegExp(`^${token}( ${token})?$`).test(t)
}

const SERIAL_KEYS = new Set(['serial', 'serial no', 'serial number', 'ser no', 'sn'])

/** Field names whose value is a specification rather than an identity. */
const SPEC_KEYS = new Set([
  'volts', 'voltage', 'amps', 'amperage', 'watts', 'hz', 'frequency', 'phase',
  'capacity', 'tank volume', 'volume', 'weight', 'pressure', 'maximum operating pressure',
  'factory precharge pressure', 'temperature', 'gpm', 'gph', 'gpd', 'btu', 'kw',
  'nominal filtration', 'micron', 'year', 'date', 'made in', 'country of origin',
])

/**
 * Build one lookup query from one label's fields.
 *
 * **Returns a query even when nothing identifies a product** — with
 * `specificity: 'none'`, which the caller skips. Reporting the skip is the
 * point: a plate with no identity is a capture finding, not a silence.
 */
export function buildQuery(readingId: string, mediaId: string, surface: string, fields: readonly FieldClaim[]): LookupQuery {
  const usable = fields.filter((f) => !f.unreadable && f.value.trim() !== '')

  const makers: FieldClaim[] = []
  const models: FieldClaim[] = []
  const names: FieldClaim[] = []
  let hasSerial = false

  for (const f of usable) {
    const key = f.fieldKey || fieldKey(f.field)
    if (SERIAL_KEYS.has(key)) { hasSerial = true; continue }
    if (SPEC_KEYS.has(key)) continue
    if (isManufacturerField(key)) { makers.push(f); continue }
    if (isModelField(key)) { models.push(f); continue }
    // ⚑ Everything else is scanned for a part-number-shaped token, because this
    // is where the Franklin cartridge's `FWPS20B20` actually lives.
    if (f.value.split(/\s+/).some(partNumberShaped)) { models.push(f); continue }
    names.push(f)
  }

  const from = [...makers, ...models, ...names].map((f) => ({ field: f.field, value: f.value.trim() }))
  const text = [...new Set([...makers, ...models, ...names].map((f) => f.value.trim()))].join(' ').trim()

  let specificity: Specificity = 'none'
  let why = 'Nothing on this label identifies a product.'
  if (models.length > 0 && hasSerial) {
    specificity = 'unit'
    why = 'A model number and a serial, so this can resolve to the individual unit and often to its date of manufacture.'
  } else if (models.length > 0) {
    specificity = 'line'
    why = 'A model or part number with no serial, so this resolves to the product line.'
  } else if (makers.length > 0 || names.length > 0) {
    specificity = 'family'
    why = 'A brand or product name with no model number, so this resolves to a family rather than a catalogue entry — which is a real answer.'
  }

  return { readingId, mediaId, surface, text, specificity, why, from, models: models.map((f) => f.value.trim()) }
}

/** Every query for a set of readings, one per label, in reading order. */
export function buildQueries(claims: readonly FieldClaim[]): LookupQuery[] {
  const byReading = new Map<string, FieldClaim[]>()
  for (const c of claims) {
    const list = byReading.get(c.readingId)
    if (list) list.push(c)
    else byReading.set(c.readingId, [c])
  }
  const out: LookupQuery[] = []
  for (const [readingId, fields] of byReading) {
    const first = fields[0]!
    out.push(buildQuery(readingId, first.mediaId, first.surface, fields))
  }
  return out
}

// ------------------------------------------------------------------- honesty

/**
 * What kind of thing a resolution says this is.
 *
 * **This pass sorts equipment from supplies, and that removes a whole error
 * class before anything is classed.** `PP20B-20` resolves to a cartridge; a
 * cartridge is a consumable, and a consumable proposed as an object is how a
 * client's binder comes to list sediment filter media as equipment.
 */
export const PRODUCT_KINDS = ['equipment', 'consumable', 'part', 'material', 'unknown'] as const
export type ProductKind = (typeof PRODUCT_KINDS)[number]

/**
 * Honesty labels **this pass** may assign — and `Documented` is still not among
 * them, after Binder 6b as much as before it.
 *
 * ⚑ **The name changed in 6b and the value did not.** `engine/sources.ts` now
 * offers `Documented`, and it would be easy to read that as this constant having
 * been superseded. It has not: **that one is what the evidence can support and
 * this one is what the model may claim**, and keeping them apart is the whole
 * mechanism. A single `HONESTY_LABELS` meaning both would be a model's opinion
 * and a document's authority sharing a name.
 *
 * **A model recalling a product from training is recall, not a lookup.** Far
 * better than guessing from a photograph — it is text, it is checkable by a
 * person, and abstention is available — but it is `Inferred` and it must say so.
 *
 * Amendment 11: *a resolution that cannot state its source does not ship*, and
 * *a model number resolved from a retail listing and rendered as `Documented` is
 * the exact failure this project has spent a week naming.* A resolution becomes
 * `Documented` by acquiring a source that qualifies under §8 — never by this
 * pass saying so, and never by anything writing a column.
 */
export const MODEL_HONESTY_LABELS = ['Inferred'] as const
export type ModelHonesty = (typeof MODEL_HONESTY_LABELS)[number]

export interface Resolution {
  readingId: string
  /** What the product is, in the manufacturer's own terms. Empty when unresolved. */
  product: string
  kind: ProductKind
  /** What the model recognised it from, in its own words. Evidence for a person. */
  recognisedFrom: string
  /** False is an expected outcome and never an error. */
  resolved: boolean
  specificity: Specificity
}

/**
 * Does this resolution carry enough to ship?
 *
 * **A resolved row with no product string and no recognition note is not a
 * resolution** — it is an abstention wearing a success flag, which is the one
 * shape that would let this pass overclaim.
 */
export const shippable = (r: Resolution): boolean =>
  !r.resolved || (r.product.trim() !== '' && r.recognisedFrom.trim() !== '')
