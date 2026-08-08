/**
 * The identification pass — Increment 5 §3.
 *
 * **Batch by room, never by photograph.** The named failure is quoted because it
 * is both halves of the argument: *three hundred photographs asked one at a time
 * is three hundred calls, and it is also less accurate — the model sees
 * disconnected frames instead of a room.* One call per zone is five to ten on a
 * five-zone house.
 *
 * ---
 *
 * ## What is in this file, and what is deliberately not
 *
 * **Call assembly: which media, in what order, how many batches.** All of it is
 * decided here, and all of it is testable **with no API key and no photographs
 * on disk** — the walk fixture's 163 media rows are every one of them
 * `file_status: absent`, and that is enough to decide every question this module
 * answers. Only the *response* needs real bytes.
 *
 * That split is why this is worth its own module rather than living inside a
 * task: the expensive, hard-to-test part is the model call, and none of the
 * decisions above depend on it.
 *
 * ---
 *
 * ## A zone's media is not the media a zone owns
 *
 * Measured on the walk fixture, which is a real two-room export: **113 of 163
 * media are zone-owned, 38 are pin-owned and 12 are canvas-owned.** Taking only
 * `owner.kind = 'zone'` would hand the model 69% of the room and call it the
 * room.
 *
 * Every one of the other 50 reaches a zone by a declared route — a pin carries
 * its `zoneId`, a canvas belongs to a zone — and on this fixture **all 163
 * resolve, with none left over.** So the rule is *resolve, then group*, and a
 * media that resolves by no route is reported rather than dropped (doctrine 6).
 *
 * ## Media kind is open vocabulary and this module must not forget it
 *
 * The fixture already holds **157 photo, 4 video and 2 voice**. Video arrived
 * before anything downstream asked for it, which is exactly the case CLAUDE.md
 * warns about, and `voice` may yet be renamed to audio.
 *
 * **So nothing here switches on an exhaustive list.** A kind this module knows
 * to be a still image is sent; **every other kind is excluded WITH ITS KIND
 * NAMED**, never silently skipped. An unrecognised kind is a fact for the person
 * reading the run, not an error — and when video becomes usable input it is one
 * entry in a set rather than a rewrite.
 */

/** What a still-image call can currently be handed. Additive, never exhaustive. */
export const IMAGE_KINDS: readonly string[] = ['photo']

/**
 * Per-call ceiling.
 *
 * **One call per zone is the rule; this is the relief valve, not the unit.** The
 * fixture's mechanical room holds 55 photographs and a full baseline is expected
 * at 400–600, so a zone can exceed what one call should carry. Splitting a room
 * costs accuracy — the model sees part of a room — which is why the ceiling is
 * high enough that most zones never reach it.
 */
export const MAX_MEDIA_PER_CALL = 24

export interface MediaRow {
  mediaId: string
  kind: string | null
  ownerKind: string | null
  ownerZoneId: string | null
  ownerPinId: string | null
  ownerCanvasId: string | null
  /** Sort key, so a call sees a room in the order it was walked. */
  file: string | null
  /**
   * The capture note, where the concierge left one — Amendment 10 §D.
   *
   * **The mechanism was in the manifest and did not reach the call.** A
   * deliberately framed photograph carries no record of why it was framed, and
   * the injection-point shot failed for exactly that reason: it was framed on
   * purpose, and the purpose lived in the operator's head and nowhere in the
   * file. *The capture moment is the only time intent is free* — after that it
   * is reconstructed, and a reconstruction that fails is the reading document.
   */
  note?: string | null
}

/** Where a pin and a canvas each live, so their media can reach a zone. */
export interface ZoneRoutes {
  pinZone: ReadonlyMap<string, string>
  canvasZone: ReadonlyMap<string, string>
}

export interface ResolvedMedia extends MediaRow {
  zoneId: string
  /** How it got there — reported, because 'zone' and 'via pin' are different facts. */
  route: 'zone' | 'pin' | 'canvas'
}

export interface Unresolved {
  mediaId: string
  ownerKind: string | null
  why: string
}

/**
 * Attach every media to the zone it belongs to, by whichever route declares it.
 *
 * **Nothing is dropped.** A media that reaches no zone comes back in
 * `unresolved` with the reason, because a photograph the pass never saw is a
 * hole in an identification and the run must be able to say so.
 */
export function resolveToZones(
  media: readonly MediaRow[],
  routes: ZoneRoutes,
): { resolved: ResolvedMedia[]; unresolved: Unresolved[] } {
  const resolved: ResolvedMedia[] = []
  const unresolved: Unresolved[] = []

  for (const m of media) {
    if (m.ownerZoneId) {
      resolved.push({ ...m, zoneId: m.ownerZoneId, route: 'zone' })
      continue
    }
    if (m.ownerPinId) {
      const z = routes.pinZone.get(m.ownerPinId)
      if (z) {
        resolved.push({ ...m, zoneId: z, route: 'pin' })
        continue
      }
      unresolved.push({
        mediaId: m.mediaId,
        ownerKind: m.ownerKind,
        why: `owned by pin \`${m.ownerPinId}\`, which declares no zone. An unanchored pin is ordinary in a real export; its photographs still exist and this run did not see them.`,
      })
      continue
    }
    if (m.ownerCanvasId) {
      const z = routes.canvasZone.get(m.ownerCanvasId)
      if (z) {
        resolved.push({ ...m, zoneId: z, route: 'canvas' })
        continue
      }
      unresolved.push({
        mediaId: m.mediaId,
        ownerKind: m.ownerKind,
        why: `owned by canvas \`${m.ownerCanvasId}\`, which belongs to no zone in this import.`,
      })
      continue
    }
    unresolved.push({
      mediaId: m.mediaId,
      ownerKind: m.ownerKind,
      why: `owner kind \`${String(m.ownerKind)}\` reaches no zone. Inbox media is the ordinary case — it was captured before a room was open.`,
    })
  }
  return { resolved, unresolved }
}

export interface Batch {
  zoneId: string
  /** 1-based, and `of` is on every batch so a reader never has to count. */
  index: number
  of: number
  /**
   * The detail photographs — what was taken *within* the room. Counted against
   * the ceiling, split across batches when a room is too large for one call.
   */
  media: ResolvedMedia[]
  /**
   * The zone's canvas frames — Amendment 10 §B2.
   *
   * **On every batch, and outside the budget.** The defect this closes produced
   * the symptom that caused the amendment: a call that pulled 24 nameplates and
   * no room shot *produces a good parts list with no system in it*, which is
   * precisely what the first mechanical-room reading produced.
   *
   * **What may be concluded from these is narrower than from the rest**, and
   * §B is explicit about it: a canvas frame can establish that a thing is there
   * and that two things share a wall. **It cannot name a model, read a plate, or
   * assert a state.** They are a separate field rather than merged into `media`
   * so that the distinction survives into the call — merged, the caller would
   * have to remember it, and Amendment 10 exists because somebody did not.
   */
  context: ResolvedMedia[]
}

export interface ExcludedMedia {
  mediaId: string
  zoneId: string
  kind: string | null
  why: string
}

export interface CallPlan {
  batches: Batch[]
  /** Resolved to a zone, but not a still image. Named, never silently skipped. */
  excluded: ExcludedMedia[]
  unresolved: Unresolved[]
  /** Reads like a sentence, because a person checks this before paying for a run. */
  note: string
}

/**
 * Decide the calls for one import's media.
 *
 * **Zones with no usable media produce no batch and are not an error** — an
 * elevation photographed only on video is a real thing, and an empty call would
 * cost money to be told nothing.
 */
export function planIdentificationCalls(
  media: readonly MediaRow[],
  routes: ZoneRoutes,
  opts: { maxPerCall?: number } = {},
): CallPlan {
  const max = opts.maxPerCall ?? MAX_MEDIA_PER_CALL
  if (!Number.isInteger(max) || max < 1) {
    throw new Error(`maxPerCall must be a positive integer; got ${String(max)}`)
  }

  const { resolved, unresolved } = resolveToZones(media, routes)

  const excluded: ExcludedMedia[] = []
  const usable: ResolvedMedia[] = []
  for (const m of resolved) {
    if (m.kind !== null && IMAGE_KINDS.includes(m.kind)) {
      usable.push(m)
      continue
    }
    excluded.push({
      mediaId: m.mediaId,
      zoneId: m.zoneId,
      kind: m.kind,
      why:
        m.kind === null
          ? 'declares no kind, so nothing can be assumed about what it holds.'
          : `kind \`${m.kind}\` is not a still image this pass can send. Recorded rather than dropped — the vocabulary is open and this may become usable input without the file changing.`,
    })
  }

  // Stable order, so the same import plans the same calls every time and a
  // cached run can be compared against a fresh one. `file` carries the export's
  // own path; media id breaks ties and is always present.
  const inWalkOrder = (a: ResolvedMedia, b: ResolvedMedia): number =>
    (a.file ?? '').localeCompare(b.file ?? '') || a.mediaId.localeCompare(b.mediaId)

  // Two piles per zone, because Amendment 10 §B2 budgets them differently: the
  // detail photographs are what the ceiling counts, and the canvas frames ride
  // every batch outside it.
  const detail = new Map<string, ResolvedMedia[]>()
  const context = new Map<string, ResolvedMedia[]>()
  for (const m of usable) {
    const into = m.route === 'canvas' ? context : detail
    const list = into.get(m.zoneId)
    if (list) list.push(m)
    else into.set(m.zoneId, [m])
  }

  const zoneIds = new Set([...detail.keys(), ...context.keys()])
  const batches: Batch[] = []
  for (const zoneId of zoneIds) {
    const details = (detail.get(zoneId) ?? []).sort(inWalkOrder)
    const canvas = (context.get(zoneId) ?? []).sort(inWalkOrder)

    // A zone with canvas frames and nothing else still gets ONE call. What it
    // can answer is narrow — §B's *present, not identified* — but the honest
    // outcome of a room photographed only on its canvas is a gap, and a gap is
    // cheap to raise. Planning no call at all would make it silence instead.
    const of = Math.max(1, Math.ceil(details.length / max))
    for (let i = 0; i < of; i++) {
      batches.push({
        zoneId,
        index: i + 1,
        of,
        media: details.slice(i * max, (i + 1) * max),
        context: canvas,
      })
    }
  }
  batches.sort((a, b) => a.zoneId.localeCompare(b.zoneId) || a.index - b.index)

  const split = batches.filter((b) => b.of > 1).length
  const detailCount = usable.length - [...context.values()].reduce((n, l) => n + l.length, 0)
  const canvasSends = batches.reduce((n, b) => n + b.context.length, 0)
  const contextless = batches.filter((b) => b.context.length === 0).length

  return {
    batches,
    excluded,
    unresolved,
    note:
      batches.length === 0
        ? `No calls. ${media.length} media in, none of them a still image reaching a zone — ${excluded.length} excluded by kind, ${unresolved.length} reaching no zone. That is a state, not a pass.`
        : `${batches.length} calls over ${zoneIds.size} zones, ${detailCount} detail photographs. ` +
          `${canvasSends} canvas sends ride alongside them, outside the ceiling` +
          (contextless > 0
            ? ` — and ${contextless} of these calls carry no canvas frame at all, so they see parts and no room.`
            : '.') +
          ` ${excluded.length} excluded by kind, ${unresolved.length} reaching no zone` +
          (split > 0 ? `, ${split} calls from zones too large for one.` : '.'),
  }
}
