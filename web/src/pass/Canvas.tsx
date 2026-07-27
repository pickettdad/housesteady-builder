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
 * Nothing on this canvas is draggable. Placing or moving an anchor is field
 * work (spec §2) and the builder was not there.
 */

const markerClass = (pin: PassPin, deskFlagged: boolean): string => {
  const classes = ['marker']
  if (pin.flag === 'issue') classes.push('issue')
  else if (pin.flag) classes.push('monitor')
  if (deskFlagged) classes.push('desk-flagged')
  if (!pin.typeKind) classes.push('typeless')
  return classes.join(' ')
}

export function ZoneCanvas({
  visitId,
  zone,
  deskFlaggedPinIds,
  selectedPinId,
  onPick,
}: {
  visitId: string
  zone: PassZone
  deskFlaggedPinIds: Set<string>
  selectedPinId: string | null
  onPick: (pinId: string) => void
}) {
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

  const placed = zone.pins.filter((p) => p.anchors.some((a) => a.canvasId === canvas.canvasId))

  return (
    <div className="canvas-wrap">
      <div className="canvas">
        <img src={thumbUrl(visitId, canvas.mediaId, 1200)} alt={`Canvas for ${zone.label ?? 'this room'}`} />
        {placed.map((pin) =>
          pin.anchors
            .filter((a) => a.canvasId === canvas.canvasId && a.x !== null && a.y !== null)
            .map((a) => (
              <button
                key={a.anchorId}
                className={`${markerClass(pin, deskFlaggedPinIds.has(pin.pinId))}${
                  selectedPinId === pin.pinId ? ' selected' : ''
                }`}
                style={{ left: `${a.x! * 100}%`, top: `${a.y! * 100}%` }}
                onClick={() => onPick(pin.pinId)}
                title={pin.componentType ?? pin.freeformLabel ?? 'Never typed'}
              >
                {pin.number ?? '?'}
              </button>
            )),
        )}
      </div>

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
      {zone.unplacedPins.length > 0 && (
        <div className="tray">
          <h4>Not placed on the plan</h4>
          <p className="hint">
            {zone.unplacedPins.length} pin{zone.unplacedPins.length === 1 ? '' : 's'} in this room{' '}
            {zone.unplacedPins.length === 1 ? 'has' : 'have'} no position on a canvas. Placing them is field work
            — they carry forward to the next visit rather than being positioned here.
          </p>
          <div className="chips">
            {zone.unplacedPins.map((p) => (
              <button
                key={p.pinId}
                className={`chip${selectedPinId === p.pinId ? ' selected' : ''}`}
                onClick={() => onPick(p.pinId)}
              >
                {pinLabel(p)}
              </button>
            ))}
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
