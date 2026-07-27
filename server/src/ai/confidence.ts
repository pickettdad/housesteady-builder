/**
 * How sure a ranked suggestion is.
 *
 * Three words rather than a number, deliberately. A model asked for 0.87 will
 * produce 0.87, and it will mean nothing — the digits imply a calibration that
 * does not exist and invite a threshold tuned to two decimal places of noise.
 * Three levels can be defined operationally in the prompt, in terms of the thing
 * being decided rather than in terms of a feeling:
 *
 *   certain   — only one candidate could be this, and the evidence plainly shows it
 *   likely    — it fits one better than the others, but another could also fit
 *   possible  — it could be any of several
 *
 * The middle definition is the one that matters. Where several candidates are
 * genuinely alike — six receptacles in one room, which is the real reference
 * visit — the honest answer is a list marked `possible`, not a pick. A model
 * pressured toward a single answer will produce one, and a confident wrong
 * attachment is the failure mode that gets believed.
 */

export const CONFIDENCE = ['certain', 'likely', 'possible'] as const
export type Confidence = (typeof CONFIDENCE)[number]

const RANK: Record<Confidence, number> = { certain: 3, likely: 2, possible: 1 }

export const isConfidence = (v: unknown): v is Confidence =>
  typeof v === 'string' && (CONFIDENCE as readonly string[]).includes(v)

/**
 * Does this confidence meet a bar?
 *
 * Anything unrecognized reads as the weakest level rather than throwing. This is
 * one of ours rather than the field app's, so the schema already constrains it —
 * but a suggestion is never worth failing a job over, and treating an odd word
 * as *less* sure fails in the safe direction.
 */
export const clears = (c: string, bar: Confidence): boolean => (RANK[c as Confidence] ?? 0) >= RANK[bar]
