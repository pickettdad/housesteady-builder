import type { CanonicalImport } from './adapters/canonical.js'

/**
 * Validation vocabulary.
 *
 * `error`   — refuses the import. Structural only: unparseable JSON, a manifest
 *             version with no adapter, missing top-level sections.
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
 * Every declared total against the actual arrays, reported one by one.
 *
 * Runs on the CANONICAL shape, so it is written once and works for every
 * manifest version. The adapter is responsible for putting the export's declared
 * totals into `declaredTotals` under these names.
 */
export function checkTotals(c: CanonicalImport): Check[] {
  const { checks, add } = makeReport()

  const actual: Record<string, number> = {
    zones: c.zones.length,
    pins: c.pins.length,
    canvases: c.canvases.length,
    photos: c.media.filter((x) => x.kind === 'photo').length,
    voiceNotes: c.media.filter((x) => x.kind === 'voice').length,
    notes: c.notes.length,
    chats: c.chatThreads.length,
    inboxItems: c.inboxRefs.length,
    mediaFiles: c.media.length,
    mediaBytes: c.media.reduce((n, x) => n + (x.bytes ?? 0), 0),
  }

  for (const [key, actualValue] of Object.entries(actual)) {
    const declared = c.declaredTotals[key]
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
