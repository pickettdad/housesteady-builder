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
 * **The number is a range across versions, and citing one figure reads as a
 * contradiction to whoever finds it next.** Field Code reports **twelve of
 * thirteen** zone types with no default, reading master v1.11. Measured here on
 * field config v1.2.1, `defaultsTrueFor` appears nowhere at all, so it is
 * **thirteen of thirteen**. Both are true of the version they were read from,
 * and the honest statement is *between twelve and thirteen of thirteen, and none
 * at all on the config this repo can actually read.*
 *
 * Three items are gated on a zone attribute in this config — `liv.egress` on
 * `zone.sleeping`, `bsm.finished-behind` on `zone.finished`, `cir.stairs-rails`
 * on `zone.has_stairs`. Lose the ensuite's `finished: true` on replay and
 * anything gated on it stops being due, silently, in a room where it applies.
 *
 * **The test for what belongs in the plan: could the app work this out again by
 * looking at the house?** If no, carry it explicitly.
 *
 * ---
 *
 * ## The trap inside "carry the attributes"
 *
 * **A recorded `false` is a decision. An absent attribute is not.** The bedroom
 * carries `sleeping: false` — somebody was asked and said no. `has_plumbing` is
 * absent from both zones, because this config sets `askAtCreation: false` on it
 * and nobody was ever asked.
 *
 * An emitter that carries truthy keys only makes those two identical on the
 * receiving end, and the second visit cannot tell *"we established there is no
 * plumbing here"* from *"nobody has ever considered it."* Same shape as
 * declared-and-false versus never-declared in the trigger evaluator, and the
 * third time this distinction has decided a design here.
 *
 * So the plan carries **the recorded map verbatim, falses included**, and names
 * the unanswered attributes separately — `unanswered` rather than `neverAsked`,
 * because *never* is a historical quantifier on a current fact and the list is
 * derived from today's config. Same correction as *"we were not able to
 * cover"*: a word claiming more than the data supports.
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
  /**
   * Attributes this config declares that this zone has no recorded answer for,
   * **as of this plan.**
   *
   * **Deliberately not `neverAsked`, and the rename is the same correction as
   * *"we were not able to cover."*** *Never* is a historical quantifier on a
   * current fact: this list is derived from today's `zoneAttributes[]` minus
   * what the zone recorded, so it changes when the config changes. An attribute
   * added between visits appears here — correctly, because nobody has answered
   * it and somebody should — and calling that *never asked* would claim a
   * history the derivation does not have.
   *
   * The derivation is right for the purpose. The word was claiming more than it
   * supports.
   */
  unanswered: string[]
}

export interface PlanObject {
  pinId: string
  componentType: string | null
  label: string | null
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
   * The DATE OF THE VISIT that first made this due — what the field can say out
   * loud: *"open since your March visit."*
   *
   * **Null when that visit carries no date**, and it does not fall back to the
   * import timestamp. One field standing for two facts is how a zone `type`
   * ended up doing a nickname's job, and a field the receiver has to guess the
   * meaning of is worse than a null it can see.
   */
  since: string | null
  /**
   * When the import that first made it due was read.
   *
   * A different fact, named separately. It has no meaning in the field — this
   * export was visited on the 24th and imported on the 31st — and it is here
   * because it is the ordering key this repo actually sorts on.
   */
  sinceImportedAt: string
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
  objects: PlanObject[]
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
    objects: SectionReport
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
  const declaredAttributes = new Set(
    (Array.isArray(evidence.snapshot.zoneAttributes)
      ? (evidence.snapshot.zoneAttributes as { id?: unknown }[])
      : []
    ).map((a) => a.id).filter((id): id is string => typeof id === 'string'),
  )

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
      unanswered: [...declaredAttributes].filter((a) => !(a in attributes)).sort(),
    })
  }
  const zones = [...byZone.values()]

  const decidedFalse = zones.flatMap((z) => Object.entries(z.attributes).filter(([, v]) => v === false).length)
    .reduce((a, b) => a + b, 0)
  const decidedTrue = zones.flatMap((z) => Object.entries(z.attributes).filter(([, v]) => v === true).length)
    .reduce((a, b) => a + b, 0)

  // ---------------------------------------------------------------- objects
  const pins = evidence.pins.filter((p) => !p.retired && p.componentType !== null)
  const units = unitItems(evidence.snapshot)

  const objects: PlanObject[] = pins.map((pin) => {
    // §B3 — the prior unit photograph. Resolved through the type graph, because
    // §1b's inheritance means a softener's unit item is its parent's id.
    const candidates = evidence.graph.lineage(pin.componentType!).flatMap((t) => units.get(t) ?? [])
    let priorUnitPhoto: PlanObject['priorUnitPhoto'] = null
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
      priorUnitPhoto,
    }
  })

  // ----------------------------------------------------------- carried gaps
  const active = activeItemSet(db, propertyId)
  const scoped = scopedResolutions(db, propertyId)
  const { carried } = carriedItems({ evidence, active, resolutions: scoped })
  // The visit date for each visit that first made something due. Looked up
  // once: a query per gap would be twenty queries for two answers.
  const visitDates = new Map(
    (db.prepare('SELECT id, visit_date FROM visits WHERE property_id = ?').all(propertyId) as
      { id: string; visit_date: string | null }[]).map((v) => [v.id, v.visit_date]),
  )

  const carriedGaps: PlanGap[] = carried.items.map((item) => ({
    scopeKind: item.scope.kind,
    zoneId: item.scope.zoneId,
    pinId: item.scope.pinId,
    itemId: item.itemId,
    reason: item.reason,
    since: item.dueSince.visitId ? visitDates.get(item.dueSince.visitId) ?? null : null,
    sinceImportedAt: item.dueSince.at,
  }))
  const undated = carriedGaps.filter((g) => g.since === null).length

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
  const KNOWN_FLAGS = ['monitor', 'issue']
  const unrecognisedFlags = [...flagCounts].filter(([f]) => !KNOWN_FLAGS.includes(f))
  const flagsSeen = [...flagCounts].map(([f, n]) => `${n} ${f}`).join(' · ')
  if (unrecognisedFlags.length > 0) {
    warnings.push(
      `pin flag value(s) this builder does not recognise: ${unrecognisedFlags.map(([f, n]) => `${f} (${n})`).join(', ')}. ` +
        'Preserved and counted, not treated as monitors, and not dropped.',
    )
  }

  const comparisonPositionsDue = objects
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
        'arrives. The master declares 23; field config v1.2.1 declares none.',
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
    objects,
    carriedGaps,
    monitorsDue,
    comparisonPositionsDue,
    openConcerns: [],
    sections: {
      zones: {
        count: zones.length,
        note: zones.length === 0
          ? 'no zone has been walked on this property'
          : `${decidedTrue} attribute(s) decided true and ${decidedFalse} decided false travel explicitly; ` +
            'a recorded false is a decision and must not arrive as an absence',
      },
      objects: {
        count: objects.length,
        note: objects.length === 0 ? 'no live typed pin on this property' : 'live typed pins, by field-minted uuid',
      },
      carriedGaps: {
        count: carriedGaps.length,
        note: carriedGaps.length === 0
          ? 'every applicable item on this property has an answer'
          : `unanswered items and gap-feeding na, with the reason the config gave` +
            (undated > 0
              ? ` · ${undated} carry no \`since\` because the visit that made them due has no date recorded — ` +
                'not defaulted to the import timestamp, which means something else'
              : ''),
      },
      monitorsDue: {
        count: monitorsDue.length,
        note: [
          monitorsDue.length === 0
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
        count: objects.filter((o) => o.priorUnitPhoto).length,
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
