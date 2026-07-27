import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { go } from '../App.js'
import { api, type DecisionItem, type PassModel, type PassZone } from '../api.js'
import { ZoneCanvas, type DeskPlacement } from './Canvas.js'
import { DecisionRow, PhotoTileView, type ActHandlers } from './Decisions.js'
import { MicCheck, ZoneMemory } from './Memory.js'

/**
 * The fresh pass.
 *
 * Spec §1: a walk, not a queue. Zone by zone, in visit order, while the house is
 * still in mind. Memory is the only input that decays — the manifest holds what
 * was captured but not why a photo was taken or what the owner said at the door,
 * and by day five most of that is gone permanently. An hour is budgeted, and it
 * is the highest-value hour in the process rather than overhead to be minimised.
 *
 * So this screen is arranged the way the house is: the rail is the rooms in the
 * order they were walked, and each room's decisions sit in the room. Nothing is
 * batched by task, because a batch of thirty "type this pin" prompts stripped of
 * their rooms is exactly the memory the design is trying to keep.
 */

/** The session page sits after the last room, so it needs a stable id. */
const SESSION = '__session__'

export function PassView({ visitId }: { visitId: string }) {
  const [model, setModel] = useState<PassModel | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [zoneId, setZoneId] = useState<string | null>(null)
  const [cursor, setCursor] = useState(0)
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null)
  const [completion, setCompletion] = useState<string[] | null>(null)
  const [completionCode, setCompletionCode] = useState<string | null>(null)
  // Once per pass, before the first room — see MicCheck.
  const [micChecked, setMicChecked] = useState(false)
  const openedZones = useRef<Set<string>>(new Set())

  const load = useCallback(
    () => api.getPass(visitId).then(setModel).catch((e) => setError((e as Error).message)),
    [visitId],
  )

  useEffect(() => {
    void api.startPass(visitId).then(load).catch((e) => setError((e as Error).message))
  }, [visitId, load])

  // Land on the first room that still has work, so reopening the screen picks
  // up where the afternoon left off rather than at the top every time.
  useEffect(() => {
    if (!model || zoneId !== null) return
    const next = model.zones.find((z) => z.decisionsRemaining > 0 || !z.opened) ?? model.zones[0]
    setZoneId(next?.zoneId ?? SESSION)
  }, [model, zoneId])

  // Walking into a room is recorded once per arrival, and it also starts the
  // room's thumbnails being made — see thumbs.ts for why they are not made at
  // import time.
  useEffect(() => {
    if (!zoneId || zoneId === SESSION || openedZones.current.has(zoneId)) return
    openedZones.current.add(zoneId)
    void api.openZone(visitId, zoneId).then(load)
  }, [zoneId, visitId, load])

  const zone: PassZone | null = useMemo(
    () => model?.zones.find((z) => z.zoneId === zoneId) ?? null,
    [model, zoneId],
  )
  const items: DecisionItem[] = zoneId === SESSION ? (model?.sessionItems ?? []) : (zone?.decisions ?? [])

  useEffect(() => setCursor(0), [zoneId])

  // ------------------------------------------------------------------ acts
  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setError(null)
      try {
        await fn()
        await load()
      } catch (e) {
        setError((e as Error).message)
      }
    },
    [load],
  )

  const acts: ActHandlers = useMemo(
    () => ({
      confirm: (d) =>
        void run(() => api.writeOverlay(visitId, { kind: 'confirm', targetKind: d.targetKind, targetId: d.targetId })),
      correct: (d, field, newValue) =>
        void run(() =>
          api.writeOverlay(visitId, { kind: 'correct', targetKind: d.targetKind, targetId: d.targetId, field, newValue }),
        ),
      assign: (d, toKind, toId) =>
        void run(() =>
          api.writeOverlay(visitId, {
            kind: 'assign', targetKind: d.targetKind, targetId: d.targetId, newValue: { toKind, toId },
          }),
        ),
      flag: (d, reason) =>
        void run(() =>
          api.writeOverlay(visitId, { kind: 'flag', targetKind: d.targetKind, targetId: d.targetId, reason }),
        ),
      undo: (overlayId) => void run(() => api.undo(visitId, overlayId)),
    }),
    [run, visitId],
  )

  /** Desk placements for the current room, keyed by pin. */
  const deskPlacements = useMemo(() => {
    const out = new Map<string, DeskPlacement>()
    for (const pin of zone?.pins ?? []) {
      const d = pin.deskPlacement
      if (d) out.set(pin.pinId, { pinId: pin.pinId, ...d })
    }
    return out
  }, [zone])

  const nextZone = useCallback(() => {
    if (!model) return
    const order = [...model.zones.map((z) => z.zoneId), SESSION]
    const at = order.indexOf(zoneId ?? order[0]!)
    setZoneId(order[Math.min(at + 1, order.length - 1)]!)
  }, [model, zoneId])

  // --------------------------------------------------------------- keyboard
  //
  // Spec §5: "The pass must be completable without the mouse except for placing
  // an assignment." j/k move, c matches the photo, e correct, a assign, f flag,
  // u undo, n next zone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      // Never steal a keystroke from someone typing a flag reason.
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const item = items[cursor]
      switch (e.key) {
        case 'j': setCursor((c) => Math.min(c + 1, Math.max(items.length - 1, 0))); break
        case 'k': setCursor((c) => Math.max(c - 1, 0)); break
        case 'n': nextZone(); break
        case 'c': if (item) acts.confirm(item); break
        case 'u':
          // With no argument this takes back the most recent act in the whole
          // pass. Mis-taps are certain at this pace and undo has to be instant,
          // or people slow down to avoid needing it.
          void run(() => api.undo(visitId))
          break
        case 'e':
        case 'a':
        case 'f': {
          // These need a value, so the keystroke opens the editor the mouse
          // would have opened rather than guessing at one.
          const row = item ? document.getElementById(`decision-${item.key}`) : null
          const label = e.key === 'e' ? 'Correct' : e.key === 'a' ? 'Attach' : 'Closer look'
          const button = [...(row?.querySelectorAll('button') ?? [])].find((b) =>
            b.textContent?.startsWith(label),
          )
          ;(button as HTMLButtonElement | undefined)?.click()
          break
        }
        default:
          return
      }
      if (['j', 'k', 'n', 'c', 'u', 'e', 'a', 'f'].includes(e.key)) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [items, cursor, acts, nextZone, run, visitId])

  useEffect(() => {
    const item = items[cursor]
    if (item) document.getElementById(`decision-${item.key}`)?.scrollIntoView({ block: 'nearest' })
  }, [cursor, items])

  /**
   * Marking the pass complete answers rather than just firing.
   *
   * With work still open the first press comes back with what is open, in
   * words, and asks. The button is never disabled: a disabled button with no
   * explanation is the worst of both — it refuses and declines to say why, and
   * the concierge is left clicking a dead control.
   */
  const complete = (force = false) =>
    void (async () => {
      setError(null)
      try {
        await api.completePass(visitId, force)
        setCompletion(null)
        await load()
      } catch (e) {
        const outstanding = (e as unknown as { outstanding?: string[] }).outstanding
        const code = (e as unknown as { code?: string }).code ?? null
        if (outstanding?.length) {
          setCompletion(outstanding)
          setCompletionCode(code)
        } else setError((e as Error).message)
      }
    })()

  const reopen = () =>
    void (async () => {
      setError(null)
      setCompletion(null)
      try {
        await api.reopenPass(visitId)
        await load()
      } catch (e) {
        setError((e as Error).message)
      }
    })()

  if (!model) return <p className="empty">{error ?? 'Loading…'}</p>

  if (!model.import) {
    return (
      <>
        <Crumbs model={model} />
        <p className="empty">
          Nothing has been imported into this visit yet, so there is nothing to walk. Import the export first.
        </p>
      </>
    )
  }

  const p = model.progress
  const history = model.pass?.history ?? []
  const lastReopen = [...history].reverse().find((h) => h.type === 'reopened')
  const deskFlaggedPinIds = new Set(
    (zone?.decisions ?? []).filter((d) => d.state?.flag && d.pin).map((d) => d.pin!.pinId),
  )

  return (
    <>
      <Crumbs model={model} />

      <div className="pass-head">
        <div>
          <h2>The fresh pass</h2>
          <p className="lede">
            Room by room, in the order you walked them. Everything you remember about the house is worth more
            today than it will be on Friday.
          </p>
        </div>
        <Progress model={model} onComplete={() => complete(false)} onReopen={reopen} />
      </div>

      {error && <div className="banner failed"><div className="detail">{error}</div></div>}

      {/*
        Two different refusals, deliberately handled differently.
        A silent recording is NOT forceable — the exit is one click (re-record
        or acknowledge), and forcing past it would delete the only thing
        standing between the concierge and an hour of recordings of nothing.
        Open decisions ARE forceable, because a lock people route around is
        worse than a recorded decision.
      */}
      {completion && completionCode === 'pass.silent-recording' && (
        <div className="banner failed">
          <div className="status">A memory recording came out silent</div>
          <ul>{completion.map((o) => <li key={o}>{o}</li>)}</ul>
          <div className="detail">
            Fix it in the room it belongs to — record again, or keep it and say you know. This one is not
            skippable: it is the whole reason the microphone is checked at all.
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="ghost" onClick={() => { setCompletion(null); setCompletionCode(null) }}>
              Go and fix it
            </button>
          </div>
        </div>
      )}

      {completion && completionCode !== 'pass.silent-recording' && (
        <div className="banner warn">
          <div className="status">{completion.join(' · ')} — complete anyway?</div>
          <div className="detail">
            Closing it now is allowed. What is still open is recorded against the pass, so the record says what
            was left rather than implying everything was walked.
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button onClick={() => complete(true)}>Complete anyway</button>
            <button className="ghost" onClick={() => { setCompletion(null); setCompletionCode(null) }}>
              Keep working
            </button>
          </div>
        </div>
      )}

      {/*
        A pass that was closed and then reopened says so, and says why. The most
        common reason is the concierge deciding something after closing it —
        which withdraws the completion rather than letting the stored "closed
        with 5 open" quietly become false.
      */}
      {!model.pass?.completedAt && lastReopen && (
        <div className="banner warn">
          <div className="status">Reopened</div>
          <div className="detail">
            This pass was marked complete and is open again — {lastReopen.reason}. Mark it complete again when
            you are done.
          </div>
        </div>
      )}

      {model.pass?.completedAt && (
        <div className="banner ok">
          <div className="status">Pass complete</div>
          <div className="detail">
            Finished {new Date(model.pass.completedAt).toLocaleString()}. This says the walk is done — it is not a
            claim about the binder, which the Binder Schema decides separately.
          </div>
          {model.pass.completedWithOutstanding?.length ? (
            <div className="detail">
              Closed with work still open: {model.pass.completedWithOutstanding.join(' · ')}.
            </div>
          ) : null}
        </div>
      )}

      <MicCheck done={micChecked} onDone={() => setMicChecked(true)} />

      <div className="pass">
        <nav className="rail">
          {model.zones.map((z, i) => (
            <button
              key={z.zoneId}
              className={`rail-zone${z.zoneId === zoneId ? ' current' : ''} ${zoneStatus(z)}`}
              onClick={() => setZoneId(z.zoneId)}
            >
              <span className="pip" />
              <span className="rail-label">
                <strong>{i + 1}. {z.label ?? 'unnamed room'}</strong>
                <span className="muted small">{z.level ?? ''} {z.type ?? ''}</span>
              </span>
              {/*
                A bare number reads as "3 what?" — pins in the room, decisions
                left, photos? It has to say.
              */}
              <span className="rail-count">
                {z.decisionsRemaining > 0
                  ? `${z.decisionsRemaining} to decide`
                  : z.opened
                    ? 'done'
                    : z.decisions.length === 0
                      ? 'nothing to decide'
                      : 'not opened'}
              </span>
            </button>
          ))}
          <button
            className={`rail-zone${zoneId === SESSION ? ' current' : ''} ${
              model.sessionItems.every((d) => d.decided) ? 'done' : 'todo'
            }`}
            onClick={() => setZoneId(SESSION)}
          >
            <span className="pip" />
            <span className="rail-label">
              <strong>The visit as a whole</strong>
              <span className="muted small">alarm coverage, terminations</span>
            </span>
            <span className="rail-count">
              {model.sessionItems.filter((d) => !d.decided).length > 0
                ? `${model.sessionItems.filter((d) => !d.decided).length} to decide`
                : 'done'}
            </span>
          </button>
        </nav>

        <main className="zone-page">
          {zoneId === SESSION ? (
            <>
              <h3>The visit as a whole</h3>
              <p className="hint">
                These items belong to the visit rather than to any one room, so they come last.
              </p>
              <Decisions
                visitId={visitId} zone={null} items={model.sessionItems} cursor={cursor}
                vocabulary={model.vocabulary} acts={acts} onSelect={setCursor}
              />
            </>
          ) : zone ? (
            <>
              <h3>{zone.label ?? 'Unnamed room'}</h3>

              <ZoneCanvas
                visitId={visitId} zone={zone} deskFlaggedPinIds={deskFlaggedPinIds}
                deskPlacements={deskPlacements}
                selectedPinId={selectedPinId} onPick={setSelectedPinId}
                onPlace={(pinId, canvasId, x, y, evidence) =>
                  void run(() => api.place(visitId, pinId, { canvasId, x, y, evidence }))
                }
                onUndo={(overlayId) => void run(() => api.undo(visitId, overlayId))}
              />

              <h4>Needs a decision here</h4>
              {zone.decisions.length === 0 ? (
                <p className="muted">Nothing in this room needs deciding.</p>
              ) : (
                <Decisions
                  visitId={visitId} zone={zone} items={zone.decisions} cursor={cursor}
                  vocabulary={model.vocabulary} acts={acts} onSelect={setCursor}
                />
              )}

              {/*
                The count has to move when a photo is attached. Saying "1 photo
                belonging to the room itself" above a tile that reads "on pin 1"
                is a small lie in the one place that must not tell them.
              */}
              <h4>Room photos</h4>
              <p className="hint">
                {(() => {
                  const attached = zone.roomPhotos.filter((p) => p.state?.assign).length
                  const withRoom = zone.roomPhotos.length - attached
                  return (
                    <>
                      {withRoom} still with the room
                      {attached > 0 && `, ${attached} attached to a pin`}. Leaving one with the room is a
                      finished state — most room photos are context, and nothing here asks you to file them.
                    </>
                  )
                })()}
              </p>
              <div className="tiles grid">
                {zone.roomPhotos.map((photo) => (
                  <PhotoTileView
                    key={photo.mediaId} visitId={visitId} photo={photo} zone={zone} acts={acts}
                  />
                ))}
              </div>

              {/*
                Spec §5.4 — "What do you remember about this room?" — is the next
                part of this increment, along with the recording safeguards that
                make it trustworthy. Saying so beats a silent gap.
              */}
              <h4>What do you remember about this room?</h4>
              <ZoneMemory visitId={visitId} zone={zone} onSaved={load} />
            </>
          ) : null}
        </main>
      </div>
    </>
  )
}

const zoneStatus = (z: PassZone): string => {
  if (!z.opened) return 'todo'
  return z.decisionsRemaining > 0 ? 'doing' : 'done'
}

function Decisions({
  visitId, zone, items, cursor, vocabulary, acts, onSelect,
}: {
  visitId: string
  zone: PassZone | null
  items: DecisionItem[]
  cursor: number
  vocabulary: PassModel['vocabulary']
  acts: ActHandlers
  onSelect: (i: number) => void
}) {
  return (
    <div className="decisions">
      {items.map((item, i) => (
        <DecisionRow
          key={item.key} visitId={visitId} zone={zone} item={item} selected={i === cursor}
          vocabulary={vocabulary} acts={acts} onSelect={() => onSelect(i)}
        />
      ))}
    </div>
  )
}

function Crumbs({ model }: { model: PassModel }) {
  return (
    <div className="crumbs">
      <a className="crumb" onClick={() => go({ name: 'properties' })}>Properties</a> ›{' '}
      <a className="crumb" onClick={() => go({ name: 'property', id: model.visit.propertyId })}>
        {model.property.label}
      </a>{' '}
      › the fresh pass
    </div>
  )
}

/**
 * Progress, honestly: zones walked, decisions made, decisions remaining, time
 * in pass. Every figure is counted from the record rather than estimated.
 */
function Progress({
  model,
  onComplete,
  onReopen,
}: {
  model: PassModel
  onComplete: () => void
  onReopen: () => void
}) {
  const p = model.progress
  const started = model.pass?.startedAt
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  const minutes = started ? Math.max(0, Math.round((now - new Date(started).getTime()) / 60_000)) : 0

  return (
    <div className="progress card">
      <div className="stat">
        <strong>{p.zonesWalked}/{p.zonesTotal}</strong>
        <span>rooms walked</span>
      </div>
      <div className="stat">
        <strong>{p.decisionsMade}/{p.decisionsTotal}</strong>
        <span>decisions made</span>
      </div>
      <div className="stat">
        <strong>{p.decisionsRemaining}</strong>
        <span>remaining</span>
      </div>
      <div className="stat">
        <strong>{minutes}m</strong>
        <span>in this pass</span>
      </div>
      {/*
        Never a dead control. Once complete, the button becomes the way back in
        — late thoughts about a house are normal and should not need a hack, and
        a greyed-out "Complete" is the same refusal-without-explanation as a
        disabled complete button, just arriving later.
      */}
      {model.pass?.completedAt ? (
        <button className="ghost" onClick={onReopen}>Reopen the pass</button>
      ) : (
        <button onClick={onComplete}>Mark the pass complete</button>
      )}
      <div className="keys">
        <kbd>j</kbd><kbd>k</kbd> move · <kbd>c</kbd> matches · <kbd>e</kbd> correct · <kbd>a</kbd> attach ·{' '}
        <kbd>f</kbd> closer look · <kbd>u</kbd> undo · <kbd>n</kbd> next room
      </div>
    </div>
  )
}
