/**
 * Stage 1 of the comparison pass — candidates and derivation, no model call.
 *
 * Amendment 11 §B, and the ruling of 2026-08-09: **build stage 1, measure the
 * residue after binding, and do not build stage 3 before that number exists.**
 *
 * ---
 *
 * ## What it answers, and what it deliberately does not
 *
 * Identification proposes into a void: every call sees a batch of photographs
 * and no other call's output. So one physical object became four proposals, and
 * **nothing in the pass has ever been asked *is this the thing you already told
 * me about*.**
 *
 * **This file answers that question the two ways it can be answered for free**,
 * and reports what is left over for the ways that are not free:
 *
 * | | how |
 * |---|---|
 * | **derived same** | two objects bound to **one** resolved product |
 * | **derived different** | two objects bound to **different** resolved products |
 * | **candidate** | unbound, but sharing a photograph, a class or label words |
 * | **residue** | unbound and grouped with nothing |
 *
 * **No model call anywhere in here.** Stage 2 — asking a model to compare two
 * unbound proposals — is the thing the residue number decides the size of, and
 * it may only ever be needed for unplated objects.
 *
 * ## Why the derivation runs both ways, and why that half matters more
 *
 * Two objects binding to different products are **different by construction**,
 * and that is the case a merge pass would have got *wrong*: the Burcam 600545B
 * and the WellMate UT-450 are both grey vertical tanks in the same room. **A
 * comparison built only to merge would have merged them**, and a merge is the
 * invisible half of the failure — a duplicate shows up in a list, a wrong merge
 * shows up nowhere.
 *
 * ## Bindings do not exist yet, and the report says so rather than reading zero
 *
 * A binding comes from Amendment 11's pass 2 — resolve a model number to a
 * product — **which is unbuilt.** So today every object is unbound and the whole
 * inventory lands in candidates and residue. **That is the honest pre-binding
 * state and it is what makes the post-binding number worth measuring**, not a
 * result to report as though the derivation had run and found nothing.
 */

import type { Db } from '../db/index.js'
import { laneClause, type LaneScope } from './lanes.js'

/** One proposed object, as much of it as comparison needs. */
export interface Proposal {
  id: string
  zoneId: string
  classId: string | null
  label: string
  /** Every photograph cited as evidence. */
  mediaIds: readonly string[]
  /**
   * Which pass and lane wrote this object — `objects.derived_from`.
   *
   * ⚑ **Carried because `objects` holds the output of more than one pass**, and a
   * consumer that cannot tell them apart reports a number naming neither.
   * `plate` and `appearance` are Amendment 11 pass 3's two lanes; **`null` is the
   * old identification pass**, which wrote no lane.
   */
  derivedFrom: string | null
  /** Pass 3's own model reading — `objects.model_read`. What rule 6 scores. */
  modelRead: string | null
  /**
   * ⚑ Which model call proposed this — `objects.generation_id`.
   *
   * **The run discriminator, and it has been in the schema since 2026-08-09.**
   * `--again` re-runs a pass by re-queueing the JOB; it deletes nothing, because
   * the log is append-only and the first run is evidence. So a re-run *appends* a
   * second set of proposals beside the first, and **`import_id` and
   * `derived_from` are identical across both** — the lane split cannot separate
   * them.
   *
   * *Without this, a fixture written after a re-run mixes two runs and scores a
   * number naming neither* — the same failure `splitByPass` exists to prevent,
   * one level down.
   */
  generationId: string | null
}

/**
 * An object tied to a resolved product — Amendment 11 pass 2's output.
 *
 * `productKey` is whatever identity that pass settles on; this file only needs
 * two of them to be comparable for equality. **Deliberately opaque here**, so
 * the derivation cannot start depending on the shape of a model number.
 */
export interface Binding {
  objectId: string
  productKey: string
}

export interface DerivedPair {
  a: string
  b: string
  /** The product both bound to, on `same`. Absent on `different`. */
  productKey?: string
  /** What each bound to, on `different`. */
  keys?: [string, string]
}

/** Unbound proposals that might be one thing, with the reason they were grouped. */
export interface Candidate {
  zoneId: string
  objectIds: string[]
  /** Strongest signal first — a shared photograph beats a shared class. */
  signal: 'shared-photograph' | 'shared-class' | 'shared-label-words'
  detail: string
}

export interface ComparisonReport {
  zoneId: string | null
  proposals: number
  bound: number
  derivedSame: DerivedPair[]
  derivedDifferent: DerivedPair[]
  candidates: Candidate[]
  /** Unbound and grouped with nothing. **This is the measurement.** */
  residue: string[]
  /**
   * Said in words, because a report reading `bound: 0` is indistinguishable
   * from a derivation that ran and found nothing.
   */
  note: string
}

// ---------------------------------------------------------------- the signals

/**
 * Label words worth comparing.
 *
 * Deliberately crude and deliberately not tuned. This is the **weakest** of the
 * three signals and it exists to catch the case the other two miss — a duplicate
 * landing under two different classes, which is what the Vanée did. Tuning it
 * would be optimising a filter whose job is to be over-inclusive.
 */
const STOP = new Set([
  'the', 'and', 'with', 'for', 'of', 'to', 'in', 'on', 'a', 'an',
  'system', 'unit', 'assembly', 'or', 'from',
])

export const labelWords = (label: string): Set<string> =>
  new Set(
    label
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  )

const shareWords = (a: string, b: string): string[] => {
  const wa = labelWords(a)
  return [...labelWords(b)].filter((w) => wa.has(w))
}

// ------------------------------------------------------------- the derivation

/**
 * Compare one zone's proposals.
 *
 * Pure — no database, no model, no clock. Everything it needs is an argument, so
 * the measurement can be re-run against a stored set months later and produce
 * the same answer.
 */
export function compareProposals(
  proposals: readonly Proposal[],
  bindings: readonly Binding[] = [],
): ComparisonReport {
  const zoneIds = new Set(proposals.map((p) => p.zoneId))
  const boundTo = new Map(bindings.map((b) => [b.objectId, b.productKey]))
  const bound = proposals.filter((p) => boundTo.has(p.id))

  /**
   * **Group first, then let bindings adjudicate — not the other way round.**
   *
   * A first draft derived `different` for every bound pair in the zone. That is
   * true and useless: ten distinct products give **45 pairs**, all different,
   * which is the trivial restatement that ten things are ten things. **The
   * derivation is only interesting about pairs something else suggested were the
   * same**, so the signals run over everything and the bindings settle the groups
   * they raise.
   *
   * *Found by the test asserting five and getting forty-five.*
   */
  const groups = groupBySignal(proposals)

  const derivedSame: DerivedPair[] = []
  const derivedDifferent: DerivedPair[] = []
  const candidates: Candidate[] = []

  for (const g of groups) {
    const keys = g.objectIds.map((id) => boundTo.get(id))
    if (keys.some((k) => k === undefined)) {
      // At least one member is unbound, so the group cannot be settled without
      // asking. Partially-bound is still a question — a bound object and an
      // unbound one may well be the same thing.
      candidates.push(g)
      continue
    }
    for (let i = 0; i < g.objectIds.length; i++) {
      for (let j = i + 1; j < g.objectIds.length; j++) {
        const a = g.objectIds[i]!
        const b = g.objectIds[j]!
        const ka = keys[i]!
        const kb = keys[j]!
        if (ka === kb) derivedSame.push({ a, b, productKey: ka })
        else derivedDifferent.push({ a, b, keys: [ka, kb] })
      }
    }
  }

  const inGroup = new Set(groups.flatMap((g) => g.objectIds))
  const residue = proposals.filter((p) => !inGroup.has(p.id) && !boundTo.has(p.id)).map((p) => p.id)

  return {
    zoneId: zoneIds.size === 1 ? [...zoneIds][0]! : null,
    proposals: proposals.length,
    bound: bound.length,
    derivedSame,
    derivedDifferent,
    candidates,
    residue,
    note:
      bindings.length === 0
        ? `No bindings supplied, so nothing could be derived. Amendment 11's pass 2 — resolve a model ` +
          `number to a product — is unbuilt, so this is the PRE-binding state: every proposal is ` +
          `unbound and the derivation did not run. It is not a derivation that found nothing.`
        : `${bound.length} of ${proposals.length} proposals are bound to a resolved product. ` +
          `${groups.length - candidates.length} of ${groups.length} candidate groups were settled without a ` +
          `model call — ${derivedSame.length} same, ${derivedDifferent.length} different. ` +
          `${candidates.length} groups and ${residue.length} loose objects remain, and that remainder ` +
          `decides whether stage 2 is worth building.`,
  }
}

/**
 * Group proposals that might be one thing, strongest signal first.
 *
 * Runs over **every** proposal, bound or not — a group is a question, and
 * whether the bindings can answer it is decided afterwards.
 */
function groupBySignal(proposals: readonly Proposal[]): Candidate[] {
  const groups: Candidate[] = []
  const grouped = new Set<string>()

  const addGroup = (zoneId: string, ids: string[], signal: Candidate['signal'], detail: string): void => {
    if (ids.length < 2) return
    groups.push({ zoneId, objectIds: ids, signal, detail })
    for (const id of ids) grouped.add(id)
  }

  // Each object is claimed once. A pair sharing a photograph does not also need
  // reporting as sharing a class — the same pair twice under two headings is two
  // rows for one question.
  const byPhoto = new Map<string, Proposal[]>()
  for (const p of proposals) {
    for (const m of p.mediaIds) {
      if (!byPhoto.has(m)) byPhoto.set(m, [])
      byPhoto.get(m)!.push(p)
    }
  }
  for (const [mediaId, sharing] of byPhoto) {
    const fresh = sharing.filter((p) => !grouped.has(p.id))
    if (fresh.length > 1) {
      addGroup(fresh[0]!.zoneId, fresh.map((p) => p.id), 'shared-photograph', `all cite ${mediaId}`)
    }
  }

  const byClass = new Map<string, Proposal[]>()
  for (const p of proposals) {
    if (p.classId === null || grouped.has(p.id)) continue
    const key = `${p.zoneId} ${p.classId}`
    if (!byClass.has(key)) byClass.set(key, [])
    byClass.get(key)!.push(p)
  }
  for (const [key, sharing] of byClass) {
    addGroup(sharing[0]!.zoneId, sharing.map((p) => p.id), 'shared-class', `all proposed as ${key.split(' ')[1]}`)
  }

  const left = proposals.filter((p) => !grouped.has(p.id))
  for (let i = 0; i < left.length; i++) {
    for (let j = i + 1; j < left.length; j++) {
      const a = left[i]!
      const b = left[j]!
      if (a.zoneId !== b.zoneId || grouped.has(a.id) || grouped.has(b.id)) continue
      const shared = shareWords(a.label, b.label)
      if (shared.length > 0) {
        addGroup(a.zoneId, [a.id, b.id], 'shared-label-words', `both mention ${shared.join(', ')}`)
      }
    }
  }

  return groups
}

// ------------------------------------------------------------- reading rows

/**
 * Every proposed object of one import, with its evidence.
 *
 * ⚑ **`scope` is required, and that is the point of it.** `objects` holds two
 * passes' answers to the same question, so *which pass* is a decision every
 * caller has to make — and an optional parameter is a decision most callers make
 * by not noticing. `scripts/compare.ts` read this function for a fortnight and
 * measured a residue across both passes, which is a number naming neither.
 *
 * The blend happens in memory here, where no amount of scanning the SQL can see
 * it. **The typechecker is the only mechanism that reaches it**, which is why
 * this is an argument rather than a convention. See `lanes.ts`.
 *
 * `every-pass` is legitimate — the score and the fixture writer both take it —
 * and it is a promise to split downstream, not a synonym for "all of them".
 */
export function proposalsForImport(
  db: Db,
  importId: string,
  scope: LaneScope,
  zoneId?: string,
): Proposal[] {
  const rows = db
    .prepare(
      `SELECT o.id, o.zone_id AS zoneId, o.class_id AS classId, o.label, o.derived_from AS derivedFrom, o.model_read AS modelRead, o.generation_id AS generationId
         FROM objects o
        WHERE o.import_id = ? AND ${laneClause(scope, 'o')}${zoneId ? ' AND o.zone_id = ?' : ''}
        ORDER BY o.zone_id, o.label`,
    )
    .all(...(zoneId ? [importId, zoneId] : [importId])) as {
    id: string
    zoneId: string
    classId: string | null
    label: string
    derivedFrom: string | null
    modelRead: string | null
    generationId: string | null
  }[]

  const media = db.prepare('SELECT media_id AS mediaId FROM object_media WHERE object_id = ?')
  return rows.map((r) => ({
    ...r,
    mediaIds: (media.all(r.id) as { mediaId: string }[]).map((m) => m.mediaId),
  }))
}
