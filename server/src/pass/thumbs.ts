/**
 * Thumbnails — generated on demand, cached on disk.
 *
 * THE NUMBERS THAT DECIDED THIS. A baseline visit is 400–600 photos; an iPad
 * photo is 4032×3024 and around 4 MB. Measured on a worst-case image (photo
 * entropy, so nothing compresses away):
 *
 *   serving one zone of 40 photos full size ....... 402 MB over the wire
 *   serving the same zone as 400px thumbnails ..... 0.34 MB
 *   generating every thumbnail during import ...... ~59 s added to EVERY import
 *   generating one zone's worth on demand ......... ~3.9 s once, then free
 *
 * So thumbnails are not optional — 402 MB per room is the half-minute page. The
 * question is only when they are made, and the answer is on demand, for four
 * reasons:
 *
 * 1. IMPORT IS THE OPERATION THAT MUST NOT FAIL. It already moves 1.5–2 GB and
 *    checksums every file, and its doctrine is "media copied first, DB committed
 *    last". Adding a minute of image decoding to the slowest, highest-stakes
 *    operation in the system — and with it a new way to fail, on a photo that
 *    will not decode — buys page speed with the wrong currency.
 *
 * 2. THE CACHE IS DERIVED AND DISPOSABLE. It lives outside the visit directory,
 *    so nothing in it is evidence and deleting the whole thing is always safe.
 *    That matters in a directory that holds real people's houses: a derived file
 *    sitting beside the originals is a file someone will eventually mistake for
 *    one.
 *
 * 3. IT WORKS FOR IMPORTS THAT ALREADY EXIST. No backfill, no migration, and
 *    changing the thumbnail size later costs nothing but a cold cache.
 *
 * 4. VIDEO IS COMING (CLAUDE.md §5) and its thumbnail is a frame grab, not a
 *    resize. On demand keeps that a change to this one module instead of growing
 *    the import path a video dependency.
 *
 * The cost — a cold zone taking a few seconds — is paid once per zone actually
 * opened, and the screen hides it: the zone page asks for its thumbnails as soon
 * as it opens and the grid lazy-loads, so tiles are usually warm by the time
 * they are scrolled to.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import sharp from 'sharp'
import { absoluteFilePath } from '../media/paths.js'
import { dataRoot, type Db } from '../db/index.js'

/** Everything a caller needs to serve, or to explain why it cannot. */
export type MediaResolution =
  | { ok: true; path: string; mime: string }
  | { ok: false; reason: 'unknown' | 'absent' | 'quarantined' | 'not-an-image'; message: string }

export interface MediaRow {
  media_id: string
  property_id: string
  /** Null for a property-scoped artifact — §1j. */
  visit_id: string | null
  import_id: string
  kind: string | null
  mime: string | null
  file: string | null
  file_status: string
}

export const findMedia = (db: Db, visitId: string, mediaId: string): MediaRow | undefined =>
  db
    .prepare(
      `SELECT m.media_id, m.property_id, m.visit_id, m.import_id, m.kind, m.mime, m.file, m.file_status
         FROM media m JOIN imports i ON i.id = m.import_id
        WHERE m.visit_id = ? AND m.media_id = ? ORDER BY i.imported_at DESC LIMIT 1`,
    )
    .get(visitId, mediaId) as MediaRow | undefined

/** Where the import actually put this file. Relative in the DB, resolved here. */
export const originalPath = (m: MediaRow, root = dataRoot): string =>
  // §1j — the layout has two roots and `media/paths.ts` is the only thing that
  // knows which applies. A media row mirrors its import's visit, so a null one
  // here means a property-scoped artifact rather than an unresolved lookup.
  absoluteFilePath(
    { propertyId: m.property_id, visitId: m.visit_id ?? null, importId: m.import_id },
    m.file,
    root,
  )

/**
 * Resolve a media id to a servable original.
 *
 * A quarantined file is refused rather than served. The import moved it to
 * `media/_failed/` and said plainly that it "is not counted as evidence"; a
 * screen that renders it as an ordinary photo would quietly undo that, and
 * whoever looked at it would have no way to know they were looking at bytes the
 * export itself disowns.
 */
export function resolveOriginal(m: MediaRow | undefined, root = dataRoot): MediaResolution {
  if (!m) return { ok: false, reason: 'unknown', message: 'This visit has no such file.' }
  if (m.file_status === 'failed_checksum') {
    return {
      ok: false,
      reason: 'quarantined',
      message:
        'This file did not match the checksum the export declared for it. It has been kept, but it is not ' +
        'counted as evidence and is not shown as though it were.',
    }
  }
  if (m.file_status === 'absent' || !m.file) {
    return {
      ok: false,
      reason: 'absent',
      message: 'The export lists this file, but the file itself is not on this machine.',
    }
  }
  const path = originalPath(m, root)
  if (!existsSync(path)) {
    return { ok: false, reason: 'absent', message: 'The file is recorded but is not where the import put it.' }
  }
  return { ok: true, path, mime: m.mime ?? 'application/octet-stream' }
}

/**
 * Is this something we can make a picture of?
 *
 * Deliberately a mime check rather than a list of media kinds. `media.kind` is
 * open vocabulary — video is arriving and `voice` may be renamed — so switching
 * on it would be exactly the exhaustive-list mistake CLAUDE.md §5 warns about.
 * Asking "is this an image" answers the question actually being asked, and an
 * audio or video file simply gets no thumbnail rather than an error.
 */
const isImage = (m: MediaRow): boolean => (m.mime ?? '').startsWith('image/')

/** Widths the API will produce. A fixed set, so the cache cannot be a DoS. */
export const THUMB_WIDTHS = [400, 1200] as const
export type ThumbWidth = (typeof THUMB_WIDTHS)[number]

export const isThumbWidth = (n: number): n is ThumbWidth => (THUMB_WIDTHS as readonly number[]).includes(n)

/** Distinguishes concurrent writers within one process. */
let nextTmp = 0

/**
 * The cache lives OUTSIDE the visit directory, on purpose — see reason 2 above.
 * The path includes a hash of the original's location so a re-import to the same
 * ids cannot serve a stale picture.
 */
export function cachePath(m: MediaRow, width: number, root = dataRoot): string {
  // §1j — an artifact's media has no visit, so the cache is keyed on the import
  // instead. Falling back to the string "null" would put every artifact's
  // thumbnails for a property in one directory and let two of them collide.
  const scope = m.visit_id ?? m.import_id
  const key = createHash('sha256').update(`${scope}:${m.media_id}:${m.file}:${width}`).digest('hex').slice(0, 16)
  return join(root, '.cache', 'thumbs', m.property_id, scope, `${m.media_id}-w${width}-${key}.jpg`)
}

/**
 * Returns a path to a cached thumbnail, making it first if it does not exist.
 *
 * Never throws for a bad image. A photo that will not decode is reported as such
 * and the tile says so — one unreadable file must not take the zone page with
 * it, for the same reason one bad checksum does not fail an import.
 */
export async function thumbnail(
  m: MediaRow | undefined,
  width: ThumbWidth,
  root = dataRoot,
): Promise<MediaResolution> {
  const original = resolveOriginal(m, root)
  if (!original.ok) return original
  if (!isImage(m!)) {
    return {
      ok: false,
      reason: 'not-an-image',
      message: `A ${m!.kind ?? 'file'} has no thumbnail. The file itself is here and can be played or downloaded.`,
    }
  }

  const out = cachePath(m!, width, root)
  if (existsSync(out)) return { ok: true, path: out, mime: 'image/jpeg' }

  try {
    mkdirSync(dirname(out), { recursive: true })
    // Written to a temp name and renamed into place, because two requests for
    // the same thumbnail genuinely do race: opening a zone kicks off warmZone
    // in the background while the browser asks for the same tiles. Writing
    // straight to `out` lets a reader open a half-written file and get a
    // truncated image or a 404. rename() within one filesystem is atomic, so a
    // reader sees either no file or the whole file — never half of one.
    const tmp = `${out}.${process.pid}-${nextTmp++}.tmp`
    await sharp(original.path)
      // `inside` keeps the aspect ratio and never enlarges a photo that is
      // already smaller than the target.
      .resize(width, width, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 72 })
      .toFile(tmp)
    renameSync(tmp, out)
    return { ok: true, path: out, mime: 'image/jpeg' }
  } catch (e) {
    return {
      ok: false,
      reason: 'not-an-image',
      message: `This file is recorded as an image but could not be read as one: ${(e as Error).message}`,
    }
  }
}

/**
 * Make a zone's thumbnails ahead of being asked for them.
 *
 * Called when a zone page opens. Runs to completion in the background and its
 * result is never awaited by a request — the point is only that by the time
 * someone scrolls, most tiles are already cached.
 */
export async function warmZone(db: Db, visitId: string, zoneId: string, root = dataRoot): Promise<number> {
  const rows = db
    .prepare(
      `SELECT m.media_id, m.property_id, m.visit_id, m.kind, m.mime, m.file, m.file_status
         FROM media m JOIN imports i ON i.id = m.import_id
        WHERE m.visit_id = ? AND (m.owner_zone_id = ? OR m.group_key = ?) AND m.file_status = 'present'`,
    )
    .all(visitId, zoneId, zoneId) as MediaRow[]

  let made = 0
  for (const m of rows) {
    const r = await thumbnail(m, 400, root)
    if (r.ok) made++
  }
  return made
}
