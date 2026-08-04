/**
 * Whether a property is complete enough for the property pass to run at all.
 *
 * THE NAMED FAILURE (Amendment 1 §E, which neither session caught first time):
 * *media arrives in slices. Zones one and two are identified while zones three
 * to eight have no photographs on the machine at all. Nothing is queued,
 * identification is "complete", and the property pass runs against two rooms of
 * an eight-room house — reporting confident absences about six rooms nobody has
 * looked at.*
 *
 * **An empty work queue and a fully captured property are indistinguishable from
 * inside.** That is doctrine 7 in the one place where the wrong answer is a
 * client-facing claim about something not existing. *There is no CO alarm on this
 * floor* and *we did not photograph one* are different sentences, and only one of
 * them is a liability.
 *
 * COMPLETENESS IS DERIVED FROM FACTS, NEVER SIGNED AS A JUDGEMENT.
 *
 * This matters more than it looks. The overlay layer's own doctrine note says a
 * signature claims the record matches the evidence and **never condition,
 * adequacy, age, safety or completeness** — so a human act saying *this capture
 * is complete* would be the assessment the concierge is not permitted to make,
 * arriving through a new door.
 *
 * So nobody signs completeness. A person declares one narrow **fact** they can
 * actually check — *this zone has no media to load* — and readiness is computed
 * from that plus what is on disk. Same discipline as `none-present`: the reason
 * is the data, and the fact is checkable while the judgement would not be.
 *
 * WHY THE DECLARATION IS NEEDED AT ALL, WHEN THE MANIFEST ALREADY SAYS NOTHING.
 *
 * A zone with zero media rows is ambiguous in exactly the way that matters: the
 * concierge went to the attic and there was nothing to photograph, or the
 * concierge never went to the attic. **The manifest cannot tell those apart**,
 * and inferring the first is how a property pass ends up asserting an absence
 * about a room nobody entered. Amendment §E's *a zone with no media at all is a
 * declared state, not an inferred one* is that sentence.
 *
 * THE TOKEN EXISTS SO THE CHECK CANNOT BE SKIPPED.
 *
 * `PropertyReady` has no exported constructor. The only way to hold one is to
 * have called `propertyReadiness` and received `ready: true`. When the property
 * pass is built it will take one as an argument, so *running without the check*
 * is not a discipline anyone has to remember — it is a call that does not
 * compile. §10's "the type or the constructor forbids it", applied to the
 * ordering constraint the spec calls hard rather than preferred.
 */

import type { Db } from '../db/index.js'
import { writeOverlay } from '../overlay/store.js'
import { assembleImport } from './plan.js'

/**
 * The kind an overlay carries when a person records that a zone has nothing to
 * load. Open vocabulary, like every other overlay kind.
 *
 * Deliberately named for the fact rather than for the conclusion: `capture-none`
 * says *there is no capture here*, where a `capture-complete` would say *the
 * capture is sufficient* — a judgement, and the wrong one to let anybody sign.
 */
export const NO_MEDIA_KIND = 'capture-none'

export type ZoneCaptureState =
  /** Media declared, every file on disk, and identification has run. */
  | 'identified'
  /** Media declared and present, but the identification pass has not run. */
  | 'awaiting-identification'
  /** Media declared in the manifest, some or all files not on the machine. */
  | 'media-not-loaded'
  /** No media declared, and a person recorded why. */
  | 'empty-declared'
  /** No media declared and nobody has said why. The blocking state. */
  | 'empty-undeclared'

export interface ZoneCompleteness {
  zoneId: string
  label: string | null
  state: ZoneCaptureState
  /** Media rows the manifest declares for this zone. */
  declared: number
  /** Of those, how many files are on the machine. */
  present: number
  /** The reason a person gave, for `empty-declared`. */
  declaredReason?: string
}

/** Why the property pass may not run. Each names a zone and what would fix it. */
export interface Blocker {
  zoneId: string
  label: string | null
  state: ZoneCaptureState
  /** Plain words, for a person rather than a log. */
  note: string
}

/**
 * Proof that the check ran and passed.
 *
 * No exported constructor and a private brand, so it cannot be forged by an
 * object literal that happens to have the right shape. The property pass will
 * require one.
 */
export interface PropertyReady {
  readonly [readyBrand]: true
  readonly importId: string
  readonly zones: readonly ZoneCompleteness[]
}

declare const readyBrand: unique symbol

export type PropertyReadiness =
  | { ready: true; proof: PropertyReady; zones: ZoneCompleteness[] }
  | { ready: false; blockers: Blocker[]; zones: ZoneCompleteness[] }

export interface ReadinessInput {
  db: Db
  importId: string
  /**
   * Zones the identification pass has completed.
   *
   * **Passed in rather than inferred**, and that is the whole point of §E: the
   * absence of queued work is not evidence that work was done. A caller that
   * cannot say which zones were identified passes an empty set and is told the
   * property is not ready — which is the correct answer, not a limitation.
   */
  identifiedZones: ReadonlySet<string>
}

/**
 * Can the property pass run?
 *
 * Returns every zone's state either way. A refusal that does not say which rooms
 * are missing is not actionable, and the person who can fix it is the person
 * reading this.
 */
export function propertyReadiness(input: ReadinessInput): PropertyReadiness {
  const { db, importId } = input

  // Through the assembly, never through a second query. *Which media belongs to
  // this zone* is the owner-resolution rule from Amendment 2 §B, and asking it
  // again in SQL here would be a second implementation that agrees on today's
  // export and diverges on an unanchored pin — the same silent drift as grouping
  // by path, one module along.
  const assembly = assembleImport(db, importId)
  const declaredEmpty = liveNoMediaDeclarations(db, importId)

  const states: ZoneCompleteness[] = assembly.zones.map((z) => {
    const base = {
      zoneId: z.zoneId,
      label: z.zoneLabel,
      declared: z.receivedCount,
      present: z.presentCount,
    }

    if (z.receivedCount === 0) {
      const reason = declaredEmpty.get(z.zoneId)
      return reason === undefined
        ? { ...base, state: 'empty-undeclared' as const }
        : { ...base, state: 'empty-declared' as const, declaredReason: reason }
    }
    if (z.presentCount < z.receivedCount) return { ...base, state: 'media-not-loaded' as const }
    return {
      ...base,
      state: input.identifiedZones.has(z.zoneId) ? ('identified' as const) : ('awaiting-identification' as const),
    }
  })

  const blockers = states.filter((s) => s.state !== 'identified' && s.state !== 'empty-declared').map(blockerFor)

  if (blockers.length > 0) return { ready: false, blockers, zones: states }
  return {
    ready: true,
    proof: { importId, zones: states } as unknown as PropertyReady,
    zones: states,
  }
}

function blockerFor(z: ZoneCompleteness): Blocker {
  const name = z.label ?? z.zoneId
  const note =
    z.state === 'empty-undeclared'
      ? `${name} has no media and nobody has recorded why. A room that was visited and had nothing ` +
        `to photograph and a room nobody entered look identical here — say which.`
      : z.state === 'media-not-loaded'
        ? `${name} declares ${z.declared} file${z.declared === 1 ? '' : 's'} and ${z.present} ` +
          `${z.present === 1 ? 'is' : 'are'} on this machine. The rest have not been loaded.`
        : `${name} has ${z.present} file${z.present === 1 ? '' : 's'} loaded and has not been through ` +
          `identification.`
  return { zoneId: z.zoneId, label: z.label, state: z.state, note }
}

/**
 * Zones a person has recorded as having nothing to load, with their reasons.
 *
 * Reads the overlay layer's own supersession rule: a declaration that something
 * points at has been taken back. Nothing is deleted, so a zone declared empty
 * and then corrected reads as undeclared again rather than staying stale.
 */
export function liveNoMediaDeclarations(db: Db, importId: string): Map<string, string> {
  const rows = db
    .prepare(
      `SELECT o.target_id, o.reason
         FROM overlays o
         JOIN imports i ON i.visit_id = o.visit_id
        WHERE i.id = ?
          AND o.kind = ?
          AND o.target_kind = 'zone'
          AND NOT EXISTS (SELECT 1 FROM overlays s WHERE s.supersedes_id = o.id)
        ORDER BY o.seq`,
    )
    .all(importId, NO_MEDIA_KIND) as { target_id: string; reason: string | null }[]

  const out = new Map<string, string>()
  // Later acts win, matching the overlay layer's "latest live decision" rule.
  for (const r of rows) out.set(r.target_id, r.reason ?? '')
  return out
}

/**
 * Record that a zone has nothing to load, and why.
 *
 * The reason is required, not optional. *The attic hatch was sealed* and *there
 * is no attic access from inside* and *not visited this trip* are three
 * different facts, and a property pass that later asserts something about the
 * attic needs to have been told which. An empty reason is the same failure as
 * an inferred emptiness, one step later.
 *
 * Goes through `writeOverlay` rather than its own table so it inherits the
 * actor trigger, the supersession rule and the audit trail — and so taking a
 * declaration back is an act rather than a delete.
 */
export function declareNoMedia(args: {
  db: Db
  propertyId: string
  visitId: string
  zoneId: string
  reason: string
  actorId: string
}): void {
  const reason = args.reason.trim()
  if (!reason) {
    throw new Error(
      'A zone recorded as having no media has to say why. "Nothing to photograph" and "not visited" ' +
        'are different facts, and the property pass needs to know which.',
    )
  }
  writeOverlay({
    db: args.db,
    propertyId: args.propertyId,
    visitId: args.visitId,
    kind: NO_MEDIA_KIND,
    targetKind: 'zone',
    targetId: args.zoneId,
    reason,
    actorId: args.actorId,
  })
}

/**
 * A refusal a person can act on.
 *
 * The pass does not run partially and it does not run and caveat (§E), so this
 * is the whole output when readiness fails — there is no half-result to read
 * past.
 */
export function refusalNote(r: Extract<PropertyReadiness, { ready: false }>): string {
  const lines = r.blockers.map((b) => `  · ${b.note}`)
  return (
    `The property pass did not run. ${r.blockers.length} of ${r.zones.length} zones are not ready:\n` +
    lines.join('\n') +
    `\n\nA property pass over a partly-loaded house reports confident absences about rooms nobody has ` +
    `looked at, so it does not run until every zone is either identified or recorded as having nothing.`
  )
}
