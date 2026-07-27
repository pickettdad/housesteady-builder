import { useState } from 'react'
import { thumbUrl, type PassPin, type PassZone } from '../api.js'
import { pinLabel } from './Decisions.js'

/**
 * The zone's canvas with its pins on it.
 *
 * Anchors arrive as normalized 0–1 floats against the canvas image, so they
 * render as percentages directly — no scaling maths, no layout measurement, and
 * correct at every window size. The numbers are the field's own and are never
 * rounded on the way here: a marker is a record of where somebody tapped on a
 * photograph of a wall in someone's house.
 *
 * PLACING AT THE DESK IS ALLOWED, AND IT SAYS SO (spec §2, revised). An earlier
 * rule blocked it because the builder was not there — true of the claim, but the
 * requirement is that a desk placement never be INDISTINGUISHABLE from a field
 * one, not that it be prevented. Leaving a pin in the wrong room for a month
 * because of a rule is the wrong trade.
 *
 * So a desk-placed marker is drawn differently, says "placed at the desk" on
 * hover, is listed separately below the canvas, and is structurally an overlay
 * rather than a row in `anchors` — four independent ways of telling it apart,
 * because a reader may only encounter one of them.
 *
 * The line that decides whether a placement is allowed at all is EVIDENCE
 * VERSUS RECALL, not desk versus field: the position has to be read off
 * something in hand. That is why choosing a piece of evidence is part of
 * placing, and why the server refuses a placement without one.
 */

const markerClass = (pin: PassPin, deskFlagged: boolean, deskPlaced: boolean): string => {
  const classes = ['marker']
  if (pin.flag === 'issue') classes.push('issue')
  else if (pin.flag) classes.push('monitor')
  if (deskFlagged) classes.push('desk-flagged')
  if (!pin.typeKind) classes.push('typeless')
  if (deskPlaced) classes.push('desk-placed')
  return classes.join(' ')
}

export interface DeskPlacement {
  pinId: string
  canvasId: string
  x: number
  y: number
  /** What the position was read off. Required by the server. */
  evidence: { kind: string; id: string } | null
  overlayId: string
}

export function ZoneCanvas({
  visitId,
  zone,
  deskFlaggedPinIds,
  deskPlacements,
  selectedPinId,
  onPick,
  onPlace,
  onUndo,
}: {
  visitId: string
  zone: PassZone
  deskFlaggedPinIds: Set<string>
  deskPlacements: Map<string, DeskPlacement>
  selectedPinId: string | null
  onPick: (pinId: string) => void
  onPlace: (pinId: string, canvasId: string, x: number, y: number, evidence: { kind: string; id: string }) => void
  onUndo: (overlayId: string) => void
}) {
  const [placing, setPlacing] = useState<PassPin | null>(null)
  const canvas = zone.canvases[0]

  // Spec §5.1: a manifest-only import degrades to a pin list with a plain
  // explanation. Not an error and not an empty box — the pins are all here and
  // the pass can be walked without the picture.
  if (!canvas) {
    return (
      <div className="canvas-fallback">
        <p className="muted">
          No canvas was captured for this room. Its {zone.pins.length} pin{zone.pins.length === 1 ? '' : 's'}{' '}
          {zone.pins.length === 1 ? 'is' : 'are'} listed below and can be worked through as normal.
        </p>
      </div>
    )
  }

  if (!canvas.imageAvailable || !canvas.mediaId) {
    return (
      <div className="canvas-fallback">
        <p className="muted">
          This room has a canvas, but its image is not on this machine — the manifest was imported without its
          media. Pin positions are recorded and will appear once the media arrives.
        </p>
        <PinList zone={zone} selectedPinId={selectedPinId} onPick={onPick} />
      </div>
    )
  }

  // A desk placement takes precedence over the field anchor for WHERE the
  // marker is drawn — it is the later, corrected position — while remaining
  // visibly and structurally a different thing.
  const markers = zone.pins.flatMap((pin) => {
    const desk = deskPlacements.get(pin.pinId)
    if (desk && desk.canvasId === canvas.canvasId) {
      return [{ pin, key: desk.overlayId, x: desk.x, y: desk.y, desk: true }]
    }
    return pin.anchors
      .filter((a) => a.canvasId === canvas.canvasId && a.x !== null && a.y !== null)
      .map((a) => ({ pin, key: a.anchorId, x: a.x!, y: a.y!, desk: false }))
  })

  const clickToPlace = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!placing) return
    const evidence = firstEvidence(placing, zone)
    if (!evidence) return
    const box = (e.currentTarget.querySelector('img') as HTMLImageElement).getBoundingClientRect()
    const x = (e.clientX - box.left) / box.width
    const y = (e.clientY - box.top) / box.height
    if (x < 0 || x > 1 || y < 0 || y > 1) return
    onPlace(placing.pinId, canvas.canvasId, x, y, evidence)
    setPlacing(null)
  }

  return (
    <div className="canvas-wrap">
      <div className={`canvas${placing ? ' placing' : ''}`} onClick={clickToPlace}>
        <img src={thumbUrl(visitId, canvas.mediaId, 1200)} alt={`Canvas for ${zone.label ?? 'this room'}`} />
        {markers.map((m) => (
          <button
            key={m.key}
            className={`${markerClass(m.pin, deskFlaggedPinIds.has(m.pin.pinId), m.desk)}${
              selectedPinId === m.pin.pinId ? ' selected' : ''
            }`}
            style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}
            onClick={(e) => {
              if (placing) return
              e.stopPropagation()
              onPick(m.pin.pinId)
            }}
            title={`${pinLabel(m.pin)}${m.desk ? ' — placed at the desk, from recall' : ''}`}
          >
            {m.pin.number ?? '?'}
          </button>
        ))}
      </div>

      {placing && (
        <p className="hint placing-hint">
          Click where <strong>{pinLabel(placing)}</strong> is on this canvas. It will be recorded as placed at
          the desk, from recall, and carried into the next visit to confirm on site.{' '}
          <button className="link" onClick={() => setPlacing(null)}>cancel</button>
        </p>
      )}

      {zone.canvases.length > 1 && (
        <p className="hint">
          This room has {zone.canvases.length} canvases. The first is shown; the others hold the same pins.
        </p>
      )}

      {/*
        Spec §5.1: a tray of pins not placed on the plan, "labelled as a field
        task rather than something to fix here". The wording matters — an
        unplaced pin is not a mistake to correct at the desk, it is a job for
        the next visit.
      */}
      {(() => {
        // Only pins with no position AT ALL — a pin placed at the desk has one
        // now and belongs on the canvas, not in the tray.
        const stillUnplaced = zone.unplacedPins.filter((p) => !deskPlacements.has(p.pinId))
        if (stillUnplaced.length === 0) return null
        return (
          <div className="tray">
            <h4>Not placed on the plan</h4>
            <p className="hint">
              {stillUnplaced.length} pin{stillUnplaced.length === 1 ? '' : 's'} in this room{' '}
              {stillUnplaced.length === 1 ? 'has' : 'have'} no position on a canvas. Place one from a photo or
              note you can see — anything you only remember belongs in the next visit, not in the record.
            </p>
            <div className="chips">
              {stillUnplaced.map((p) => {
                const evidence = firstEvidence(p, zone)
                return (
                  <span key={p.pinId} className="tray-pin">
                    <button
                      className={`chip${selectedPinId === p.pinId ? ' selected' : ''}`}
                      onClick={() => onPick(p.pinId)}
                    >
                      {pinLabel(p)}
                    </button>
                    {evidence ? (
                      <button className="link" onClick={() => setPlacing(p)}>
                        place from {evidence.kind === 'media' ? 'its photo' : `its ${evidence.kind}`}
                      </button>
                    ) : (
                      <span className="hint" style={{ marginTop: 0 }}>
                        nothing on screen shows where this is — carries to the next visit
                      </span>
                    )}
                  </span>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/*
        Listed separately, so a desk placement is distinguishable here as well as
        on the canvas. §8 asks for "everywhere it appears".
      */}
      {deskPlacements.size > 0 && (
        <div className="tray desk-placed-tray">
          <h4>Placed at the desk</h4>
          <p className="hint">
            Positioned here rather than in the house, from evidence on screen. The manifest still says what it
            said; these ride into the next visit to confirm on site.
          </p>
          <div className="chips">
            {[...deskPlacements.values()].map((d) => {
              const pin = zone.pins.find((p) => p.pinId === d.pinId)
              if (!pin) return null
              return (
                <span key={d.pinId} className="tray-pin">
                  <button className="chip desk" onClick={() => onPick(d.pinId)}>{pinLabel(pin)}</button>
                  <button className="link" onClick={() => onUndo(d.overlayId)}>undo</button>
                </span>
              )
            })}
          </div>
        </div>
      )}

      {zone.retiredPinCount > 0 && (
        <p className="hint">
          {zone.retiredPinCount} pin{zone.retiredPinCount === 1 ? '' : 's'} in this room{' '}
          {zone.retiredPinCount === 1 ? 'was' : 'were'} retired during the visit. They keep their numbers and stay
          in the record; nothing here asks you about them.
        </p>
      )}
    </div>
  )
}

/**
 * The nearest thing on screen that shows where this pin is.
 *
 * Its own photo first, then a note on it, then the room's photos. If there is
 * nothing, placement is not offered at all — that pin's position exists only in
 * somebody's memory, and the honest home for it is the next visit's carried
 * items rather than this record.
 */
function firstEvidence(pin: PassPin, zone: PassZone): { kind: string; id: string } | null {
  if (pin.mediaIds.length > 0) return { kind: 'media', id: pin.mediaIds[0]! }
  if (pin.notes.length > 0) return { kind: 'note', id: pin.notes[0]!.noteId }
  const roomPhoto = zone.roomPhotos.find((p) => p.fileStatus === 'present')
  if (roomPhoto) return { kind: 'media', id: roomPhoto.mediaId }
  return null
}

function PinList({
  zone,
  selectedPinId,
  onPick,
}: {
  zone: PassZone
  selectedPinId: string | null
  onPick: (pinId: string) => void
}) {
  return (
    <div className="chips">
      {zone.pins.map((p) => (
        <button
          key={p.pinId}
          className={`chip${selectedPinId === p.pinId ? ' selected' : ''}`}
          onClick={() => onPick(p.pinId)}
        >
          {pinLabel(p)}
        </button>
      ))}
    </div>
  )
}
