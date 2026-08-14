/**
 * Session plan v0 — Increment 4 §3.
 *
 * **What this repo sends back into the field app.** The manifest is the field's
 * export; this is the return leg, and §1's identity note makes it structural
 * rather than a convenience: *"without it a five-year-old leak is minted fresh
 * every visit and nothing lines up."*
 *
 * ---
 *
 * ## §3a — the named failure, and it is about decisions rather than identity
 *
 * > A concierge ticks `has_mechanicals` on the basement during the baseline.
 * > Visit two replays the zone as identity only. The attribute arrives absent,
 * > falls through to a default — and twelve of thirteen zone types have no
 * > default. The mechanical checklist is empty on visit two, and an empty
 * > checklist reads as already handled.
 *
 * **The strongest evidence is a LIST GATE, not an item gate**, and an earlier
 * version of this comment argued from the weaker one. Field Code, reading master
 * v1.11: seven surfaces where a zone attribute decides something, and among them
 * **`base:mechanical-base` is gated on `zone.has_mechanicals`.**
 *
 * An item gate loses one question. A list gate loses **the entire list** — the
 * base list never composes, no item under it is ever due, and the audit reports
 * full coverage of a list nobody asked. So the spec's sentence is not a figure of
 * speech: *the mechanical checklist is empty on visit two* is literally what one
 * lost boolean does.
 *
 * **What this repo can measure is weaker, because it holds an older config.**
 * v1.2.1 has no `has_mechanicals` and no `defaultsTrueFor` anywhere, so the list
 * gate cannot be demonstrated here. Three item-level gates can: `liv.egress` on
 * `zone.sleeping`, `bsm.finished-behind` on `zone.finished`, `cir.stairs-rails`
 * on `zone.has_stairs`. Lose the ensuite's `finished: true` on replay and those
 * three stop being due, silently, in a room where they apply.
 *
 * **Measured on the real v1.11 config, and this is the third different number in
 * three documents — so it is stated once, precisely, and zone TYPES are dropped
 * from the framing entirely.**
 *
 * All six zone attributes **declare** `defaultsTrueFor`. Five declare it with an
 * **empty** value. The sixth, `has_mechanicals`, defaults true for `utility`
 * alone — and it is the one carrying the list gate.
 *
 * That makes §3a stronger rather than weaker: **the mechanism is wired, and it is
 * load-bearing on exactly the one attribute that gates an entire base list.**
 * Declared-and-empty is not never-declared — seventh instance.
 *
 * **The test for what belongs in the plan: could the app work this out again by
 * looking at the house?** If no, carry it explicitly.
 *
 * ---
 *
 * ## The trap inside "carry the attributes"
 *
 * **A recorded key and an absent key are different things. That is all the
 * record supports, and it is enough.**
 *
 * **An earlier version of this said a recorded `false` meant somebody was asked
 * and said no. It does not.** Zone creation writes
 * `attributes[a.id] = attrs.has(a.id)` for every `askAtCreation: true`
 * attribute and there is no skip path, so an untouched toggle and a considered
 * *no* produce the same `false`. The REFERENCE export's bedroom — three falses,
 * on a room labelled bedroom that is not `sleeping` — is almost certainly three
 * toggles nobody moved.
 *
 * ⚑ **The export is named on purpose.** Two fixtures now carry a bedroom and
 * they disagree: the walk fixture's is `finished: true, sleeping: true`, and its
 * thirty-two attribute values are all correct about the house. An unqualified
 * *"the bedroom's falses"* is what let one file's true observation get carried
 * onto another where it is false — contract §3b records the retraction.
 *
 * The verbatim map is still right — **it preserves the field's own ambiguity
 * faithfully**, which is the most any emitter can do. But the earlier reason
 * licensed rendering `false` as *"we established there is none"*, which is the
 * proposed error a third time: a value read as more definite than its
 * provenance supports.
 *
 * So, precisely: a recorded `false` is what the field wrote down and says
 * nothing about how it got there; an ABSENT key means `askAtCreation: false`,
 * so nothing was ever written. An emitter carrying truthy keys only collapses
 * those two and loses the one distinction the record genuinely supports. Same
 * shape as declared-and-false versus never-declared in the trigger evaluator,
 * and the third time this distinction has decided a design here.
 *
 * ---
 *
 * ## Session data, never config
 *
 * §3: this rides in as its own import artifact, **never touches the generated
 * config or its hash**, and is provenance-tagged `system`. A plan that modified
 * the config would make the config a function of what the builder thinks, which
 * is exactly backwards — the config is the field's declaration of what a visit
 * asks, and this is one visit's starting state.
 *
 * **Naming trap, from the spec:** `src/engine/plan.ts` in the field repo exports
 * `SessionPlan` and `compilePlan`, and **that is the v1 slot-model plan compiler
 * and is unrelated to this.** Nothing here binds to it or mirrors its shape.
 *
 * **No receiver exists.** `PLAN-STAGE-1` §7a and §7a-ii scope the import in
 * detail but it is not built, so this specifies and emits as though nothing is
 * listening — which is the correct sequencing, since the import cannot be built
 * until something emits an artifact to build against.
 */

import type { Db } from '../db/index.js'
import { now } from '../db/index.js'
import { activeItemSet } from '../audit/activeItems.js'
import { carriedItems } from '../audit/carriedItems.js'
import { propertyEvidence } from '../audit/propertyEvidence.js'
import { walkedAtByVisit } from '../audit/walkedAt.js'
import { activeItemKey } from '../audit/activeItems.js'
import { outstandingSince, type SinceBasis } from '../audit/outstandingSince.js'

/** The plan's own version, independent of the manifest's. */
export const PLAN_SCHEMA_VERSION = 1

export interface PlanZone {
  zoneId: string
  label: string | null
  type: string | null
  /**
   * The recorded attribute map, **verbatim, falses included.**
   *
   * Not "the true ones". A recorded `false` is a decision somebody made and it
   * has to survive the round trip, or visit two cannot tell it from a question
   * nobody has been asked.
   */
  attributes: Record<string, boolean>
}

/**
 * **There is deliberately no `unanswered` list in the payload**, and the reason
 * is a version argument the emitter cannot win.
 *
 * It was here, derived from this config's `zoneAttributes[]` minus the keys the
 * zone recorded. Field Code's evidence killed it: **v1.2.1 declares five zone
 * attributes and v1.11 declares six, and the sixth is `has_mechanicals` — the
 * only attribute in the whole config carrying a `defaultsTrueFor`.**
 *
 * **An emitter always reads a past config.** Its list is therefore
 * systematically under-inclusive, and on these two versions it is missing
 * exactly the attribute §3a is named after. A receiver trusting it would be
 * told nothing is unanswered about the one thing most worth asking.
 *
 * The receiver has the current vocabulary and derives it itself:
 *
 * > `unanswered = its own declared attributes − keys(zone.attributes)`
 *
 * The verbatim map is all the emitter can honestly send, and it is enough.
 */

/**
 * A live typed pin, as the field recorded it. **Named for what it holds.**
 *
 * This was `PlanObject` / `objects` until Increment 5 Amendment 1 §A. Under the
 * class frame an *object* is the desk's confirmed answer about a thing in a
 * room — a builder-side entity with a class and a property-lifetime identity.
 * A pin is a field-side entity. §2 of that spec says the two must never be
 * conflated, and one word covering both is how that conflation arrives.
 *
 * **`objects` is reserved, not vacated.** When the desk produces confirmed
 * objects the plan will carry them, and it may well carry both — *what the
 * field recorded* and *what the desk confirmed* are different facts about the
 * same house. Two names because two things.
 *
 * Fourth instance of this hazard after `compilePlan`, `type`/`label` and
 * `sinceImportedAt`, and all three prior were cheaper to fix before the second
 * meaning arrived than after.
 */
export interface PlanTypedPin {
  pinId: string
  componentType: string | null
  label: string | null
  /**
   * ⚑ The field's own flag on this pin, **verbatim and uninterpreted**.
   *
   * **Added 2026-08-14 on Cloud Field's review, and the argument is about what
   * survives a visit.** The plan carried only `monitorsDue` — a *derivation* of
   * this value — so visit two could say *check this one* and could never say
   * *you flagged this an issue last time.* The field app cannot recover it
   * either: **nothing about a house survives a visit on that side**, which is
   * the whole reason the return leg exists.
   *
   * **The raw value outlives the derivation, and that is the point of carrying
   * both.** At Increment 5 `monitorsDue` is re-sourced from this repo's own
   * `openConcerns` and stops reading flags entirely (contract §9a). This field
   * is unaffected: it is what the field recorded, not what this repo concluded.
   *
   * **Not filtered to the values this build knows.** `fine`, `monitor`, `issue`
   * and anything the field adds next all travel — doctrine 7, fail open on
   * vocabulary. `monitorsDue` is where interpretation happens; this is evidence.
   *
   * **Always present, `null` where the pin carries no flag** — rather than the
   * optional key Cloud Field asked for. An absent key would mean *this pin has
   * no flag* and *this emitter does not send flags* identically, and telling
   * those apart is the distinction §3 spends its whole length on.
   */
  flag: string | null
  /**
   * §B3 — the prior whole-unit photograph, to display beside the capture prompt.
   *
   * **Null is not the same as absent.** See `sections.priorUnitPhotographs`:
   * this config declares no `.unit` items at all, so there is no comparison
   * position to carry and nothing here is a failure to find one.
   */
  priorUnitPhoto: { mediaId: string; capturedAt: string | null; itemId: string } | null
}

export interface PlanGap {
  scopeKind: string
  zoneId: string | null
  pinId: string | null
  itemId: string
  /** `not-reached`, or the config's own na reason id. Verbatim. */
  reason: string
  /**
   * The walk date of the visit this item's **current unbroken run** of being
   * outstanding began at.
   *
   * **Not the first time it was ever outstanding**, which is what shipped and
   * what `dueSince` holds — an item satisfied on visit two and unanswered again
   * on visit three would be dated a year back when it was closed for eleven
   * months of it. **Not the most recent carry either**, or the clock resets every
   * visit. See `outstandingSince.ts` for the walk.
   *
   * **From the manifest's `session.startedAt`, never `visits.visit_date`**, which
   * is hand-typed and unchecked — see `walkedAt.ts`. The first signed gap report
   * rendered a date a day off the manifest because a seed script typed one, and
   * *"open since your visit"* must not read a field that can disagree with the
   * evidence. And not `completedAt`, which moves when a session is reopened.
   *
   * Null on every basis but `dated`. **Read `sinceBasis` before reading this** —
   * a null here is four different facts.
   */
  since: string | null
  /**
   * Which of four things a `since` of null means.
   *
   * `dated` · `undated` (the visit is known, no session start recorded) ·
   * `predates-record` (the run reaches this record's earliest visit and that is
   * not the property's first) · `no-visit` (a visit-less import).
   */
  sinceBasis: SinceBasis
  /** The visit the run began at, where one is identifiable. */
  sinceVisitId: string | null
  /** How many consecutive visits this record can see it outstanding for. */
  sinceRunVisits: number
  /** Why, in a sentence, so a receiver never has to interpret a bare null. */
  sinceNote: string
  /**
   * When the import that **first** made this item due was read by this builder.
   *
   * **Renamed from `firstDueImportedAt`, and the rename is the point.** While
   * `since` meant *first ever due*, the two names described one import and the
   * shared prefix was accurate. They now describe different visits — the demo
   * export has an item whose `since` is July and whose first-due import is March
   * — and a name that still read `since…` would invite exactly the collapse this
   * change removes.
   *
   * Kept because it is the ordering key this repo actually sorts on. It has no
   * meaning in the field: the reference session was walked on the 25th and
   * imported days later. It is not a fallback for `since`.
   */
  firstDueImportedAt: string
}

/**
 * Why a section of the payload is empty, said out loud.
 *
 * **This is the whole reason the emitter reports rather than just emits.** Three
 * of five sections are empty on the reference export, and an empty section looks
 * identical whether the mechanism works, was never built, or found nothing —
 * Verification Discipline rule 7, at the payload level.
 *
 * So each section carries a count and a sentence, and the sentence distinguishes
 * *nothing matched* from *this config cannot express the thing*.
 */
export interface SectionReport {
  count: number
  note: string
}

export interface SessionPlan {
  planSchemaVersion: number
  kind: 'session-plan'
  /**
   * Provenance-tagged `system`, per §3, with what produced it.
   *
   * **`binderId` is the property id in this build**, because a binder is a
   * property's record and no separate binder entity exists. Named rather than
   * assumed: if a binder ever becomes its own row, this is the field that has to
   * change and the receiver should not have inferred the equivalence.
   */
  source: {
    actor: 'system'
    binderId: string
    propertyId: string
    auditRunId: string | null
    generatedAt: string
    generatedBy: string
  }
  property: { id: string; label: string }
  zones: PlanZone[]
  typedPins: PlanTypedPin[]
  carriedGaps: PlanGap[]
  monitorsDue: { pinId: string; componentType: string | null; label: string | null }[]
  comparisonPositionsDue: { pinId: string; itemId: string }[]
  /**
   * §3b — **recorded, not specced.** Concerns are Increment 5 and gated on
   * manifest v4. The key exists so the shape has room; nothing is built from it
   * and nothing writes to it.
   */
  openConcerns: never[]
  sections: {
    zones: SectionReport
    typedPins: SectionReport
    carriedGaps: SectionReport
    monitorsDue: SectionReport
    comparisonPositionsDue: SectionReport
    priorUnitPhotographs: SectionReport
    openConcerns: SectionReport
  }
  warnings: string[]
}

const parse = <T,>(s: unknown, fallback: T): T => {
  if (typeof s !== 'string') return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

/** Every checklist item this config declares whose id ends `.unit` — §B3's comparison positions. */
function unitItems(snapshot: Record<string, unknown>): Map<string, string[]> {
  const byType = new Map<string, string[]>()
  const lists = Array.isArray(snapshot.componentLists)
    ? (snapshot.componentLists as { types?: unknown; items?: unknown }[])
    : []
  for (const list of lists) {
    const types = Array.isArray(list.types) ? (list.types as string[]) : []
    const items = Array.isArray(list.items) ? (list.items as { id?: unknown }[]) : []
    const units = items.map((i) => i.id).filter((id): id is string => typeof id === 'string' && id.endsWith('.unit'))
    if (units.length === 0) continue
    for (const type of types) byType.set(type, [...(byType.get(type) ?? []), ...units])
  }
  return byType
}

export function buildSessionPlan(args: {
  db: Db
  propertyId: string
  generatedBy: string
}): SessionPlan {
  const { db, propertyId, generatedBy } = args
  const evidence = propertyEvidence(db, propertyId)
  const warnings: string[] = []

  const property = db.prepare('SELECT id, label FROM properties WHERE id = ?').get(propertyId) as
    | { id: string; label: string }
    | undefined
  if (!property) throw new Error('No such property.')

  const run = db
    .prepare('SELECT id FROM audit_runs WHERE property_id = ? ORDER BY run_at DESC, id DESC LIMIT 1')
    .get(propertyId) as { id: string } | undefined

  // ------------------------------------------------------------------ zones
  //
  // §3a. The latest row per zone uuid — the field-minted id is the cross-visit
  // identity, so the same ensuite seen twice is one ensuite.
  const zoneRows = db
    .prepare(
      `SELECT z.zone_id, z.label, z.type, z.attributes, i.imported_at
         FROM zones z JOIN imports i ON i.id = z.import_id
        WHERE i.property_id = ? ORDER BY i.imported_at, z.id`,
    )
    .all(propertyId) as { zone_id: string; label: string | null; type: string | null; attributes: string | null }[]

  const byZone = new Map<string, PlanZone>()
  for (const row of zoneRows) {
    const recorded = parse<Record<string, unknown>>(row.attributes, {})
    // Booleans only, and BOTH booleans. A recorded false is a decision; a
    // non-boolean is something this build does not understand and is left to
    // the never-asked list rather than coerced.
    const attributes: Record<string, boolean> = {}
    for (const [key, value] of Object.entries(recorded)) {
      if (typeof value === 'boolean') attributes[key] = value
    }
    byZone.set(row.zone_id, {
      zoneId: row.zone_id,
      label: row.label,
      type: row.type,
      attributes,
    })
  }
  const zones = [...byZone.values()]

  const decidedFalse = zones.flatMap((z) => Object.entries(z.attributes).filter(([, v]) => v === false).length)
    .reduce((a, b) => a + b, 0)
  const decidedTrue = zones.flatMap((z) => Object.entries(z.attributes).filter(([, v]) => v === true).length)
    .reduce((a, b) => a + b, 0)

  // --------------------------------------------------------------- typed pins
  const pins = evidence.pins.filter((p) => !p.retired && p.componentType !== null)
  const units = unitItems(evidence.snapshot)

  const typedPins: PlanTypedPin[] = pins.map((pin) => {
    // §B3 — the prior unit photograph. Resolved through the type graph, because
    // §1b's inheritance means a softener's unit item is its parent's id.
    const candidates = evidence.graph.lineage(pin.componentType!).flatMap((t) => units.get(t) ?? [])
    let priorUnitPhoto: PlanTypedPin['priorUnitPhoto'] = null
    for (const itemId of candidates) {
      const resolution = evidence.pinResolutions.get(pin.pinId)?.get(itemId)
      if (resolution?.kind !== 'satisfied') continue
      const media = db
        .prepare(
          `SELECT m.media_id, m.captured_at FROM media m JOIN imports i ON i.id = m.import_id
            WHERE i.property_id = ? AND m.owner_pin_id = ? ORDER BY m.captured_at DESC LIMIT 1`,
        )
        .get(propertyId, pin.pinId) as { media_id: string; captured_at: string | null } | undefined
      if (media) {
        priorUnitPhoto = { mediaId: media.media_id, capturedAt: media.captured_at, itemId }
        break
      }
    }
    return {
      pinId: pin.pinId,
      componentType: pin.componentType,
      label: pin.freeformLabel,
      // Verbatim. `monitorsDue` below decides what a flag MEANS; this carries
      // what the field wrote, including values this build has never met.
      flag: pin.flag,
      priorUnitPhoto,
    }
  })

  // ----------------------------------------------------------- carried gaps
  const active = activeItemSet(db, propertyId)
  const scoped = scopedResolutions(db, propertyId)
  const { carried } = carriedItems({ evidence, active, resolutions: scoped })
  // When each visit's walk began, from the manifest. One query rather than one
  // per gap. NOT the hand-typed planned date — see `walkedAt.ts` for why.
  const walks = walkedAtByVisit(db, propertyId)
  for (const [visitId, walk] of walks) {
    if (!walk.disagreesWithPlanned) continue
    warnings.push(
      `visit ${visitId} carries a planned date of ${walk.disagreesWithPlanned.planned}, and the session ` +
        `it imported began ${walk.disagreesWithPlanned.walked}. The plan sends the evidence; the ` +
        'disagreement is reported rather than silently preferred.',
    )
  }

  // The run each gap is currently in — the `since` ruling. Computed once for the
  // whole stream rather than per row, because it walks the property's visit
  // sequence and that sequence is the same for all of them.
  const runs = outstandingSince({
    db,
    propertyId,
    active,
    keys: carried.items.map((i) => activeItemKey(i.scope, i.itemId)),
    snapshot: evidence.snapshot,
  })
  warnings.push(...runs.warnings)

  const carriedGaps: PlanGap[] = carried.items.map((item) => {
    const run = runs.since.get(activeItemKey(item.scope, item.itemId))
    return {
      scopeKind: item.scope.kind,
      zoneId: item.scope.zoneId,
      pinId: item.scope.pinId,
      itemId: item.itemId,
      reason: item.reason,
      since: run?.date ?? null,
      // No default. A gap the run walk did not reach at all is `no-visit`, which
      // is a state it already has a name for — inventing `dated` here would be
      // the fallback-that-cannot-fail this whole change exists to remove.
      sinceBasis: run?.basis ?? 'no-visit',
      sinceVisitId: run?.visitId ?? null,
      sinceRunVisits: run?.runVisits ?? 0,
      sinceNote: run?.note ?? 'no run could be reconstructed for this item',
      firstDueImportedAt: item.dueSince.at,
    }
  })
  const byBasis = new Map<SinceBasis, number>()
  for (const g of carriedGaps) byBasis.set(g.sinceBasis, (byBasis.get(g.sinceBasis) ?? 0) + 1)

  // -------------------------------------------------------------- monitors
  //
  // A pin the field flagged `monitor`. The flag vocabulary is the field's and is
  // read rather than interpreted — `issue` is the other value this export
  // carries, and it is not a monitor.
  const monitorsDue = evidence.pins
    .filter((p) => !p.retired && p.flag === 'monitor')
    .map((p) => ({ pinId: p.pinId, componentType: p.componentType, label: p.freeformLabel }))

  /**
   * Every flag value present, counted — Observed Addendum §5.
   *
   * **Silently ignoring a flag this builder does not act on is not fail-open.**
   * The rule is preserve, display, count, mark unrecognised, and *ignored* is
   * none of those — it is the safe branch that never announces itself, which is
   * rule 7 in one line of filtering.
   *
   * The pin `flag` has **no declared vocabulary in the config** — `propertyFlags`
   * is a different thing entirely, house-level facts like `well`. So the two
   * values this build knows come from the Manifest Contract rather than from
   * data, and anything else is genuinely unmet vocabulary.
   */
  const flagCounts = new Map<string, number>()
  for (const p of evidence.pins) {
    if (p.retired || !p.flag) continue
    flagCounts.set(p.flag, (flagCounts.get(p.flag) ?? 0) + 1)
  }
  /**
   * The values this build knows, **from the Manifest Contract** — and the
   * Contract is one value short, which is a live problem rather than a v4 one.
   *
   * **The pin `flag` has no declared vocabulary in the config** — `propertyFlags`
   * is a different thing entirely, house-level facts like `well`. So this list
   * comes from a document rather than from data, and a document being wrong is
   * invisible until somebody reads the other side.
   *
   * **Field Code did: the field's flag type is `"fine" | "monitor" | "issue"`**
   * (`events.ts:28`, `PinScreen.tsx:12`), and `fine` is settable in the shipping
   * app today. So the first time a concierge taps it, this list will report it as
   * unmet vocabulary — preserved, counted, marked, not treated as a monitor.
   *
   * **`fine` is deliberately not added here.** The Manifest Contract is the
   * governing document for this seam — its source of truth is `PLAN-STAGE-1` §7
   * in the field repo — and this repo does not fork it: *"if something about it
   * seems wrong, say so and stop — the owner routes the change to the Field
   * team."* Adding a value read out of the field's source would make this repo
   * depend on a source it does not hold.
   *
   * **And the Contract needs more than a third value.** `monitor` and `fine`
   * both retire at v4, so a contract listing three today would go stale by
   * design. The request is the full versioned form: v3 vocabulary is
   * `fine | monitor | issue`; `monitor` and `fine` retire at v4; **archived v3
   * exports carry all three forever**, because retirement changes what a new
   * export may contain and does not reach backwards into one already written.
   *
   * When the Contract carries that, this list takes it — **versioned the same
   * way**, so a v3 import and a v4 import are each read against the vocabulary of
   * their own manifest version. Session-plan contract §9b is the request.
   */
  const KNOWN_FLAGS = ['monitor', 'issue']

  /**
   * **`monitor` is retired at v4, and "found none" would then be true and
   * misleading.**
   *
   * Design record §1 retires `monitor` and `fine`. So on a v4 export this
   * section would say *the mechanism ran and found none* — accurate, and read as
   * *this house has nothing being watched* when the truth is *the word no longer
   * exists.* Amendment §C5's failure one artifact out, and the same three-state
   * shape as everywhere else: **empty · unbuilt · vocabulary-retired.**
   *
   * **The successor is settled, and the problem dissolves rather than defers.**
   * Field Code: at Increment 5 this section is **re-sourced as a query over this
   * repo's own `openConcerns`, with no field input at all** — a thing being
   * watched is a concern with an open lifecycle, which is what the ratified model
   * already says and which this repo already owns. And `fine` decomposes into
   * nothing: a satisfied checklist item already records it, so there is no
   * successor to design because there was never a second fact.
   *
   * So the flag is not replaced by another flag; the section stops reading a
   * flag. Until Increment 5 lands, the third-state sentence stays.
   */
  const versions = (db
    .prepare('SELECT DISTINCT manifest_schema_version AS v FROM imports WHERE property_id = ?')
    .all(propertyId) as { v: number | null }[])
    .map((r) => r.v).filter((v): v is number => typeof v === 'number')
  const retiredVocabulary = versions.some((v) => v >= 4)
  const unrecognisedFlags = [...flagCounts].filter(([f]) => !KNOWN_FLAGS.includes(f))
  const flagsSeen = [...flagCounts].map(([f, n]) => `${n} ${f}`).join(' · ')
  if (unrecognisedFlags.length > 0) {
    warnings.push(
      `pin flag value(s) this builder does not recognise: ${unrecognisedFlags.map(([f, n]) => `${f} (${n})`).join(', ')}. ` +
        'Preserved and counted, not treated as monitors, and not dropped.',
    )
  }

  /**
   * Live pins carrying a flag that `typedPins` cannot hold — see that section's
   * note. Computed rather than remembered, so it cannot go stale.
   */
  const flaggedUntyped = evidence.pins.filter((p) => !p.retired && p.componentType === null && p.flag).length

  const comparisonPositionsDue = typedPins
    .filter((o) => o.priorUnitPhoto !== null)
    .map((o) => ({ pinId: o.pinId, itemId: o.priorUnitPhoto!.itemId }))

  // --------------------------------------------------------- what is empty
  //
  // Rule 7 at the payload level. An empty section is identical whether the
  // mechanism works and found nothing, or was never built — so each one says
  // which, and says it in the plan rather than only in a log.
  const unitItemCount = [...units.values()].flat().length
  if (unitItemCount === 0) {
    warnings.push(
      'this property\'s config declares no `.unit` items, so there are no comparison positions to ' +
        'carry — §B3\'s prior unit photographs cannot be exercised until a config that declares them ' +
        'arrives. Master v1.11 declares 27, plus 5 `.wide`; the earlier reading of 23 was correct at ' +
        'v1.5.1. A version skew, not a disagreement — the same shape as the zone-attribute count.',
    )
  }
  if (!Array.isArray(evidence.snapshot.zoneAttributes)) {
    warnings.push('this config declares no zone attributes, so nothing can be carried as decided')
  }

  return {
    planSchemaVersion: PLAN_SCHEMA_VERSION,
    kind: 'session-plan',
    source: {
      actor: 'system',
      binderId: propertyId,
      propertyId,
      auditRunId: run?.id ?? null,
      generatedAt: now(),
      generatedBy,
    },
    property: { id: property.id, label: property.label },
    zones,
    typedPins,
    carriedGaps,
    monitorsDue,
    comparisonPositionsDue,
    openConcerns: [],
    sections: {
      zones: {
        count: zones.length,
        /**
         * ⚑ **This sentence used to end *"a recorded false is a decision and
         * must not arrive as an absence"*, and the second half is right while
         * the first half was an overclaim.**
         *
         * Cloud Field, F-20: on the July walk the bedroom recorded
         * `finished: false, sleeping: false` **from toggles nobody touched.**
         * Capture mode now refuses to ask attributes at zone creation for that
         * reason, so a post-fix export leaves an unset attribute honestly
         * absent. **Every export written before that fix carries both kinds of
         * false and no way to tell them apart** — including the walk fixture
         * this repo validates against, on all eight zones.
         *
         * The verbatim map is unchanged and still correct: carrying the false
         * preserves the field's own ambiguity, which is the most an emitter can
         * do. **What was wrong was the sentence claiming the ambiguity was not
         * there** — and it was in the payload, which is the one place an
         * overclaim reaches a reader who never opens the contract.
         */
        note: zones.length === 0
          ? 'no zone has been walked on this property'
          : `${decidedTrue} attribute(s) recorded true and ${decidedFalse} recorded false travel explicitly, ` +
            'verbatim. A recorded key and an absent key are different things and the difference must survive. ' +
            'A recorded FALSE is not necessarily a decision: exports written before the field-side capture-mode ' +
            'fix wrote a false for every unset toggle, so a considered no and an untouched control are ' +
            'indistinguishable in them. From exports written after that fix, an unset attribute is absent ' +
            'rather than false and a recorded false is a decision.',
      },
      typedPins: {
        count: typedPins.length,
        /**
         * ⚑ **`typedPins[].flag` is not the property's whole flag record, and
         * saying so is the difference between a gap and a wrong answer.**
         *
         * This array is live **typed** pins. A live pin with no component type
         * is not in it — so a flag on an untyped pin does not travel here at
         * all, while `monitorsDue` reads every live pin and would carry it.
         * **The walk export has exactly this case**, not a hypothetical one:
         * six live pins carry `fine` and only three of them are typed.
         *
         * A receiver reading `typedPins[].flag` as the complete record would
         * conclude those three pins were never flagged. Counted here rather
         * than fixed with a new array, because *which* pins the plan should
         * carry is the field side's call and inventing a second array to answer
         * it would be this repo deciding a seam question on its own.
         */
        note: typedPins.length === 0
          ? 'no live typed pin on this property'
          : [
            `live typed pins, by field-minted uuid. Each carries the field's own \`flag\` verbatim — ` +
              'uninterpreted, including values this build has never met. `monitorsDue` is the derivation; ' +
              'this is the evidence, and it outlives the derivation when Increment 5 stops reading flags',
            flaggedUntyped > 0
              ? `${flaggedUntyped} live pin(s) carry a flag and have no component type, so they are NOT in ` +
                'this array and their flags do not travel with it. This array is not the property\'s whole ' +
                'flag record; `monitorsDue` reads every live pin, typed or not'
              : 'every live pin carrying a flag is typed, so this array is the whole flag record for this property',
          ].join(' · '),
      },
      carriedGaps: {
        count: carriedGaps.length,
        note: carriedGaps.length === 0
          ? 'every applicable item on this property has an answer'
          : [
            'unanswered items and gap-feeding na, with the reason the config gave',
            // The basis breakdown, always — not only when something is missing.
            // `since` is a date on some rows and one of three different silences
            // on the others, and a count per basis is the only way a receiver can
            // see which without reading every row.
            `\`since\` basis: ${[...byBasis].sort().map(([b, n]) => `${n} ${b}`).join(' · ')}`,
            'each date is the first visit of the item\'s current unbroken run of being outstanding — ' +
              'not the first time it was ever due, which would age a reopened item by the months it ' +
              'spent closed',
            // Each silence explains itself HERE as well as on the row. A basis
            // count alone is a word a receiver has to look up, and the whole
            // reason `since` stopped being a nullable date is that one null
            // meant four things.
            (byBasis.get('undated') ?? 0) > 0
              ? `${byBasis.get('undated')} carry no \`since\` because no import for the visit that made ` +
                'them due records a session start — not defaulted to the import timestamp, which means ' +
                'something else'
              : null,
            (byBasis.get('predates-record') ?? 0) > 0
              ? `${byBasis.get('predates-record')} carry no \`since\` because their run reaches the ` +
                'earliest visit this record holds and that visit is not a baseline — how long they have ' +
                'been open cannot be stated from what is here'
              : null,
            (byBasis.get('no-visit') ?? 0) > 0
              ? `${byBasis.get('no-visit')} carry no \`since\` because no visit on record has them due — ` +
                'a visit-less import has no walk to date them to'
              : null,
            runs.recordReachesBack
              ? null
              : 'this property\'s earliest visit on record is not a baseline, so runs reaching it are ' +
                'reported as `predates-record` rather than dated to a visit that may not be the first',
          ].filter(Boolean).join(' · '),
      },
      monitorsDue: {
        count: monitorsDue.length,
        note: [
          // Three states, not two. `retired` is the one that would otherwise
          // read as a confident empty.
          retiredVocabulary
            ? 'this property has evidence at manifest v4 or later, where the design record retires ' +
              'the `monitor` flag — so an empty list here may mean the vocabulary is gone rather than ' +
              'that nothing is being watched. At Increment 5 this section is re-sourced as a query ' +
              'over this repo\'s own open concerns with no field input, so the flag is not replaced ' +
              'by another flag — the section stops reading a flag. Until then, this sentence.'
            : monitorsDue.length === 0
              ? 'no live pin carries the monitor flag — the mechanism ran and found none, ' +
                'which is not the same as it being unbuilt'
              : 'pins the field flagged for monitoring',
          // Every flag value present, whether or not this build acts on it.
          // Preserve, display, count — never ignore.
          flagCounts.size > 0 ? `flags on live pins: ${flagsSeen}` : 'no live pin carries any flag',
          unrecognisedFlags.length > 0
            ? `${unrecognisedFlags.map(([f, n]) => `${n} pin(s) carry a flag this builder does not recognise (${f})`).join('; ')} — not treated as monitors`
            : null,
        ].filter(Boolean).join(' · '),
      },
      comparisonPositionsDue: {
        count: comparisonPositionsDue.length,
        note: unitItemCount === 0
          ? 'this config declares no `.unit` items, so there is no comparison position to be due — ' +
            'unexercised rather than empty'
          : `${unitItemCount} \`.unit\` item(s) declared; positions with a prior photograph to compare against`,
      },
      priorUnitPhotographs: {
        count: typedPins.filter((o) => o.priorUnitPhoto).length,
        note: unitItemCount === 0
          ? 'none possible — see comparisonPositionsDue'
          : 'a prior whole-unit photograph to display beside the capture prompt, so the same object is ' +
            'photographed from the same position rather than differently every month',
      },
      openConcerns: {
        count: 0,
        note: 'recorded, not specced — concerns are Increment 5 and gated on manifest v4. The key ' +
          'exists so the shape has room; nothing writes to it.',
      },
    },
    warnings,
  }
}

/**
 * The latest resolution per `(scope, item)`.
 *
 * The same query `runAudit` uses, and deliberately duplicated rather than
 * imported: the audit's copy is private to the run and this one belongs to the
 * emitter. Two callers of one private helper is a worse coupling than two small
 * queries — and if they ever need to differ, they can.
 */
function scopedResolutions(
  db: Db,
  propertyId: string,
): Map<string, { kind: string | null; reasonId: string | null; at: string }> {
  const rows = db
    .prepare(
      `SELECT r.scope_kind, r.scope_zone_id, r.scope_pin_id, r.item_id, r.kind, r.reason_id, i.imported_at
         FROM resolutions r JOIN imports i ON i.id = r.import_id
        WHERE r.property_id = ? ORDER BY i.imported_at, r.id`,
    )
    .all(propertyId) as {
    scope_kind: string | null; scope_zone_id: string | null; scope_pin_id: string | null
    item_id: string; kind: string | null; reason_id: string | null; imported_at: string
  }[]

  const out = new Map<string, { kind: string | null; reasonId: string | null; at: string }>()
  for (const r of rows) {
    const scopeKey = r.scope_kind === 'zone'
      ? `zone:${r.scope_zone_id ?? ''}`
      : r.scope_kind === 'pin'
        ? `pin:${r.scope_pin_id ?? ''}`
        : r.scope_kind === 'session' ? 'session' : `${r.scope_kind}:${r.scope_zone_id ?? r.scope_pin_id ?? ''}`
    out.set(`${scopeKey}/${r.item_id}`, { kind: r.kind, reasonId: r.reason_id, at: r.imported_at })
  }
  return out
}
