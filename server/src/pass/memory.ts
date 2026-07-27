/**
 * Zone memory — what the concierge remembers about a room, recorded at the desk.
 *
 * Spec §4: an overlay of kind `memory` targeting the zone, carrying free text
 * and/or an audio file with `origin = desk`. The honesty label is **Observed**,
 * because the concierge did see the room; the provenance says `human-entered,
 * desk, from recall`, because that is when it got written down. The label
 * describes who perceived it and the provenance describes when — collapsing
 * those two would either overclaim (calling recall a fresh observation) or
 * underclaim (calling a real observation hearsay).
 *
 * RECORD, NEVER LIVE DICTATION. The audio is the evidence. Live speech-to-text
 * makes the recognizer's mistake *the record* with no original to fall back on,
 * and the person who could catch the mishearing has already moved on. So 2a
 * stores audio and plays it back; 2b derives a transcript from it, which is
 * provenance-tagged, surfaced for review, and correctable like any other value.
 * The audio is kept permanently even after transcription.
 */

import { createHash } from 'node:crypto'
import { mkdirSync, renameSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { dataRoot, newId, now, type Db } from '../db/index.js'
import { writeOverlay } from '../overlay/store.js'

/** Where desk captures live inside the visit — beside the field's, never mixed in. */
export const DESK_DIR = join('desk', 'memory')

export interface DeskMediaRow {
  id: string
  property_id: string
  visit_id: string
  kind: string
  origin: string
  file: string
  mime: string | null
  bytes: number | null
  sha256: string | null
  duration_ms: number | null
  peak_level: number | null
  silent: number
  acknowledged_at: string | null
  created_at: string
}

export interface SaveMemoryAudioArgs {
  db: Db
  propertyId: string
  visitId: string
  zoneId: string
  /** Where multer put the upload. Moved into the visit directory from here. */
  tempPath: string
  mime: string | null
  durationMs: number | null
  /**
   * Loudest sample the browser saw, 0–1.
   *
   * Measured at record time and kept, because a muted microphone produces a
   * file of exactly the right length full of near-silence — indistinguishable
   * from a good recording by size alone. This number is the only thing that
   * tells them apart, and it cannot be recovered later without decoding the
   * audio, so it is captured while it is free.
   */
  peakLevel: number | null
  dataDir?: string
}

/** Below this, a recording is treated as silence rather than quiet speech. */
export const SILENCE_PEAK = 0.02

export function saveMemoryAudio(args: SaveMemoryAudioArgs): { media: DeskMediaRow; overlayId: string } {
  const { db, propertyId, visitId, zoneId, tempPath, dataDir = dataRoot } = args

  const id = newId()
  const ext = (args.mime ?? '').includes('ogg') ? '.ogg' : (args.mime ?? '').includes('mp4') ? '.mp4' : '.webm'
  const relative = join(DESK_DIR, `${id}${ext}`)
  const dest = join(dataDir, 'properties', propertyId, 'visits', visitId, relative)
  mkdirSync(dirname(dest), { recursive: true })
  renameSync(tempPath, dest)

  const bytes = statSync(dest).size
  const sha256 = createHash('sha256').update(String(id)).digest('hex')

  // Silent OR empty. A zero-byte file and a file of silence are different
  // failures — a dead recorder and a muted microphone — and both are the same
  // outcome for the concierge: nothing was captured.
  const peak = args.peakLevel
  const silent = bytes === 0 || (peak !== null && peak < SILENCE_PEAK) ? 1 : 0

  db.prepare(
    `INSERT INTO desk_media
       (id, property_id, visit_id, kind, origin, file, mime, bytes, sha256, duration_ms,
        peak_level, silent, acknowledged_at, created_at)
     VALUES (?, ?, ?, 'audio', 'desk', ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
  ).run(id, propertyId, visitId, relative, args.mime, bytes, sha256, args.durationMs, peak, silent, now())

  // The overlay is what makes it part of the record. `field` separates text
  // from audio so a typed note and a spoken one can both stand for the same
  // room — §4 says "free text, and/or an audio file", and superseding one with
  // the other would quietly discard whichever came first.
  const overlay = writeOverlay({
    db,
    propertyId,
    visitId,
    kind: 'memory',
    targetKind: 'zone',
    targetId: zoneId,
    field: 'audio',
    newValue: { deskMediaId: id, durationMs: args.durationMs, bytes, peakLevel: peak, silent: silent === 1 },
    reason: 'human-entered, desk, from recall',
  })

  return { media: findDeskMedia(db, id)!, overlayId: overlay.id }
}

export const findDeskMedia = (db: Db, id: string): DeskMediaRow | undefined =>
  db.prepare('SELECT * FROM desk_media WHERE id = ?').get(id) as DeskMediaRow | undefined

export const deskMediaForVisit = (db: Db, visitId: string): DeskMediaRow[] =>
  db.prepare('SELECT * FROM desk_media WHERE visit_id = ? ORDER BY created_at').all(visitId) as DeskMediaRow[]

export const deskMediaPath = (m: DeskMediaRow, root = dataRoot): string =>
  join(root, 'properties', m.property_id, 'visits', m.visit_id, m.file)

/**
 * Recordings that are silent or empty and have not been acknowledged.
 *
 * This is the backstop from §5: the failure it guards against is walking the
 * whole pass and discovering afterwards that the microphone was muted.
 *
 * The ROOM comes back with each one, joined through the memory overlay that
 * introduced it. Without that the refusal says "a silent recording (3s)" and
 * sends the concierge hunting through nine rooms for it — the same fault as a
 * bare "not complete", and the same fix as naming the unopened rooms.
 */
export interface SilentRecording extends DeskMediaRow {
  zone_id: string | null
  zone_label: string | null
}

export const unacknowledgedSilent = (db: Db, visitId: string): SilentRecording[] =>
  db
    .prepare(
      `SELECT d.*, o.target_id AS zone_id, z.label AS zone_label
         FROM desk_media d
         LEFT JOIN overlays o
           ON o.visit_id = d.visit_id AND o.kind = 'memory' AND o.field = 'audio'
          AND json_extract(o.new_value, '$.deskMediaId') = d.id
         LEFT JOIN zones z ON z.zone_id = o.target_id AND z.visit_id = d.visit_id
        WHERE d.visit_id = ? AND d.acknowledged_at IS NULL
          AND (d.silent = 1 OR d.bytes IS NULL OR d.bytes = 0)
        GROUP BY d.id
        ORDER BY d.created_at`,
    )
    .all(visitId) as SilentRecording[]

/**
 * "I know it is silent, keep it anyway."
 *
 * A recorded act rather than an assumption — the pass cannot be completed while
 * one of these is outstanding, and "the concierge probably noticed" is not a
 * thing this software gets to assume.
 */
export function acknowledgeDeskMedia(db: Db, id: string): DeskMediaRow | undefined {
  db.prepare('UPDATE desk_media SET acknowledged_at = ? WHERE id = ? AND acknowledged_at IS NULL').run(now(), id)
  return findDeskMedia(db, id)
}
