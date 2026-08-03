/**
 * Reading an import into the assembly's inputs.
 *
 * The only part of the engine's send side that touches the database. `assembly`
 * itself stays pure so it can be tested against handwritten rows; this module is
 * the thin thing that gets real rows into that shape.
 *
 * RESOLVE THE ZONE FROM `owner`, NEVER FROM THE PATH (Amendment 2 §B).
 *
 * The first version of this module grouped media on the export's `group` key,
 * which follows the zone *directory*. It produced the right per-zone numbers on
 * the walk, and it was wrong anyway — the contract stores a pin's media under its
 * zone's directory, so the two agree by coincidence rather than by construction.
 *
 * **The coincidence breaks exactly where it matters.** A pin with no zone (the
 * reference export carries four) has media under no zone directory. Inbox media
 * lives under `media/_misc/`. And any future change to the export's storage
 * layout would silently change what a model is shown — a storage decision
 * reaching into the pass's input without anyone deciding it should.
 *
 * Rule 4's fourth instance here, and the first where the wrong method produced
 * the right answer, which is the version hardest to catch: nothing was failing,
 * so nothing drew attention to it.
 *
 * EVERYTHING THAT RESOLVES TO THE ZONE GOES IN, BY ANY OWNER (Amendment 2 §A).
 *
 * Zone-owned, pin-owned via the pin's zone, canvas-owned via the canvas's zone.
 * **A pin is more identification signal, not less** — a concierge who pinned
 * something said *this specific thing matters*, which is a stronger statement
 * about a photograph than the absence of a pin. Ownership travels as evidence on
 * the row and is never a filter.
 *
 * Canvas media goes in as room context rather than as a subject, so a floorplan
 * sketch cannot come back as a proposed object called *a drawing of a room*.
 */

import type { Db } from '../db/index.js'
import {
  assembleZone,
  type AssemblyMedia,
  type AssemblyOptions,
  type MediaRole,
  type ZoneAssembly,
} from './assembly.js'

interface ZoneRow {
  zone_id: string
  label: string | null
}

interface MediaRow {
  media_id: string
  kind: string | null
  mime: string | null
  bytes: number | null
  file_status: string
  file: string | null
  captured_at: string | null
  owner_kind: string | null
  owner_zone_id: string | null
  owner_pin_id: string | null
  owner_canvas_id: string | null
}

/** A capture with no room. Real, and not the same thing as missing. */
export interface Unassigned {
  mediaId: string
  ownerKind: string | null
  /**
   * Why no zone could be resolved — an unanchored pin, an owner the import has
   * no row for, an inbox item, or an owner kind nobody has met.
   */
  reason: string
}

export interface ImportAssembly {
  importId: string
  zones: ZoneAssembly[]
  /**
   * How each media row arrived, by owner kind. **A census, not an exclusion** —
   * every one of these owners now reaches the pass.
   *
   * Kept on every run for a reason that outlives the ownership ruling
   * (Amendment 2 §C): under Baseline Process v2.1 §4.2 there is no pinning in
   * the room, so a true capture-first export should be almost entirely
   * zone-owned. **A large pin-owned count means the field workflow is not what
   * the process says it is** — a signal about the service, not about the import.
   */
  byOwnerKind: { ownerKind: string; count: number }[]
  /**
   * Captures that resolve to no zone. Surfaced, never dropped and never folded
   * into `unavailable` — an orphan-pin photograph is unassigned rather than
   * missing, and the two want different actions from a person.
   */
  unassigned: Unassigned[]
}

/** Where a media row belongs, and what it is doing there. */
interface Resolution {
  zoneId: string | null
  role: MediaRole
  pinId: string | null
  reason: string
}

/**
 * Every zone in an import, with the calls its media would produce.
 *
 * Zones with no media still appear, carrying an empty batch list. A zone that
 * was created and never captured is a real thing rather than an error, and it
 * has to be visible as such — Amendment §E turns on being able to tell it from a
 * zone whose photographs simply have not been loaded yet.
 */
export function assembleImport(
  db: Db,
  importId: string,
  options: AssemblyOptions = {},
): ImportAssembly {
  const zones = db
    .prepare('SELECT zone_id, label FROM zones WHERE import_id = ? ORDER BY id')
    .all(importId) as ZoneRow[]

  const media = db
    .prepare(
      `SELECT media_id, kind, mime, bytes, file_status, file, captured_at,
              owner_kind, owner_zone_id, owner_pin_id, owner_canvas_id
         FROM media WHERE import_id = ? ORDER BY id`,
    )
    .all(importId) as MediaRow[]

  // The producer declared ownership; these maps are how it is honoured rather
  // than re-derived. A pin's zone may be null — an unanchored pin is valid.
  const pinZone = new Map<string, string | null>()
  for (const p of db
    .prepare('SELECT pin_id, zone_id FROM pins WHERE import_id = ?')
    .all(importId) as { pin_id: string; zone_id: string | null }[]) {
    pinZone.set(p.pin_id, p.zone_id)
  }
  const canvasZone = new Map<string, string>()
  for (const c of db
    .prepare('SELECT canvas_id, zone_id FROM canvases WHERE import_id = ?')
    .all(importId) as { canvas_id: string; zone_id: string }[]) {
    canvasZone.set(c.canvas_id, c.zone_id)
  }
  const knownZones = new Set(zones.map((z) => z.zone_id))

  const byZone = new Map<string, AssemblyMedia[]>()
  const owners = new Map<string, number>()
  const unassigned: Unassigned[] = []

  for (const m of media) {
    owners.set(m.owner_kind ?? 'unowned', (owners.get(m.owner_kind ?? 'unowned') ?? 0) + 1)
    const r = resolve(m, pinZone, canvasZone, knownZones)
    if (r.zoneId === null) {
      unassigned.push({ mediaId: m.media_id, ownerKind: m.owner_kind, reason: r.reason })
      continue
    }
    const list = byZone.get(r.zoneId) ?? []
    list.push({
      mediaId: m.media_id,
      kind: m.kind,
      mime: m.mime,
      bytes: m.bytes,
      fileStatus: m.file_status,
      file: m.file,
      capturedAt: m.captured_at,
      role: r.role,
      ownerKind: m.owner_kind,
      ownerPinId: r.pinId,
    })
    byZone.set(r.zoneId, list)
  }

  return {
    importId,
    zones: zones.map((z) =>
      assembleZone({ zoneId: z.zone_id, label: z.label }, byZone.get(z.zone_id) ?? [], options),
    ),
    byOwnerKind: [...owners.entries()]
      .map(([ownerKind, count]) => ({ ownerKind, count }))
      .sort((a, b) => b.count - a.count || a.ownerKind.localeCompare(b.ownerKind)),
    unassigned,
  }
}

/**
 * Which zone a capture belongs to, from what the export declared.
 *
 * Fail open on the owner vocabulary: an owner kind nobody has met resolves to no
 * zone and is reported, rather than throwing or being guessed at from a path.
 */
function resolve(
  m: MediaRow,
  pinZone: Map<string, string | null>,
  canvasZone: Map<string, string>,
  knownZones: Set<string>,
): Resolution {
  const present = (zoneId: string | null | undefined, role: MediaRole, pinId: string | null, reason: string): Resolution =>
    zoneId != null && knownZones.has(zoneId)
      ? { zoneId, role, pinId, reason: 'resolved' }
      : { zoneId: null, role, pinId, reason }

  switch (m.owner_kind) {
    case 'zone':
      return present(m.owner_zone_id, 'subject', null, m.owner_zone_id === null ? 'zone-owner-has-no-zone' : 'zone-not-in-import')
    case 'pin': {
      if (m.owner_pin_id === null) return { zoneId: null, role: 'subject', pinId: null, reason: 'pin-owner-has-no-pin' }
      if (!pinZone.has(m.owner_pin_id)) {
        return { zoneId: null, role: 'subject', pinId: m.owner_pin_id, reason: 'pin-not-in-import' }
      }
      // An unanchored pin is valid and its media is a real capture with no room.
      const z = pinZone.get(m.owner_pin_id) ?? null
      return present(z, 'subject', m.owner_pin_id, z === null ? 'pin-is-unanchored' : 'zone-not-in-import')
    }
    case 'canvas': {
      if (m.owner_canvas_id === null) return { zoneId: null, role: 'context', pinId: null, reason: 'canvas-owner-has-no-canvas' }
      const z = canvasZone.get(m.owner_canvas_id)
      return present(z ?? null, 'context', null, z === undefined ? 'canvas-not-in-import' : 'zone-not-in-import')
    }
    default:
      // `inbox`, and anything the field app ships next. Preserved and counted.
      return { zoneId: null, role: 'subject', pinId: null, reason: `owner-kind-${m.owner_kind ?? 'absent'}` }
  }
}

/**
 * Every media row in the import is accounted for somewhere.
 *
 * The zones' own `receivedCount` plus the unassigned bucket must equal the
 * import's media total. Exported so the run record can report it rather than a
 * test being the only thing that ever checks.
 */
export function importReconciles(db: Db, a: ImportAssembly): boolean {
  const total = (
    db.prepare('SELECT COUNT(*) AS n FROM media WHERE import_id = ?').get(a.importId) as { n: number }
  ).n
  return a.zones.reduce((t, z) => t + z.receivedCount, 0) + a.unassigned.length === total
}
