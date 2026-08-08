/**
 * The class projection — what identification sends, and why it is not the frame.
 *
 * **Send the projection, not the file.** Measured on the shipped frame at v1.0.0,
 * 176 classes — and **the earlier figure for this side was too high by about
 * five times**, which is why rule 6 says re-read rather than carry forward:
 *
 * | | characters | ≈ tokens | added to a 24-image call |
 * |---|---:|---:|---:|
 * | the whole `class-frame-v1.json` | 217,230 | ~54,000–62,000 | **~50%** |
 * | **ids and labels only** | **6,107** | **~1,500–1,800** | **~1.5%** |
 *
 * A 24-image call is 114,816 visual tokens before anything else. The frame is
 * **35× the projection by size**, and the projection's real cost is closer to a
 * third of one photograph than to the two it was estimated at. **The earlier
 * ~9,600 was an estimate; this is the file.**
 *
 * *(The token columns are approximate in different directions and deliberately
 * given as ranges: prose runs near four characters per token, hyphenated
 * identifiers nearer three and a half, and JSON punctuation worse than either.
 * The exact figure comes back from the API on every generation.)*
 *
 * **And the stronger reason is doctrinal rather than financial.** The frame's
 * prose carries rulings — *zero care is a ruling* · *this held on a different
 * axis than it was split on* · the owner's line about electrical work. **Those
 * are arguments aimed at a human reading the frame, not context for a model
 * naming a water heater.** Sending them invites the model to reason about *what
 * this thing needs*, which is §4's job, a different act, and a different honesty
 * label. Keeping them out of the call is a doctrine benefit that happens also to
 * be cheaper.
 *
 * ## What the projection deliberately does not carry
 *
 * **No care categories, no inspection points, no opportunity conditions, no
 * owner questions, no replacement horizon.** Identification answers *what is
 * this*, and every one of those answers *what does it need* — the question §4
 * asks, of a model that has an object rather than a photograph in front of it.
 *
 * **No component types either.** The class is upstream of the type now (§2's
 * stage table, and migration 017 follows it), so the type is derived at the desk
 * from the class rather than proposed alongside it.
 *
 * ## The projection is per-call data, never prompt text
 *
 * It rides the `facts` block. `/prompts/README.md` is explicit: *wording lives
 * here; per-call data does not* — a hash that changed whenever the frame gained
 * a class would identify nothing. The frame's **version** is recorded on the
 * generation instead, so a proposal made against 176 classes stays
 * distinguishable from one made against 206.
 */

import type { ClassFrame } from './classFrame.js'

export interface Projection {
  /** The frame version this was cut from. Recorded on every generation. */
  frameVersion: string
  /** How many classes it offers. The denominator for a coverage question. */
  classCount: number
  /** The block itself, sent verbatim as per-call data. */
  text: string
}

/**
 * Every class as `id — label`, one per line, sorted.
 *
 * **Flat rather than grouped by system.** A class may carry two systems, so any
 * grouping either repeats classes or picks one system and hides the other —
 * and a model choosing an id from a list does not need the taxonomy, it needs
 * the list. The systems are §4's context, not identification's.
 */
export function projectClasses(frame: ClassFrame): Projection {
  const lines = frame.classes
    .map((c) => `${c.id} — ${c.label}`)
    .sort((a, b) => a.localeCompare(b))

  return {
    frameVersion: frame.version,
    classCount: frame.classes.length,
    text:
      `The class list, version ${frame.version} — ${frame.classes.length} classes.\n` +
      `Use an id from this list exactly as written, or null. Never invent an id, and never adapt one that is close.\n\n` +
      lines.join('\n'),
  }
}

/**
 * Rough token cost of the projection, for the run record.
 *
 * **Deliberately approximate and named as such.** The real figure comes back on
 * the generation's `input_tokens` from the API; this exists so a person deciding
 * whether to run 8 calls has an order of magnitude before paying for one. Four
 * characters per token is the usual English approximation and it is close enough
 * for that decision and for nothing else.
 */
export const approximateTokens = (text: string): number => Math.ceil(text.length / 4)
