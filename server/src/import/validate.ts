import type { Manifest } from './manifest.js'

/**
 * Validation vocabulary.
 *
 * `error`   — refuses the import. Structural only: wrong schema version,
 *             unparseable JSON, missing top-level sections.
 * `warning` — imports fine, but something is off and a human should see it.
 * `info`    — recorded because it is worth knowing, not because it is wrong.
 *
 * Every entry names the entities involved. "3 dangling references" is not a
 * finding; "pin 7 references media 019f9a35-… which is not in media[]" is.
 */
export type Severity = 'error' | 'warning' | 'info'

export interface Check {
  code: string
  severity: Severity
  message: string
  detail?: unknown
}

export interface UnrecognizedTermSummary {
  field: string
  value: string
  count: number
  examples: string[]
}

export interface ValidationReport {
  status: 'ok' | 'ok_with_warnings' | 'failed'
  checks: Check[]
  /** Which check groups actually ran. Honesty about coverage, not decoration. */
  checksRun: string[]
  /** Words this export used that the builder has not met. Never a failure. */
  unrecognizedTerms: UnrecognizedTermSummary[]
  counts: { errors: number; warnings: number; infos: number }
}

export const MANIFEST_SCHEMA_VERSION = 3

/** Top-level sections that must exist for the file to be a v3 manifest at all. */
const REQUIRED_SECTIONS = [
  'session',
  'config',
  'zones',
  'pins',
  'media',
  'resolutions',
  'totals',
  'events',
] as const

/** Present in every real export but not fatal if a future one omits them. */
const OPTIONAL_SECTIONS = ['notes', 'chats', 'inbox', 'orphanEvents'] as const

export function makeReport(): { checks: Check[]; add: (c: Check) => void } {
  const checks: Check[] = []
  return { checks, add: (c) => checks.push(c) }
}

export function finalize(
  checks: Check[],
  checksRun: string[],
  unrecognizedTerms: UnrecognizedTermSummary[] = [],
): ValidationReport {
  const errors = checks.filter((c) => c.severity === 'error').length
  const warnings = checks.filter((c) => c.severity === 'warning').length
  const infos = checks.filter((c) => c.severity === 'info').length
  return {
    status: errors > 0 ? 'failed' : warnings > 0 ? 'ok_with_warnings' : 'ok',
    checks,
    checksRun,
    unrecognizedTerms,
    counts: { errors, warnings, infos },
  }
}

/**
 * Fail closed on structure.
 *
 * Runs before anything is written. If this produces an error the import is
 * refused outright and nothing is persisted — a refused import must leave no
 * trace in the database.
 */
export function checkStructure(raw: string): { manifest?: Manifest; checks: Check[] } {
  const { checks, add } = makeReport()

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    add({
      code: 'structure.unparseable',
      severity: 'error',
      message: `The file is not valid JSON: ${(e as Error).message}`,
    })
    return { checks }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    add({
      code: 'structure.not-an-object',
      severity: 'error',
      message: 'The manifest must be a JSON object at the top level.',
    })
    return { checks }
  }

  const m = parsed as Manifest
  const version = m.manifestSchemaVersion

  if (version !== MANIFEST_SCHEMA_VERSION) {
    add({
      code: 'structure.schema-version',
      severity: 'error',
      message:
        version === undefined
          ? 'No manifestSchemaVersion found. This builder imports manifest schema version 3 only.'
          : `Manifest schema version ${JSON.stringify(version)} found — this builder imports version ${MANIFEST_SCHEMA_VERSION} only. Refusing the import rather than guessing at the differences.`,
      detail: { found: version ?? null, expected: MANIFEST_SCHEMA_VERSION },
    })
    // Keep checking so the report names everything wrong at once, not one at a time.
  }

  for (const section of REQUIRED_SECTIONS) {
    if (!(section in m) || m[section] === undefined || m[section] === null) {
      add({
        code: 'structure.missing-section',
        severity: 'error',
        message: `Required top-level section "${section}" is missing.`,
        detail: { section },
      })
    }
  }

  for (const section of OPTIONAL_SECTIONS) {
    if (!(section in m) || m[section] === undefined || m[section] === null) {
      add({
        code: 'structure.missing-optional-section',
        severity: 'warning',
        message: `Optional top-level section "${section}" is absent. Importing without it.`,
        detail: { section },
      })
    }
  }

  const arrays: [string, unknown][] = [
    ['zones', m.zones],
    ['pins', m.pins],
    ['media', m.media],
    ['resolutions', m.resolutions],
    ['events', m.events],
  ]
  for (const [name, value] of arrays) {
    if (value !== undefined && value !== null && !Array.isArray(value)) {
      add({
        code: 'structure.wrong-shape',
        severity: 'error',
        message: `Top-level "${name}" must be an array, found ${typeof value}.`,
        detail: { section: name },
      })
    }
  }

  // inbox is an object of reference arrays, not an array of items.
  if (m.inbox !== undefined && m.inbox !== null && (typeof m.inbox !== 'object' || Array.isArray(m.inbox))) {
    add({
      code: 'structure.wrong-shape',
      severity: 'error',
      message: 'Top-level "inbox" must be an object of reference arrays ({mediaIds, noteIds}).',
      detail: { section: 'inbox' },
    })
  }

  if (checks.some((c) => c.severity === 'error')) return { checks }
  return { manifest: m, checks }
}

/**
 * Every declared total against the actual arrays, reported one by one.
 *
 * The reference export reconciles perfectly on all ten, so any mismatch is a
 * real signal — either the field app's counter or our reading of the shape.
 */
export function checkTotals(m: Manifest): Check[] {
  const { checks, add } = makeReport()
  const t = m.totals ?? {}
  const media = m.media ?? []

  const actual: Record<string, number> = {
    zones: (m.zones ?? []).length,
    pins: (m.pins ?? []).length,
    canvases: (m.zones ?? []).reduce((n, z) => n + (z.canvases ?? []).length, 0),
    photos: media.filter((x) => x.kind === 'photo').length,
    voiceNotes: media.filter((x) => x.kind === 'voice').length,
    notes: (m.notes ?? []).length,
    chats: (m.chats ?? []).length,
    inboxItems: (m.inbox?.mediaIds ?? []).length + (m.inbox?.noteIds ?? []).length,
    mediaFiles: media.length,
    mediaBytes: media.reduce((n, x) => n + (x.bytes ?? 0), 0),
  }

  for (const [key, actualValue] of Object.entries(actual)) {
    const declared = (t as Record<string, number | undefined>)[key]
    if (declared === undefined) {
      add({
        code: 'totals.absent',
        severity: 'warning',
        message: `totals.${key} is not declared by the export. Counted ${actualValue} directly.`,
        detail: { key, actual: actualValue },
      })
    } else if (declared !== actualValue) {
      add({
        code: 'totals.mismatch',
        severity: 'warning',
        message: `totals.${key} says ${declared} but the file actually contains ${actualValue}.`,
        detail: { key, declared, actual: actualValue },
      })
    }
  }

  return checks
}
