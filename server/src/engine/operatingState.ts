/**
 * Operating state — Baseline Service Design v1.3 §4.1c-i.
 *
 * **The fourth attested field, and the distinction that earns it a place beside
 * product and role rather than a note.**
 *
 * | field | source | honesty label |
 * |---|---|---|
 * | product | the nameplate | `Documented` |
 * | role | the household | `Reported by homeowner` |
 * | **state** | **the household** | **`Reported by homeowner`** |
 * | condition | observation | `Observed`, validated by recurrence |
 *
 * ---
 *
 * ## State is not condition, and that is the whole argument
 *
 * **A condition cannot be attested.** *"I have not noticed this"* about split
 * insulation is the category failing, not the person — which is why conditions
 * are validated by recurrence instead (#114).
 *
 * **A state is an intention, and an intention has an authority.** The household
 * knows why the breaker is off. So state sits on the attestable side of the
 * line, with product and role, and it can be scored the way they are.
 *
 * ## What it prevents, measured on one room
 *
 * The first water heater's breaker is **deliberately off** — it is a geothermal
 * preheat store and the panel is marked to keep it off. **With no state, the
 * engine proposes a water heater with the full care package for a tank that
 * heats nothing, and a well-meaning technician switches it on.**
 *
 * Two consequences follow and both are functions here rather than prose:
 * `suppressesCare` and `blocksOperation`.
 *
 * ## And it is an edge property, which is why the store is polymorphic
 *
 * *Legacy coax distribution* and *legacy telephone wiring* were recorded as
 * whole systems whose entire content is **household says legacy**. They are
 * `abandoned in place`, **and they are runs rather than objects** — which is the
 * ordinary case: most of what an older house has abandoned is connective.
 */

/**
 * The declared vocabulary. **Open, like every other word from a household.**
 *
 * A state this build has not met is stored, displayed and counted as
 * unrecognised. What it cannot do is suppress care or reach a trades brief,
 * because those switch on the values below — the same safety property `surface`
 * and `captureIntent` have, from a third direction.
 */
export const DECLARED_STATES = [
  'in service',
  'deliberately off',
  'seasonal or standby',
  'abandoned in place',
  'decommissioned but present',
  'unknown',
] as const

export type DeclaredState = (typeof DECLARED_STATES)[number]

/** Who says so. Different strengths, never averaged — rule 4, one level out. */
export const ATTESTORS = ['household', 'observed', 'unknown'] as const
export type Attestor = (typeof ATTESTORS)[number]

const DECLARED = new Set<string>(DECLARED_STATES)

export interface NormalisedState {
  state: string
  recognised: boolean
}

/**
 * Tidy a state without deciding anything.
 *
 * An empty answer becomes `unknown`, which is a declared value and an honest
 * one: **an explicit unknown is information and a guess is a liability.**
 */
export function normaliseState(raw: unknown): NormalisedState {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase().replace(/\s+/g, ' ') : ''
  if (s === '') return { state: 'unknown', recognised: true }
  return { state: s, recognised: DECLARED.has(s) }
}

/** One attestation, as everything downstream needs it. */
export interface StateRecord {
  subjectKind: string
  subjectId: string
  state: string
  attestedBy: string
  because: string | null
  createdAt: string
}

/**
 * The current state of one subject — **the latest attestation, never a merge.**
 *
 * Two rows disagreeing is not a conflict to resolve: it is a history, and the
 * later one is what is true now. *The transition is the fact worth having* —
 * a furnace present until 2027 needs both rows, and only the log has both.
 */
export function currentState(records: readonly StateRecord[]): StateRecord | undefined {
  let latest: StateRecord | undefined
  for (const r of records) {
    if (!latest || r.createdAt >= latest.createdAt) latest = r
  }
  return latest
}

/**
 * States where the class frame's care package must NOT be proposed.
 *
 * **The measured failure this exists for:** a water heater with its breaker
 * deliberately off is a geothermal preheat store. Anode-rod intervals and
 * sediment flushes on a tank that heats nothing are work nobody needs, on a
 * maintenance list a client reads.
 *
 * ⚑ **Suppressed, never deleted.** The object stays in the binder, its care
 * categories stay derivable, and the reason is recorded — because the state can
 * change back, and a house that lost its water heater's maintenance plan when
 * somebody flipped a breaker is worse than one that carries it dormant.
 *
 * `seasonal or standby` is deliberately NOT here: a pool heater in November is
 * off and still needs winterising. **Off for the season and off for good are
 * different facts, which is why they are different values.**
 */
export function suppressesCare(state: string): boolean {
  return (
    state === 'deliberately off' ||
    state === 'abandoned in place' ||
    state === 'decommissioned but present'
  )
}

/**
 * States that ride a trades brief as a do-not-operate line.
 *
 * **This is the technician who switches the breaker back on.** An intentional
 * state reads as a defect to anyone who was not told, and the brief is the last
 * place it can be said before somebody acts on it.
 *
 * Broader than `suppressesCare` by one value: **`seasonal or standby` suppresses
 * no care and still must not be started up by a visiting trade.**
 */
export function blocksOperation(state: string): boolean {
  return suppressesCare(state) || state === 'seasonal or standby'
}

/**
 * The sentence a trades brief carries. **Never AI-written and never softened.**
 *
 * It states what is so and who says it. Doctrine 2 — a state the household
 * reported is `Reported by homeowner` and must not be rendered as observed.
 */
export function doNotOperateLine(r: StateRecord): string | null {
  if (!blocksOperation(r.state)) return null
  const who = r.attestedBy === 'household' ? 'The household reports' : `Recorded as ${r.attestedBy}:`
  const why = r.because && r.because.trim() !== '' ? ` — ${r.because.trim()}` : ''
  return `DO NOT OPERATE. ${who} this is ${r.state}${why}. Confirm with the homeowner before changing it.`
}
