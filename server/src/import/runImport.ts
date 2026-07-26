import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Db } from '../db/index.js'
import { dataRoot } from '../db/index.js'
import {
  checkAnchorBounds,
  checkConfigHash,
  checkEventSequence,
  checkPinNumbers,
  checkReferentialIntegrity,
  checkResolutionReconciliation,
} from './integrity.js'
import { persistImport } from './persist.js'
import { checkPropertyLabel } from './propertyMatch.js'
import { checkStructure, checkTotals, finalize, type Check } from './validate.js'
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
  visitId: string
  raw: string
  /** Media handling lands with the checksum pass; today every import is manifest-only. */
  mediaMode?: 'manifest_only' | 'with_media'
  /** Overrides where the verbatim copy is written. Tests use a scratch directory. */
  dataDir?: string
}

/**
 * One import, end to end.
 *
 * Order matters: structure is checked BEFORE anything touches the database, so a
 * refused import leaves no trace at all — not a partial row, not a directory.
 */
export function runImport(args: RunImportArgs): { importId: string; status: string } {
  const { db, propertyId, visitId, raw, mediaMode = 'manifest_only', dataDir = dataRoot } = args

  const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(propertyId) as
    | { id: string; label: string; address: string | null }
    | undefined
  if (!property) throw new ImportRefused('No such property.', [])

  const visit = db.prepare('SELECT * FROM visits WHERE id = ?').get(visitId) as
    | { id: string; property_id: string }
    | undefined
  if (!visit) throw new ImportRefused('No such visit.', [])
  if (visit.property_id !== propertyId) {
    throw new ImportRefused('That visit belongs to a different property.', [])
  }

  // ------------------------------------------------- fail closed on structure
  const { manifest, checks: structureChecks } = checkStructure(raw)
  if (!manifest) {
    // The headline says what is actually wrong. "Not a version 3 export" when the
    // real problem is a truncated download sends someone looking in the wrong place.
    const first = structureChecks.find((c) => c.severity === 'error')
    const headline =
      first?.code === 'structure.unparseable'
        ? 'This file could not be read as JSON, so nothing was imported.'
        : first?.code === 'structure.missing-section'
          ? 'This file is missing sections a manifest must have, so nothing was imported.'
          : 'This file is not a manifest schema version 3 export, so nothing was imported.'
    throw new ImportRefused(headline, structureChecks)
  }

  const checks: Check[] = [...structureChecks]
  const checksRun = [
    'structure',
    'totals',
    'referential integrity',
    'anchor bounds',
    'event sequence',
    'resolutions vs events',
    'pin numbers',
    'config hash',
    'vocabulary',
    'property label',
    'media presence',
  ]

  // ------------------------------------------------------------------ totals
  checks.push(...checkTotals(manifest))

  // ------------------------------------------------- integrity and sequences
  checks.push(...checkReferentialIntegrity(manifest))
  checks.push(...checkAnchorBounds(manifest))
  checks.push(...checkEventSequence(manifest))
  checks.push(...checkResolutionReconciliation(manifest))
  checks.push(...checkPinNumbers(db, propertyId, manifest))
  checks.push(...checkConfigHash(db, propertyId, manifest))

  // ------------------------------------------------------------- vocabulary
  const vocabulary = checkVocabulary(manifest)
  checks.push(...vocabulary.checks)

  // ----------------------------------------------------------- media absence
  // Manifest-only is a legitimate mode — it is how the reference export gets
  // imported before its media zips exist. But an import whose photos are not on
  // this machine is not a complete import, and the report must not imply it is.
  const mediaCount = (manifest.media ?? []).length
  if (mediaMode === 'manifest_only' && mediaCount > 0) {
    const bytes = (manifest.media ?? []).reduce((n, m) => n + (m.bytes ?? 0), 0)
    checks.push({
      code: 'media.absent',
      severity: 'warning',
      message:
        `The manifest was imported without its media. All ${mediaCount} files ` +
        `(${(bytes / 1024 ** 2).toFixed(0)} MB) are listed and accounted for, but the files themselves are not ` +
        `on this machine and no checksum has been verified.`,
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
    manifestLabel: manifest.session?.propertyLabel,
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
        `going further — a visit filed under the wrong property corrupts the pin-number history of both, ` +
        `permanently and undetectably.`,
      detail: match,
    })
  } else if (match.looksWrong) {
    checks.push({
      code: 'property.label-mismatch',
      severity: 'warning',
      message:
        `The export calls this property "${match.manifestLabel}", which does not look like ` +
        `"${match.best?.value}". If this visit belongs to a different house, stop and re-import it there — ` +
        `filing a visit under the wrong property corrupts the pin-number history of both, permanently.`,
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
  const sessionId = manifest.session?.sessionId ?? null
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

  const importId = persistImport({
    db,
    propertyId,
    visitId,
    raw,
    manifest,
    report,
    mediaMode,
    unrecognizedResolutions: vocabulary.unrecognizedResolutions,
    unrecognizedEvents: vocabulary.unrecognizedEvents,
  })

  // The verbatim file on disk beside where its media will live. Two copies on
  // purpose: the database row is queryable, the file is what a human can open,
  // checksum, and hand to someone else in five years.
  const visitDir = join(dataDir, 'properties', propertyId, 'visits', visitId)
  mkdirSync(visitDir, { recursive: true })
  writeFileSync(join(visitDir, 'manifest.json'), raw, 'utf8')

  return { importId, status: report.status }
}
