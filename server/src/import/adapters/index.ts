import type { Manifest } from '../manifest.js'
import type { Check } from '../validate.js'
import type { CanonicalImport } from './canonical.js'
import {
  MANIFEST_SCHEMA_VERSION as V3,
  toCanonical as v3ToCanonical,
  validateStructure as v3ValidateStructure,
} from './v3.js'

/**
 * The adapter registry.
 *
 * Adding manifest v4 means writing `v4.ts` and adding one line here. Nothing
 * else in the import path changes — not persistence, not the checks, not the
 * report. That is the test of whether this layer is doing its job.
 *
 * No dual-support machinery, deliberately: exactly one real v3 export exists and
 * it is archived. When v4 lands, v3 stays here as the reader for that archive
 * and the production path moves on.
 */

export interface Adapter {
  version: number
  /** Fail-closed shape check. Version-specific: each version defines "readable". */
  validateStructure: (parsed: unknown) => Check[]
  /** Normalize into the canonical shape. Never judges — only reshapes. */
  toCanonical: (m: Manifest) => { canonical: CanonicalImport; checks: Check[] }
}

const ADAPTERS: Adapter[] = [
  { version: V3, validateStructure: v3ValidateStructure, toCanonical: v3ToCanonical },
]

/** Every manifest version this build can read. Used in refusal messages. */
export const supportedVersions = (): number[] => ADAPTERS.map((a) => a.version).sort((a, b) => a - b)

export const adapterFor = (version: unknown): Adapter | undefined =>
  ADAPTERS.find((a) => a.version === version)

export type { CanonicalImport } from './canonical.js'
export * from './canonical.js'
