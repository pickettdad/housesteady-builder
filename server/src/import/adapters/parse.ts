import type { Manifest } from '../manifest.js'
import { makeReport, type Check } from '../validate.js'
import type { CanonicalImport } from './canonical.js'
import { adapterFor, supportedVersions } from './index.js'

/**
 * The front door. Raw bytes in, canonical shape out.
 *
 * Fail closed on structure: unparseable JSON, a manifest version with no
 * adapter, or missing top-level sections all refuse the import outright and
 * nothing is written. Fail open on everything else — content problems are found
 * downstream, on the canonical shape, by checks that are version-agnostic.
 *
 * Version dispatch happens exactly here and nowhere else.
 */
export function parseToCanonical(raw: string): {
  canonical?: CanonicalImport
  checks: Check[]
} {
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

  const version = (parsed as { manifestSchemaVersion?: unknown }).manifestSchemaVersion
  const adapter = adapterFor(version)

  if (!adapter) {
    const supported = supportedVersions().join(', ')
    add({
      code: 'structure.schema-version',
      severity: 'error',
      message:
        version === undefined
          ? `No manifestSchemaVersion found. This builder reads manifest schema version ${supported}.`
          : `Manifest schema version ${JSON.stringify(version)} found — this builder reads version ${supported}. ` +
            `Refusing the import rather than guessing at the differences.`,
      detail: { found: version ?? null, supported: supportedVersions() },
    })
    // No adapter means no way to check anything else about the shape. Stop here.
    return { checks }
  }

  // The adapter owns everything version-specific from this point.
  checks.push(...adapter.validateStructure(parsed))
  if (checks.some((c) => c.severity === 'error')) return { checks }

  const { canonical, checks: adapterChecks } = adapter.toCanonical(parsed as Manifest)
  checks.push(...adapterChecks)

  return { canonical, checks }
}
