/**
 * Generates a complete synthetic v3 export — manifest plus real media files with
 * correct checksums — modelled on the reference export's conventions.
 *
 * WHY THIS EXISTS: the one real export we have leaves whole paths untested. It
 * has no measurement, no exterior zone, no voice note, no nickname, and no
 * whole-unit photo. Those are not obscure corners — measurements are the
 * year-over-year comparison backbone, and `.unit` photos are the object-level
 * comparison position that makes "here is your water heater, and here is what it
 * looked like last year" a real binder page. Until the field app produces a
 * richer export, this file is the only coverage they get.
 *
 * DELIBERATELY SINGLE-VISIT. A two-visit generator's whole shape depends on what
 * persists across visits, which is manifest-v4-shaped. Building it now means
 * building it twice.
 *
 * Run it:  npx tsx server/scripts/make-fixture.ts [outDir]
 * Default: fixtures/synthetic/
 */

import { createHash } from 'node:crypto'
import { createWriteStream, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import yazl from 'yazl'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..')

// ---------------------------------------------------------------- identity

/**
 * UUIDv7 — time-ordered, minted offline, exactly as the field app does it. The
 * ordering matters: ids sort into the order things happened, which is why the
 * field app can mint them in a basement with no server.
 */
let clock = Date.parse('2026-09-14T13:02:00.000Z')
let counter = 0
function uuidv7(): string {
  clock += 137 // deterministic, so a regenerated fixture is byte-identical
  counter++
  const ms = clock.toString(16).padStart(12, '0')
  const rand = (counter * 2654435761) >>> 0
  const a = ms.slice(0, 8)
  const b = ms.slice(8, 12)
  const c = `7${(rand & 0xfff).toString(16).padStart(3, '0')}`
  const d = ((0x8000 | (rand >>> 16)) & 0xbfff).toString(16).padStart(4, '0')
  const e = (rand.toString(16) + counter.toString(16).padStart(4, '0')).padStart(12, '0').slice(-12)
  return `${a}-${b}-${c}-${d}-${e}`
}

const at = (offsetMinutes: number): string =>
  new Date(Date.parse('2026-09-14T13:00:00.000Z') + offsetMinutes * 60_000).toISOString()

const HUMAN = { actor: 'human', actorId: 'inspector', device: 'MacIntel', appVersion: '0.6.0' }
const SYSTEM = { actor: 'system', actorId: 'app', device: 'MacIntel', appVersion: '0.6.0' }

// ------------------------------------------------------------ media bytes

/** A real, decodable 1x1 JPEG. Padding after EOI varies size and checksum. */
const JPEG_BASE = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
    'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
)

function jpegOf(seedByte: number, padBytes: number): Buffer {
  const pad = Buffer.alloc(padBytes)
  for (let i = 0; i < padBytes; i++) pad[i] = (seedByte + i * 31) & 0xff
  return Buffer.concat([JPEG_BASE, pad])
}

/** A real, playable WAV — 44-byte header plus silence. */
function wavOf(samples: number): Buffer {
  const dataBytes = samples * 2
  const buf = Buffer.alloc(44 + dataBytes)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataBytes, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(16000, 24)
  buf.writeUInt32LE(32000, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataBytes, 40)
  for (let i = 0; i < samples; i++) buf.writeInt16LE(Math.round(Math.sin(i / 12) * 900), 44 + i * 2)
  return buf
}

const sha256 = (b: Buffer): string => createHash('sha256').update(b).digest('hex')

// ------------------------------------------------------- the config snapshot

/**
 * Compact but structurally faithful: the same shape as the real config, with
 * every item the synthetic visit actually resolves. `naReasons` carries the
 * feedsGapList / recordsFinding flags the builder reads per import, and the
 * layers include `monitor` so the language-lint question stays visible.
 */
const CONFIG_SNAPSHOT = {
  configId: 'checklists-baseline',
  configVersion: '1.3.0',
  naReasons: [
    { id: 'none-present', label: 'Confirmed absent', note: 'optional', feedsGapList: false, recordsFinding: true },
    { id: 'no-access', label: 'Not accessible today', note: 'recommended', feedsGapList: true, recordsFinding: false },
    { id: 'not-applicable', label: "Doesn't apply to this property/zone", note: 'optional', feedsGapList: false, recordsFinding: false },
    { id: 'deferred', label: 'Deferred to visit two', note: 'optional', feedsGapList: true, recordsFinding: false },
  ],
  layers: [
    { id: 'issues', label: 'Issues', predicate: { flags: ['issue'] } },
    { id: 'monitor', label: 'Monitoring', predicate: { flags: ['monitor'] } },
    { id: 'shutoffs', label: 'Shutoffs & controls', predicate: { componentTypes: ['water-main', 'electrical-panel'] } },
    { id: 'comparison', label: 'Comparison positions', predicate: { componentTypes: ['comparison-position', 'foundation-crack'] } },
    { id: 'all', label: 'All pins', predicate: {} },
  ],
  propertyFlags: [
    { id: 'well', label: 'Private well', intakeSource: 'Water source' },
    { id: 'septic', label: 'Septic system', intakeSource: 'Sewage' },
    { id: 'waterfront', label: 'Waterfront/shoreline', intakeSource: 'Waterfront' },
  ],
  zoneAttributes: [
    { id: 'finished', label: 'Finished space', askAtCreation: true },
    { id: 'sleeping', label: 'Used for sleeping', askAtCreation: true },
    { id: 'has_stairs', label: 'Contains stairs', askAtCreation: true },
  ],
  zoneTypes: [
    { id: 'utility', typicalLabels: ['mechanical room'], inherits: ['interior-base', 'rough-base'] },
    { id: 'living-space', typicalLabels: ['bedroom', 'living'], inherits: ['interior-base'] },
    // The exterior zone the real export never exercises. Photo-only canvas model.
    { id: 'elevation', typicalLabels: ['north side', 'front', 'rear'], inherits: ['exterior-base'] },
  ],
  baseLists: [
    {
      id: 'interior-base',
      items: [
        { id: 'int.canvas', text: 'Zone has a canvas covering all walls', satisfy: 'check', tier: 'core', attest: 'evidence', scope: ['baseline'] },
        { id: 'int.surfaces', text: 'Ceiling, walls, floor scanned', satisfy: 'check', tier: 'core', attest: 'action', scope: ['baseline'] },
        { id: 'int.moisture-suspect', text: 'Any stain metered and the reading recorded', satisfy: 'measure', tier: 'core', attest: 'action', scope: ['baseline', 'monthly'], unit: '%' },
        { id: 'int.receptacles', text: 'Representative receptacles tested', satisfy: 'check', tier: 'core', attest: 'action', scope: ['baseline'] },
        { id: 'int.lighting', text: 'Switches and fixtures function', satisfy: 'check', tier: 'standard', attest: 'action', scope: ['baseline'] },
        { id: 'liv.fireplace', text: 'Fireplace/insert pinned if present', satisfy: 'pin', tier: 'standard', attest: 'evidence', scope: ['baseline'], pinTypes: ['fireplace'] },
      ],
    },
    {
      id: 'rough-base',
      items: [
        { id: 'rgh.access', text: 'Access route and headroom noted', satisfy: 'note', tier: 'standard', attest: 'evidence', scope: ['baseline'] },
      ],
    },
    {
      id: 'exterior-base',
      items: [
        { id: 'ext.canvas', text: 'Elevation photographed corner to corner', satisfy: 'photo', tier: 'core', attest: 'evidence', scope: ['baseline'] },
        { id: 'ext.cladding', text: 'Cladding condition scanned', satisfy: 'check', tier: 'core', attest: 'action', scope: ['baseline'] },
        { id: 'ext.grade', text: 'Grade falls away from foundation — measured at the worst point', satisfy: 'measure', tier: 'core', attest: 'action', scope: ['baseline'], unit: 'mm/m' },
        { id: 'ext.penetrations', text: 'Penetrations sealed', satisfy: 'check', tier: 'standard', attest: 'action', scope: ['baseline'] },
      ],
    },
  ],
  zoneLists: [
    {
      zoneType: 'utility',
      items: [
        { id: 'utl.water-heater', text: 'Water heater pinned', satisfy: 'pin', tier: 'core', attest: 'evidence', scope: ['baseline'], pinTypes: ['water-heater'], group: 'Water' },
        { id: 'utl.pressure', text: 'Static water pressure measured', satisfy: 'measure', tier: 'core', attest: 'action', scope: ['baseline'], unit: 'psi', group: 'Water' },
        { id: 'utl.panel', text: 'Main panel pinned; directory photographed', satisfy: 'pin', tier: 'core', attest: 'evidence', scope: ['baseline'], pinTypes: ['electrical-panel'], group: 'Electrical' },
        { id: 'utl.unidentified', text: 'Anything unidentified pinned as freeform', satisfy: 'check', tier: 'standard', attest: 'action', scope: ['baseline'], group: 'Close-out' },
      ],
    },
    { zoneType: 'living-space', items: [] },
    {
      zoneType: 'elevation',
      items: [
        { id: 'elv.roofline', text: 'Roofline and eaves photographed from grade', satisfy: 'photo', tier: 'standard', attest: 'evidence', scope: ['baseline'] },
      ],
    },
  ],
  componentLists: [
    {
      types: ['water-heater'],
      stub: false,
      items: [
        // The whole-unit photo: a distinct item class, and the object-level
        // comparison position. Framing it the same way next visit is what makes
        // year-over-year comparison possible at all.
        { id: 'wh.unit', text: 'Whole-unit photograph, framed to match prior visits', satisfy: 'photo', tier: 'core', attest: 'evidence', scope: ['baseline', 'monthly'] },
        { id: 'wh.nameplate', text: 'Nameplate photographed legibly', satisfy: 'photo', tier: 'core', attest: 'evidence', scope: ['baseline'] },
        { id: 'wh.age', text: 'Age decoded from serial and recorded', satisfy: 'note', tier: 'core', attest: 'evidence', scope: ['baseline'] },
        { id: 'wh.tpr', text: 'TPR valve present; discharge piped toward floor', satisfy: 'check', tier: 'core', attest: 'action', scope: ['baseline'] },
      ],
    },
    {
      types: ['electrical-panel'],
      stub: false,
      items: [
        { id: 'pnl.unit', text: 'Whole-unit photograph, framed to match prior visits', satisfy: 'photo', tier: 'core', attest: 'evidence', scope: ['baseline', 'monthly'] },
        { id: 'pnl.directory', text: 'Directory photographed', satisfy: 'photo', tier: 'core', attest: 'evidence', scope: ['baseline'] },
        { id: 'pnl.brand', text: 'Make and model recorded', satisfy: 'note', tier: 'core', attest: 'evidence', scope: ['baseline'] },
      ],
    },
    {
      types: ['comparison-position', 'foundation-crack'],
      stub: false,
      items: [
        { id: 'cmp.width', text: 'Crack width measured at the marked point', satisfy: 'measure', tier: 'core', attest: 'action', scope: ['baseline', 'monthly'], unit: 'mm' },
        { id: 'cmp.unit', text: 'Whole-position photograph, framed to match prior visits', satisfy: 'photo', tier: 'core', attest: 'evidence', scope: ['baseline', 'monthly'] },
      ],
    },
  ],
  sessionItems: [
    { id: 'ses.alarm-coverage', text: 'Alarm coverage judged against the pin set', satisfy: 'check', tier: 'core', attest: 'action', scope: ['baseline'] },
    { id: 'ses.triggers-confirmed', text: 'Triggered specialist referrals confirmed', satisfy: 'check', tier: 'core', attest: 'action', scope: ['baseline'] },
    { id: 'ses.termination-reconcile', text: 'Every termination traced to its source', satisfy: 'check', tier: 'standard', attest: 'action', scope: ['baseline'] },
  ],
}

const CONFIG_HASH = sha256(Buffer.from(JSON.stringify(CONFIG_SNAPSHOT)))

// ------------------------------------------------------------ the manifest

interface BuiltFile {
  path: string
  bytes: Buffer
}

export interface Fixture {
  manifest: Record<string, unknown>
  files: BuiltFile[]
  /** Grouping key per file, so per-zone zips can be built the way the field app does. */
  groups: Map<string, string>
}

export function buildFixture(): Fixture {
  const files: BuiltFile[] = []
  const groups = new Map<string, string>()
  const events: Record<string, unknown>[] = []
  let seq = 0

  const sessionId = uuidv7()
  const event = (type: string, payload: Record<string, unknown>, minutes: number, source = HUMAN) => {
    events.push({ type, ...payload, eventId: uuidv7(), sessionId, seq: ++seq, at: at(minutes), schemaVersion: 2, source })
  }

  event(
    'SessionInitialized',
    {
      configId: CONFIG_SNAPSHOT.configId,
      configVersion: CONFIG_SNAPSHOT.configVersion,
      configHash: CONFIG_HASH,
      propertyFlags: ['well', 'septic', 'waterfront'],
      propertyLabel: '12 Riverside Lane',
    },
    0,
    SYSTEM,
  )

  // ------------------------------------------------------------ zone ids
  const utilityId = uuidv7()
  const livingId = uuidv7()
  const elevationId = uuidv7()

  const media: Record<string, unknown>[] = []
  const addMedia = (args: {
    kind: string
    owner: Record<string, unknown>
    group: string
    path: string
    bytes: Buffer
    mime: string
    minutes: number
    durationMs?: number
  }): string => {
    const mediaId = uuidv7()
    const file = args.path.replace('{id}', mediaId)
    files.push({ path: file, bytes: args.bytes })
    groups.set(file, args.group)
    media.push({
      mediaId,
      kind: args.kind,
      owner: args.owner,
      group: args.group,
      file,
      mime: args.mime,
      bytes: args.bytes.length,
      sha256: sha256(args.bytes),
      capturedAt: at(args.minutes),
      ...(args.durationMs !== undefined ? { durationMs: args.durationMs } : {}),
      source: HUMAN,
    })
    return mediaId
  }

  // ------------------------------------------------- zone 1: utility (interior)
  event('ZoneCreated', { zoneId: utilityId, zoneType: 'utility', label: 'mechanical room', attributes: { finished: false, sleeping: false, has_stairs: false }, level: 'basement' }, 2)

  const utilCanvasId = uuidv7()
  const utilCanvasMedia = addMedia({
    kind: 'photo',
    owner: { kind: 'canvas', canvasId: utilCanvasId },
    group: utilityId,
    path: `media/${utilityId}/_canvas/{id}.jpg`,
    bytes: jpegOf(11, 4200),
    mime: 'image/jpeg',
    minutes: 3,
  })
  event('CanvasAdded', { zoneId: utilityId, canvasId: utilCanvasId, mediaId: utilCanvasMedia, kind: 'photo' }, 3)

  // Pin 1 — the water heater, WITH A NICKNAME (absent from every real export).
  const whPinId = uuidv7()
  event('PinCreated', { pinId: whPinId, pinNumber: 1, zoneId: utilityId }, 5)
  event('PinTyped', { pinId: whPinId, pinType: { kind: 'component', componentType: 'water-heater' } }, 5)

  // The whole-unit photo — the object-level comparison position.
  const whUnitMedia = addMedia({
    kind: 'photo',
    owner: { kind: 'pin', pinId: whPinId, pinNumber: 1 },
    group: utilityId,
    path: `media/${utilityId}/pin-1/{id}.jpg`,
    bytes: jpegOf(23, 5100),
    mime: 'image/jpeg',
    minutes: 6,
  })
  event('PhotoAdded', { mediaId: whUnitMedia, target: { kind: 'pin', id: whPinId } }, 6)

  const whNameplateMedia = addMedia({
    kind: 'photo',
    owner: { kind: 'pin', pinId: whPinId, pinNumber: 1 },
    group: utilityId,
    path: `media/${utilityId}/pin-1/{id}.jpg`,
    bytes: jpegOf(29, 3300),
    mime: 'image/jpeg',
    minutes: 7,
  })
  event('PhotoAdded', { mediaId: whNameplateMedia, target: { kind: 'pin', id: whPinId } }, 7)

  const whAnchorId = uuidv7()
  event('AnchorPlaced', { pinId: whPinId, anchorId: whAnchorId, canvasId: utilCanvasId, x: 0.31, y: 0.62 }, 8)

  // A VOICE NOTE — zero in every real export, though the kind is defined.
  const voiceMedia = addMedia({
    kind: 'voice',
    owner: { kind: 'pin', pinId: whPinId, pinNumber: 1 },
    group: utilityId,
    path: `media/${utilityId}/pin-1/{id}.wav`,
    bytes: wavOf(16000),
    mime: 'audio/wav',
    minutes: 9,
    durationMs: 1000,
  })
  event('PhotoAdded', { mediaId: voiceMedia, target: { kind: 'pin', id: whPinId } }, 9)

  const whNoteId = uuidv7()
  event('NoteAdded', { noteId: whNoteId, target: { kind: 'pin', id: whPinId }, text: 'Serial decodes to 2009. Owned, not rented.' }, 10)

  // Pin 2 — the panel, flagged as an issue.
  const panelPinId = uuidv7()
  event('PinCreated', { pinId: panelPinId, pinNumber: 2, zoneId: utilityId }, 12)
  event('PinTyped', { pinId: panelPinId, pinType: { kind: 'component', componentType: 'electrical-panel' } }, 12)
  event('PinFlagged', { pinId: panelPinId, flag: 'issue' }, 13)

  const panelUnitMedia = addMedia({
    kind: 'photo',
    owner: { kind: 'pin', pinId: panelPinId, pinNumber: 2 },
    group: utilityId,
    path: `media/${utilityId}/pin-2/{id}.jpg`,
    bytes: jpegOf(37, 4800),
    mime: 'image/jpeg',
    minutes: 13,
  })
  event('PhotoAdded', { mediaId: panelUnitMedia, target: { kind: 'pin', id: panelPinId } }, 13)

  const panelAnchorId = uuidv7()
  event('AnchorPlaced', { pinId: panelPinId, anchorId: panelAnchorId, canvasId: utilCanvasId, x: 0.78, y: 0.44 }, 14)

  const panelNoteId = uuidv7()
  event('NoteAdded', { noteId: panelNoteId, target: { kind: 'pin', id: panelPinId }, text: 'Federal Pacific Stab-Lok. Identified only — assessment referred.' }, 15)

  // Pin 3 — a freeform, the vocabulary-telemetry case.
  const freeformPinId = uuidv7()
  event('PinCreated', { pinId: freeformPinId, pinNumber: 3, zoneId: utilityId }, 16)
  event('PinTyped', { pinId: freeformPinId, pinType: { kind: 'freeform', label: 'mystery box' } }, 16)

  // A loose zone photo, nothing pointing at it — the ordinary mess.
  const utilZoneMedia = addMedia({
    kind: 'photo',
    owner: { kind: 'zone', zoneId: utilityId },
    group: utilityId,
    path: `media/${utilityId}/_zone/{id}.jpg`,
    bytes: jpegOf(41, 3900),
    mime: 'image/jpeg',
    minutes: 17,
  })
  event('PhotoAdded', { mediaId: utilZoneMedia, target: { kind: 'zone', id: utilityId } }, 17)

  // ------------------------------------------------ zone 2: living (interior)
  event('ZoneCreated', { zoneId: livingId, zoneType: 'living-space', label: 'living room', attributes: { finished: true, sleeping: false, has_stairs: false }, level: 'main' }, 22)

  const livCanvasId = uuidv7()
  const livCanvasMedia = addMedia({
    kind: 'photo',
    owner: { kind: 'canvas', canvasId: livCanvasId },
    group: livingId,
    path: `media/${livingId}/_canvas/{id}.jpg`,
    bytes: jpegOf(53, 4400),
    mime: 'image/jpeg',
    minutes: 23,
  })
  event('CanvasAdded', { zoneId: livingId, canvasId: livCanvasId, mediaId: livCanvasMedia, kind: 'photo' }, 23)

  // ------------------------------------------- zone 3: elevation (EXTERIOR)
  // Photo-only canvas model, and the first exterior zone anything has seen.
  event('ZoneCreated', { zoneId: elevationId, zoneType: 'elevation', label: 'north side', attributes: {}, level: 'exterior' }, 30)

  const elvCanvasId = uuidv7()
  const elvCanvasMedia = addMedia({
    kind: 'photo',
    owner: { kind: 'canvas', canvasId: elvCanvasId },
    group: elevationId,
    path: `media/${elevationId}/_canvas/{id}.jpg`,
    bytes: jpegOf(61, 6100),
    mime: 'image/jpeg',
    minutes: 31,
  })
  event('CanvasAdded', { zoneId: elevationId, canvasId: elvCanvasId, mediaId: elvCanvasMedia, kind: 'photo' }, 31)

  // Pin 4 — a comparison position on the exterior. Measured, not judged.
  const crackPinId = uuidv7()
  event('PinCreated', { pinId: crackPinId, pinNumber: 4, zoneId: elevationId }, 33)
  event('PinTyped', { pinId: crackPinId, pinType: { kind: 'component', componentType: 'foundation-crack' } }, 33)

  const crackUnitMedia = addMedia({
    kind: 'photo',
    owner: { kind: 'pin', pinId: crackPinId, pinNumber: 4 },
    group: elevationId,
    path: `media/${elevationId}/pin-4/{id}.jpg`,
    bytes: jpegOf(67, 5600),
    mime: 'image/jpeg',
    minutes: 34,
  })
  event('PhotoAdded', { mediaId: crackUnitMedia, target: { kind: 'pin', id: crackPinId } }, 34)

  const crackAnchorId = uuidv7()
  event('AnchorPlaced', { pinId: crackPinId, anchorId: crackAnchorId, canvasId: elvCanvasId, x: 0.52, y: 0.88 }, 35)

  const elvZoneMedia = addMedia({
    kind: 'photo',
    owner: { kind: 'zone', zoneId: elevationId },
    group: elevationId,
    path: `media/${elevationId}/_zone/{id}.jpg`,
    bytes: jpegOf(71, 4100),
    mime: 'image/jpeg',
    minutes: 36,
  })
  event('PhotoAdded', { mediaId: elvZoneMedia, target: { kind: 'zone', id: elevationId } }, 36)

  // An unassigned capture — the inbox is first-class, never buried.
  const inboxMedia = addMedia({
    kind: 'photo',
    owner: { kind: 'inbox' },
    group: '_misc',
    path: 'media/_misc/_inbox/{id}.jpg',
    bytes: jpegOf(79, 2900),
    mime: 'image/jpeg',
    minutes: 40,
  })
  event('PhotoAdded', { mediaId: inboxMedia, target: { kind: 'inbox' } }, 40)

  // -------------------------------------------------------- the resolutions
  const resolutions: Record<string, unknown>[] = []
  const resolve = (
    scope: Record<string, unknown>,
    itemId: string,
    resolution: Record<string, unknown>,
    minutes: number,
  ) => {
    resolutions.push({ scope, itemId, resolution, at: at(minutes), source: HUMAN })
    event('ItemResolved', { scope, itemId, resolution }, minutes)
  }

  const utilScope = { kind: 'zone', zoneId: utilityId }
  const livScope = { kind: 'zone', zoneId: livingId }
  const elvScope = { kind: 'zone', zoneId: elevationId }

  resolve(utilScope, 'int.canvas', { kind: 'satisfied', via: 'check' }, 18)
  resolve(utilScope, 'int.surfaces', { kind: 'satisfied', via: 'check', result: 'pass' }, 18)
  // A MEASURE resolution with a numeric value — eleven measure items exist in
  // the real config and not one of them ever fired.
  resolve(utilScope, 'int.moisture-suspect', { kind: 'satisfied', via: 'measure', value: 14.2, unit: '%', note: 'Metered at the floor slab near the tank.' }, 19)
  resolve(utilScope, 'int.receptacles', { kind: 'satisfied', via: 'check', result: 'fail', note: 'Two receptacles on the south wall are ungrounded.' }, 19)
  resolve(utilScope, 'int.lighting', { kind: 'satisfied', via: 'check', result: 'pass' }, 20)
  resolve(utilScope, 'liv.fireplace', { kind: 'na', reasonId: 'none-present' }, 20)
  resolve(utilScope, 'utl.water-heater', { kind: 'satisfied', via: 'pin', evidence: { pinId: whPinId } }, 20)
  resolve(utilScope, 'utl.pressure', { kind: 'satisfied', via: 'measure', value: 52, unit: 'psi' }, 21)
  resolve(utilScope, 'utl.panel', { kind: 'satisfied', via: 'pin', evidence: { pinId: panelPinId } }, 21)
  resolve(utilScope, 'utl.unidentified', { kind: 'satisfied', via: 'check', result: 'pass' }, 21)
  resolve(utilScope, 'rgh.access', { kind: 'satisfied', via: 'note', note: 'Hatch behind the tank, 1.5 m headroom.' }, 21)

  // Object-scoped: the water heater's own checklist, including `.unit`.
  const whScope = { kind: 'pin', pinId: whPinId }
  resolve(whScope, 'wh.unit', { kind: 'satisfied', via: 'photo', evidence: { mediaId: whUnitMedia } }, 10)
  resolve(whScope, 'wh.nameplate', { kind: 'satisfied', via: 'photo', evidence: { mediaId: whNameplateMedia } }, 10)
  resolve(whScope, 'wh.age', { kind: 'satisfied', via: 'note', note: 'Serial decodes to 2009.' }, 11)
  resolve(whScope, 'wh.tpr', { kind: 'satisfied', via: 'check', result: 'pass' }, 11)

  const panelScope = { kind: 'pin', pinId: panelPinId }
  resolve(panelScope, 'pnl.unit', { kind: 'satisfied', via: 'photo', evidence: { mediaId: panelUnitMedia } }, 15)
  resolve(panelScope, 'pnl.directory', { kind: 'na', reasonId: 'no-access' }, 15)
  resolve(panelScope, 'pnl.brand', { kind: 'satisfied', via: 'note', note: 'Federal Pacific Stab-Lok.' }, 15)

  const crackScope = { kind: 'pin', pinId: crackPinId }
  resolve(crackScope, 'cmp.width', { kind: 'satisfied', via: 'measure', value: 3.5, unit: 'mm', note: 'At the marked point, 400 mm above grade.' }, 35)
  resolve(crackScope, 'cmp.unit', { kind: 'satisfied', via: 'photo', evidence: { mediaId: crackUnitMedia } }, 35)

  resolve(elvScope, 'ext.canvas', { kind: 'satisfied', via: 'photo', evidence: { mediaId: elvCanvasMedia } }, 37)
  resolve(elvScope, 'ext.cladding', { kind: 'satisfied', via: 'check', result: 'pass' }, 37)
  resolve(elvScope, 'ext.grade', { kind: 'satisfied', via: 'measure', value: 18, unit: 'mm/m' }, 38)
  resolve(elvScope, 'ext.penetrations', { kind: 'na', reasonId: 'deferred' }, 38)
  resolve(elvScope, 'elv.roofline', { kind: 'satisfied', via: 'photo', evidence: { mediaId: elvZoneMedia } }, 38)

  // Living room left substantially unworked — the ordinary shape of a real visit.
  resolve(livScope, 'int.canvas', { kind: 'satisfied', via: 'check' }, 24)

  const sessionScope = { kind: 'session' }
  resolve(sessionScope, 'ses.alarm-coverage', { kind: 'satisfied', via: 'check', result: 'pass' }, 45)
  resolve(sessionScope, 'ses.triggers-confirmed', { kind: 'satisfied', via: 'check', result: 'pass' }, 45)

  // Resolved, then reopened, then resolved again — so resolutions[] is genuinely
  // a projection of the log rather than a copy of it.
  resolve(sessionScope, 'ses.termination-reconcile', { kind: 'satisfied', via: 'check', result: 'pass' }, 46)
  event('ItemReopened', { scope: sessionScope, itemId: 'ses.termination-reconcile' }, 47)
  resolutions.pop()
  resolve(sessionScope, 'ses.termination-reconcile', { kind: 'na', reasonId: 'deferred' }, 48)

  // ------------------------------------------------------------- close-out
  event('ZoneClosed', { zoneId: utilityId }, 22)
  event('ZoneClosed', { zoneId: livingId }, 29)
  event('ZoneClosed', { zoneId: elevationId }, 42)
  event('SessionCompleted', {}, 49)
  event('SessionReopened', { reason: 'Grade measurement re-checked' }, 50)
  event('ZoneReopened', { zoneId: elevationId, note: 'Grade measurement re-checked' }, 50)
  event('ZoneClosed', { zoneId: elevationId }, 52)
  event('SessionCompleted', {}, 53)

  // ---------------------------------------------------------- a chat thread
  const threadId = uuidv7()
  event('ChatMessageSent', { threadId, target: { kind: 'pin', id: freeformPinId }, text: 'What is this box?' }, 41)
  event('ChatReplyRecorded', { threadId, model: 'claude-sonnet-5', usage: { input: 820, output: 140 } }, 41)

  const photoMedia = media.filter((m) => m.kind === 'photo')
  const voiceMediaRecords = media.filter((m) => m.kind === 'voice')

  const manifest = {
    manifestSchemaVersion: 3,
    session: {
      sessionId,
      propertyLabel: '12 Riverside Lane',
      flags: ['well', 'septic', 'waterfront'],
      startedAt: at(0),
      completedAt: at(53),
      lifecycle: [
        { type: 'completed', at: at(49) },
        { type: 'reopened', at: at(50), reason: 'Grade measurement re-checked' },
        { type: 'completed', at: at(53) },
      ],
      exportedAt: at(55),
      appVersion: '0.6.0',
    },
    config: {
      configId: CONFIG_SNAPSHOT.configId,
      version: CONFIG_SNAPSHOT.configVersion,
      hash: CONFIG_HASH,
      snapshot: CONFIG_SNAPSHOT,
    },
    zones: [
      {
        zoneId: utilityId,
        type: 'utility',
        label: 'mechanical room',
        level: 'basement',
        attributes: { finished: false, sleeping: false, has_stairs: false },
        closedAt: at(22),
        closeNote: null,
        canvases: [{ canvasId: utilCanvasId, kind: 'photo', retired: false, mediaId: utilCanvasMedia, file: `media/${utilityId}/_canvas/${utilCanvasMedia}.jpg` }],
        audit: { coreUnresolved: [], standardUnresolved: 0, naCount: 1 },
      },
      {
        zoneId: livingId,
        type: 'living-space',
        label: 'living room',
        level: 'main',
        attributes: { finished: true, sleeping: false, has_stairs: false },
        closedAt: at(29),
        closeNote: null,
        canvases: [{ canvasId: livCanvasId, kind: 'photo', retired: false, mediaId: livCanvasMedia, file: `media/${livingId}/_canvas/${livCanvasMedia}.jpg` }],
        audit: { coreUnresolved: ['int.surfaces', 'int.moisture-suspect', 'int.receptacles'], standardUnresolved: 2, naCount: 0 },
      },
      {
        zoneId: elevationId,
        type: 'elevation',
        label: 'north side',
        level: 'exterior',
        attributes: {},
        closedAt: at(52),
        closeNote: null,
        canvases: [{ canvasId: elvCanvasId, kind: 'photo', retired: false, mediaId: elvCanvasMedia, file: `media/${elevationId}/_canvas/${elvCanvasMedia}.jpg` }],
        audit: { coreUnresolved: [], standardUnresolved: 0, naCount: 1 },
      },
    ],
    pins: [
      {
        pinId: whPinId,
        number: 1,
        zoneId: utilityId,
        type: { kind: 'component', componentType: 'water-heater' },
        // The NICKNAME the contract's telemetry requires and no real export has.
        label: 'the old beast',
        flag: null,
        anchors: [{ anchorId: whAnchorId, canvasId: utilCanvasId, x: 0.31, y: 0.62 }],
        mediaIds: [whUnitMedia, whNameplateMedia, voiceMedia],
        noteIds: [whNoteId],
        chatThreadIds: [],
      },
      {
        pinId: panelPinId,
        number: 2,
        zoneId: utilityId,
        type: { kind: 'component', componentType: 'electrical-panel' },
        flag: 'issue',
        anchors: [{ anchorId: panelAnchorId, canvasId: utilCanvasId, x: 0.78, y: 0.44 }],
        mediaIds: [panelUnitMedia],
        noteIds: [panelNoteId],
        chatThreadIds: [],
      },
      {
        pinId: freeformPinId,
        number: 3,
        zoneId: utilityId,
        type: { kind: 'freeform', label: 'mystery box' },
        flag: null,
        anchors: [],
        mediaIds: [],
        noteIds: [],
        chatThreadIds: [threadId],
      },
      {
        pinId: crackPinId,
        number: 4,
        zoneId: elevationId,
        type: { kind: 'component', componentType: 'foundation-crack' },
        flag: 'monitor',
        anchors: [{ anchorId: crackAnchorId, canvasId: elvCanvasId, x: 0.52, y: 0.88 }],
        mediaIds: [crackUnitMedia],
        noteIds: [],
        chatThreadIds: [],
      },
    ],
    inbox: { mediaIds: [inboxMedia], noteIds: [] },
    notes: [
      { noteId: whNoteId, target: { kind: 'pin', id: whPinId }, text: 'Serial decodes to 2009. Owned, not rented.', at: at(10), source: HUMAN },
      { noteId: panelNoteId, target: { kind: 'pin', id: panelPinId }, text: 'Federal Pacific Stab-Lok. Identified only — assessment referred.', at: at(15), source: HUMAN },
    ],
    chats: [
      {
        threadId,
        target: { kind: 'pin', id: freeformPinId },
        messages: [
          { role: 'user', text: 'What is this box?', mediaIds: [], model: null, at: at(41), source: HUMAN },
          {
            role: 'assistant',
            text: 'It looks like a low-voltage transformer enclosure. Photograph any label on the underside — that will identify it. I cannot tell you whether it is wired correctly; that is an electrician’s call.',
            mediaIds: null,
            model: 'claude-sonnet-5',
            at: at(41),
            source: { actor: 'ai', actorId: 'claude-sonnet-5', device: 'server', appVersion: '0.6.0' },
          },
        ],
      },
    ],
    resolutions,
    media,
    totals: {
      zones: 3,
      pins: 4,
      canvases: 3,
      photos: photoMedia.length,
      voiceNotes: voiceMediaRecords.length,
      notes: 2,
      chats: 1,
      inboxItems: 1,
      mediaFiles: media.length,
      mediaBytes: media.reduce((n, m) => n + (m.bytes as number), 0),
    },
    orphanEvents: [],
    events,
  }

  return { manifest, files, groups }
}

// ------------------------------------------------------------------- output

function writeZip(path: string, entries: BuiltFile[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const zip = new yazl.ZipFile()
    for (const f of entries) zip.addBuffer(f.bytes, f.path)
    zip.end()
    mkdirSync(dirname(path), { recursive: true })
    const out = zip.outputStream.pipe(createWriteStream(path))
    out.on('close', () => resolvePromise())
    out.on('error', reject)
  })
}

export async function writeFixture(outDir: string): Promise<{ manifestPath: string; zipPaths: string[] }> {
  const { manifest, files, groups } = buildFixture()

  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })

  const manifestPath = join(outDir, 'manifest.json')
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')

  // The loose media tree, at the export's own relative paths.
  for (const f of files) {
    const full = join(outDir, f.path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, f.bytes)
  }

  // Per-zone zips plus `_misc`, the way the field app groups them.
  const byGroup = new Map<string, BuiltFile[]>()
  for (const f of files) {
    const group = groups.get(f.path) ?? '_misc'
    byGroup.set(group, [...(byGroup.get(group) ?? []), f])
  }
  const zipPaths: string[] = []
  for (const [group, entries] of byGroup) {
    const path = join(outDir, 'zips', `${group}.zip`)
    await writeZip(path, entries)
    zipPaths.push(path)
  }

  return { manifestPath, zipPaths }
}

// Run directly: npx tsx server/scripts/make-fixture.ts [outDir]
if (process.argv[1] && process.argv[1].endsWith('make-fixture.ts')) {
  const outDir = process.argv[2] ?? join(repoRoot, 'fixtures', 'synthetic')
  const { manifestPath, zipPaths } = await writeFixture(outDir)
  const { manifest } = buildFixture()
  const totals = manifest.totals as Record<string, number>
  console.log(`wrote ${manifestPath}`)
  console.log(`  ${totals.zones} zones · ${totals.pins} pins · ${totals.mediaFiles} files (${totals.photos} photos, ${totals.voiceNotes} voice)`)
  console.log(`  ${zipPaths.length} media archives in ${join(outDir, 'zips')}`)
}
