/**
 * Surfaces, fields, and who may assert a manufacturer — Amendment 11 pass 1.
 *
 * **The pure half.** Nothing here calls a model or touches a database, which is
 * what lets the rules be argued about in tests rather than discovered on a bill.
 *
 * ---
 *
 * ## Why the surface field exists at all
 *
 * *A brand on a fascia, a model on a plate* named two surfaces and offered one
 * field, and **that single sentence is the root cause of the NextEnergy error**:
 * two identification runs reported the manufacturer as NextEnergy when the
 * nameplate says CLIMATEMASTER and NextEnergy is a yellow homeowner warranty
 * decal on the same cabinet, in the same photograph.
 *
 * **A manufacturer read off a data plate is `Observed` at the finest grain
 * available. A name on a decal beside it is `Observed` too — of the decal.**
 * Collapsing them is doctrine 2's laundering, one level down.
 *
 * ## Fail open on the vocabulary, and here is why that is safe
 *
 * A surface is a fact about a photograph, not a choice from this repo's
 * taxonomy. *Cast in relief on the housing* is a real surface and is on no list.
 * So an unrecognised word is preserved, marked, counted — never nulled.
 *
 * **The safety property: an unrecognised surface is not `nameplate`, and only a
 * nameplate may assert a manufacturer.** A word the builder has never met
 * therefore cannot acquire authority by being unknown, which is the failure mode
 * that usually makes fail-open dangerous.
 */

/**
 * The surfaces Amendment 11 declares, plus `surface-unclear`.
 *
 * **`surface-unclear` is a first-class value and not a fallback.** A photograph
 * showing text with no visible indication of what it is printed on is an
 * ordinary photograph; forcing it to `nameplate` invents authority, and forcing
 * it to `adjacent-sticker` invents doubt. **Neither is what was seen.**
 */
export const DECLARED_SURFACES = [
  'nameplate',
  'fascia-brand',
  'adjacent-sticker',
  'handwritten-tag',
  'document',
  'surface-unclear',
] as const

export type DeclaredSurface = (typeof DECLARED_SURFACES)[number]

/**
 * The one surface that carries authority about what a product IS.
 *
 * Everything else on this list is a claim about something near the product.
 */
export const AUTHORITATIVE_SURFACE: DeclaredSurface = 'nameplate'

const DECLARED = new Set<string>(DECLARED_SURFACES)

export interface NormalisedSurface {
  /** What is stored. Verbatim where unrecognised — never replaced. */
  surface: string
  /** False when this build has not met the word. Reported, never absorbed. */
  recognised: boolean
}

/**
 * Tidy a surface without deciding anything.
 *
 * Whitespace and case are noise; the word is not. An empty answer becomes
 * `surface-unclear`, because *the model did not say* and *the model said it
 * could not tell* are the same fact from the reader's side and there is no third
 * state worth carrying.
 */
export function normaliseSurface(raw: unknown): NormalisedSurface {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase().replace(/\s+/g, '-') : ''
  if (s === '') return { surface: 'surface-unclear', recognised: true }
  return { surface: s, recognised: DECLARED.has(s) }
}

/** Whether a stored surface may be treated as the product's own plate. */
export const isAuthoritative = (surface: string): boolean => surface === AUTHORITATIVE_SURFACE

// ------------------------------------------------------------------- field names

/**
 * A field name reduced for matching, with the printed name kept elsewhere.
 *
 * `Model No.` · `MODEL` · `Model #` are one field wearing three plates' habits.
 * **Derived in one place so two callers cannot disagree**, and stored beside the
 * verbatim name rather than replacing it — the plate's own wording is evidence.
 */
export const fieldKey = (field: string): string =>
  field.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * Field names that name a model number.
 *
 * **Deliberately a list a person can read, and deliberately short.** Whether
 * *Cat. No.* names a model is a judgement about how manufacturers write plates,
 * and a judgement buried in a fuzzy matcher is one nobody audits — the same rule
 * the scoring harness applies to its wording test.
 *
 * `serial` is not here and must not be: a serial identifies the unit, a model
 * identifies the product, and pass 2 resolves them to different things.
 */
const MODEL_KEYS = new Set([
  'model', 'model no', 'model number', 'model n', 'modelno',
  'cat no', 'catalog no', 'catalogue no', 'cat number',
  'part no', 'part number', 'part n', 'partno',
  'type', 'type no',
])

/** Field names that name who made the thing. */
const MANUFACTURER_KEYS = new Set([
  'manufacturer', 'manufactured by', 'made by', 'brand', 'maker', 'mfr', 'mfg',
  'manufacturer name', 'company',
])

export const isModelField = (key: string): boolean => MODEL_KEYS.has(key)
export const isManufacturerField = (key: string): boolean => MANUFACTURER_KEYS.has(key)

// ------------------------------------------------------------------ adjudication

/** One field read off one label, as everything downstream needs it. */
export interface FieldClaim {
  /** The label this came from, so two plates in one frame stay two plates. */
  readingId: string
  mediaId: string
  surface: string
  /** Verbatim, as printed. */
  field: string
  fieldKey: string
  /** Verbatim. May be `N/A`, which is a fact and not an absence. */
  value: string
  unreadable: boolean
}

export interface Adjudication {
  /**
   * The value that may be asserted, or null.
   *
   * **Null is a real outcome and the interesting one.** Amendment 11: *a label
   * may not assert a manufacturer that only a non-nameplate surface supports.*
   * So a decal with no plate beside it yields null and its text as evidence —
   * not the decal's answer for want of a better one.
   */
  asserted: string | null
  /** Which surface supports the asserted value. Null when nothing is asserted. */
  supportedBy: string | null
  /** Every claim read, including the one that won. Nothing is discarded. */
  claims: FieldClaim[]
  /** Claims that disagree with the asserted value, or with each other. */
  competing: FieldClaim[]
  /** Why this came out the way it did, for a person to read. */
  why: string
}

const sameValue = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Which manufacturer claim, if any, may be asserted.
 *
 * **The four outcomes, and three of them assert nothing:**
 *
 * | what was read | asserted |
 * |---|---|
 * | nothing | null |
 * | claims, none from a nameplate | **null** — the rule, and the NextEnergy case |
 * | exactly one nameplate answer | that answer; the rest are competing |
 * | nameplates that disagree | **null** — an unresolved conflict, stated |
 *
 * **A competing claim is retained, not deleted.** Register #121: a decal
 * manufacturer must lose to the nameplate *rather than overwrite it*, and one
 * column has room for one answer — so whichever read arrives last becomes the
 * manufacturer, which is the bug restored. Losing is a position in a list, not
 * an absence from it.
 */
export function adjudicateManufacturer(claims: readonly FieldClaim[]): Adjudication {
  const all = claims.filter((c) => isManufacturerField(c.fieldKey))
  const usable = all.filter((c) => !c.unreadable && c.value.trim() !== '')

  if (usable.length === 0) {
    return {
      asserted: null,
      supportedBy: null,
      claims: [...all],
      competing: [],
      why:
        all.length === 0
          ? 'No manufacturer was read from any surface.'
          : `${all.length} manufacturer field(s) read and none carried a legible value.`,
    }
  }

  const plates = usable.filter((c) => isAuthoritative(c.surface))
  if (plates.length === 0) {
    const surfaces = [...new Set(usable.map((c) => c.surface))].join(', ')
    return {
      asserted: null,
      supportedBy: null,
      claims: [...all],
      competing: [...usable],
      why:
        `A manufacturer is supported only by ${surfaces}. A label may not assert a manufacturer that ` +
        `no nameplate supports — a name on a decal is the decal's, not the machine's. ` +
        `The reading is kept as evidence.`,
    }
  }

  const distinct = [...new Set(plates.map((c) => c.value.trim().toLowerCase()))]
  if (distinct.length > 1) {
    return {
      asserted: null,
      supportedBy: null,
      claims: [...all],
      competing: [...usable],
      why:
        `${plates.length} nameplates in this set give ${distinct.length} different manufacturers. ` +
        `An unresolved conflict between plates is stated, never averaged — this is usually two objects ` +
        `in one photograph.`,
    }
  }

  const winner = plates[0]!
  const competing = usable.filter((c) => !sameValue(c.value, winner.value))
  return {
    asserted: winner.value.trim(),
    supportedBy: winner.surface,
    claims: [...all],
    competing,
    why:
      competing.length === 0
        ? `Read from a ${winner.surface}, with nothing competing.`
        : `Read from a ${winner.surface}. ${competing.length} other reading(s) name someone else — ` +
          `${[...new Set(competing.map((c) => `${c.value.trim()} (${c.surface})`))].join(', ')} — ` +
          `and are kept beside it rather than overwritten.`,
  }
}

export interface ModelRead {
  value: string
  surface: string
  mediaId: string
  readingId: string
  field: string
}

/**
 * The model string for a set of readings, for the scoring harness's rule 6.
 *
 * **Nameplate only, and that is not fussiness.** Rule 6 says a model number off
 * by a character is *plate legibility, not an engine error* — the whole claim is
 * about a photograph of a plate. A model number read off a shipping carton or a
 * manual is a different kind of evidence and a mismatch there means something
 * else entirely.
 *
 * Returns every distinct plate-borne model string rather than one, because **two
 * plates in one photograph is the case rule 6 was written from**, and collapsing
 * them here would hide exactly what it is trying to separate.
 */
export function plateModels(claims: readonly FieldClaim[]): ModelRead[] {
  const out: ModelRead[] = []
  const seen = new Set<string>()
  for (const c of claims) {
    if (!isModelField(c.fieldKey)) continue
    if (c.unreadable) continue
    if (!isAuthoritative(c.surface)) continue
    const value = c.value.trim()
    if (value === '') continue
    const key = `${c.readingId}:${value.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ value, surface: c.surface, mediaId: c.mediaId, readingId: c.readingId, field: c.field })
  }
  return out
}

/**
 * Values a plate states as not applicable.
 *
 * **`N/A` in a named field is the strongest negative evidence a plate carries**,
 * and it is only reachable because pass 1 emits fields rather than a string — an
 * empty cell has no text to survive flattening.
 *
 * *The WellMate UT-450 disproves itself twice in its own fields:*
 * `Factory Precharge pressure: N/A`, and `N/A` across all three drawdown
 * columns. **Drawdown is the entire function of a pressure tank.** Read as
 * prose the label says *pressure* a dozen times; read as a table it says the
 * opposite.
 */
const NOT_APPLICABLE = new Set(['n/a', 'na', 'n.a.', 'none', '--', '—', '-', 'not applicable'])

export const statesNotApplicable = (value: string): boolean =>
  NOT_APPLICABLE.has(value.trim().toLowerCase())
