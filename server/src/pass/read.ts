/**
 * The fresh pass, read model.
 *
 * Spec §1: this screen is a walk, not a queue. Decisions surface where the
 * concierge arrives at them — in the room they belong to — because the thing
 * being raced is memory, and memory is organised by room. Everything here is
 * therefore assembled per zone, in the order the visit actually happened.
 *
 * Nothing in this file reads manifest JSON. It reads this repo's own tables, so
 * it does not know and cannot ask which manifest version produced them — which
 * is what makes v4 a new adapter rather than a rewrite of this screen.
 */

import type { Db } from '../db/index.js'
import { resolutionKey } from '../overlay/fields.js'
import { entityKey, type EntityState } from '../overlay/model.js'
import { readVisitOverlays, visitState } from '../overlay/store.js'

const parse = <T,>(s: unknown, fallback: T): T => {
  if (typeof s !== 'string') return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

// --------------------------------------------------------------- the config
//
// Item wording and na-reason labels come from THIS import's own config
// snapshot, never from a list in this file. CLAUDE.md §5: the config decides,
// not the builder. A reason the field app added last week has a label here the
// day it arrives.

interface ConfigItem {
  id: string
  text?: string
  tier?: string
  satisfy?: string
}

export interface NaReason {
  id: string
  label?: string
  feedsGapList?: boolean
  recordsFinding?: boolean
}

export interface ConfigLookup {
  itemText: (id: string) => string | null
  itemTier: (id: string) => string | null
  reason: (id: string | null) => NaReason | null
  /**
   * The vocabularies the correction editors offer.
   *
   * Spec §5.2: what 2a corrects is "component types picked from a list". The
   * list is the config's, read per import — so a component type the field app
   * added last week is offerable the day it arrives, and one it removed stops
   * being offered without anyone editing this repo.
   */
  componentTypes: string[]
  naReasons: NaReason[]
}

export function configLookup(db: Db, importId: string): ConfigLookup {
  const row = db.prepare('SELECT snapshot FROM config_snapshots WHERE import_id = ?').get(importId) as
    | { snapshot: string }
    | undefined
  const snapshot = parse<Record<string, unknown>>(row?.snapshot, {})

  // Items live in four places in the config. Walking all of them keeps the
  // lookup honest when the field app moves an item between lists.
  const items = new Map<string, ConfigItem>()
  const collect = (list: unknown) => {
    if (!Array.isArray(list)) return
    for (const entry of list as Record<string, unknown>[]) {
      if (Array.isArray(entry?.items)) {
        for (const item of entry.items as ConfigItem[]) if (item?.id) items.set(item.id, item)
      } else if ((entry as unknown as ConfigItem)?.id) {
        const item = entry as unknown as ConfigItem
        items.set(item.id, item)
      }
    }
  }
  collect(snapshot.baseLists)
  collect(snapshot.zoneLists)
  collect(snapshot.componentLists)
  collect(snapshot.sessionItems)

  const reasons = new Map<string, NaReason>()
  if (Array.isArray(snapshot.naReasons)) {
    for (const r of snapshot.naReasons as NaReason[]) if (r?.id) reasons.set(r.id, r)
  }

  const componentTypes = new Set<string>()
  if (Array.isArray(snapshot.componentLists)) {
    for (const entry of snapshot.componentLists as { types?: unknown }[]) {
      if (Array.isArray(entry?.types)) for (const t of entry.types as string[]) if (t) componentTypes.add(t)
    }
  }
  // Layer predicates name component types the lists may not — reading both means
  // the offered vocabulary is everything the config knows about.
  if (Array.isArray(snapshot.layers)) {
    for (const layer of snapshot.layers as { predicate?: { componentTypes?: unknown } }[]) {
      const types = layer?.predicate?.componentTypes
      if (Array.isArray(types)) for (const t of types as string[]) if (t) componentTypes.add(t)
    }
  }

  return {
    itemText: (id) => items.get(id)?.text ?? null,
    itemTier: (id) => items.get(id)?.tier ?? null,
    reason: (id) => (id === null ? null : (reasons.get(id) ?? null)),
    componentTypes: [...componentTypes].sort(),
    naReasons: [...reasons.values()],
  }
}

// ----------------------------------------------------------------- the shapes

export interface PassPin {
  pinId: string
  number: number | null
  typeKind: string | null
  componentType: string | null
  freeformLabel: string | null
  flag: string | null
  retiredAt: string | null
  /** Normalized 0–1 against the canvas image. Rendered directly as percentages. */
  anchors: { anchorId: string; canvasId: string | null; x: number | null; y: number | null }[]
  mediaIds: string[]
  notes: { noteId: string; text: string | null; at: string | null }[]
  /**
   * A live desk placement, if this pin was positioned at the desk.
   *
   * Kept separate from `anchors` rather than merged into it, which is the
   * structural half of "a desk placement must never be indistinguishable from a
   * field one" (spec §2, §8). Merging would make them the same shape and the
   * distinction would then depend on every consumer remembering to check a flag.
   */
  deskPlacement: {
    overlayId: string
    canvasId: string
    x: number
    y: number
    evidence: { kind: string; id: string } | null
    priorPosition: { canvasId?: string; x?: number; y?: number } | null
    at: string
  } | null
}

export interface PassCanvas {
  canvasId: string
  kind: string | null
  mediaId: string | null
  /** False when the manifest lists the image but the file is not on this machine. */
  imageAvailable: boolean
}

export interface PhotoTile {
  mediaId: string
  kind: string | null
  mime: string | null
  bytes: number | null
  capturedAt: string | null
  durationMs: number | null
  /** present | absent | failed_checksum — the tile says which, it never guesses. */
  fileStatus: string
  /**
   * Any desk decision about this photo — where it was attached, and the trail.
   *
   * Spec §5.3 says room photos are "browsable, attachable". Attachable needs
   * this: without the overlay state a tile cannot say it is already on pin 4,
   * and the concierge would have no way to see or undo an attachment they had
   * just made. Still never REQUIRED — leaving a photo with the room is a
   * finished state, and none of these appear in the decision count.
   */
  state: EntityState | null
}

/** Why an item is sitting in front of the concierge. An item can have several. */
export type DecisionReason =
  | 'typeless-pin'
  | 'pin-flagged-issue'
  | 'failed-check'
  | 'na'
  | 'inbox-unassigned'

export interface DecisionItem {
  key: string
  targetKind: string
  targetId: string
  reasons: DecisionReason[]
  headline: string
  /**
   * Whatever evidence belongs beside the decision — photos, notes, the reason.
   *
   * There is deliberately no `detail` summary field. It existed briefly and was
   * always a copy of something below it: a pin's notes rendered once as a
   * summary line and again as bullets, and a resolution's note rendered as body
   * text and again as "Field note". One fact, one place — a screen that says
   * the same sentence twice makes a reader look for the difference between
   * them.
   */
  pin?: PassPin
  photo?: PhotoTile
  resolution?: {
    itemId: string
    itemText: string | null
    kind: string | null
    via: string | null
    result: string | null
    note: string | null
    reasonId: string | null
    reasonLabel: string | null
    evidence: Record<string, unknown> | null
    scopeKind: string | null
    scopePinNumber: number | null
  }
  decided: boolean
  state: EntityState | null
}

export interface PassZone {
  zoneId: string
  type: string | null
  label: string | null
  level: string | null
  closedAt: string | null
  /** Position in the visit, from the event log — never alphabetical. */
  order: number
  canvases: PassCanvas[]
  pins: PassPin[]
  /** Pins with no anchor anywhere. Reported as a field task, never placed here. */
  unplacedPins: PassPin[]
  retiredPinCount: number
  decisions: DecisionItem[]
  roomPhotos: PhotoTile[]
  memory: EntityState | null
  /** Desk recordings for this room, with the assurance figures kept at capture. */
  memoryAudio: {
    id: string
    durationMs: number | null
    bytes: number | null
    peakLevel: number | null
    silent: boolean
    acknowledgedAt: string | null
    createdAt: string
  }[]
  opened: boolean
  openedAt: string | null
  openCount: number
  decisionsRemaining: number
}

export interface PassModel {
  visit: { id: string; kind: string; visitDate: string | null; propertyId: string }
  property: { id: string; label: string }
  import: { id: string; mediaMode: string; importedAt: string } | null
  pass: {
    id: string
    mode: string
    startedAt: string
    completedAt: string | null
    /** Non-null when it was closed with work still open — see migration 004. */
    completedWithOutstanding?: string[] | null
    /** Completions and reopenings, oldest first. Frozen; never rewritten. */
    history?: { type: string; at: string; outstanding: string[] | null; reason: string | null }[]
  } | null
  zones: PassZone[]
  /** Alarm coverage, termination reconcile — no zone. A final page after the last. */
  sessionItems: DecisionItem[]
  /** The config's own vocabularies, for the correction editors. Never a list here. */
  vocabulary: { componentTypes: string[]; naReasons: NaReason[] }
  progress: {
    zonesTotal: number
    zonesWalked: number
    decisionsTotal: number
    decisionsMade: number
    decisionsRemaining: number
    /** Every act written in this pass, including ones later taken back. */
    actsRecorded: number
    complete: boolean
    /** Each unmet completion condition, named. Empty when the pass is done. */
    outstanding: string[]
  }
}

// ------------------------------------------------------------------ assembly

export const latestImport = (db: Db, visitId: string) =>
  db
    .prepare('SELECT * FROM imports WHERE visit_id = ? ORDER BY imported_at DESC LIMIT 1')
    .get(visitId) as Record<string, unknown> | undefined

/**
 * Zone order, from the event log.
 *
 * Spec §5: "zones in visit order (derived from the event log, not alphabetical)".
 * The earliest event mentioning a zone is when the concierge first stood in it,
 * which is the order they will remember it in. A zone with no events at all
 * sorts last rather than being dropped.
 */
export function zoneOrder(db: Db, importId: string): Map<string, number> {
  const rows = db
    .prepare(
      `SELECT json_extract(payload, '$.zoneId') AS zone_id, MIN(seq) AS first_seq
         FROM events WHERE import_id = ? AND json_extract(payload, '$.zoneId') IS NOT NULL
        GROUP BY zone_id ORDER BY first_seq`,
    )
    .all(importId) as { zone_id: string; first_seq: number }[]
  return new Map(rows.map((r, i) => [r.zone_id, i]))
}

/**
 * The visit's zones in walking order, ids only.
 *
 * Cheap enough to call on every zone open, which is what the thumbnail warmer
 * needs: it warms the room being entered AND the one after it, so the few
 * seconds a cold room costs are paid while somebody is reading the room before
 * it. After zone one the wait disappears.
 */
export function orderedZoneIds(db: Db, visitId: string): string[] {
  const imp = latestImport(db, visitId)
  if (!imp) return []
  const importId = imp.id as string
  const order = zoneOrder(db, importId)
  return (db.prepare('SELECT zone_id, label FROM zones WHERE import_id = ?').all(importId) as {
    zone_id: string
    label: string | null
  }[])
    .map((z) => ({ ...z, at: order.get(z.zone_id) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => (a.at === b.at ? (a.label ?? '').localeCompare(b.label ?? '') : a.at - b.at))
    .map((z) => z.zone_id)
}

const photoTile = (
  m: Record<string, unknown>,
  states?: Map<string, EntityState>,
): PhotoTile => ({
  mediaId: m.media_id as string,
  kind: (m.kind as string) ?? null,
  mime: (m.mime as string) ?? null,
  bytes: (m.bytes as number) ?? null,
  capturedAt: (m.captured_at as string) ?? null,
  durationMs: (m.duration_ms as number) ?? null,
  fileStatus: m.file_status as string,
  state: states?.get(entityKey('media', m.media_id as string)) ?? null,
})

/** Everything the pass screen needs, for one visit. */
export function buildPass(db: Db, visitId: string): PassModel | null {
  const visit = db.prepare('SELECT * FROM visits WHERE id = ?').get(visitId) as
    | { id: string; property_id: string; kind: string; visit_date: string | null }
    | undefined
  if (!visit) return null

  const property = db.prepare('SELECT id, label FROM properties WHERE id = ?').get(visit.property_id) as {
    id: string
    label: string
  }
  const imp = latestImport(db, visitId)
  const passRow = db.prepare('SELECT * FROM passes WHERE visit_id = ?').get(visitId) as
    | {
        id: string; mode: string; started_at: string
        completed_at: string | null; completed_with_outstanding: string | null
      }
    | undefined

  const base: PassModel = {
    visit: { id: visit.id, kind: visit.kind, visitDate: visit.visit_date, propertyId: visit.property_id },
    property: { id: property.id, label: property.label },
    import: null,
    pass: passRow
      ? {
          id: passRow.id,
          mode: passRow.mode,
          startedAt: passRow.started_at,
          completedAt: passRow.completed_at,
          completedWithOutstanding: parse<string[] | null>(passRow.completed_with_outstanding, null),
          history: (
            db
              .prepare('SELECT type, at, outstanding, reason FROM pass_events WHERE pass_id = ? ORDER BY id')
              .all(passRow.id) as {
              type: string; at: string; outstanding: string | null; reason: string | null
            }[]
          ).map((e) => ({ ...e, outstanding: parse<string[] | null>(e.outstanding, null) })),
        }
      : null,
    zones: [],
    sessionItems: [],
    vocabulary: { componentTypes: [], naReasons: [] },
    progress: {
      zonesTotal: 0, zonesWalked: 0, decisionsTotal: 0, decisionsMade: 0,
      decisionsRemaining: 0, actsRecorded: 0, complete: false, outstanding: [],
    },
  }

  // A visit with no import yet is a real state, not an error: the pass simply
  // has nothing to walk.
  if (!imp) return base
  const importId = imp.id as string
  base.import = {
    id: importId,
    mediaMode: imp.media_mode as string,
    importedAt: imp.imported_at as string,
  }

  const config = configLookup(db, importId)
  const states = visitState(db, visitId)
  const order = zoneOrder(db, importId)

  // Desk recordings, matched to their room through the memory overlay that
  // introduced them — the file itself knows the visit, not the room.
  const memoryAudioByZone = new Map<string, PassZone['memoryAudio']>()
  {
    const rows = db
      .prepare(
        `SELECT o.target_id AS zone_id, d.id, d.duration_ms, d.bytes, d.peak_level, d.silent,
                d.acknowledged_at, d.created_at
           FROM overlays o
           JOIN desk_media d ON d.id = json_extract(o.new_value, '$.deskMediaId')
          WHERE o.visit_id = ? AND o.kind = 'memory' AND o.field = 'audio'
            AND NOT EXISTS (SELECT 1 FROM overlays s WHERE s.supersedes_id = o.id)
          ORDER BY d.created_at`,
      )
      .all(visitId) as {
      zone_id: string; id: string; duration_ms: number | null; bytes: number | null
      peak_level: number | null; silent: number; acknowledged_at: string | null; created_at: string
    }[]
    for (const r of rows) {
      const list = memoryAudioByZone.get(r.zone_id) ?? []
      list.push({
        id: r.id,
        durationMs: r.duration_ms,
        bytes: r.bytes,
        peakLevel: r.peak_level,
        silent: r.silent === 1,
        acknowledgedAt: r.acknowledged_at,
        createdAt: r.created_at,
      })
      memoryAudioByZone.set(r.zone_id, list)
    }
  }

  const opens = db
    .prepare(
      `SELECT zone_id, MIN(at) AS first_at, COUNT(*) AS n FROM pass_zone_opens
        WHERE pass_id = ? GROUP BY zone_id`,
    )
    .all(passRow?.id ?? '') as { zone_id: string; first_at: string; n: number }[]
  const openedByZone = new Map(opens.map((o) => [o.zone_id, o]))

  // ------------------------------------------------------------------- pins
  const pinRows = db
    .prepare('SELECT * FROM pins WHERE import_id = ? ORDER BY number')
    .all(importId) as Record<string, unknown>[]
  const anchorRows = db
    .prepare('SELECT * FROM anchors WHERE import_id = ?')
    .all(importId) as Record<string, unknown>[]
  const noteRows = db
    .prepare('SELECT * FROM notes WHERE import_id = ?')
    .all(importId) as Record<string, unknown>[]

  const anchorsByPin = new Map<string, PassPin['anchors']>()
  for (const a of anchorRows) {
    const pinId = a.pin_id as string
    const list = anchorsByPin.get(pinId) ?? []
    list.push({
      anchorId: a.anchor_id as string,
      canvasId: (a.canvas_id as string) ?? null,
      x: (a.x as number) ?? null,
      y: (a.y as number) ?? null,
    })
    anchorsByPin.set(pinId, list)
  }

  const notesByTarget = new Map<string, PassPin['notes']>()
  for (const n of noteRows) {
    const targetId = (n.target_id as string) ?? ''
    const list = notesByTarget.get(targetId) ?? []
    list.push({ noteId: n.note_id as string, text: (n.text as string) ?? null, at: (n.at as string) ?? null })
    notesByTarget.set(targetId, list)
  }

  // Live `place` overlays, by pin. One query for the visit rather than one per
  // pin — a baseline can carry a few hundred.
  const placementByPin = new Map<string, PassPin['deskPlacement']>()
  for (const o of readVisitOverlays(db, visitId)) {
    if (o.kind !== 'place' || o.targetKind !== 'pin') continue
    const state = states.get(entityKey('pin', o.targetId))
    const live = state?.trail.find((t) => t.live && t.overlay.id === o.id)
    if (!live) continue
    const v = o.newValue as { canvasId?: string; x?: number; y?: number; evidence?: { kind: string; id: string } }
    if (!v?.canvasId || typeof v.x !== 'number' || typeof v.y !== 'number') continue
    placementByPin.set(o.targetId, {
      overlayId: o.id,
      canvasId: v.canvasId,
      x: v.x,
      y: v.y,
      evidence: v.evidence ?? null,
      priorPosition: (o.priorValue as { canvasId?: string; x?: number; y?: number } | null) ?? null,
      at: o.createdAt,
    })
  }

  const toPin = (p: Record<string, unknown>): PassPin => ({
    pinId: p.pin_id as string,
    number: (p.number as number) ?? null,
    typeKind: (p.type_kind as string) ?? null,
    componentType: (p.component_type as string) ?? null,
    freeformLabel: (p.freeform_label as string) ?? null,
    flag: (p.flag as string) ?? null,
    retiredAt: (p.retired_at as string) ?? null,
    anchors: anchorsByPin.get(p.pin_id as string) ?? [],
    mediaIds: parse<string[]>(p.media_ids, []),
    notes: notesByTarget.get(p.pin_id as string) ?? [],
    deskPlacement: placementByPin.get(p.pin_id as string) ?? null,
  })

  const pinsById = new Map(pinRows.map((p) => [p.pin_id as string, toPin(p)]))

  // ------------------------------------------------------------ resolutions
  const resolutionRows = db
    .prepare('SELECT * FROM resolutions WHERE import_id = ?')
    .all(importId) as Record<string, unknown>[]

  // --------------------------------------------------------------- the zones
  const zoneRows = db
    .prepare('SELECT * FROM zones WHERE import_id = ?')
    .all(importId) as Record<string, unknown>[]

  const zones: PassZone[] = zoneRows
    .map((z) => {
      const zoneId = z.zone_id as string
      const zonePins = [...pinsById.values()].filter(
        (p) => pinRows.find((r) => r.pin_id === p.pinId)?.zone_id === zoneId,
      )
      const livePins = zonePins.filter((p) => !p.retiredAt)

      const canvases = (
        db
          .prepare('SELECT * FROM canvases WHERE import_id = ? AND zone_id = ? AND retired = 0')
          .all(importId, zoneId) as Record<string, unknown>[]
      ).map((c): PassCanvas => {
        const mediaId = (c.media_id as string) ?? null
        const media = mediaId
          ? (db
              .prepare('SELECT file_status FROM media WHERE import_id = ? AND media_id = ?')
              .get(importId, mediaId) as { file_status: string } | undefined)
          : undefined
        return {
          canvasId: c.canvas_id as string,
          kind: (c.kind as string) ?? null,
          mediaId,
          imageAvailable: media?.file_status === 'present',
        }
      })

      const roomPhotos = (
        db
          .prepare(
            `SELECT * FROM media WHERE import_id = ? AND owner_kind = 'zone' AND owner_zone_id = ?
              ORDER BY captured_at`,
          )
          .all(importId, zoneId) as Record<string, unknown>[]
      ).map((m) => photoTile(m, states))

      const decisions = collectDecisions({
        db, importId, visitId, zoneId, config, states, pinsById, pinRows, resolutionRows, livePins,
      })

      const opened = openedByZone.get(zoneId)
      return {
        zoneId,
        type: (z.type as string) ?? null,
        label: (z.label as string) ?? null,
        level: (z.level as string) ?? null,
        closedAt: (z.closed_at as string) ?? null,
        order: order.get(zoneId) ?? Number.MAX_SAFE_INTEGER,
        canvases,
        pins: livePins,
        // Pins with no position at all — neither a field anchor nor a desk
        // placement. Spec §2 (revised): these are the ones that genuinely
        // cannot be positioned from evidence and carry to the next visit.
        unplacedPins: livePins.filter((p) => p.anchors.length === 0 && !p.deskPlacement),
        retiredPinCount: zonePins.length - livePins.length,
        decisions,
        roomPhotos,
        memory: states.get(entityKey('zone', zoneId)) ?? null,
        memoryAudio: memoryAudioByZone.get(zoneId) ?? [],
        opened: Boolean(opened),
        openedAt: opened?.first_at ?? null,
        openCount: opened?.n ?? 0,
        decisionsRemaining: decisions.filter((d) => !d.decided).length,
      }
    })
    .sort((a, b) => (a.order === b.order ? (a.label ?? '').localeCompare(b.label ?? '') : a.order - b.order))

  // ------------------------------------------------------- session-scoped items
  const sessionItems = resolutionRows
    .filter((r) => r.scope_kind === 'session')
    .map((r) => resolutionDecision(r, config, states, null))
    .filter((d): d is DecisionItem => d !== null)

  // --------------------------------------------------------------- progress
  const allDecisions = [...zones.flatMap((z) => z.decisions), ...sessionItems]
  const made = allDecisions.filter((d) => d.decided).length
  const zonesWalked = zones.filter((z) => z.opened).length
  const actsRecorded = (
    db.prepare("SELECT COUNT(*) AS n FROM overlays WHERE visit_id = ? AND kind != 'undo'").get(visitId) as {
      n: number
    }
  ).n

  // Spec §6, named one by one, and phrased the way somebody would say it out
  // loud. A single "not complete" tells the concierge nothing about what to do
  // next, and this hour is too expensive to spend hunting for the one item
  // holding it open — so the sentence carries the count AND where to look.
  const outstanding: string[] = []
  const remaining = allDecisions.length - made
  if (remaining > 0) {
    const roomsWithWork = zones.filter((z) => z.decisionsRemaining > 0).length
    const sessionLeft = sessionItems.filter((d) => !d.decided).length
    const where =
      roomsWithWork > 0
        ? ` in ${roomsWithWork} room${roomsWithWork === 1 ? '' : 's'}${sessionLeft > 0 ? ' and the visit page' : ''}`
        : ' on the visit page'
    outstanding.push(`${remaining} decision${remaining === 1 ? '' : 's'} still open${where}`)
  }

  const unwalked = zones.filter((z) => !z.opened)
  if (unwalked.length > 0) {
    // Named, not counted. "2 rooms not opened" makes you go and find them.
    const names = unwalked.map((z) => z.label ?? 'unnamed room')
    const shown = names.slice(0, 3).join(', ')
    outstanding.push(
      `${names.length} room${names.length === 1 ? '' : 's'} not opened yet: ${shown}` +
        (names.length > 3 ? `, and ${names.length - 3} more` : ''),
    )
  }

  base.zones = zones
  base.sessionItems = sessionItems
  base.vocabulary = { componentTypes: config.componentTypes, naReasons: config.naReasons }
  base.progress = {
    zonesTotal: zones.length,
    zonesWalked,
    decisionsTotal: allDecisions.length,
    decisionsMade: made,
    decisionsRemaining: remaining,
    actsRecorded,
    complete: outstanding.length === 0,
    outstanding,
  }
  return base
}

// --------------------------------------------------------------- decisions

interface CollectArgs {
  db: Db
  importId: string
  visitId: string
  zoneId: string
  config: ConfigLookup
  states: Map<string, EntityState>
  pinsById: Map<string, PassPin>
  pinRows: Record<string, unknown>[]
  resolutionRows: Record<string, unknown>[]
  livePins: PassPin[]
}

/**
 * What needs deciding in this room, in context rather than batched.
 *
 * One entry per ENTITY, not per reason. In the reference export pin 10 is
 * typeless and retired and unanchored at once; listing it three times would
 * treble the apparent workload and let the same pin be counted as three
 * decisions when it is one. Reasons accumulate onto a single row instead.
 */
function collectDecisions(args: CollectArgs): DecisionItem[] {
  const { db, importId, visitId, zoneId, config, states, resolutionRows, livePins } = args
  const byKey = new Map<string, DecisionItem>()

  const add = (item: DecisionItem) => {
    const existing = byKey.get(item.key)
    if (existing) {
      for (const r of item.reasons) if (!existing.reasons.includes(r)) existing.reasons.push(r)
      return
    }
    byKey.set(item.key, item)
  }

  const stateOf = (kind: string, id: string) => states.get(entityKey(kind, id)) ?? null
  const decidedBy = (kind: string, id: string) => Boolean(stateOf(kind, id)?.decision)

  // Typeless pins, and pins the field flagged as an issue. Retired pins are
  // excluded: asking someone to type a pin they deliberately retired is
  // busywork, and the zone reports the retired count separately so nothing
  // disappears quietly.
  for (const pin of livePins) {
    const reasons: DecisionReason[] = []
    if (!pin.typeKind) reasons.push('typeless-pin')
    if (pin.flag === 'issue') reasons.push('pin-flagged-issue')
    if (reasons.length === 0) continue

    const name = pin.componentType ?? pin.freeformLabel ?? 'never typed'
    add({
      key: entityKey('pin', pin.pinId),
      targetKind: 'pin',
      targetId: pin.pinId,
      reasons,
      headline: `Pin ${pin.number ?? '—'} · ${name}`,
      pin,
      decided: decidedBy('pin', pin.pinId),
      state: stateOf('pin', pin.pinId),
    })
  }

  // Failed checks and na items, for this zone and for the pins inside it.
  const pinIdsHere = new Set(livePins.map((p) => p.pinId))
  for (const r of resolutionRows) {
    const scope = r.scope_kind as string | null
    const belongsHere =
      (scope === 'zone' && r.scope_zone_id === zoneId) ||
      (scope === 'pin' && pinIdsHere.has(r.scope_pin_id as string))
    if (!belongsHere) continue

    const pinNumber =
      scope === 'pin' ? (args.pinsById.get(r.scope_pin_id as string)?.number ?? null) : null
    const item = resolutionDecision(r, config, states, pinNumber)
    if (item) add(item)
  }

  // Inbox items whose group names this zone.
  //
  // An inbox photo carries no owner by definition. Some carry a group key that
  // happens to name a zone, and those surface in that room; the rest have no
  // room to surface in and go to the session page at the end. The builder was
  // not there and will not guess which room a loose photo came from — inventing
  // one would be a fabrication with a plausible face on it.
  const inbox = db
    .prepare(
      `SELECT m.* FROM media m
         JOIN inbox_refs r ON r.import_id = m.import_id AND r.ref_kind = 'media' AND r.ref_id = m.media_id
        WHERE m.import_id = ? AND m.group_key = ?`,
    )
    .all(importId, zoneId) as Record<string, unknown>[]

  for (const m of inbox) {
    const mediaId = m.media_id as string
    add({
      key: entityKey('media', mediaId),
      targetKind: 'media',
      targetId: mediaId,
      reasons: ['inbox-unassigned'],
      headline: 'Loose photo, not attached to anything',
      photo: photoTile(m, states),
      decided: decidedBy('media', mediaId),
      state: stateOf('media', mediaId),
    })
  }

  void visitId
  return [...byKey.values()]
}

/**
 * A failed check or an na item as a decision.
 *
 * Both go in front of the concierge and neither is a "problem" by default —
 * `records_finding` covers failed checks AND confirmed absences, and CLAUDE.md
 * §5 is explicit that rendering the two under one heading that implies trouble
 * is the mistake. So the headline states what happened and nothing more.
 */
function resolutionDecision(
  r: Record<string, unknown>,
  config: ConfigLookup,
  states: Map<string, EntityState>,
  pinNumber: number | null,
): DecisionItem | null {
  const kind = (r.kind as string) ?? null
  const result = (r.result as string) ?? null
  const isFailed = result === 'fail'
  const isNa = kind === 'na'
  // Only these two need acknowledging. A plain satisfied check is already
  // resolved and putting it in the queue would bury the two that are not.
  if (!isFailed && !isNa) return null

  const key = resolutionKey({
    scope_kind: (r.scope_kind as string) ?? null,
    scope_zone_id: (r.scope_zone_id as string) ?? null,
    scope_pin_id: (r.scope_pin_id as string) ?? null,
    item_id: r.item_id as string,
  })
  const state = states.get(entityKey('resolution', key)) ?? null
  const reasonId = (r.reason_id as string) ?? null
  const reason = config.reason(reasonId)
  const itemId = r.item_id as string

  return {
    key: entityKey('resolution', key),
    targetKind: 'resolution',
    targetId: key,
    reasons: [isFailed ? 'failed-check' : 'na'],
    headline: config.itemText(itemId) ?? itemId,
    resolution: {
      itemId,
      itemText: config.itemText(itemId),
      kind,
      via: (r.via as string) ?? null,
      result,
      note: (r.note as string) ?? null,
      reasonId,
      reasonLabel: reason?.label ?? null,
      evidence: parse<Record<string, unknown> | null>(r.evidence, null),
      scopeKind: (r.scope_kind as string) ?? null,
      scopePinNumber: pinNumber,
    },
    decided: Boolean(state?.decision),
    state,
  }
}
