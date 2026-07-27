import { useCallback, useEffect, useRef, useState } from 'react'
import type { PassZone } from '../api.js'

/**
 * "What do you remember about this room?"
 *
 * Prompted every room, always skippable. The thing being raced is memory: the
 * manifest holds what was captured but not the smell in the crawlspace or what
 * the owner said at the door, and by day five most of that is gone.
 *
 * CAPTURE ASSURANCE IS THE POINT OF MOST OF THIS FILE (spec §5). The failure it
 * guards against is walking the whole pass and discovering afterwards that the
 * microphone was muted — an hour of the highest-value work in the process,
 * recorded as nothing. Same discipline as checksum verification on import: do
 * not assume capture worked, prove it. So there is a mic check before the first
 * room, the record button cannot be pressed until permission is actually
 * granted, a live level meter moves while recording, duration and size are
 * shown on stop, silence is detected and reported at once, and the recording
 * plays back inline — because hearing it is the strongest verification there is.
 */

/** Below this peak, a recording is silence rather than quiet speech. */
const SILENCE_PEAK = 0.02

interface RecorderState {
  permission: 'unknown' | 'granted' | 'denied'
  recording: boolean
  /** 0–1, updated many times a second. A moving bar, never a status dot. */
  level: number
  error: string | null
}

/**
 * Microphone plumbing, kept away from the rendering.
 *
 * The peak level is tracked across the whole recording rather than sampled at
 * the end: a muted microphone produces a file of exactly the right length full
 * of near-silence, and the only thing that distinguishes it from good audio is
 * that nothing in it was ever loud.
 */
function useRecorder() {
  const [state, setState] = useState<RecorderState>({
    permission: 'unknown', recording: false, level: 0, error: null,
  })
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const peakRef = useRef(0)
  const startedRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)

  const stopMeter = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    void ctxRef.current?.close().catch(() => {})
    ctxRef.current = null
  }, [])

  const release = useCallback(() => {
    stopMeter()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [stopMeter])

  useEffect(() => release, [release])

  // The mic check and each room's recorder are separate instances, so without
  // this the state would read 'unknown' in every room even after permission had
  // been granted once — which is exactly the ambiguity of showing Record and
  // "Allow the microphone" side by side.
  useEffect(() => {
    const perms = navigator.permissions as
      | { query?: (d: { name: string }) => Promise<{ state: string }> }
      | undefined
    if (!perms?.query) return
    void perms
      .query({ name: 'microphone' })
      .then((status) => {
        if (status.state === 'granted') setState((s) => (s.permission === 'unknown' ? { ...s, permission: 'granted' } : s))
        else if (status.state === 'denied') setState((s) => ({ ...s, permission: 'denied' }))
      })
      // Firefox does not support querying `microphone`. Staying on 'unknown' is
      // the honest answer there, and the Allow button is the way through.
      .catch(() => {})
  }, [])

  /** Ask once. Until this succeeds the record button stays disabled — never a
   *  button that pretends. */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      setState((s) => ({ ...s, permission: 'granted', error: null }))
      return true
    } catch (e) {
      setState((s) => ({
        ...s,
        permission: 'denied',
        error:
          `The microphone is not available: ${(e as Error).message}. Recording is off until it is — ` +
          `you can still type what you remember.`,
      }))
      return false
    }
  }, [])

  const start = useCallback(async (): Promise<boolean> => {
    if (!streamRef.current && !(await requestPermission())) return false
    const stream = streamRef.current!

    chunksRef.current = []
    peakRef.current = 0
    startedRef.current = Date.now()

    // The level meter. Reading the analyser every frame is what makes a flat
    // line visible immediately rather than after the recording is over.
    const ctx = new AudioContext()
    ctxRef.current = ctx
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    source.connect(analyser)
    const buf = new Float32Array(analyser.fftSize)

    const tick = () => {
      analyser.getFloatTimeDomainData(buf)
      let peak = 0
      for (const v of buf) peak = Math.max(peak, Math.abs(v))
      if (peak > peakRef.current) peakRef.current = peak
      setState((s) => ({ ...s, level: peak }))
      rafRef.current = requestAnimationFrame(tick)
    }
    tick()

    const recorder = new MediaRecorder(stream)
    recorderRef.current = recorder
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.start()
    setState((s) => ({ ...s, recording: true, error: null }))
    return true
  }, [requestPermission])

  const stop = useCallback(
    (): Promise<{ blob: Blob; durationMs: number; peakLevel: number }> =>
      new Promise((resolve) => {
        const recorder = recorderRef.current
        if (!recorder) return
        recorder.onstop = () => {
          stopMeter()
          setState((s) => ({ ...s, recording: false, level: 0 }))
          resolve({
            blob: new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }),
            durationMs: Date.now() - startedRef.current,
            peakLevel: peakRef.current,
          })
        }
        recorder.stop()
      }),
    [stopMeter],
  )

  return { state, requestPermission, start, stop, release }
}

// ----------------------------------------------------------------- mic check

/**
 * Two seconds, once per pass, before the first room.
 *
 * Doing it here catches a wrong input device or an ungranted permission
 * systemically rather than nine separate times — and crucially it catches it
 * BEFORE the hour of work rather than after.
 */
export function MicCheck({ done, onDone }: { done: boolean; onDone: () => void }) {
  const { state, start, stop } = useRecorder()
  const [result, setResult] = useState<{ peak: number; ok: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  if (done) return null

  const run = async () => {
    setBusy(true)
    setResult(null)
    if (!(await start())) {
      setBusy(false)
      return
    }
    await new Promise((r) => setTimeout(r, 2000))
    const { peakLevel } = await stop()
    setResult({ peak: peakLevel, ok: peakLevel >= SILENCE_PEAK })
    setBusy(false)
  }

  return (
    <div className="banner warn mic-check">
      <div className="status">Microphone check</div>
      <div className="detail">
        Two seconds, once for the whole pass. Say anything. This is here so a muted microphone is found now
        rather than after an hour of recordings of nothing.
      </div>
      <div className="row" style={{ marginTop: 10, alignItems: 'center' }}>
        <button onClick={() => void run()} disabled={busy}>
          {busy ? 'Listening…' : 'Check the microphone'}
        </button>
        {state.recording && <Meter level={state.level} />}
        <button className="ghost" onClick={onDone}>
          Skip — I will type instead
        </button>
      </div>
      {state.error && <div className="detail error-text">{state.error}</div>}
      {result && (
        <div className="detail">
          {result.ok ? (
            <>
              Heard you — peak {(result.peak * 100).toFixed(0)}%.{' '}
              <button className="link" onClick={onDone}>
                Start the pass
              </button>
            </>
          ) : (
            <>
              <strong>Nothing came through</strong> — peak {(result.peak * 100).toFixed(0)}%. That usually means
              the microphone is muted or the wrong input is selected. Fix it and check again, or skip and type
              your notes.
            </>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * A stored recording, with a player that actually plays.
 *
 * MediaRecorder writes webm with no Duration in the Segment Info header, so a
 * browser reports `Infinity` for it and the native controls show 0:00 / 0:00
 * with a scrub bar that cannot be dragged. That matters more here than it
 * usually would: playback is one of the six assurance steps and hearing the
 * recording is the strongest verification available, so a player that renders
 * but cannot seek has quietly removed the best check in the chain.
 *
 * Seeking past the end forces the browser to scan the file and work the
 * duration out; the timeupdate handler puts the position back to zero. Ugly,
 * and the standard fix for this specific bug.
 *
 * The figure printed beside it is OUR measurement, taken while recording. That
 * one is authoritative regardless of what the container says, and it is what the
 * backstop reads.
 */
function Recording({
  visitId,
  audio,
  onAcknowledge,
  onRerecord,
}: {
  visitId: string
  audio: MemoryAudio
  onAcknowledge: (id: string) => void
  onRerecord: () => void
}) {
  const ref = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onMeta = () => {
      if (el.duration !== Infinity && !Number.isNaN(el.duration)) return
      const restore = () => {
        el.removeEventListener('timeupdate', restore)
        el.currentTime = 0
      }
      el.addEventListener('timeupdate', restore)
      el.currentTime = 1e101
    }
    el.addEventListener('loadedmetadata', onMeta)
    return () => el.removeEventListener('loadedmetadata', onMeta)
  }, [audio.id])

  const unresolved = audio.silent && !audio.acknowledgedAt
  return (
    <li className={unresolved ? 'silent' : ''}>
      <div className="recording-row">
        <audio
          ref={ref}
          controls
          preload="metadata"
          src={`/api/visits/${visitId}/memory/${audio.id}/audio`}
        />
        {/*
          Bytes and peak, once. Duration is deliberately NOT here: the player
          shows it, and printing "2.6s" beside a player reading 0:02 is the same
          fact twice in two slightly different forms, which makes a reader stop
          and work out which one to believe.
        */}
        <span className="hint" style={{ marginTop: 0 }}>
          {(audio.bytes ?? 0).toLocaleString()} bytes · peak {((audio.peakLevel ?? 0) * 100).toFixed(0)}%
          {audio.silent && audio.acknowledgedAt && ' · silent, kept knowingly'}
        </span>
      </div>

      {unresolved && (
        <div className="recording-alarm">
          <strong>This recording is silent.</strong> The microphone was probably muted.
          <div className="row" style={{ marginTop: 6 }}>
            <button onClick={onRerecord}>Record it again</button>
            <button className="ghost" onClick={() => onAcknowledge(audio.id)}>
              Keep it — I know it is silent
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

/** A moving bar, not a status dot. A flat line has to be visible at a glance. */
function Meter({ level }: { level: number }) {
  return (
    <span className="meter" title={`peak ${(level * 100).toFixed(0)}%`}>
      <span className="meter-fill" style={{ width: `${Math.min(100, level * 140)}%` }} />
    </span>
  )
}

// ------------------------------------------------------------- zone memory

export interface MemoryAudio {
  id: string
  durationMs: number | null
  bytes: number | null
  peakLevel: number | null
  silent: boolean
  acknowledgedAt: string | null
  createdAt: string
}

export function ZoneMemory({
  visitId,
  zone,
  onSaved,
}: {
  visitId: string
  zone: PassZone
  onSaved: () => void
}) {
  const { state, requestPermission, start, stop } = useRecorder()
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setText('')
  }, [zone.zoneId])

  const existingText = zone.memory?.corrections ? null : null // text lives in its own overlay field
  void existingText

  const record = async () => {
    setError(null)
    if (state.recording) {
      const { blob, durationMs, peakLevel } = await stop()
      setSaving(true)
      try {
        const fd = new FormData()
        fd.append('audio', blob, 'memory.webm')
        fd.append('zoneId', zone.zoneId)
        fd.append('durationMs', String(durationMs))
        fd.append('peakLevel', String(peakLevel))
        const res = await fetch(`/api/visits/${visitId}/memory/audio`, { method: 'POST', body: fd })
        const saved = (await res.json()) as { error?: string }
        if (!res.ok) throw new Error(saved.error ?? 'The recording did not save.')
        onSaved()
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setSaving(false)
      }
    } else {
      await start()
    }
  }

  const saveText = async () => {
    if (!text.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/visits/${visitId}/memory/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zoneId: zone.zoneId, text: text.trim() }),
      })
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? 'The note did not save.')
      setText('')
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const acknowledge = async (id: string) => {
    await fetch(`/api/visits/${visitId}/memory/${id}/acknowledge`, { method: 'POST' })
    onSaved()
  }

  const memoryText = (zone.memory?.trail ?? [])
    .filter((t) => t.live && t.overlay.kind === 'memory' && t.overlay.field === 'text')
    .map((t) => (t.overlay.newValue as { text?: string })?.text)
    .filter(Boolean)

  return (
    <div className="memory">
      {/*
        One control per state, never two. Record and "Allow the microphone"
        showing together left it ambiguous whether the microphone was available,
        and a Record button that is enabled without permission is a button that
        pretends.
      */}
      <div className="row">
        {state.permission === 'granted' ? (
          <button onClick={() => void record()} disabled={saving}>
            {state.recording ? 'Stop' : 'Record'}
          </button>
        ) : (
          <>
            <button disabled title="The microphone has not been allowed yet">
              Record
            </button>
            {state.permission === 'unknown' && (
              <button className="ghost" onClick={() => void requestPermission()}>
                Allow the microphone
              </button>
            )}
          </>
        )}
        {state.recording && <Meter level={state.level} />}
        <span className="hint" style={{ marginTop: 0 }}>
          Always optional. Nothing here is required to finish the pass.
        </span>
      </div>

      {state.permission === 'denied' && (
        <p className="error-text">
          The microphone is not available, so recording is off. Typing what you remember works just as well —
          the note is the point, not the format.
        </p>
      )}

      {/* Never a button that pretends: with permission denied, record is off
          and the screen says why rather than failing silently on click. */}
      {state.error && <p className="error-text">{state.error}</p>}
      {error && <p className="error-text">{error}</p>}

      {/*
        There is no separate "saved" banner. The recording appears below the
        moment it stops, carrying its own byte count, peak level and — from the
        player — its duration, which is exactly what §5 asks to be shown on
        stop. A banner repeating those figures was the same fact in two places,
        the same shape as the duplicated field notes, and it made the silent
        case say everything twice at the moment it most needed to be clear.
      */}
      {zone.memoryAudio.length > 0 && (
        <ul className="recordings">
          {zone.memoryAudio.map((a) => (
            <Recording
              key={a.id} visitId={visitId} audio={a}
              onAcknowledge={(id) => void acknowledge(id)}
              onRerecord={() => void record()}
            />
          ))}
        </ul>
      )}

      <div className="stack" style={{ marginTop: 10 }}>
        <textarea
          rows={2}
          value={text}
          placeholder="or type what you remember about this room"
          onChange={(e) => setText(e.target.value)}
        />
        <div className="row">
          <button className="ghost" disabled={!text.trim() || saving} onClick={() => void saveText()}>
            Save the note
          </button>
        </div>
      </div>

      {memoryText.length > 0 && (
        <ul className="notes">
          {memoryText.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
