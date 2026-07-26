import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { dirname, join, normalize, relative, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import yauzl from 'yauzl'
import type { CanonicalImport } from './adapters/canonical.js'
import { makeReport, type Check } from './validate.js'

/**
 * Media handling — copy the files, verify every one, and be honest about the
 * ones that did not make it.
 *
 * The doctrine here is `media copied first, DB committed last`. A file that
 * fails its checksum is quarantined rather than dropped: the bytes arrived, they
 * are just not the bytes the export says they are, and deleting them would
 * destroy the only evidence of what actually went wrong.
 *
 * "One bad checksum fails that file loudly and imports the rest."
 */

export type FileStatus = 'present' | 'absent' | 'failed_checksum'

export interface PlacedFile {
  status: FileStatus
  shaVerified: boolean
  bytesOnDisk: number | null
  /** What we actually computed, when it differs from what the export declared. */
  actualSha256?: string
}

export type PlacementMap = Map<string, PlacedFile>

/** Where quarantined files go. Inside the visit, so they travel with their import. */
export const FAILED_DIR = join('media', '_failed')

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(path), hash)
  return hash.digest('hex')
}

/**
 * Resolves a path from inside an archive against a destination directory,
 * refusing anything that would escape it.
 *
 * A zip entry is free to be named `../../../etc/passwd`. This is the guard
 * against that, and it applies to manifest-declared paths too — those also come
 * from outside this program.
 */
export function safeJoin(root: string, candidate: string): string | null {
  const target = resolve(root, normalize(candidate))
  const rel = relative(resolve(root), target)
  if (rel === '' || rel.startsWith('..') || rel.split(sep)[0] === '..') return null
  return target
}

/**
 * Extracts one zip into a directory, streaming entry by entry.
 *
 * Streaming rather than loading the archive: a baseline visit is 1.5–2 GB, and
 * reading that into memory to copy it out again is the difference between this
 * running on the owner's laptop and not.
 */
export function extractZip(zipPath: string, destDir: string): Promise<{ entries: number; skipped: string[] }> {
  return new Promise((resolvePromise, rejectPromise) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zip) => {
      if (err || !zip) return rejectPromise(err ?? new Error('Could not open archive.'))

      let entries = 0
      const skipped: string[] = []

      zip.on('error', rejectPromise)
      zip.on('end', () => resolvePromise({ entries, skipped }))

      zip.on('entry', (entry) => {
        // Directory entries end with a slash; nothing to write.
        if (entry.fileName.endsWith('/')) return zip.readEntry()

        const target = safeJoin(destDir, entry.fileName)
        if (target === null) {
          // Refusing to write outside the destination is not negotiable, and the
          // attempt is worth surfacing rather than silently ignoring.
          skipped.push(entry.fileName)
          return zip.readEntry()
        }

        zip.openReadStream(entry, (streamErr, readStream) => {
          if (streamErr || !readStream) return rejectPromise(streamErr ?? new Error('Could not read entry.'))
          mkdirSync(dirname(target), { recursive: true })
          const out = createWriteStream(target)
          readStream.pipe(out)
          out.on('finish', () => {
            entries++
            zip.readEntry()
          })
          out.on('error', rejectPromise)
        })
      })

      zip.readEntry()
    })
  })
}

export interface PlaceMediaArgs {
  canonical: CanonicalImport
  /** Where the extracted archives were written. */
  stagingDir: string
  /** The visit's own directory — files land at the export's relative paths under it. */
  visitDir: string
}

/**
 * Walks every media record, finds its file, verifies it, and puts it where it
 * belongs. Returns one entry per media id, plus the checks worth reporting.
 *
 * Nothing here throws on a bad file. A corrupt photo is a fact about the import,
 * not a reason to lose the other four hundred.
 */
export async function placeMedia(args: PlaceMediaArgs): Promise<{ placement: PlacementMap; checks: Check[] }> {
  const { canonical, stagingDir, visitDir } = args
  const { checks, add } = makeReport()
  const placement: PlacementMap = new Map()

  const missing: string[] = []
  const failed: { mediaId: string; file: string; declared: string | null; actual: string }[] = []
  const unverifiable: string[] = []
  const unsafe: string[] = []
  let verified = 0

  for (const m of canonical.media) {
    const mediaId = m.mediaId
    if (mediaId === null) continue

    if (m.file === null) {
      placement.set(mediaId, { status: 'absent', shaVerified: false, bytesOnDisk: null })
      missing.push(mediaId)
      continue
    }

    const source = safeJoin(stagingDir, m.file)
    if (source === null) {
      // The manifest's own path tried to escape the visit directory.
      placement.set(mediaId, { status: 'absent', shaVerified: false, bytesOnDisk: null })
      unsafe.push(`${mediaId} (${m.file})`)
      continue
    }

    if (!existsSync(source)) {
      placement.set(mediaId, { status: 'absent', shaVerified: false, bytesOnDisk: null })
      missing.push(mediaId)
      continue
    }

    const bytesOnDisk = statSync(source).size
    const actual = await sha256File(source)

    if (m.sha256 === null) {
      // The file is here but the export never said what it should be, so there
      // is nothing to check it against. Present, unverified — and said plainly.
      const dest = safeJoin(visitDir, m.file)!
      mkdirSync(dirname(dest), { recursive: true })
      renameSync(source, dest)
      placement.set(mediaId, { status: 'present', shaVerified: false, bytesOnDisk, actualSha256: actual })
      unverifiable.push(mediaId)
      continue
    }

    if (actual === m.sha256) {
      const dest = safeJoin(visitDir, m.file)!
      mkdirSync(dirname(dest), { recursive: true })
      renameSync(source, dest)
      placement.set(mediaId, { status: 'present', shaVerified: true, bytesOnDisk })
      verified++
      continue
    }

    // Quarantined, not deleted. The bytes are evidence of what went wrong.
    const quarantine = join(visitDir, FAILED_DIR, `${mediaId}${extOf(m.file)}`)
    mkdirSync(dirname(quarantine), { recursive: true })
    renameSync(source, quarantine)
    placement.set(mediaId, { status: 'failed_checksum', shaVerified: false, bytesOnDisk, actualSha256: actual })
    failed.push({ mediaId, file: m.file, declared: m.sha256, actual })
  }

  if (verified > 0) {
    add({
      code: 'media.verified',
      severity: 'info',
      message: `${verified} file${verified === 1 ? '' : 's'} copied and checksum-verified against the export.`,
      detail: { verified },
    })
  }

  for (const f of failed) {
    add({
      code: 'media.checksum-failed',
      severity: 'warning',
      message:
        `${f.file} does not match the checksum the export declares for it. The export says ` +
        `${f.declared?.slice(0, 16)}…, the file on disk is ${f.actual.slice(0, 16)}…. It has been moved to ` +
        `${FAILED_DIR}/ rather than deleted, and is not counted as evidence. Every other file imported normally.`,
      detail: f,
    })
  }

  if (missing.length > 0) {
    add({
      code: 'media.file-missing',
      severity: 'warning',
      message:
        `${missing.length} file${missing.length === 1 ? '' : 's'} listed in the export ` +
        `${missing.length === 1 ? 'was' : 'were'} not found in the media supplied. ` +
        `${missing.length === 1 ? 'It is' : 'They are'} recorded as absent, not dropped.`,
      detail: { count: missing.length, examples: missing.slice(0, 10) },
    })
  }

  if (unverifiable.length > 0) {
    add({
      code: 'media.no-declared-checksum',
      severity: 'warning',
      message:
        `${unverifiable.length} file${unverifiable.length === 1 ? '' : 's'} arrived without a checksum in the ` +
        `export, so ${unverifiable.length === 1 ? 'it' : 'they'} cannot be verified. Stored and marked unverified.`,
      detail: { count: unverifiable.length, examples: unverifiable.slice(0, 10) },
    })
  }

  if (unsafe.length > 0) {
    add({
      code: 'media.unsafe-path',
      severity: 'warning',
      message:
        `${unsafe.length} media path${unsafe.length === 1 ? '' : 's'} in the export point outside the visit ` +
        `directory and ${unsafe.length === 1 ? 'was' : 'were'} not written: ${unsafe.slice(0, 5).join(', ')}.`,
      detail: { paths: unsafe },
    })
  }

  return { placement, checks }
}

const extOf = (file: string): string => {
  const i = file.lastIndexOf('.')
  return i > file.lastIndexOf('/') ? file.slice(i) : ''
}
