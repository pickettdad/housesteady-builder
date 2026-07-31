/**
 * The client-facing composer — Increment 4 §2.
 *
 * **The failure this exists to prevent, in one line from the spec:** *if the gap
 * report renders the audit's sentences, the client reads item ids and enum
 * values.*
 *
 * Increment 3's `sentenceOf()` produces, correctly and by design:
 *
 * > nameplate photograph on the water heater (wh.nameplate) was recorded
 * > none-present on this pin
 *
 * **Internally that is right.** It quotes `derivedFrom` from the config instead
 * of paraphrasing, which is Verification Discipline rule 4 working exactly as
 * intended. **Client-facing it is a failure** — `wh.nameplate`, `none-present`
 * and `unknown-provenance` are internal vocabulary, and a homeowner learns
 * nothing from them except that we discuss their house in a language they do not
 * speak.
 *
 * ---
 *
 * **This module reads structured parts. It never reads an internal sentence.**
 *
 * That is the whole design and it is not a style preference. §2a: *do not lint
 * the internal sentence into a client-facing one, and do not re-parse it.* The
 * internal composer knew the parts and composed them; un-composing its output is
 * the same information destruction the dash lesson names, one layer out — and
 * this time the guessing lands in a document a client reads.
 *
 * A doctrine scan holds the boundary: nothing in this directory may import
 * `sentenceOf`, and nothing here may take a composed sentence as input.
 *
 * ---
 *
 * **Two honesty labels reach this report and only two** — §2b. The schema
 * declares eight; a gap row may carry `not-accessible` or `not-inspected`.
 *
 * **A gap row never carries a positive label.** `observed`, `measured`,
 * `documented`, `reported-by-homeowner` and `inferred` are assertions about the
 * house, and *a gap report asserts nothing about the house.* It says what we do
 * not yet know. `specialist-assessment-recommended` belongs to the triggered-flags
 * column, which is a referral rather than an absence.
 *
 * **`unknown-provenance` never renders client-facing at all.** On any export
 * predating config v1.9 that is every transcribed value, so this is the normal
 * path rather than a rare one.
 */

import type { CarriedItem } from '../audit/carriedItems.js'

/**
 * The only two labels a gap row may carry.
 *
 * Declared here as a closed set on purpose, which is the exception rather than
 * the rule in this codebase. Everywhere else vocabulary fails open, because an
 * unknown word is still a word and dropping it loses data. **Here the opposite
 * risk dominates:** a label that reaches a client asserts something about their
 * house, and a new label admitted automatically would assert something nobody
 * reviewed. Fail open on structure, fail closed on what we tell a client.
 */
export type GapLabel = 'not-accessible' | 'not-inspected'

/**
 * Labels that assert something about the house, and therefore cannot appear on
 * a gap row. Named rather than implied, so the scan and the reader agree.
 */
export const POSITIVE_LABELS = [
  'observed', 'measured', 'documented', 'reported-by-homeowner', 'inferred',
] as const

/**
 * Which `na` reasons mean *we could not reach it* rather than *we did not look*.
 *
 * **PROVISIONAL, and it wants a home upstream.** Nothing declares this today —
 * not the field config's `naReasons[]` (which carries `label`, `feedsGapList`
 * and `recordsFinding`, but no honesty label) and not the Binder Schema (whose
 * `labelRules` states the never-upgraded rule without a mapping). The only
 * written source is the Honesty-Label Mapping note's table, and a note is not
 * data. **Routed to the owner: this belongs in one of those two files.**
 *
 * **Why a declaration rather than a pattern.** The first version of this tested
 * the reason id against `/access/i`, which is right on today's config and is
 * precisely the move §1b forbids — a reason id is vocabulary and matching on its
 * spelling makes a config that renames it silently wrong in a client's document.
 *
 * **And why the asymmetry is safe.** `not-inspected` is the default and
 * `not-accessible` requires this declaration, because the two are not equally
 * risky. *We did not inspect it* is true of every gap here. *We could not reach
 * it* additionally claims we tried and were blocked — so an unrecognised reason
 * defaulting to `not-accessible` would put a claim about the visit into a
 * client's document that nobody made. The safe label is the default; the
 * specific one has to be declared.
 */
export const NOT_ACCESSIBLE_REASONS: readonly string[] = ['no-access']

export interface ClientRow {
  /** The sentence a homeowner reads. */
  text: string
  label: GapLabel
  /**
   * What we will do, or what we need, where there is something to say. A row
   * that names an absence and nothing else leaves the reader with a task they
   * were not given.
   */
  next?: string
}

/**
 * How a carried item reads to the person whose house it is.
 *
 * **The room, not the item id. The plain reason, not the enum.**
 *
 * Where the config wrote a label for a reason — *"Not accessible today"* — this
 * uses it, because the producer wrote it for a person and quoting beats
 * paraphrasing. Where it did not, the row says plainly that it was not reached
 * rather than exposing the id: an unrecognised reason is a fact about our
 * vocabulary, not about their house, and it has no business in their document.
 */
export function clientRow(item: CarriedItem, describe: DescribeItem): ClientRow | null {
  /**
   * §1c — `proposed` defaults out of the client render.
   *
   * A photograph is sitting on a pin waiting for one confirming tap. That is our
   * desk work, not the client's, and telling them *"we did not capture this"*
   * about a photograph we are holding is a false statement in the one artifact
   * that must not contain any.
   */
  if (item.status === 'proposed') return null

  const what = describe(item.itemId)
  // No plain-language name for this item means we cannot say it plainly. The row
  // is withheld from the client render and surfaces on the desk instead, where
  // somebody can write one. Rendering the id would be the §2 failure exactly.
  if (!what) return null

  const where = item.scope.kind === 'session' ? null : item.where

  if (item.reason === 'not-reached') {
    return {
      text: where ? `${what} — in ${where} — was not covered on this visit.` : `${what} was not covered on this visit.`,
      label: 'not-inspected',
      next: 'It is on the list for the next visit.',
    }
  }

  // `na` with a gap-feeding reason. Accessibility is the one distinction a
  // homeowner can act on — a locked room is theirs to open — so it gets its own
  // label and its own sentence. Everything else is a scheduling fact, and says
  // so without implying anybody was obstructed.
  if (item.naReasonId !== null && NOT_ACCESSIBLE_REASONS.includes(item.naReasonId)) {
    return {
      text: where ? `${what} — in ${where} — could not be reached on this visit.` : `${what} could not be reached on this visit.`,
      label: 'not-accessible',
      next: 'We will need access to it next time.',
    }
  }

  return {
    text: where ? `${what} — in ${where} — is carried forward to the next visit.` : `${what} is carried forward to the next visit.`,
    label: 'not-inspected',
    next: 'No action is needed from you.',
  }
}

/**
 * Item id to plain language.
 *
 * A function rather than a table, because the table does not exist yet and the
 * shape of where it comes from is not this increment's to decide. **Returning
 * undefined is a supported answer** and means *withhold this row from the client
 * render* — never *render the id*. Abstention is success here for the same
 * reason it is in an extraction prompt: a blank gets chased, a wrong one gets
 * believed.
 */
export type DescribeItem = (itemId: string) => string | undefined

/**
 * Plain-language names from the config's own item text.
 *
 * The field config carries `text` on every checklist item — *"Photograph the
 * data plate"* — written for the concierge standing in the room. That is not the
 * same register as a client-facing sentence, but it is written by a person for a
 * person, and it is a far better starting point than an id.
 *
 * **Where the config has no text, this returns undefined and the row is
 * withheld.** That is the intended behaviour, not a fallback: §5's editor is
 * where a human supplies wording, and a machine-generated approximation sitting
 * in the box would make acceptance the default — the same inversion §9 forbids
 * for AI suggestions.
 */
export function describeFromConfig(snapshot: Record<string, unknown>): DescribeItem {
  const text = new Map<string, string>()
  const collect = (items: unknown): void => {
    if (!Array.isArray(items)) return
    for (const item of items) {
      const i = item as { id?: unknown; text?: unknown }
      if (typeof i?.id === 'string' && typeof i.text === 'string' && i.text.trim() !== '') {
        text.set(i.id, i.text.trim())
      }
    }
  }
  for (const key of ['baseLists', 'zoneLists', 'componentLists']) {
    const lists = snapshot[key]
    if (Array.isArray(lists)) for (const entry of lists) collect((entry as { items?: unknown }).items)
  }
  collect(snapshot.sessionItems)
  return (itemId) => text.get(itemId)
}

/**
 * Every row that could not be written for a client, and why.
 *
 * **Never drop anything silently** — doctrine 6. A row withheld because nothing
 * can name its item is a desk task, and it has to reach the desk. The whole
 * point of withholding it is that somebody writes the wording; a withheld row
 * nobody hears about is a dropped row with extra steps.
 */
export function withheld(items: CarriedItem[], describe: DescribeItem): { item: CarriedItem; because: string }[] {
  const out: { item: CarriedItem; because: string }[] = []
  for (const item of items) {
    if (item.status === 'proposed') {
      out.push({ item, because: 'evidence is on the pin awaiting confirmation — desk work, not the client\'s' })
      continue
    }
    if (!describe(item.itemId)) {
      out.push({ item, because: 'no plain-language name for this item, so it cannot be written for a client yet' })
    }
  }
  return out
}
