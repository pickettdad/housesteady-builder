/**
 * The render gate for slots outside the honesty vocabulary — Honesty-Label
 * Mapping §6a, ruled 2026-08-08.
 *
 * **Two slots state a judgement HouseSteady makes rather than something it
 * knows.** `s19.reserve-figure` is a dollar figure; `s2.next-review` is a date
 * we choose. Neither is Observed, Measured, Documented, Reported, Inferred, Not
 * inspected or Not accessible, because none of those is what they are.
 *
 * **And the absence of a label is itself a claim.** Every other value on the
 * page carries one, so an unlabelled dollar figure reads as evidence-derived —
 * *the most certain thing on the page* — when it is the least. §6a calls that
 * rule 12 arriving at the slot that can least afford it.
 *
 * ---
 *
 * ## Why this is a gate and not a field
 *
 * The obvious build is a `renderNote` on the slot that a renderer *may* emit.
 * **That is Table I** — `audit/provenance.ts`, five exported functions built,
 * tested, and called by nothing, idle for weeks with no test able to notice.
 * An optional field is satisfied by declaring it; the failure it exists to
 * prevent survives untouched.
 *
 * So the shape is the one the render path already uses for signatures: **there
 * is no way to render one of these slots except through a function that
 * refuses.** `render.ts`'s own header states the principle — *a flag can be
 * passed wrong and two functions can be called in the wrong order* — and this
 * module is that principle applied one slot lower down.
 *
 * ## What it refuses today, and that is not a bug
 *
 * **Both slots now carry their words, and `s19.reserve-figure` still refuses** —
 * for a different reason than it did on 2026-08-08, and a more interesting one.
 * Its ruled sentence contains *"how old it appears to be"*, and House Style §6
 * bans *appears to be* by name. The collision is between two ratified documents
 * and is not this module's to resolve — see
 * `docs/HouseSteady_Binder-Builder_Note_Reserve-Sentence-Collision_2026-08-08.md`.
 * What this module does is refuse until it is.
 *
 * **A refusal is therefore still the honest state, and it is visible.** The
 * alternative — rendering the figure bare until somebody remembers the sentence
 * — is the failure §6a describes, shipped. Increment 6's binder renderer will
 * meet this gate on its first run and be told what is missing, which is the
 * point of building it before the renderer rather than after.
 *
 * ## The gate lints, because a gate that clears unrenderable copy is not a gate
 *
 * **Words that exist are not the same as words that can ship.** A `renderNote`
 * carrying a banned word passes the words-are-written check, gets composed into
 * a document alongside the figure, and dies at the House Style lint in the
 * render path — *after* the figure is composed, with nothing pointing back at
 * the sentence that caused it.
 *
 * That is the same shape as every other failure this module exists to prevent:
 * a check satisfied by declaring something, while the failure survives untouched.
 * **So the lint runs here, at the only point these words can be cleared**, and a
 * violation refuses by name rather than by regex.
 *
 * ## Scope, stated because it is easy to overrun
 *
 * **No binder-section renderer exists** — Increment 6 is not started, and this
 * module does not begin it. What is built is the gate and its refusal, so the
 * renderer cannot be written around it. The same reasoning as `confirm.ts`'s
 * `adopted` path, built before §4 could produce anything to adopt: *the guard
 * has to be in place before the temptation.*
 */

import { lint } from './houseStyle.js'
import type { Violation } from './houseStyle.js'
import type { LoadedSchema, Slot } from '../audit/schema.js'

/**
 * A slot's declaration that no honesty label applies to it.
 *
 * `renderNote` is `string | null` and **the null is load-bearing**: it is the
 * difference between *the words have not been written* and *no words are
 * needed*. Typing it `string | undefined` would narrow that away and let the
 * first reader treat an unwritten sentence as a slot that opted out — the same
 * distinction `defaultLabel` already turns on, and the sixth time it has decided
 * something in this repo.
 */
export interface OutsideVocabulary {
  /** Why no label fits. Authored here; a reason, not client copy. */
  why: string
  /** The sentence a client reads beside the value. Null until written. */
  renderNote: string | null
}

export class RenderGateRefused extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly slotId: string,
    /** Set only on `gate.unrenderable-words`, so a screen can show what to fix. */
    readonly violations: Violation[] = [],
  ) {
    super(message)
    this.name = 'RenderGateRefused'
  }
}

/**
 * The declaration on a slot, or null where the slot makes none.
 *
 * Reads the shape rather than trusting it: the schema is a JSON file that ships
 * ahead of this code, and a malformed declaration must not read as an absent
 * one — an absent declaration means *an ordinary labelled slot* and would send
 * the value straight past the gate.
 */
export function outsideVocabulary(slot: Slot): OutsideVocabulary | null {
  const raw = slot.outsideHonestyVocabulary
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'object') {
    throw new RenderGateRefused(
      `\`${slot.id}\` declares \`outsideHonestyVocabulary\` as ${typeof raw}, which this gate cannot read. ` +
        `A declaration it cannot read is not the same as no declaration, and guessing which one it is at the ` +
        `reserve figure is the failure this gate exists to prevent.`,
      'gate.unreadable-declaration',
      slot.id,
    )
  }
  const { why, renderNote } = raw as { why?: unknown; renderNote?: unknown }
  if (typeof why !== 'string' || why.trim() === '') {
    throw new RenderGateRefused(
      `\`${slot.id}\` declares itself outside the honesty vocabulary and gives no reason why. ` +
        `The reason is what a later reader checks the claim against.`,
      'gate.no-reason',
      slot.id,
    )
  }
  if (renderNote !== null && typeof renderNote !== 'string') {
    throw new RenderGateRefused(
      `\`${slot.id}\`'s \`renderNote\` is ${typeof renderNote}. It is a sentence or it is null; ` +
        `null means the words have not been written yet, and nothing else means anything.`,
      'gate.bad-render-note',
      slot.id,
    )
  }
  return { why, renderNote: renderNote as string | null }
}

/** Every slot declaring itself outside the vocabulary, in schema order. */
export const outsideVocabularySlots = (schema: LoadedSchema): { slot: Slot; declared: OutsideVocabulary }[] =>
  schema.slots
    .map((slot) => ({ slot, declared: outsideVocabulary(slot) }))
    .filter((x): x is { slot: Slot; declared: OutsideVocabulary } => x.declared !== null)

/**
 * A slot's value, cleared to render.
 *
 * **The brand is unforgeable and that is the whole mechanism** — the same shape
 * `completeness.ts` uses for `PropertyReady`. A caller cannot construct one, so
 * a renderer that wants to emit the reserve figure has exactly one way to obtain
 * the value, and that way checks the words are there.
 */
declare const gatedBrand: unique symbol
export interface GatedValue {
  readonly [gatedBrand]: never
  slotId: string
  /** What the client reads as the value. */
  value: string
  /** The sentence that must appear with it. Never empty on a gated value. */
  note: string
}

/**
 * Clear one slot's value for rendering, or refuse.
 *
 * **Refuses on an empty value as well as an absent note.** A slot outside the
 * vocabulary that renders a blank where a dollar figure belongs is not a gate
 * working — it is the page saying nothing in a place a reader expects a number,
 * which is a different wrong answer with the same silence.
 */
export function gate(slot: Slot, value: string): GatedValue {
  const declared = outsideVocabulary(slot)
  if (!declared) {
    throw new RenderGateRefused(
      `\`${slot.id}\` does not declare itself outside the honesty vocabulary, so it does not come through this ` +
        `gate — it carries a label like every other slot.`,
      'gate.not-declared',
      slot.id,
    )
  }
  if (declared.renderNote === null || declared.renderNote.trim() === '') {
    throw new RenderGateRefused(
      `\`${slot.id}\` cannot render: no honesty label applies to it and the words that stand in for one have not ` +
        `been written. ${declared.why} ` +
        `**The words are client-facing copy and are the design session's to write** — this repo does not invent ` +
        `client-facing copy. Until they exist, the honest output is nothing at all rather than a bare value.`,
      'gate.no-words',
      slot.id,
    )
  }
  const violations = lint(declared.renderNote, slot.id)
  if (violations.length > 0) {
    throw new RenderGateRefused(
      `\`${slot.id}\`'s words cannot go to a client: ` +
        violations.map((v) => `${v.rule} ("${v.found}")`).join('; ') +
        `. ${violations.map((v) => v.because).join(' ')} ` +
        `**Copy the render rejects is worse than no copy** — it clears this gate and dies at the next one with ` +
        `the figure already composed. The sentence is the design session's to resolve, not this repo's to reword.`,
      'gate.unrenderable-words',
      slot.id,
      violations,
    )
  }
  if (value.trim() === '') {
    throw new RenderGateRefused(
      `\`${slot.id}\` has no value, so there is nothing for the words to stand beside. A blank where a figure ` +
        `belongs is not a gate working.`,
      'gate.no-value',
      slot.id,
    )
  }
  return { slotId: slot.id, value, note: declared.renderNote } as unknown as GatedValue
}

export interface BlockedSlot {
  slotId: string
  /** The slot's declared reason for carrying no label. Context, not the blockage. */
  why: string
  /** Which refusal `gate()` would raise — the same codes, so the two cannot drift. */
  blocking: 'gate.no-words' | 'gate.unrenderable-words'
  /** Empty unless `blocking` is `gate.unrenderable-words`. */
  violations: Violation[]
}

/**
 * What is blocking, in words, without throwing.
 *
 * For a screen that wants to show *this is why the binder will not render* ahead
 * of somebody pressing the button. **Reporting is not the gate** — nothing here
 * clears anything, and `gate()` remains the only way a value comes out.
 *
 * **Both directions have to hold.** Every slot named here refuses at the gate,
 * and — since the gate started linting — every slot that refuses is named here.
 * A screen reporting *nothing is blocking* while the render refuses would be the
 * more dangerous half of that pair, because it reads as done.
 */
export const blockedSlots = (schema: LoadedSchema): BlockedSlot[] =>
  outsideVocabularySlots(schema).flatMap(({ slot, declared }): BlockedSlot[] => {
    if (declared.renderNote === null || declared.renderNote.trim() === '') {
      return [{ slotId: slot.id, why: declared.why, blocking: 'gate.no-words', violations: [] }]
    }
    const violations = lint(declared.renderNote, slot.id)
    return violations.length > 0
      ? [{ slotId: slot.id, why: declared.why, blocking: 'gate.unrenderable-words', violations }]
      : []
  })
