/**
 * Shapes of the field export, as observed in the real v3 manifest.
 *
 * These types are deliberately loose about vocabulary. Every `kind`, `via`,
 * `type` and `flag` is `string`, never a union of known values — the field app
 * is still adding words (a `choice` resolution kind is coming; `video` media is
 * coming; `voice` may be renamed `audio`). A union type here would turn a new
 * word into a compile error, which is precisely the failure mode doctrine
 * forbids. Recognition is checked at runtime and reported, never enforced by
 * the type system.
 *
 * Where the shipped export differs from the contract document, these follow the
 * export. See /docs/HouseSteady_Manifest-Contract_v3_Observed-Addendum_2026-07-27.md
 */

export interface Source {
  actor?: string
  actorId?: string
  device?: string
  appVersion?: string
}

export interface LifecycleEntry {
  type?: string // completed | reopened
  at?: string
  reason?: string
}

export interface ManifestSession {
  sessionId?: string
  propertyLabel?: string
  flags?: string[]
  startedAt?: string
  completedAt?: string
  exportedAt?: string
  lifecycle?: LifecycleEntry[]
  appVersion?: string
}

export interface NaReason {
  id: string
  label?: string
  note?: string
  feedsGapList?: boolean
  recordsFinding?: boolean
}

export interface ItemDef {
  id: string
  text?: string
  satisfy?: string
  tier?: string
  attest?: string
  scope?: string[]
  pinTypes?: string[]
  trigger?: { anyOf?: string[] }
  unit?: string
  group?: string
}

export interface ConfigSnapshot {
  configId?: string
  configVersion?: string
  naReasons?: NaReason[]
  layers?: unknown[]
  propertyFlags?: unknown[]
  zoneTypes?: { id: string; inherits?: string[] }[]
  zoneAttributes?: unknown[]
  baseLists?: { id: string; items?: ItemDef[] }[]
  zoneLists?: { zoneType: string; items?: ItemDef[] }[]
  componentLists?: { types?: string[]; stub?: boolean; items?: ItemDef[] }[]
  sessionItems?: ItemDef[]
}

export interface ManifestConfig {
  configId?: string
  version?: string
  hash?: string
  snapshot?: ConfigSnapshot
}

export interface Canvas {
  canvasId?: string
  kind?: string
  retired?: boolean
  mediaId?: string
  file?: string
}

export interface ZoneAudit {
  coreUnresolved?: string[]
  standardUnresolved?: number
  naCount?: number
}

export interface Zone {
  zoneId?: string
  type?: string
  label?: string
  level?: string
  attributes?: Record<string, unknown>
  closedAt?: string
  closeNote?: string | null
  canvases?: Canvas[]
  audit?: ZoneAudit
}

export interface Anchor {
  anchorId?: string
  canvasId?: string
  x?: number
  y?: number
}

/**
 * `type` is ABSENT on typeless pins in the real export — the key is missing, not
 * set to null. Two of eleven pins in the reference file are like this.
 * There is no `label` (nickname) field in the shipped export; see Addendum §8.1.
 */
export interface PinType {
  kind?: string // component | freeform
  componentType?: string
  label?: string // the freeform text
}

export interface Pin {
  pinId?: string
  number?: number
  zoneId?: string
  type?: PinType
  label?: string // reserved: nickname, not present in the observed export
  flag?: string | null
  retired?: { at?: string }
  anchors?: Anchor[]
  mediaIds?: string[]
  noteIds?: string[]
  chatThreadIds?: string[]
}

export interface MediaOwner {
  kind?: string // zone | pin | canvas | inbox
  zoneId?: string
  pinId?: string
  pinNumber?: number
  canvasId?: string
}

export interface MediaRecord {
  mediaId?: string
  kind?: string
  owner?: MediaOwner
  group?: string
  file?: string
  mime?: string
  bytes?: number
  sha256?: string
  capturedAt?: string
  durationMs?: number
  source?: Source
}

export interface Note {
  noteId?: string
  target?: { kind?: string; id?: string }
  text?: string
  at?: string
  source?: Source
}

/** Messages carry no `seq` — order is array position. */
export interface ChatMessage {
  role?: string
  text?: string
  mediaIds?: string[] | null
  model?: string | null
  at?: string
  source?: Source
}

export interface ChatThread {
  threadId?: string
  target?: { kind?: string; id?: string }
  messages?: ChatMessage[]
}

/** `evidence` lives INSIDE the resolution object, alongside kind/via/result. */
export interface ResolutionBody {
  kind?: string
  via?: string
  result?: string
  note?: string
  reasonId?: string
  evidence?: Record<string, unknown>
}

export interface Resolution {
  scope?: { kind?: string; zoneId?: string; pinId?: string }
  itemId?: string
  resolution?: ResolutionBody
  at?: string
  source?: Source
}

export interface ManifestEvent {
  type?: string
  eventId?: string
  seq?: number
  at?: string
  schemaVersion?: number
  source?: Source
  [k: string]: unknown // payload fields are flat on the event object
}

export interface Totals {
  zones?: number
  pins?: number
  canvases?: number
  photos?: number
  voiceNotes?: number
  notes?: number
  chats?: number
  inboxItems?: number
  mediaFiles?: number
  mediaBytes?: number
}

/** `inbox` is an OBJECT of reference arrays, not a list of items. */
export interface Inbox {
  mediaIds?: string[]
  noteIds?: string[]
}

export interface Manifest {
  manifestSchemaVersion?: number
  session?: ManifestSession
  config?: ManifestConfig
  zones?: Zone[]
  pins?: Pin[]
  inbox?: Inbox
  notes?: Note[]
  chats?: ChatThread[]
  resolutions?: Resolution[]
  media?: MediaRecord[]
  totals?: Totals
  orphanEvents?: unknown[]
  events?: ManifestEvent[]
}

/** Every item definition in a config snapshot, flattened. */
export function allItemDefs(snapshot: ConfigSnapshot | undefined): ItemDef[] {
  if (!snapshot) return []
  return [
    ...(snapshot.baseLists ?? []).flatMap((l) => l.items ?? []),
    ...(snapshot.zoneLists ?? []).flatMap((l) => l.items ?? []),
    ...(snapshot.componentLists ?? []).flatMap((l) => l.items ?? []),
    ...(snapshot.sessionItems ?? []),
  ]
}

/** Every component type the config declares. */
export function allComponentTypes(snapshot: ConfigSnapshot | undefined): string[] {
  return [...new Set((snapshot?.componentLists ?? []).flatMap((l) => l.types ?? []))]
}
