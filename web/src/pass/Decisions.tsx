import { useState } from 'react'
import { Lightbox } from './Lightbox.js'
import {
  thumbUrl,
  type DecisionItem,
  type DecisionReason,
  type NaReason,
  type PassPin,
  type PassZone,
  type PhotoTile,
} from '../api.js'

/**
 * One decision, in the room it belongs to.
 *
 * THE BUTTON LABEL IS THE CLAIM (spec §2). It reads "Matches the photo" — not
 * Verify, not Approve, not Confirm. A signature here means "I observed this,
 * and this description matches what I saw", and the moment the button says
 * Approve it starts meaning something the concierge cannot defend and a
 * homeowner may act on. There is a doctrine scan in the test suite that fails
 * the build if those words appear in this path.
 */

/** Why this is in front of you, said plainly. Never a word implying trouble. */
const REASON_TEXT: Record<DecisionReason, string> = {
  'typeless-pin': 'never typed',
  'pin-flagged-issue': 'flagged in the field',
  'failed-check': 'check did not pass',
  na: 'marked not applicable',
  'inbox-unassigned': 'not attached to anything',
}

/**
 * How a pin reads, everywhere it appears.
 *
 * One helper rather than three call sites, because they drifted: the decision
 * card said "Pin 3 · mystery box" while the unplaced-pin chip said "3 mystery
 * box", which scans as a quantity — three mystery boxes rather than pin three.
 */
export const pinLabel = (p: { number: number | null; componentType: string | null; freeformLabel: string | null }): string =>
  `Pin ${p.number ?? '—'} · ${p.componentType ?? p.freeformLabel ?? 'never typed'}`

export interface ActHandlers {
  confirm: (d: DecisionItem) => void
  correct: (d: DecisionItem, field: string, newValue: unknown) => void
  assign: (d: DecisionItem, toKind: string, toId: string) => void
  flag: (d: DecisionItem, reason: string) => void
  undo: (overlayId: string) => void
}

export function DecisionRow({
  visitId,
  zone,
  item,
  selected,
  vocabulary,
  acts,
  onSelect,
  assist,
}: {
  visitId: string
  zone: PassZone | null
  item: DecisionItem
  selected: boolean
  vocabulary: { componentTypes: string[]; naReasons: NaReason[] }
  acts: ActHandlers
  onSelect: () => void
  /**
   * A proposal about this same thing, rendered after the evidence.
   *
   * Increment 2b §7 puts the assists in the fresh pass rather than on a screen
   * of their own, and this is the seam: a typeless pin's suggested type and a
   * loose photograph's suggested pin belong in the row that already asks about
   * that pin or that photograph, under the evidence and above the acts.
   */
  assist?: React.ReactNode
}) {
  const [editing, setEditing] = useState<null | 'correct' | 'assign' | 'flag'>(null)
  const [reopened, setReopened] = useState(false)
  const state = item.state
  const live = state?.trail.filter((t) => t.live) ?? []

  /**
   * A decided card collapses to one line.
   *
   * On a fifteen-decision room the alternative is scrolling past your own
   * finished work to reach what is left, which is the opposite of what this
   * screen is for. Collapsing lets the remaining items rise on their own as you
   * work down the list.
   *
   * Deliberately NOT re-sorting decided items to the bottom: rows would jump
   * under the cursor as you press `c`, and `j`/`k` would lose their place mid
   * -keystroke. Collapsing gets the same result without anything moving.
   */
  if (item.decided && !reopened) {
    return (
      <div
        className={`decision decided collapsed${selected ? ' selected' : ''}`}
        id={`decision-${item.key}`}
        onClick={() => {
          onSelect()
          setReopened(true)
        }}
      >
        <span className="decision-headline">{item.headline}</span>
        <span className="trail inline">
          {state?.trail.map((t) => (
            <span key={t.overlay.id} className={`trail-step${t.live ? ' live' : ''}`}>
              {t.verb}
              {t.overlay.reason ? `: ${t.overlay.reason}` : ''}
            </span>
          ))}
        </span>
        {live.length > 0 && (
          <button
            className="link"
            onClick={(e) => {
              e.stopPropagation()
              acts.undo(live.at(-1)!.overlay.id)
            }}
          >
            undo <kbd>u</kbd>
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      className={`decision${selected ? ' selected' : ''}${item.decided ? ' decided' : ''}`}
      onClick={onSelect}
      id={`decision-${item.key}`}
    >
      <div className="decision-head">
        <div>
          <div className="decision-headline">{item.headline}</div>
          <div className="decision-why">
            {item.reasons.map((r) => (
              <span key={r} className={`tag ${r}`}>
                {REASON_TEXT[r]}
              </span>
            ))}
          </div>
        </div>
        <div className="decision-acts">
          {/*
            The claim, in the narrowest words available. Everything else on this
            row is a way of saying the record does NOT match the evidence.
          */}
          <button className="primary" onClick={() => acts.confirm(item)}>
            Matches the photo <kbd>c</kbd>
          </button>
          <button className="ghost" onClick={() => setEditing(editing === 'correct' ? null : 'correct')}>
            Correct <kbd>e</kbd>
          </button>
          {item.photo && (
            <button className="ghost" onClick={() => setEditing(editing === 'assign' ? null : 'assign')}>
              Attach <kbd>a</kbd>
            </button>
          )}
          <button className="ghost" onClick={() => setEditing(editing === 'flag' ? null : 'flag')}>
            Closer look <kbd>f</kbd>
          </button>
        </div>
      </div>

      {item.resolution && <ResolutionEvidence item={item} />}
      {item.pin && <PinEvidence visitId={visitId} pin={item.pin} />}
      {item.photo && (
        <div className="tiles">
          <PhotoTileView visitId={visitId} photo={item.photo} />
        </div>
      )}

      {assist}

      {editing === 'correct' && (
        <CorrectEditor
          item={item}
          vocabulary={vocabulary}
          onDone={(field, value) => {
            acts.correct(item, field, value)
            setEditing(null)
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {editing === 'assign' && zone && (
        <AssignEditor
          zone={zone}
          onDone={(toKind, toId) => {
            acts.assign(item, toKind, toId)
            setEditing(null)
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {editing === 'flag' && (
        <FlagEditor
          onDone={(reason) => {
            acts.flag(item, reason)
            setEditing(null)
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {/*
        The trail, when there is one. Reads "assigned, unassigned, reassigned" —
        the honest sentence, not a tidied one. Undo is one click from here and
        one keystroke from anywhere.
      */}
      {state && state.trail.length > 0 && (
        <div className="trail">
          {state.trail.map((t) => (
            <span key={t.overlay.id} className={`trail-step${t.live ? ' live' : ''}`}>
              {t.verb}
              {t.overlay.reason ? `: ${t.overlay.reason}` : ''}
            </span>
          ))}
          {live.length > 0 && (
            <button className="link" onClick={() => acts.undo(live.at(-1)!.overlay.id)}>
              undo <kbd>u</kbd>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ResolutionEvidence({ item }: { item: DecisionItem }) {
  const r = item.resolution!
  return (
    <dl className="evidence">
      <div>
        <dt>Item</dt>
        <dd className="mono">{r.itemId}</dd>
      </div>
      {r.scopePinNumber !== null && (
        <div>
          <dt>Pin</dt>
          <dd>{r.scopePinNumber}</dd>
        </div>
      )}
      {r.result && (
        <div>
          <dt>Result</dt>
          <dd>{r.result}</dd>
        </div>
      )}
      {r.reasonId && (
        <div>
          <dt>Reason</dt>
          <dd>
            {r.reasonLabel ?? r.reasonId}
            {r.reasonLabel === null && <span className="muted"> (not in this config)</span>}
          </dd>
        </div>
      )}
      {r.note && (
        <div>
          <dt>Field note</dt>
          <dd>{r.note}</dd>
        </div>
      )}
    </dl>
  )
}

function PinEvidence({ visitId, pin }: { visitId: string; pin: PassPin }) {
  const [zoomedId, setZoomedId] = useState<string | null>(null)
  return (
    <>
      {pin.notes.length > 0 && (
        <ul className="notes">
          {pin.notes.map((n) => (
            <li key={n.noteId}>{n.text}</li>
          ))}
        </ul>
      )}
      {pin.mediaIds.length > 0 && (
        <div className="tiles">
          {pin.mediaIds.map((id) => (
            <button key={id} type="button" className="tile-open" onClick={() => setZoomedId(id)}>
              <img loading="lazy" src={thumbUrl(visitId, id, 400)} alt={`Photo on pin ${pin.number ?? ''}`} />
            </button>
          ))}
        </div>
      )}
      {zoomedId && (
        <Lightbox
          visitId={visitId}
          mediaId={zoomedId}
          caption={`pin ${pin.number ?? ''}`.trim()}
          onClose={() => setZoomedId(null)}
        />
      )}
    </>
  )
}

/**
 * One photo tile.
 *
 * Spec §5.3: room photos are "browsable, **attachable**". Browsable was here
 * from the start and attachable was not — the tile rendered an image and
 * nothing else, so `a` only ever reached a loose inbox photo. That is the gap
 * this `onAttach` closes.
 *
 * Attaching stays entirely optional. Leaving a photo with the room is a
 * finished state, not an unresolved one, and none of these tiles appears in the
 * decision count — most room photos are context, and requiring assignment would
 * turn the pass into the chore this design exists to avoid.
 */
export function PhotoTileView({
  visitId,
  photo,
  zone,
  acts,
}: {
  visitId: string
  photo: PhotoTile
  /** Omit to render a plain, non-attachable tile (pin evidence, inbox preview). */
  zone?: PassZone | null
  acts?: ActHandlers
}) {
  const [attaching, setAttaching] = useState(false)

  // Each state says which it is. A quarantined file and a file that never
  // arrived are different facts, and neither is a broken image icon.
  if (photo.fileStatus === 'absent') {
    return <div className="tile absent">not on this machine</div>
  }
  if (photo.fileStatus === 'failed_checksum') {
    return <div className="tile failed">checksum did not match — kept, not counted as evidence</div>
  }

  const isImage = (photo.mime ?? '').startsWith('image/')
  const [zoomed, setZoomed] = useState(false)
  const assigned = photo.state?.assign
  const to = assigned?.newValue as { toKind?: string; toId?: string } | undefined
  const attachedPin = to?.toKind === 'pin' ? zone?.pins.find((p) => p.pinId === to.toId) : undefined
  const canAttach = Boolean(zone && acts)

  return (
    <div className="tile-wrap">
      {isImage ? (
        <button type="button" className="tile-open" onClick={() => setZoomed(true)}>
          <img loading="lazy" src={thumbUrl(visitId, photo.mediaId, 400)} alt="" />
        </button>
      ) : (
        // A voice note or a video has nothing for a magnifier to enlarge. The
        // kind is shown instead, which is what it was already doing.
        <span className="tile other">{photo.kind ?? 'file'}</span>
      )}
      {zoomed && (
        <Lightbox visitId={visitId} mediaId={photo.mediaId} onClose={() => setZoomed(false)} />
      )}

      {assigned ? (
        <div className="tile-state">
          <span>
            on {attachedPin ? pinLabel(attachedPin).toLowerCase() : to?.toKind === 'zone' ? 'the room' : 'something'}
          </span>
          {acts && (
            <button className="link" onClick={() => acts.undo(assigned.id)}>
              undo
            </button>
          )}
        </div>
      ) : canAttach ? (
        <button className="link tile-state" onClick={() => setAttaching((v) => !v)}>
          attach to a pin
        </button>
      ) : null}

      {attaching && zone && acts && (
        <AssignEditor
          zone={zone}
          onDone={(toKind, toId) => {
            // The tile is not a decision row, so the act is addressed directly
            // at the media — same overlay, same trail, same undo.
            acts.assign(
              { targetKind: 'media', targetId: photo.mediaId } as DecisionItem,
              toKind,
              toId,
            )
            setAttaching(false)
          }}
          onCancel={() => setAttaching(false)}
        />
      )}
    </div>
  )
}

// ------------------------------------------------------------------- editors

/**
 * What the desk may change, and only that.
 *
 * There is no free-text box for a serial or a nameplate here on purpose: the v3
 * export carries no structured nameplate fields, so there is nothing captured to
 * correct, and a box to type one into would be a place to record a value with no
 * evidence behind it. Those arrive with extraction in 2b.
 */
function CorrectEditor({
  item,
  vocabulary,
  onDone,
  onCancel,
}: {
  item: DecisionItem
  vocabulary: { componentTypes: string[]; naReasons: NaReason[] }
  onDone: (field: string, value: unknown) => void
  onCancel: () => void
}) {
  const [componentType, setComponentType] = useState('')
  const [freeform, setFreeform] = useState('')
  const [reasonId, setReasonId] = useState(item.resolution?.reasonId ?? '')
  const [note, setNote] = useState(item.resolution?.note ?? '')

  if (item.targetKind === 'pin') {
    return (
      <div className="editor" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <select value={componentType} onChange={(e) => { setComponentType(e.target.value); setFreeform('') }}>
            <option value="">Pick a component type…</option>
            {vocabulary.componentTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <span className="muted">or</span>
          <input
            placeholder="describe it in your own words"
            value={freeform}
            onChange={(e) => { setFreeform(e.target.value); setComponentType('') }}
          />
          <button
            disabled={!componentType && !freeform.trim()}
            onClick={() =>
              onDone('type', componentType
                ? { kind: 'component', componentType, freeformLabel: null }
                : { kind: 'freeform', componentType: null, freeformLabel: freeform.trim() })
            }
          >
            Record the correction
          </button>
          <button className="ghost" onClick={onCancel}>Cancel</button>
        </div>
        <div className="hint">
          The original stays exactly as the field sent it. This is recorded beside it, with both values.
        </div>
      </div>
    )
  }

  if (item.targetKind === 'resolution' && item.resolution?.kind === 'na') {
    return (
      <div className="editor" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <select value={reasonId} onChange={(e) => setReasonId(e.target.value)}>
            <option value="">Pick the right reason…</option>
            {vocabulary.naReasons.map((r) => (
              <option key={r.id} value={r.id}>{r.label ?? r.id}</option>
            ))}
          </select>
          <button disabled={!reasonId} onClick={() => onDone('reasonId', reasonId)}>
            Record the correction
          </button>
          <button className="ghost" onClick={onCancel}>Cancel</button>
        </div>
        <div className="hint">
          These are this visit's own reasons, read from the checklist config it was captured with.
        </div>
      </div>
    )
  }

  if (item.targetKind === 'resolution') {
    return (
      <div className="editor" onClick={(e) => e.stopPropagation()}>
        <textarea
          rows={2}
          value={note}
          placeholder="what the note should say"
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="row">
          <button disabled={!note.trim()} onClick={() => onDone('note', note.trim())}>
            Record the correction
          </button>
          <button className="ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className="editor" onClick={(e) => e.stopPropagation()}>
      <p className="muted">There is nothing on this item the desk can correct.</p>
      <button className="ghost" onClick={onCancel}>Close</button>
    </div>
  )
}

/** Attaching a loose photo. The one act the spec allows a mouse for. */
function AssignEditor({
  zone,
  onDone,
  onCancel,
}: {
  zone: PassZone
  onDone: (toKind: string, toId: string) => void
  onCancel: () => void
}) {
  return (
    <div className="editor" onClick={(e) => e.stopPropagation()}>
      <div className="chips">
        <button className="chip" onClick={() => onDone('zone', zone.zoneId)}>
          the room itself
        </button>
        {zone.pins.map((p) => (
          <button key={p.pinId} className="chip" onClick={() => onDone('pin', p.pinId)}>
            {pinLabel(p)}
          </button>
        ))}
      </div>
      <button className="ghost" onClick={onCancel}>Cancel</button>
    </div>
  )
}

/** A flag with no reason is a sticky note with nothing written on it. */
function FlagEditor({ onDone, onCancel }: { onDone: (reason: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState('')
  return (
    <div className="editor" onClick={(e) => e.stopPropagation()}>
      <div className="row">
        <input
          autoFocus
          placeholder="what should be looked at again?"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && reason.trim()) onDone(reason.trim())
          }}
        />
        <button disabled={!reason.trim()} onClick={() => onDone(reason.trim())}>
          Mark for a closer look
        </button>
        <button className="ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
