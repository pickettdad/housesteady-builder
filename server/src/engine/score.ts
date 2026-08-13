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
 * > ### ⚑ And on 2026-08-13 it caught something written a week after it
 * >
 * > **Rule 8's model comparison was hours old.** A proposal carried a model
 * > reading **exactly** matching the key's chlorine contact tank — a free correct
 * > answer by any reading of the new rule, and reported as one.
 * >
 * > **It cites the photograph of a different tank.** It read the contact tank's
 * > plate out of the frame of the Burcam beside it, and nothing that actually
 * > looks at the contact tank read that model at all. **Without the photograph
 * > gate, the new rule would have credited an exactly-right number to a proposal
 * > looking at the wrong object.**
 * >
 * > ⚑ **A failure arriving through a field that did not exist when this rule was
 * > written, caught by this rule anyway.** *That is what a load-bearing wall
 * > looks like, and it is the argument for every other one in this file.*
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
 * error.** *(Reads the object's OWN model reading, never the photograph-level
 * list — see `ScoredProposal.modelRead`.)* `UP26-99U` against `UPS26-99U` came from one photograph holding two
 * plates at an angle. **Scoring that as a wrong identification blames the engine
 * for a photograph**, and the fix is a capture rule.
 *
 * **7 · A score names the lane that earned it.** Added 2026-08-12, when scoring
 * Amendment 11 pass 3 for the first time. The pass writes two lanes —
 * `plate`-derived, read off a label and looked up, and `appearance`-derived,
 * recognised from shape — and **claims they are different acts with different
 * reliability.** A single blended number cannot test that claim: *the scaffold
 * working* and *the enumeration carrying it* produce the same total.
 *
 * ⚑ *And the sharper version of the same problem: `objects` holds the output of
 * more than one pass. Scoring an import where both the old identification pass
 * and pass 3 have run returns the union — twice the false positives, two shots
 * at every key object, and a number that names neither pass.* **The lane is what
 * makes that visible instead of silent.**
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
 *
 * ### ⚑ Rule 8 — and it reads BOTH, added 2026-08-13
 *
 * **Everything above survives intact. One field started being read.**
 *
 * The first real pass-3 run scored the plate lane **0 correct out of 43
 * proposals** on a room where it read `TTV049BGC01ARKS`, `DMF150` and `45MHP2`
 * exactly and `UP26-99F` one character off. *Not because it was wrong* — because
 * **the key records what a thing is for and the plate lane names what it is**,
 * and only `role` was ever compared.
 *
 * **`product` was in the record from the first day.** So a judgement now tries
 * role, then product, and **records which one answered**.
 *
 * ⚑ **The field that matched is itself the diagnostic this run was for.** A
 * `plate` proposal matching on **product** is right; an `appearance` proposal
 * matching on **role** is right. *The cross-tab of lane against matched-field is
 * how you see which half of the pass did the work* — which one blended number
 * never could.
 *
 * ### ⚑ And then MODEL, added 2026-08-13 after the re-run
 *
 * **Rule 8 as first built returned `0 on product` for the plate lane** — on the
 * very run it was written to measure. The runner diagnosed it and was right:
 * **the key's products are brand-level** (*"Pentair WellMate UT-450 universal
 * retention tank"*) and pass 3's model reading is `UT-450 CE`. *The every-word
 * rule cannot bridge those, so the lane that read the plate exactly still scored
 * nothing.*
 *
 * **`model` is the third field the key has carried all along.** Reading it is
 * the same act as reading `product` was — a field already in the record, not a
 * loosening of the wording rule.
 *
 * ⚠ **EXACT only.** One character out remains rule 6's plate legibility, and the
 * two cannot collide because `nearlySameModel` returns false for identical
 * strings. *This is an extension of the owner's ruling of 2026-08-13 rather than
 * a separate decision, and it is reversible by deleting `onModel`.*
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
  /**
   * Model numbers the run read off a NAMEPLATE, for rule 6.
   *
   * **A list, not a string, and that is the same argument the storage makes.**
   * One photograph can hold two plates — `UP26-99F` and `UPS26-99U` are two real
   * pumps in one frame — so a proposal citing that photograph has two model
   * numbers behind it. **Collapsing them to one here would pick arbitrarily and
   * could report a legibility miss on a plate that was read correctly**, which
   * is the failure rule 6 exists to prevent, arriving at the last step.
   *
   * Empty until Amendment 11 pass 1 has run against the import.
   */
  models?: readonly string[]
  /**
   * ⚑ The model number THIS object's own plate carries — `objects.model_read`.
   *
   * **What rule 6 reads.** `models` above is photograph-level and bleeds: in the
   * first real run the proposal *"Fire extinguisher (red cylinder)"* carried
   * `TTV049BGC01ARKS`, the geothermal unit's number, because both were in the
   * frame it cited. **Rule 6 asks whether THIS object's model was one character
   * out**, and that question cannot be answered from a list of every plate in
   * the picture.
   *
   * *Null or absent means the pass read no model for it* — ordinary for an
   * appearance-derived object, and never an empty string.
   */
  modelRead?: string | null
  /**
   * Which model call proposed this — `objects.generation_id`, the RUN
   * discriminator.
   *
   * ⚑ **A re-run appends; it does not replace.** `import_id` and the lane are
   * identical across runs, so this is the only thing that separates run 1 from
   * run 2 — the same failure `splitByPass` prevents between passes, one level
   * down. Found by the runner session on 2026-08-13, before it cost anything.
   */
  generationId?: string | null
  /**
   * Which lane produced this proposal — `objects.derived_from`.
   *
   * ⚑ **Rule 7 — a score that cannot name the lane cannot test pass 3's claim.**
   * The pass's whole assertion is that a scaffolded `plate` reading and an
   * unscaffolded `appearance` reading are *different acts with different
   * reliability*. One blended number hides exactly the distinction being
   * measured, and would report a scaffold working when the enumeration carried
   * it — or the reverse.
   *
   * `undefined` where the caller has not said. **Never inferred from the label.**
   */
  lane?: string | null
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
  /**
   * ⚑ Rule 8 — which FIELD of the key this proposal answered.
   *
   * `role` is what the thing is for; `product` is what it is. **Both are already
   * in the room record and only `role` was ever read**, so the plate lane — which
   * names products by design — scored zero on a run where it read three model
   * numbers exactly.
   *
   * *This is itself the diagnostic the run was for:* a plate proposal matching on
   * **product** is right, an appearance proposal matching on **role** is right,
   * and which one matched is how you see which lane did the work.
   *
   * Absent when nothing matched.
   */
  matchedOn?: 'role' | 'product' | 'model'
  /**
   * Rule 7 — which lane(s) this outcome is credited to.
   *
   * **For a `correct` judgement it is the lane of the proposal that actually
   * matched**, not of every proposal citing the photograph — otherwise a lane
   * standing next to a right answer is scored as having produced it. For every
   * other outcome it is the lanes of all the hits, because they all share it.
   *
   * `(unlaned)` stands in for a null `derived_from` — an object from the old
   * identification pass, or from before lanes existed.
   */
  lanes: string[]
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
  falsePositives: { id: string; label: string; classId: string | null; lane: string }[]
  counts: Record<Outcome, number>
  /**
   * Rule 7 — the same outcomes, attributed to the lane that produced them.
   *
   * ⚑ **These are attributions, not a partition, and the difference matters when
   * reading them.** Two lanes can cite the same photograph, so one key object can
   * credit two lanes and the rows may sum above `keyObjects`. *Reported as counts
   * per lane rather than as percentages for exactly that reason* — a percentage
   * of an overlapping attribution is a number with no denominator.
   */
  byLane: Record<string, LaneTally>
  note: string
}

/** One lane's share of the outcomes. See `ScoreReport.byLane` on what it is not. */
export interface LaneTally {
  correct: number
  wrong: number
  'key-uncertain': number
  'plate-legibility': number
  /** Proposals from this lane matching no key object at all. */
  falsePositives: number
  /** Proposals this lane contributed, matched or not. */
  proposals: number
  /** Rule 8 — of this lane's correct answers, how many matched each field. */
  correctOnRole: number
  correctOnProduct: number
  correctOnModel: number
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

/**
 * The lane a proposal is credited to, with the null case named rather than blank.
 *
 * **`(unlaned)` is deliberately a visible word.** An empty string in a report
 * column reads as *nothing to say here*, and this is the opposite — it is the
 * old identification pass, which is a fact worth seeing in the table.
 */
export const UNLANED = '(unlaned)'
const laneOf = (p: ScoredProposal): string => p.lane ?? UNLANED

/**
 * Which pass wrote a proposal, from its lane alone.
 *
 * ⚑ **Here rather than in the script, because it is a rule and not a display
 * choice.** Pass 3 sets `derived_from`; the identification pass never did. *A
 * consumer that decides this from a label or a class is inferring what a column
 * states* — and would get it wrong the first time a pass-3 label happened to
 * look like a stage-4 one.
 */
export type PassName = 'match' | 'identify'
export const passOf = (lane: string | null | undefined): PassName => (lane == null ? 'identify' : 'match')

/**
 * Split proposals by the pass that wrote them. **Never scored together.**
 *
 * Scoring the union gives one number naming neither pass: two shots at every key
 * object and twice the false positives. *This is the same "two answers to one
 * question" that took stage 4 off the routine path, arriving at the measurement
 * instead of at the data.*
 */
export function splitByPass<T extends { lane?: string | null }>(
  proposals: readonly T[],
): Record<PassName, T[]> {
  const out: Record<PassName, T[]> = { match: [], identify: [] }
  for (const p of proposals) out[passOf(p.lane)].push(p)
  return out
}

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

  const byLane: Record<string, LaneTally> = {}
  const tally = (lane: string): LaneTally =>
    (byLane[lane] ??= {
      correct: 0, wrong: 0, 'key-uncertain': 0, 'plate-legibility': 0,
      falsePositives: 0, proposals: 0, correctOnRole: 0, correctOnProduct: 0, correctOnModel: 0,
    })
  for (const p of proposals) tally(laneOf(p)).proposals++

  /** Credit an outcome to each distinct lane behind it. Rule 7. */
  const credit = (outcome: Outcome, from: readonly ScoredProposal[]): string[] => {
    const lanes = [...new Set(from.map(laneOf))].sort()
    for (const l of lanes) tally(l)[outcome]++
    return lanes
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
      // No lane can be credited with a miss: nothing proposed it. **Counted in
      // the total and absent from every lane row** — which is one of the ways
      // `byLane` is an attribution rather than a partition.
      missed.push({ ...base, lanes: [], outcome: 'wrong', why: 'No proposal cites any of this object\'s photographs.' })
      counts.wrong++
      continue
    }

    // Rule 3 — an unresolved role cannot make the engine wrong about it.
    if (k.role === null) {
      // Rule 3 is unchanged and the outcome stays `key-uncertain`. **What is new
      // is that a proposal naming the PRODUCT is recorded as having done so** —
      // rule 3 says the engine cannot be marked wrong about a role the key does
      // not know, and says nothing against noticing that it got the product.
      const onProduct = k.product ? hits.filter((h) => matches(k.product!, h)) : []
      judged.push({
        ...base,
        lanes: credit('key-uncertain', hits),
        ...(onProduct.length > 0 ? { matchedOn: 'product' as const } : {}),
        outcome: 'key-uncertain',
        why: onProduct.length > 0
          ? 'The key records no role for this object — but a proposal does name its product.'
          : 'The key records no role for this object.',
      })
      counts['key-uncertain']++
      continue
    }

    // Rule 6, before the verdict — a one-character model difference is the
    // photograph's fault and must not be counted against identification.
    // Any plate the run read, not one of them — see `ScoredProposal.models`.
    // ⚑ The object's OWN reading, never the photograph's list. See `modelRead`.
    const near = k.model
      ? hits
          .filter((h) => typeof h.modelRead === 'string' && h.modelRead !== '')
          .map((h) => ({ proposal: h, model: h.modelRead as string }))
          .find((c) => nearlySameModel(k.model!, c.model))
      : undefined
    if (near && !hits.some((h) => matches(k.role!, h))) {
      judged.push({
        ...base,
        // Credited to the lane that read the plate, not to every hit — the
        // legibility miss belongs to whoever produced the model string.
        lanes: credit('plate-legibility', [near.proposal]),
        outcome: 'plate-legibility',
        why: `Model read as ${near.model} against the key's ${k.model} — one character, so this is the plate, not the engine.`,
      })
      counts['plate-legibility']++
      continue
    }

    // The hits that actually answer the key, kept apart from the hits that
    // merely share a photograph. Rule 7 credits the first; the outcome uses both.
    /**
     * ⚑ Rule 8 — role first, then product. **Both fields, one at a time.**
     *
     * Role is tried first deliberately: it is the stronger statement and the one
     * §"Product and role are separate" argues for. **Product is not a fallback
     * to a weaker answer** — it is the other half of a key that always had two
     * fields and was only ever read on one, which is why the plate lane scored
     * zero on a run where it read three model numbers exactly.
     */
    const onRole = hits.filter((h) => matches(k.role!, h))
    const onProduct = onRole.length > 0 || !k.product ? [] : hits.filter((h) => matches(k.product!, h))
    /**
     * ⚑ The third field, and it is the one the plate lane can actually hit.
     *
     * **The key's products are brand-level** — *"Pentair WellMate UT-450
     * universal retention tank"* — and pass 3's `modelRead` is *"UT-450 CE"*. The
     * every-word rule cannot bridge those, so rule 8 returned **0 on product for
     * the plate lane** on the run it was built to measure. *The lane read the
     * model exactly and the harness still could not see it.*
     *
     * **The key has carried `model` all along.** Matching on it is the same act
     * as reading `product` was: a field already in the record, not a loosening
     * of the wording rule.
     *
     * **EXACT only, and that is what keeps rule 6 intact.** One character out
     * stays plate legibility — `nearlySameModel` returns false for identical
     * strings, so the two rules cannot both fire on one proposal.
     */
    const sameModel = (a: string, b: string): boolean =>
      a.toUpperCase().replace(/[^A-Z0-9]/g, '') === b.toUpperCase().replace(/[^A-Z0-9]/g, '')
    const onModel = onRole.length > 0 || onProduct.length > 0 || !k.model
      ? []
      : hits.filter((h) => typeof h.modelRead === 'string' && h.modelRead !== '' && sameModel(k.model!, h.modelRead))

    const answering = onRole.length > 0 ? onRole : onProduct.length > 0 ? onProduct : onModel
    const matchedOn: 'role' | 'product' | 'model' | undefined =
      onRole.length > 0 ? 'role' : onProduct.length > 0 ? 'product' : onModel.length > 0 ? 'model' : undefined
    const right = answering.length > 0

    const lanes = credit(right ? 'correct' : 'wrong', right ? answering : hits)
    if (right && matchedOn) {
      const field = matchedOn === 'role' ? 'correctOnRole' : matchedOn === 'product' ? 'correctOnProduct' : 'correctOnModel'
      for (const l of lanes) tally(l)[field]++
    }

    judged.push({
      ...base,
      lanes,
      ...(matchedOn ? { matchedOn } : {}),
      outcome: right ? 'correct' : 'wrong',
      why: right
        ? matchedOn === 'role'
          ? `Matched on a shared photograph and the role agrees.`
          : matchedOn === 'product'
            ? `Matched on a shared photograph and the PRODUCT agrees — the key's role is "${k.role}", ` +
              `and this proposal names what the thing is rather than what it is for.`
            : `Matched on a shared photograph and the MODEL NUMBER is exactly the key's "${k.model}" — ` +
              `read off the plate, which is the strongest identification available.`
        : `${hits.length} proposal(s) cite this object's photographs and none matches the role "${k.role}"` +
          `${k.product ? ` or the product "${k.product}"` : ''}.`,
    })
    counts[right ? 'correct' : 'wrong']++
  }

  const falsePositives = proposals
    .filter((p) => !claimed.has(p.id))
    .map((p) => ({ id: p.id, label: p.label, classId: p.classId, lane: laneOf(p) }))
  for (const f of falsePositives) tally(f.lane).falsePositives++

  return {
    keyObjects: key.confirmed_objects.length,
    matched: key.confirmed_objects.length - missed.length,
    missed,
    judged,
    falsePositives,
    counts,
    byLane,
    note:
      `Scored against ${key.confirmed_objects.length} confirmed objects on photograph overlap, never on names. ` +
      `Role decides, not product — a key recording only the product would score "electric water heater" on the ` +
      `GSW as correct and lose that its breaker is off on purpose. ${falsePositives.length} proposal(s) matched no key ` +
      `object; those are scoreable only because the owner attested the key complete for existence. ` +
      `**This report gates nothing.** Every disagreement is resolvable in both directions.`,
  }
}
