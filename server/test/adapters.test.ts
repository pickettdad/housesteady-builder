import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { parseToCanonical } from '../src/import/adapters/parse.js'
import { supportedVersions } from '../src/import/adapters/index.js'
import { readReference, repoRoot } from './helpers.js'

/**
 * The adapter layer exists so manifest v4 is a new module, not a rewrite.
 *
 * These tests pin that rule two ways: behaviourally (the canonical shape has
 * resolved every v3 quirk) and structurally (no code outside `adapters/` knows a
 * manifest version exists). The structural one is the one that will still be
 * doing work in six months.
 */

describe('the canonical shape resolves every v3 quirk', () => {
  const { canonical: c } = parseToCanonical(readReference())

  it('parses the reference export', async () => {
    assert.ok(c)
    assert.equal(c!.sourceManifestVersion, 3)
  })

  it('flattens canvases out of zones', async () => {
    // On the wire they are nested inside each zone. Downstream never sees that.
    assert.equal(c!.canvases.length, 3)
    for (const canvas of c!.canvases) assert.ok(canvas.zoneId, 'each carries its zone down with it')
  })

  it('flattens anchors out of pins', async () => {
    assert.equal(c!.anchors.length, 7)
    for (const a of c!.anchors) assert.ok(a.pinId, 'each carries its pin down with it')
  })

  it('turns the inbox object into a flat list of references', async () => {
    assert.deepEqual(c!.inboxRefs, [
      { refKind: 'media', refId: '019f9a5b-7047-7d11-952b-014a1741ee2c' },
    ])
  })

  it('assigns chat message order from array position', async () => {
    // The wire format carries no seq. The adapter makes the ordering explicit
    // so nothing downstream has to know that.
    const messages = c!.chatThreads[0]!.messages
    assert.deepEqual(messages.map((m) => m.seq), [1, 2])
    assert.equal(messages[1]!.model, 'claude-sonnet-5')
  })

  it('normalizes an absent type to explicit nulls, inventing nothing', async () => {
    const typeless = c!.pins.filter((p) => p.typeKind === null)
    assert.equal(typeless.length, 2)
    for (const p of typeless) {
      assert.equal(p.componentType, null)
      assert.equal(p.freeformLabel, null)
    }
  })

  it('turns the retired object into a moment', async () => {
    const retired = c!.pins.filter((p) => p.retiredAt !== null)
    assert.equal(retired.length, 2)
    assert.match(retired[0]!.retiredAt!, /^\d{4}-\d{2}-\d{2}T/)
  })

  it('flattens the nested resolution body, keeping evidence', async () => {
    const alarms = c!.resolutions.find((r) => r.itemId === 'int.alarms')!
    assert.equal(alarms.kind, 'satisfied')
    assert.equal(alarms.via, 'pin')
    assert.deepEqual(alarms.evidence, { pinId: '019f9a3a-04e8-77d6-8ef8-979e43e8b998' })
  })

  it('reads media ownership from owner{}, not the path', async () => {
    const byOwner = new Map<string, number>()
    for (const m of c!.media) byOwner.set(m.ownerKind ?? '?', (byOwner.get(m.ownerKind ?? '?') ?? 0) + 1)
    assert.equal(byOwner.get('zone'), 28)
    assert.equal(byOwner.get('pin'), 5)
  })

  it('passes the config snapshot through whole, reshaping nothing', async () => {
    // "The config decides, not the builder" means the builder does not get to
    // drop a key it has not met.
    const snapshot = c!.config.snapshot
    for (const key of ['naReasons', 'layers', 'baseLists', 'zoneLists', 'componentLists', 'sessionItems']) {
      assert.ok(key in snapshot, `${key} survives`)
    }
  })

  it('keeps each event whole in its payload', async () => {
    const first = c!.events[0]!
    assert.equal(first.type, 'SessionInitialized')
    // Fields the canonical shape does not name are still there, verbatim.
    assert.equal((first.payload as Record<string, unknown>).configId, 'checklists-baseline')
  })
})

describe('version dispatch', () => {
  it('refuses a version it has no adapter for, naming what it does read', async () => {
    const raw = JSON.stringify({ ...JSON.parse(readReference()), manifestSchemaVersion: 4 })
    const { canonical, checks } = parseToCanonical(raw)
    assert.equal(canonical, undefined)
    const err = checks.find((c) => c.code === 'structure.schema-version')!
    assert.match(err.message, /version 4 found/)
    assert.match(err.message, new RegExp(`reads version ${supportedVersions().join(', ')}`))
  })

  it('reports what it supports rather than a hardcoded number', async () => {
    assert.deepEqual(supportedVersions(), [3])
  })
})

/**
 * The structural test.
 *
 * If this fails, someone has taught code outside the adapter layer what a
 * manifest looks like, and manifest v4 has quietly become a rewrite again.
 */
describe('no code outside adapters/ knows a manifest version exists', () => {
  const importDir = join(repoRoot, 'server', 'src', 'import')

  const filesOutsideAdapters = (): string[] => {
    const out: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
          if (entry !== 'adapters') walk(full)
        } else if (entry.endsWith('.ts')) {
          out.push(full)
        }
      }
    }
    walk(importDir)
    return out
  }

  /** `manifest.ts` holds the v3 wire types and is only imported BY adapters. */
  const WIRE_TYPES_MODULE = 'manifest.ts'

  it('does not branch on the manifest version anywhere downstream', async () => {
    const offenders: string[] = []
    for (const file of filesOutsideAdapters()) {
      if (file.endsWith(WIRE_TYPES_MODULE)) continue
      const text = readFileSync(file, 'utf8')
      // Comments legitimately discuss versions; code must not test them.
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      if (/sourceManifestVersion\s*[=!]==/.test(code) || /manifestSchemaVersion\s*[=!]==/.test(code)) {
        offenders.push(file.replace(repoRoot, ''))
      }
    }
    assert.deepEqual(offenders, [], 'version-specific knowledge belongs in an adapter')
  })

  it('does not import the wire-format types downstream', async () => {
    const offenders: string[] = []
    for (const file of filesOutsideAdapters()) {
      if (file.endsWith(WIRE_TYPES_MODULE)) continue
      const text = readFileSync(file, 'utf8')
      if (/from\s+['"]\.\/manifest\.js['"]/.test(text)) offenders.push(file.replace(repoRoot, ''))
    }
    assert.deepEqual(
      offenders,
      [],
      'downstream reads the canonical shape; only adapters read the wire format',
    )
  })

  it('keeps the report reading tables only, never an import shape', async () => {
    const text = readFileSync(join(importDir, 'report.ts'), 'utf8')
    assert.ok(!/from '\.\/adapters/.test(text), 'the report is built from what was stored, not from what arrived')
    assert.ok(!/CanonicalImport/.test(text))
  })
})
