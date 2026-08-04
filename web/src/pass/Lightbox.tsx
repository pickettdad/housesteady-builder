import { useCallback, useEffect, useRef, useState } from 'react'
import { mediaUrl, thumbUrl } from '../api.js'

/**
 * Reading a nameplate — the magnifier §9's first guard has always needed.
 *
 * THE DEFECT THIS FIXES. The assist screen rendered nameplates at 1200px against
 * originals 4032px on the long edge — measured, on every one of the walk's 157
 * photographs. §9's first guard is *evidence first, suggestion second: photo
 * large*, and **a photograph the concierge cannot read is not doing the job the
 * guard assigns it.** The suggestion becomes the only legible thing on screen,
 * which is precisely the acquiescence the guard exists to prevent.
 *
 * WHY THE EXISTING ESCAPE HATCH WAS NOT ONE. Both render sites already wrapped
 * the thumbnail in a link opening the original in a new tab. That looks like a
 * fix and is not: a browser fits a 4032px image to the viewport, so the new tab
 * shows it at roughly 1400px on a laptop. **Same downscale, one click further
 * away** — and the suggestion is now on a different screen, so the concierge is
 * reading from memory. `mediaUrl` was written for a lightbox that did not exist,
 * and its comment saying so is how the gap survived: anyone grepping for the
 * full-size path found it and read the comment as evidence it was wired up.
 *
 * THE MAGNIFIER SHOWS THE PHOTOGRAPH AND NOTHING ELSE. Deliberate, and the one
 * design decision here worth arguing with. Guard 1 specifies the *layout* —
 * photo large, suggestion beside it — and that layout is unchanged underneath.
 * This is a temporary act of reading laid over it, and putting the model's
 * reading inside the magnifier would rebuild the original problem at higher
 * resolution: the concierge would be checking a string against a plate instead
 * of reading a plate. **They read it, close it, and then look at the
 * suggestion.** That order is the whole point.
 *
 * The thumbnail already on screen is shown immediately, scaled up and blurred,
 * while the original loads. A blurred plate becoming sharp is honest about what
 * is happening; a spinner over a blank rectangle would leave the concierge
 * unsure whether they were looking at a slow load or a missing file.
 */

export interface LightboxProps {
  visitId: string
  mediaId: string
  /** What the concierge clicked, for the heading. Never a reading. */
  caption?: string
  onClose: () => void
}

/**
 * Zoom steps, as multiples of fit-to-window.
 *
 * Runs past 1:1 because a nameplate is often a small part of the frame — the
 * whole point is the plate, not the water heater — and stopping at "actual
 * size" would stop exactly where the small text starts to matter.
 */
const STEPS = [1, 2, 4, 8] as const

export function Lightbox({ visitId, mediaId, caption, onClose }: LightboxProps): JSX.Element {
  const [step, setStep] = useState(0)
  const [origin, setOrigin] = useState({ x: 50, y: 50 })
  const [loaded, setLoaded] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const scale = STEPS[step] ?? 1

  // Focus lands on the close button so Escape and the button agree about what
  // the keyboard is doing, and so a screen reader announces the dialog.
  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  // The page behind must not scroll while this is open — a magnifier that
  // scrolls the pass out from under itself loses the concierge's place.
  useEffect(() => {
    const prior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prior
    }
  }, [])

  const zoomAt = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    // Zoom toward the point clicked. On a plate occupying a tenth of the frame,
    // zooming to the centre and then panning is several actions to do what one
    // click should: put *that* under the magnifier.
    const r = e.currentTarget.getBoundingClientRect()
    setOrigin({
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100,
    })
    setStep((s) => (s + 1) % STEPS.length)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      // The pass is keyboard-driven everywhere else and this is no exception.
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        setStep((s) => Math.min(s + 1, STEPS.length - 1))
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        setStep((s) => Math.max(s - 1, 0))
      } else if (e.key === '0') {
        e.preventDefault()
        setStep(0)
        setOrigin({ x: 50, y: 50 })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={caption ? `Photograph — ${caption}` : 'Photograph'}
      onClick={onClose}
    >
      <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <span className="lightbox-caption">{caption ?? 'Photograph'}</span>
        <span className="lightbox-zoom">
          {scale === 1 ? 'fit' : `${scale}×`}
          <span className="lightbox-keys"> · + − 0 · esc</span>
        </span>
        <button ref={closeRef} type="button" className="ghost" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="lightbox-stage" onClick={(e) => e.stopPropagation()}>
        <img
          className={`lightbox-img${loaded ? ' loaded' : ' loading'}`}
          src={loaded ? mediaUrl(visitId, mediaId) : thumbUrl(visitId, mediaId, 1200)}
          style={{ transform: `scale(${scale})`, transformOrigin: `${origin.x}% ${origin.y}%` }}
          onClick={zoomAt}
          alt={caption ? `Photograph of ${caption}` : 'Photograph'}
        />
        {/*
          The original is fetched by a second, hidden image so the visible one is
          never swapped to a blank while the bytes arrive. Three megabytes is a
          real wait on a first view.
        */}
        {!loaded && (
          <img
            aria-hidden="true"
            className="lightbox-preload"
            src={mediaUrl(visitId, mediaId)}
            onLoad={() => setLoaded(true)}
            alt=""
          />
        )}
      </div>
    </div>
  )
}
