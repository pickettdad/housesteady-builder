/**
 * Scoring a run against the confirmed room record — register #116.
 *
 * **The first ground truth this project has had.** Two independent structured
 * reads of one room, plus seventeen household answers, attested by the owner as
 * complete for existence — which is what makes a proposal matching nothing
 * scoreable as a false positive rather than merely unaccounted for.
 *
 * ---
 *
 * ## The six rules, and each one is load-bearing
 *
 * **1 · It gates nothing.** A report, never a build failure. The key is one
 * room in one house; a harness that failed a build would make one basement the
 * definition of correct.
 *
 * **2 · Matching is on photograph overlap, never on names.** Comparing labels
 * would score the model against its own vocabulary — *"Gas water heater"*
 * against *"GSW automatic storage water heater"* is a wording difference, and
 * *"pressure tank"* against *"pressure tank"* would score the four-tank bug as
 * four correct answers. **A photograph is the only thing both sides observed.**
 *
 * **3 · Three outcomes, and `role: null` lands in the third automatically.**
 * `correct` · `wrong` · `key-uncertain`. Two of the room's objects have a
 * confirmed product and an unresolved role — **the key does not know what they
 * are for, so the engine cannot be marked wrong about it.**
 *
 * **4 · `confirmed_by` is the weight.** A product confirmed from a plate and a
 * role confirmed by the household are different strengths of evidence, and a
 * score that averages them tells you nothing about either.
 *
 * **5 · Every disagreement is resolvable in both directions, and the correction
 * is recorded.** *The key was wrong* has to be an available answer — **otherwise
 * the key outranks the house**, and a ground truth nobody may correct stops
 * being ground truth the first time it is wrong.
 *
 * **6 · A model number off by a character is plate legibility, not an engine
 * error.** `UP26-99U` against `UPS26-99U` came from one photograph holding two
 * plates at an angle. **Scoring that as a wrong identification blames the engine
 * for a photograph**, and the fix is a capture rule.
 *
 * ---
 *
 * ## Product and role are separate, and scoring uses ROLE
 *
 * **This is the whole reason the key has two fields — and the example that
 * proves it had to move once.**
 *
 * The WellMate UT-450 was the original case, on the premise that it *is*
 * genuinely a pressure vessel. **It is not.** It is a universal retention tank:
 * a contact tank by default, a pressure tank only when adapted. So a *correct*
 * product string scores `well-pressure-tank` wrong as well, and the case never
 * discriminated the two fields at all. **It now proves something better — plate,
 * lookup and household all agree, which is what a working lookup looks like.**
 *
 * **The GSW water heater is the case that does discriminate.** Its product is
 * exactly what the plate says and what a lookup returns — *an automatic storage
 * water heater* — so a proposal calling it one is **right about the product**.
 * Its role in this house is a geothermal preheat store with its breaker
 * deliberately off. **A key recording only the product would score that proposal
 * CORRECT and lose the only fact that matters:** an intentional state that reads
 * as a defect, which a well-meaning technician would "fix".
 *
 * **The plate says what the product is. The household says what it is for.**
 * A harness that scores the first is measuring whether the model can read.
 */

/** One confirmed object from the room record. */
export interface KeyObject {
  product: string | null
  role: string | null
  system?: string
  photographs: string[]
  model?: string | null
  serial?: string | null
  confirmed_by?: { product: string | null; role: string | null }
}

export interface RoomKey {
  confirmed_objects: KeyObject[]
  unconfirmed_objects?: { proposal?: string; photographs: string[] }[]
  readings?: unknown[]
}

/** What the engine proposed, as much as scoring needs. */
export interface ScoredProposal {
  id: string
  label: string
  classId: string | null
  mediaIds: readonly string[]
  /** Any model number the run read, for rule 6. */
  model?: string | null
}

export type Outcome = 'correct' | 'wrong' | 'key-uncertain' | 'plate-legibility'

export interface Judgement {
  outcome: Outcome
  /** The key's role, or its product where the role is unresolved. */
  expected: string | null
  proposalIds: string[]
  proposalLabels: string[]
  /** Rule 4 — how the key knows, so the weights are not averaged away. */
  weight: { product: string | null; role: string | null }
  why: string
  /**
   * Rule 5 — this disagreement can be resolved either way.
   *
   * Not applied by anything here. It is the shape a human's decision takes, and
   * `key-wrong` is present on every disagreement by construction.
   */
  resolvableAs: readonly ['engine-wrong', 'key-wrong']
}

export interface ScoreReport {
  keyObjects: number
  matched: number
  /** Key objects no proposal shares a photograph with. */
  missed: Judgement[]
  judged: Judgement[]
  /**
   * Proposals matching no key object at all.
   *
   * **Scoreable because the owner attested the key complete for existence** —
   * without that attestation these would be *unaccounted for*, which is a
   * different and much weaker statement.
   */
  falsePositives: { id: string; label: string; classId: string | null }[]
  counts: Record<Outcome, number>
  note: string
}

// ---------------------------------------------------------------- matching

/**
 * A photograph filename reduced to the media id the database holds.
 *
 * The key names files as exported — `019fb96f-…-3cfe3b09e737(1).jpg` — where the
 * `(1)` is a download de-duplication suffix and the stem is the media id.
 * **Matching without stripping it would score every duplicated photograph as a
 * miss**, silently, and the harness would read as an engine failure.
 */
export const mediaIdOf = (filename: string): string =>
  filename.replace(/\.[a-z0-9]+$/i, '').replace(/\(\d+\)$/, '')

const overlaps = (key: KeyObject, p: ScoredProposal): boolean => {
  const ids = new Set(key.photographs.map(mediaIdOf))
  return p.mediaIds.some((m) => ids.has(m))
}

/**
 * Rule 6 — near-identical model strings are a legibility problem.
 *
 * One edit apart, on strings long enough for that to mean something. Deliberately
 * strict: `UP26-99F` and `UPS26-99U` are two edits and two real pumps, so this
 * must not swallow them.
 */
export function nearlySameModel(a: string, b: string): boolean {
  const x = a.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const y = b.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (x === y || Math.min(x.length, y.length) < 4) return false
  if (Math.abs(x.length - y.length) > 1) return false

  let edits = 0
  let i = 0
  let j = 0
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) { i++; j++; continue }
    if (++edits > 1) return false
    if (x.length > y.length) i++
    else if (y.length > x.length) j++
    else { i++; j++ }
  }
  return edits + (x.length - i) + (y.length - j) === 1
}

// ----------------------------------------------------------------- scoring

/**
 * Score one run against the key. **Reports; never fails.**
 *
 * `matches` decides whether a proposal answers a key object — supplied by the
 * caller so the naming rule stays where a person can read it, rather than buried
 * in a similarity function nobody audits.
 */
export function scoreRun(
  key: RoomKey,
  proposals: readonly ScoredProposal[],
  matches: (expected: string, proposal: ScoredProposal) => boolean,
): ScoreReport {
  const judged: Judgement[] = []
  const missed: Judgement[] = []
  const claimed = new Set<string>()
  const counts: Record<Outcome, number> = {
    correct: 0, wrong: 0, 'key-uncertain': 0, 'plate-legibility': 0,
  }

  for (const k of key.confirmed_objects) {
    const hits = proposals.filter((p) => overlaps(k, p))
    for (const h of hits) claimed.add(h.id)

    const weight = { product: k.confirmed_by?.product ?? null, role: k.confirmed_by?.role ?? null }
    const base = {
      expected: k.role ?? k.product,
      proposalIds: hits.map((h) => h.id),
      proposalLabels: hits.map((h) => h.label),
      weight,
      resolvableAs: ['engine-wrong', 'key-wrong'] as const,
    }

    if (hits.length === 0) {
      missed.push({ ...base, outcome: 'wrong', why: 'No proposal cites any of this object\'s photographs.' })
      counts.wrong++
      continue
    }

    // Rule 3 — an unresolved role cannot make the engine wrong about it.
    if (k.role === null) {
      judged.push({ ...base, outcome: 'key-uncertain', why: 'The key records no role for this object.' })
      counts['key-uncertain']++
      continue
    }

    // Rule 6, before the verdict — a one-character model difference is the
    // photograph's fault and must not be counted against identification.
    const legibility = k.model
      ? hits.find((h) => h.model && nearlySameModel(k.model!, h.model))
      : undefined
    if (legibility && !hits.some((h) => matches(k.role!, h))) {
      judged.push({
        ...base,
        outcome: 'plate-legibility',
        why: `Model read as ${legibility.model} against the key's ${k.model} — one character, so this is the plate, not the engine.`,
      })
      counts['plate-legibility']++
      continue
    }

    const right = hits.some((h) => matches(k.role!, h))
    judged.push({
      ...base,
      outcome: right ? 'correct' : 'wrong',
      why: right
        ? `Matched on a shared photograph and the role agrees.`
        : `${hits.length} proposal(s) cite this object's photographs and none matches the role "${k.role}".`,
    })
    counts[right ? 'correct' : 'wrong']++
  }

  const falsePositives = proposals
    .filter((p) => !claimed.has(p.id))
    .map((p) => ({ id: p.id, label: p.label, classId: p.classId }))

  return {
    keyObjects: key.confirmed_objects.length,
    matched: key.confirmed_objects.length - missed.length,
    missed,
    judged,
    falsePositives,
    counts,
    note:
      `Scored against ${key.confirmed_objects.length} confirmed objects on photograph overlap, never on names. ` +
      `Role decides, not product — a key recording only the product would score "electric water heater" on the ` +
      `GSW as correct and lose that its breaker is off on purpose. ${falsePositives.length} proposal(s) matched no key ` +
      `object; those are scoreable only because the owner attested the key complete for existence. ` +
      `**This report gates nothing.** Every disagreement is resolvable in both directions.`,
  }
}
