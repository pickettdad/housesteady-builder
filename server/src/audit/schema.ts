/**
 * Loading the binder schema and a profile.
 *
 * §0.1 — **the schema and profile are config, not code.** Versioned and
 * content-hashed exactly like the field checklist config, and every audit run
 * records which of each produced it, because *"why does this March gap report
 * say something different from September's"* has to be answerable.
 *
 * Two files, versioned separately on purpose. The **schema** is the vocabulary —
 * what a binder contains, from the Master Spec. The **profile** is the promise —
 * which of those slots this service reports a gap against. The profile changes
 * for business reasons and the schema for content ones, and tying their versions
 * together would make every commercial decision look like a spec change.
 *
 * **The profile is read, never inferred** (§0.2). A slot the profile does not
 * classify is a schema error, reported loudly at load. The tempting default —
 * treat unclassified as not-required — is exactly wrong: a slot added to the
 * schema and forgotten in the profile would silently never be asked for, and
 * nothing would ever surface it.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
export const schemaRoot = join(here, '..', '..', '..', 'schema')

export class SchemaRefused extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'SchemaRefused'
  }
}

// ------------------------------------------------------------------ the shapes

export interface Binding {
  /** The field checklist item that pins this thing. */
  pinnedBy?: string
  /** Canonical component type. Matched through the inheritance graph, never by string. */
  componentType?: string
  /**
   * Field items that must be resolved for the evidence to be sufficient.
   *
   * §1c — **bind, do not re-implement.** The locating-photo rule and the 23
   * `.unit` whole-object photo items are already field checklist items. Checking
   * the photo independently would be a second implementation of a rule the
   * config already declares, and the two would drift.
   */
  viaItems?: string[]
  partial?: unknown
  note?: string
}

export interface CoverageItem {
  id: string
  label: string
  appliesWhen: unknown
  binding: Binding
}

export interface Slot {
  id: string
  kind: 'fixed' | 'coverage' | 'record-set' | 'derived' | 'narrative'
  title?: string
  sources?: string[]
  defaultLabel?: string
  items?: CoverageItem[]
  itemRequires?: unknown
  expectationSource?: unknown
  [key: string]: unknown
}

export interface Section {
  id: string
  number: number
  title: string
  layer?: string
  slots: Slot[]
}

/** How the profile classifies one slot. Read, never inferred. */
export type Classification = 'required' | 'present-when-populated' | 'out-of-scope'

export interface LoadedSchema {
  version: string
  /** Content hash of the file as read. Recorded on every run. */
  hash: string
  sections: Section[]
  slots: Slot[]
  sectionOf: (slotId: string) => Section | undefined
  /** Component inheritance as the CURRENT master declares it. Documentation only. */
  componentInheritance: Record<string, string>
  raw: Record<string, unknown>
}

export interface LoadedProfile {
  profileId: string
  version: string
  hash: string
  schemaVersion: string
  classify: (slotId: string) => Classification
  /** Why a slot is out of scope, where the profile says. Shown, never hidden. */
  noteFor: (slotId: string) => string | undefined
  raw: Record<string, unknown>
}

const hashOf = (text: string): string => createHash('sha256').update(text).digest('hex')

const readJson = (path: string): { raw: Record<string, unknown>; hash: string } => {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    throw new SchemaRefused(`No such file: ${path}`, 'schema.missing')
  }
  try {
    // Hashed as read, before parsing. The hash has to identify the bytes that
    // produced a run, not a re-serialisation of them — those differ over key
    // order and whitespace, and a hash that changes when nothing did is worse
    // than no hash.
    return { raw: JSON.parse(text) as Record<string, unknown>, hash: hashOf(text) }
  } catch (e) {
    // Doctrine 7: fail closed on structure. An unparseable schema is not a
    // vocabulary the builder has not met.
    throw new SchemaRefused(`${path} is not readable JSON: ${(e as Error).message}`, 'schema.unparseable')
  }
}

// ------------------------------------------------------------------ the schema

export function loadSchema(path = join(schemaRoot, 'binder-schema-v1.json')): LoadedSchema {
  const { raw, hash } = readJson(path)

  const version = typeof raw.version === 'string' ? raw.version : ''
  if (!version) throw new SchemaRefused(`${path} declares no version.`, 'schema.no-version')

  const sections = Array.isArray(raw.sections) ? (raw.sections as Section[]) : []
  if (sections.length === 0) throw new SchemaRefused(`${path} declares no sections.`, 'schema.no-sections')

  const slots: Slot[] = []
  const owner = new Map<string, Section>()
  for (const section of sections) {
    for (const slot of section.slots ?? []) {
      // A duplicate slot id would make "the state of s7.components" ambiguous
      // and every downstream lookup silently pick one. Structure, so it refuses.
      if (owner.has(slot.id)) {
        throw new SchemaRefused(
          `Slot ${slot.id} is declared twice — in ${owner.get(slot.id)!.id} and ${section.id}.`,
          'schema.duplicate-slot',
        )
      }
      owner.set(slot.id, section)
      slots.push(slot)
    }
  }

  const inheritance: Record<string, string> = {}
  const declared = raw.componentInheritance
  if (declared && typeof declared === 'object' && !Array.isArray(declared)) {
    for (const [child, parent] of Object.entries(declared as Record<string, unknown>)) {
      if (typeof parent === 'string') inheritance[child] = parent
    }
  }

  return {
    version, hash, sections, slots,
    sectionOf: (slotId) => owner.get(slotId),
    componentInheritance: inheritance,
    raw,
  }
}

// ----------------------------------------------------------------- the profile

export function loadProfile(
  schema: LoadedSchema,
  path = join(schemaRoot, 'profiles', 'baseline-v1.json'),
): LoadedProfile {
  const { raw, hash } = readJson(path)

  const listOf = (key: string): string[] =>
    Array.isArray(raw[key]) ? (raw[key] as unknown[]).filter((v): v is string => typeof v === 'string') : []

  const buckets: [Classification, string[]][] = [
    ['required', listOf('required')],
    ['present-when-populated', listOf('presentWhenPopulated')],
    ['out-of-scope', listOf('outOfScope')],
  ]

  const classification = new Map<string, Classification>()
  const twice: string[] = []
  for (const [kind, ids] of buckets) {
    for (const id of ids) {
      if (classification.has(id)) twice.push(`${id} is both ${classification.get(id)} and ${kind}`)
      classification.set(id, kind)
    }
  }
  if (twice.length > 0) {
    throw new SchemaRefused(
      `${path} classifies slots more than once: ${twice.join('; ')}.`,
      'profile.double-classified',
    )
  }

  crossCheck(schema, path, classification)

  const notes = (raw.notes ?? {}) as Record<string, unknown>
  return {
    profileId: String(raw.profileId ?? ''),
    version: String(raw.version ?? ''),
    hash,
    schemaVersion: String(raw.schemaVersion ?? ''),
    classify: (slotId) => {
      const found = classification.get(slotId)
      if (!found) {
        // Unreachable after crossCheck; kept because the alternative if it ever
        // is reached — returning a default — is the silent failure §0.2 forbids.
        throw new SchemaRefused(`No profile classification for ${slotId}.`, 'profile.unclassified')
      }
      return found
    },
    noteFor: (slotId) => (typeof notes[slotId] === 'string' ? (notes[slotId] as string) : undefined),
    raw,
  }
}

/**
 * §6 — **every slot in the schema is classified by the profile. Unclassified is
 * a loud error, not a default.**
 *
 * Both directions, because they fail differently and both fail quietly:
 *
 *   A slot the profile forgot would never be asked for, and nothing else in the
 *   system would ever mention it. A binder would ship missing a section and the
 *   audit would report itself complete.
 *
 *   A profile naming a slot the schema does not have is a promise about
 *   something that no longer exists — a stale profile against a newer schema,
 *   which is the shape this takes in practice.
 *
 * The schema version mismatch is a warning rather than a refusal: profiles are
 * versioned separately by design and a patch-level schema bump should not stop
 * the audit. It is surfaced so nobody has to notice it themselves.
 */
function crossCheck(schema: LoadedSchema, path: string, classification: Map<string, Classification>): void {
  const known = new Set(schema.slots.map((s) => s.id))

  const unclassified = schema.slots.filter((s) => !classification.has(s.id)).map((s) => s.id)
  if (unclassified.length > 0) {
    throw new SchemaRefused(
      `${path} does not classify ${unclassified.length} of ${known.size} slots: ${unclassified.join(', ')}. ` +
        'Every slot has to be required, present-when-populated, or out-of-scope — an unclassified slot ' +
        'would silently never be asked for.',
      'profile.unclassified',
    )
  }

  const phantom = [...classification.keys()].filter((id) => !known.has(id))
  if (phantom.length > 0) {
    throw new SchemaRefused(
      `${path} classifies ${phantom.length} slots the schema does not declare: ${phantom.join(', ')}. ` +
        'A profile written against an older schema promises things that no longer exist.',
      'profile.phantom-slot',
    )
  }
}

/**
 * What a run records about its own inputs.
 *
 * Version AND hash, because a version alone is a claim and the hash is the
 * evidence. A schema edited without a version bump is exactly the case where the
 * version says nothing changed and the results differ.
 */
export interface RunProvenance {
  schemaVersion: string
  schemaHash: string
  profileId: string
  profileVersion: string
  profileHash: string
  /** Set when the profile was written against a different schema version. */
  versionMismatch?: string
}

export const provenanceOf = (schema: LoadedSchema, profile: LoadedProfile): RunProvenance => ({
  schemaVersion: schema.version,
  schemaHash: schema.hash,
  profileId: profile.profileId,
  profileVersion: profile.version,
  profileHash: profile.hash,
  ...(profile.schemaVersion && profile.schemaVersion !== schema.version
    ? {
        versionMismatch:
          `profile ${profile.profileId} was written against schema ${profile.schemaVersion}; ` +
          `this run used ${schema.version}`,
      }
    : {}),
})
