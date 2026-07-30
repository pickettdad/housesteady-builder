import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Db } from '../db/index.js'
import { dataRoot, newId } from '../db/index.js'
import { mediaDirFor } from '../media/paths.js'
import { parseToCanonical } from './adapters/parse.js'
import {
  checkAnchorBounds,
  checkCaptureWindow,
  checkConfigHash,
  checkEventSequence,
  checkPinIdentityAcrossVisits,
  checkPinNumbers,
  checkReferentialIntegrity,
  checkResolutionReconciliation,
} from './integrity.js'
import { extractZip, placeMedia, type PlacementMap } from './media.js'
import { persistImport } from './persist.js'
import { checkPropertyLabel } from './propertyMatch.js'
import { checkTotals, finalize, type Check } from './validate.js'
import { checkVocabulary } from './vocabulary.js'

export class ImportRefused extends Error {
  constructor(
    message: string,
    readonly checks: Check[],
  ) {
    super(message)
    this.name = 'ImportRefused'
  }
}

export interface RunImportArgs {
  db: Db
  propertyId: string
  raw: string
  /**
   * Zip archives holding the visit's media, at the export's own relative paths.
   * Per-zone plus `_misc`, or one combined archive — the shape does not matter,
   * they are all extracted into one staging tree and matched by declared path.
   */
  mediaZips?: string[]
  /** An already-extracted media tree, for callers that have one. */
  mediaDir?: string
  /** Overrides where the verbatim copy is written. Tests use a scratch directory. */
  dataDir?: string
  /** Which operator ran the import. Required — Increment 2c. */
  actorId: string
  /**
   * Which visit this capture belongs to, if any — §1j.
   *
   * Optional, because a manifest is a property artifact rather than a visit
   * attachment. A drone run covering six properties cannot name one.
   */
  visitId?: string | null
  /** Which app produced the manifest — §1j. */
  producer?: string
}

/** Decimal MB, matching the manifest's own byte figures and the report screen. */
const mb = (bytes: number): string => `${(bytes / 1_000_000).toFixed(0)} MB`

/**
 * One import, end to end.
 *
 * Order matters: the file is parsed and structurally checked BEFORE anything
 * touches the database, so a refused import leaves no trace at all — not a
 * partial row, not a directory.
 *
 * Everything after `parseToCanonical` works on this repo's own shape. Nothing
 * below this line knows which manifest version arrived.
 */
export async function runImport(args: RunImportArgs): Promise<{ importId: string; status: string }> {
  const { db, propertyId, raw, mediaZips = [], mediaDir, dataDir = dataRoot, actorId } = args
  const visitId = args.visitId ?? null

  const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(propertyId) as
    | { id: string; label: string; address: string | null }
    | undefined
  if (!property) throw new ImportRefused('No such property.', [])

  // §1j — a manifest belongs to a property and only OPTIONALLY to a visit. Where
  // one is named it still has to be real and still has to belong to this
  // property; where none is named that is a property-scoped artifact, not an
  // error, and inventing a visit to hold it would be a lie about somebody
  // having been in the house.
  if (visitId !== null) {
    const visit = db.prepare('SELECT id, property_id FROM visits WHERE id = ?').get(visitId) as
      | { id: string; property_id: string }
      | undefined
    if (!visit) throw new ImportRefused('No such visit.', [])
    if (visit.property_id !== propertyId) {
      throw new ImportRefused('That visit belongs to a different property.', [])
    }
  }

  // ---------------------------------------- fail closed on structure, then adapt
  const { canonical, checks: parseChecks } = parseToCanonical(raw)
  if (!canonical) {
    // The headline says what is actually wrong. "Not a supported version" when
    // the real problem is a truncated download sends someone looking in the
    // wrong place.
    const first = parseChecks.find((c) => c.severity === 'error')
    const headline =
      first?.code === 'structure.unparseable'
        ? 'This file could not be read as JSON, so nothing was imported.'
        : first?.code === 'structure.missing-section'
          ? 'This file is missing sections a manifest must have, so nothing was imported.'
          : 'This file is not a manifest version this builder can read, so nothing was imported.'
    throw new ImportRefused(headline, parseChecks)
  }

  // §1j — an import with no visit has no visit folder. The id is minted here
  // rather than inside persist so a property-scoped artifact has a directory to
  // be written into before its row exists.
  const importId = newId()
  const visitDir = join(dataDir, mediaDirFor({ propertyId, visitId: visitId ?? null, importId }))
  const stagingDir = join(visitDir, '.staging')
  const hasMedia = mediaZips.length > 0 || mediaDir !== undefined
  const mediaMode: 'manifest_only' | 'with_media' = hasMedia ? 'with_media' : 'manifest_only'

  // -------------------------------------------------------- media, if supplied
  // Only after the structure passed — a refused import must not leave a
  // half-extracted gigabyte of photos behind.
  let placement: PlacementMap | undefined
  const checks: Check[] = [...parseChecks]

  if (hasMedia) {
    try {
      let source = mediaDir
      if (mediaZips.length > 0) {
        mkdirSync(stagingDir, { recursive: true })
        for (const zip of mediaZips) {
          try {
            const { skipped } = await extractZip(zip, stagingDir)
            if (skipped.length > 0) {
              checks.push({
                code: 'media.unsafe-archive-entry',
                severity: 'warning',
                message:
                  `${skipped.length} entr${skipped.length === 1 ? 'y' : 'ies'} in a media archive pointed outside ` +
                  `the visit directory and ${skipped.length === 1 ? 'was' : 'were'} not written: ` +
                  `${skipped.slice(0, 5).join(', ')}.`,
                detail: { skipped },
              })
            }
          } catch (e) {
            // One unreadable or hostile archive must not cost the operator the
            // other four. Its files simply never arrive, and are reported absent
            // by the placement pass like any other missing file.
            checks.push({
              code: 'media.archive-unreadable',
              severity: 'warning',
              message:
                `A media archive could not be read and was skipped: ${(e as Error).message}. Any files it held ` +
                `are reported below as absent. Every other archive was extracted normally.`,
              detail: { archive: zip.split('/').pop(), reason: (e as Error).message },
            })
          }
        }
        source = stagingDir
      }
      const placed = await placeMedia({ canonical, stagingDir: source!, visitDir })
      placement = placed.placement
      checks.push(...placed.checks)
    } finally {
      // The staging tree is scratch space; the files that mattered have been
      // moved out of it by now.
      rmSync(stagingDir, { recursive: true, force: true })
    }
  }

  const checksRun = [
    'structure',
    'totals',
    'referential integrity',
    'anchor bounds',
    'event sequence',
    'resolutions vs events',
    'pin numbers',
    'pin identity across visits',
    'capture window',
    'config hash',
    'vocabulary',
    'property label',
    hasMedia ? 'media checksums' : 'media presence',
  ]

  // ------------------------------------------------------------------ totals
  checks.push(...checkTotals(canonical))

  // ------------------------------------------------- integrity and sequences
  checks.push(...checkReferentialIntegrity(canonical))
  checks.push(...checkAnchorBounds(canonical))
  checks.push(...checkEventSequence(canonical))
  checks.push(...checkResolutionReconciliation(canonical))
  checks.push(...checkPinNumbers(canonical))
  checks.push(...checkPinIdentityAcrossVisits(db, propertyId, canonical))
  checks.push(...checkCaptureWindow(canonical))
  checks.push(...checkConfigHash(db, propertyId, canonical))

  // ------------------------------------------------------------- vocabulary
  const vocabulary = checkVocabulary(canonical)
  checks.push(...vocabulary.checks)

  // ----------------------------------------------------------- media absence
  // Manifest-only is a legitimate mode — it is how an export gets imported
  // before its media zips exist. But an import whose photos are not on this
  // machine is not a complete import, and the report must not imply it is.
  const mediaCount = canonical.media.length
  if (mediaMode === 'manifest_only' && mediaCount > 0) {
    const bytes = canonical.media.reduce((n, m) => n + (m.bytes ?? 0), 0)
    checks.push({
      code: 'media.absent',
      severity: 'warning',
      message:
        `The manifest was imported without its media. All ${mediaCount} files (${mb(bytes)}) are listed and ` +
        `accounted for, but the files themselves are not on this machine and no checksum has been verified.`,
      detail: { mediaCount, declaredBytes: bytes },
    })
  }

  // ---------------------------------------------------- property misfile guard
  const previousLabels = (
    db
      .prepare(
        `SELECT sm.property_label AS label FROM session_meta sm
         JOIN imports i ON i.id = sm.import_id
         WHERE i.property_id = ? AND sm.property_label IS NOT NULL`,
      )
      .all(propertyId) as { label: string }[]
  ).map((r) => r.label)

  const otherProperties = db
    .prepare('SELECT id, label, address FROM properties WHERE id != ?')
    .all(propertyId) as { id: string; label: string; address: string | null }[]

  const match = checkPropertyLabel({
    manifestLabel: canonical.session.propertyLabel,
    propertyLabel: property.label,
    propertyAddress: property.address,
    previousImportLabels: previousLabels,
    otherProperties,
  })

  if (match.betterMatch) {
    checks.push({
      code: 'property.better-match-elsewhere',
      severity: 'warning',
      message:
        `The export calls this property "${match.manifestLabel}", which looks more like your property ` +
        `"${match.betterMatch.label}" than like "${property.label}". Check this is the right house before ` +
        `going further — a visit filed under the wrong property corrupts the record of both.`,
      detail: match,
    })
  } else if (match.looksWrong) {
    checks.push({
      code: 'property.label-mismatch',
      severity: 'warning',
      message:
        `The export calls this property "${match.manifestLabel}", which does not look like ` +
        `"${match.best?.value}". If this visit belongs to a different house, stop and re-import it there — ` +
        `filing a visit under the wrong property corrupts the record of both.`,
      detail: match,
    })
  } else {
    checks.push({
      code: 'property.label-match',
      severity: 'info',
      message: `The export calls this property "${match.manifestLabel}".`,
      detail: match,
    })
  }

  // --------------------------------------------------------- refuse re-import
  const sessionId = canonical.session.sessionId
  if (sessionId) {
    const existing = db
      .prepare('SELECT id FROM imports WHERE visit_id = ? AND session_id = ?')
      .get(visitId, sessionId) as { id: string } | undefined
    if (existing) {
      throw new ImportRefused(
        `This export (session ${sessionId}) has already been imported into this visit. ` +
          `Re-importing would duplicate the evidence rather than replace it.`,
        [
          {
            code: 'import.duplicate',
            severity: 'error',
            message: `Import ${existing.id} already holds session ${sessionId} for this visit.`,
            detail: { existingImportId: existing.id, sessionId },
          },
        ],
      )
    }
  }

  const report = finalize(checks, checksRun, vocabulary.terms)

  persistImport({
    db,
    propertyId,
    visitId,
    raw,
    canonical,
    report,
    mediaMode,
    unrecognizedResolutions: vocabulary.unrecognizedResolutions,
    unrecognizedEvents: vocabulary.unrecognizedEvents,
    placement,
    actorId,
    importId,
    producer: args.producer,
  })

  // The verbatim file on disk beside where its media will live. Two copies on
  // purpose: the database row is queryable, the file is what a human can open,
  // checksum, and hand to someone else in five years.
  mkdirSync(visitDir, { recursive: true })
  writeFileSync(join(visitDir, 'manifest.json'), raw, 'utf8')

  return { importId, status: report.status }
}
