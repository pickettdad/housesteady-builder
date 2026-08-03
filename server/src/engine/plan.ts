/**
 * Reading an import into the assembly's inputs.
 *
 * The only part of the engine's send side that touches the database. `assembly`
 * itself stays pure so it can be tested against handwritten rows; this module is
 * the thin thing that gets real rows into that shape.
 *
 * ZONE-OWNED MEDIA ONLY — AND ON THE REAL WALK THAT IS A THIRD OF THE EXPORT.
 *
 * Under capture-first nothing is classified in the room: a photograph is taken
 * and no pin is placed. Zone-owned media is therefore exactly the material the
 * identification pass exists to read. Canvas images are the room's own floorplan
 * rather than a thing in it, and pin-owned media already carries a field-side
 * answer about what it shows. Neither belongs in a call asking *what things are
 * in this room*.
 *
 * **This is a reading of §3's "a zone's media", not a fact the spec states**, and
 * the walk shows it is not a small one. Of 163 rows, 113 are zone-owned, 38 are
 * pin-owned and 12 are canvas. Under this reading the kitchen contributes 9
 * photographs rather than 38, and **the entry contributes none at all** — every
 * file in it belongs to a pin. That walk ran Mode C, with some pinning on site;
 * a true capture-first visit would have almost everything zone-owned.
 *
 * The alternative reading — *every photograph captured in this room, whoever owns
 * it* — is defensible and would change the input by a third. It is flagged rather
 * than quietly chosen, and the breakdown below is reported so the decision stays
 * visible instead of becoming an assumption nobody can see.
 *
 * The exclusion is about ownership rather than kind, so it happens here rather
 * than in `CONSUMED_KINDS` — and it is counted, because a zone whose photographs
 * are all pin-owned would otherwise be indistinguishable from a zone nobody
 * photographed.
 */

import type { Db } from '../db/index.js'
import { assembleZone, type AssemblyMedia, type AssemblyOptions, type ZoneAssembly } from './assembly.js'

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
}

export interface ImportAssembly {
  importId: string
  zones: ZoneAssembly[]
  /**
   * Media the import holds that no zone assembly saw, because it is owned by a
   * pin, a canvas or an inbox rather than by a zone — broken out by owner kind,
   * because on the real walk this is a third of the export and the breakdown is
   * the thing that makes the ownership decision reviewable rather than buried.
   *
   * Counted so the run's arithmetic closes against the import's media total
   * rather than against the subset this pass happens to look at.
   */
  notZoneOwned: { ownerKind: string; count: number }[]
  /**
   * Media claiming a zone the import has no row for.
   *
   * The reference export already contains 28 photographs owned by a zone with
   * nothing pointing at them, so this is a shape real exports take rather than a
   * corruption. It cannot be assembled — there is no zone to describe — but it
   * must not vanish between the media count and the sum of the zones, which is
   * exactly the silent drop doctrine 6 forbids.
   */
  orphanedZoneMedia: { zoneId: string; count: number }[]
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
      `SELECT media_id, kind, mime, bytes, file_status, file, captured_at, owner_kind, owner_zone_id
         FROM media WHERE import_id = ? ORDER BY id`,
    )
    .all(importId) as (MediaRow & { owner_zone_id: string | null })[]

  const byZone = new Map<string, AssemblyMedia[]>()
  const otherOwners = new Map<string, number>()
  for (const m of media) {
    if (m.owner_kind !== 'zone' || m.owner_zone_id === null) {
      const k = m.owner_kind ?? 'unowned'
      otherOwners.set(k, (otherOwners.get(k) ?? 0) + 1)
      continue
    }
    const list = byZone.get(m.owner_zone_id) ?? []
    list.push({
      mediaId: m.media_id,
      kind: m.kind,
      mime: m.mime,
      bytes: m.bytes,
      fileStatus: m.file_status,
      file: m.file,
      capturedAt: m.captured_at,
    })
    byZone.set(m.owner_zone_id, list)
  }

  const known = new Set(zones.map((z) => z.zone_id))
  const orphanedZoneMedia = [...byZone.entries()]
    .filter(([zoneId]) => !known.has(zoneId))
    .map(([zoneId, list]) => ({ zoneId, count: list.length }))
    .sort((a, b) => b.count - a.count || a.zoneId.localeCompare(b.zoneId))

  return {
    importId,
    zones: zones.map((z) =>
      assembleZone({ zoneId: z.zone_id, label: z.label }, byZone.get(z.zone_id) ?? [], options),
    ),
    notZoneOwned: [...otherOwners.entries()]
      .map(([ownerKind, count]) => ({ ownerKind, count }))
      .sort((a, b) => b.count - a.count || a.ownerKind.localeCompare(b.ownerKind)),
    orphanedZoneMedia,
  }
}

/**
 * Every media row in the import is accounted for somewhere.
 *
 * The zones' own `receivedCount` plus the two escape hatches must equal the
 * import's media total. Exported so the run record can report it rather than a
 * test being the only thing that ever checks.
 */
export function importReconciles(db: Db, a: ImportAssembly): boolean {
  const total = (
    db.prepare('SELECT COUNT(*) AS n FROM media WHERE import_id = ?').get(a.importId) as { n: number }
  ).n
  const placed =
    a.zones.reduce((t, z) => t + z.receivedCount, 0) +
    a.notZoneOwned.reduce((t, o) => t + o.count, 0) +
    a.orphanedZoneMedia.reduce((t, o) => t + o.count, 0)
  return placed === total
}
