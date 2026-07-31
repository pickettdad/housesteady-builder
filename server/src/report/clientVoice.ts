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
 * Which `na` reasons mean *we could not reach it* rather than *we did not look*
 * now lives in **the Binder Schema**, at `labelRules.naReasonLabels` — Amendment
 * 1 §B, ruled after this file carried it provisionally for one slice.
 *
 * Read it with `naLabelMap()` from `./names.js`. Nothing here declares it, and
 * that is the point of the ruling: an honesty label is a claim the binder makes
 * in a client's document, so it belongs with the binder's own vocabulary rather
 * than beside code.
 *
 * **The asymmetry the schema encodes, kept here because it is the reasoning
 * rather than the data.** `not-inspected` is the default and `not-accessible`
 * requires a declaration, because the two are not equally risky. *We did not
 * inspect it* is true of every gap here. *We could not reach it* additionally
 * claims we tried and were blocked — so an unrecognised reason defaulting to
 * `not-accessible` would put a claim about the visit into a client's document
 * that nobody made.
 *
 * An earlier version tested the reason id against `/access/i`, which is right on
 * today's config and is precisely the move §1b forbids: a reason id is
 * vocabulary, and matching on its spelling makes a config that renames it
 * silently wrong in a client's document.
 */

export interface ClientRow {
  /** The sentence a homeowner reads. */
  text: string
  label: GapLabel
  /**
   * False when the item's name has not been through the design session.
   *
   * The row still renders — a human signs the sentence — but the editor shows
   * the mark, so nobody adopts a colleague's first draft as house style by not
   * noticing it was one.
   */
  nameRatified: boolean
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
export function clientRow(item: CarriedItem, describe: DescribeItem, labels: NaLabels): ClientRow | null {
  /**
   * §1c — `proposed` defaults out of the client render.
   *
   * A photograph is sitting on a pin waiting for one confirming tap. That is our
   * desk work, not the client's, and telling them *"we did not capture this"*
   * about a photograph we are holding is a false statement in the one artifact
   * that must not contain any.
   */
  if (item.status === 'proposed') return null

  const named = describe(item.itemId)
  // No plain-language name for this item means we cannot say it plainly. The row
  // is withheld from the client render and surfaces on the desk instead, where
  // somebody can write one. Rendering the id would be the §2 failure exactly.
  if (!named) return null
  const what = named.text

  // The client-safe label, never the desk display. A zone nobody labelled has
  // no client-facing name for its room, and the sentence composes without one —
  // "the living-space" is config vocabulary in a homeowner's document.
  const where = item.scope.kind === 'session' ? null : item.whereLabel

  if (item.reason === 'not-reached') {
    return {
      text: where ? `${what} — in ${where} — was not covered on this visit.` : `${what} was not covered on this visit.`,
      // Nothing was recorded at all, so there is no reason to look up. *We did
      // not inspect it* is the true statement and the schema's default says so.
      label: labels.labelFor(null),
      nameRatified: named.ratified,
      next: 'It is on the list for the next visit.',
    }
  }

  // `na` with a gap-feeding reason. Accessibility is the one distinction a
  // homeowner can act on — a locked room is theirs to open — so it gets its own
  // sentence. Everything else is a scheduling fact, and says so without
  // implying anybody was obstructed.
  if (labels.labelFor(item.naReasonId) === 'not-accessible') {
    return {
      text: where ? `${what} — in ${where} — could not be reached on this visit.` : `${what} could not be reached on this visit.`,
      label: 'not-accessible',
      nameRatified: named.ratified,
      next: 'We will need access to it next time.',
    }
  }

  return {
    text: where ? `${what} — in ${where} — is carried forward to the next visit.` : `${what} is carried forward to the next visit.`,
    label: labels.labelFor(item.naReasonId),
    nameRatified: named.ratified,
    next: 'No action is needed from you.',
  }
}

/** The schema's na-reason to honesty-label mapping. See `./names.js`. */
export interface NaLabels {
  labelFor: (naReasonId: string | null) => GapLabel
  isDefaulted: (naReasonId: string | null) => boolean
}

/**
 * What a checklist item is called when a homeowner reads it.
 *
 * **`ratified` is not decoration.** A name lands in a company-wide table keyed
 * on the item id rather than on the property, because the name of a thing does
 * not change between houses — which is exactly why one concierge's wording
 * silently becoming every client's needs a gate. Written, usable, and marked
 * until the design session confirms it: the same pattern as the golden set,
 * where an unratified expectation gates nothing and summons somebody to look.
 *
 * **Usable, though.** The concierge who wrote it signs the sentence it appears
 * in, and that signature is what makes it shippable for *that* report.
 * Ratification is what makes it house style for everyone else's.
 */
export interface ItemName {
  text: string
  ratified: boolean
  /** Who wrote it, for an unratified one. The editor shows this beside the row. */
  writtenBy?: string
  writtenAt?: string
}

/**
 * Item id to plain language.
 *
 * **Returning undefined is a supported answer** and means *withhold this row
 * from the client render* — never *render the id*. Abstention is success here
 * for the same reason it is in an extraction prompt: a blank gets chased, a
 * wrong one gets believed.
 */
export type DescribeItem = (itemId: string) => ItemName | undefined

/**
 * Plain-language names, from `/schema/client-names-v1.json`.
 *
 * ---
 *
 * **An earlier version of this read the field config's own `text` field, and
 * that was wrong in the direction that hides itself.** Amendment 1 §C asked how
 * many of the checklist items have a client-facing name, on the reasoning that
 * a report withholding most of itself looks identical to one working perfectly.
 * The measurement came back the other way round and worse.
 *
 * **All 266 items in the reference config carry `text`, and none of them is a
 * name.** They are checklist instructions written for the concierge standing in
 * the room:
 *
 * > Windows operated, locked, latched; seal-fog noted — pin defects
 *
 * So reading `text` as a client-facing name withheld nothing. It rendered every
 * row — including four containing the word *issue*, which House Style §7 bans
 * outright; thirty-four using *pin* as a verb; two carrying markdown asterisks;
 * and thirteen carrying an em-dash that this composer then wrapped in more
 * dashes. **§2b's safe branch was unreachable**, which is the failure the
 * question was asked to find, arriving from the opposite side.
 *
 * **The lesson generalises past this file.** A fallback whose input is always
 * present is not a fallback — it is the only path, and it never announces
 * itself. Third instance of the shape after `proposed` and the twenty: a
 * mechanism that reads as sound until somebody counts it.
 *
 * ---
 *
 * **The names file is near-empty and that is the honest state.** Naming 266
 * items in HouseSteady's voice is a content pass belonging to the design
 * session, and a machine-generated approximation sitting in the field would make
 * acceptance the default and rejection work — the inversion §9 forbids. So today
 * every row is withheld, the audit says how many, and §5's editor is where a
 * human writes one.
 */
export function describeFromNames(names: Record<string, unknown>): DescribeItem {
  const map = new Map<string, ItemName>()
  const declared = (names as { names?: unknown }).names
  if (declared && typeof declared === 'object' && !Array.isArray(declared)) {
    for (const [id, value] of Object.entries(declared as Record<string, unknown>)) {
      // A name IN THE FILE is ratified by being there. The file is reviewed
      // config; getting a name into it is the ratification. Names written
      // inline in the editor live in `client_names` and carry their own flag.
      if (typeof value === 'string' && value.trim() !== '') {
        map.set(id, { text: value.trim(), ratified: true })
      }
    }
  }
  return (itemId) => map.get(itemId)
}

/**
 * Two sources, one lookup: the reviewed file, then anything written inline.
 *
 * **The file wins.** A ratified name is house style and an inline one is a
 * proposal; letting the proposal shadow it would mean a text box quietly
 * overriding a reviewed decision, which is the whole failure the gate exists
 * for.
 */
export function mergeNames(file: DescribeItem, written: DescribeItem): DescribeItem {
  return (itemId) => file(itemId) ?? written(itemId)
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

/**
 * How much of the report can actually be written, said out loud.
 *
 * **This exists because withholding is the safe branch, and a safe branch that
 * fires on everything is indistinguishable from one that fires on nothing.**
 * Amendment 1 §C asked the question; the answer was that the client-facing name
 * table is empty, so today `renderable` is 0 and `withheld` is all of them.
 *
 * Reported as two numbers and a list, never as one. *"12 rows"* on a report that
 * withheld eight of twenty is the same class of lie as a provenance count that
 * drops the unverifiable ones — §1g.1, one artifact over.
 */
export interface ClientCoverage {
  total: number
  renderable: number
  withheld: number
  /** Why each one was withheld. A count alone cannot be chased. */
  reasons: { itemId: string; because: string }[]
  /** How many item names the table declares at all. Zero is a content pass, not a bug. */
  namesDeclared: number
}

export function coverage(
  items: CarriedItem[],
  describe: DescribeItem,
  namesDeclared: number,
): ClientCoverage {
  const held = withheld(items, describe)
  return {
    total: items.length,
    renderable: items.length - held.length,
    withheld: held.length,
    reasons: held.map((h) => ({ itemId: h.item.itemId, because: h.because })),
    namesDeclared,
  }
}

/** The coverage in words, for anything that reports it. */
export function describeCoverage(c: ClientCoverage): string[] {
  if (c.total === 0) return ['nothing is carried, so there is nothing to write']
  const lines = [
    `${c.renderable} of ${c.total} carried item(s) can be written for a client; ${c.withheld} withheld`,
  ]
  if (c.namesDeclared === 0) {
    lines.push(
      'the client-facing name table declares no names at all, so every row is withheld — ' +
        'this is a content pass, not a fault in the report',
    )
  }
  return lines
}
