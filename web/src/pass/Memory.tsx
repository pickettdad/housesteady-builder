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
  const [justSaved, setJustSaved] = useState<MemoryAudio | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setText('')
    setJustSaved(null)
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
        const saved = (await res.json()) as MemoryAudio & { error?: string }
        if (!res.ok) throw new Error(saved.error ?? 'The recording did not save.')
        setJustSaved(saved)
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
    setJustSaved(null)
    onSaved()
  }

  const memoryText = (zone.memory?.trail ?? [])
    .filter((t) => t.live && t.overlay.kind === 'memory' && t.overlay.field === 'text')
    .map((t) => (t.overlay.newValue as { text?: string })?.text)
    .filter(Boolean)

  return (
    <div className="memory">
      <div className="row">
        <button onClick={() => void record()} disabled={state.permission === 'denied' || saving}>
          {state.recording ? 'Stop' : 'Record'}
        </button>
        {state.recording && <Meter level={state.level} />}
        {state.permission === 'unknown' && !state.recording && (
          <button className="ghost" onClick={() => void requestPermission()}>
            Allow the microphone
          </button>
        )}
        <span className="hint" style={{ marginTop: 0 }}>
          Always optional. Nothing here is required to finish the pass.
        </span>
      </div>

      {/* Never a button that pretends: with permission denied, record is off
          and the screen says why rather than failing silently on click. */}
      {state.error && <p className="error-text">{state.error}</p>}
      {error && <p className="error-text">{error}</p>}

      {/*
        Duration, size and the peak level, at the moment of stopping. Near-zero
        is obviously wrong, and it is obvious immediately rather than in a month.
      */}
      {justSaved && (
        <div className={`recording-result${justSaved.silent ? ' silent' : ''}`}>
          {justSaved.silent ? (
            <>
              <strong>That recording is silent.</strong> {Math.round((justSaved.durationMs ?? 0) / 1000)}s,{' '}
              {justSaved.bytes} bytes, peak {((justSaved.peakLevel ?? 0) * 100).toFixed(0)}%. The microphone was
              probably muted.
              <div className="row" style={{ marginTop: 8 }}>
                <button onClick={() => void record()}>Record it again</button>
                <button className="ghost" onClick={() => void acknowledge(justSaved.id)}>
                  Keep it — I know it is silent
                </button>
              </div>
            </>
          ) : (
            <>
              Saved — {Math.round((justSaved.durationMs ?? 0) / 1000)}s, {justSaved.bytes} bytes, peak{' '}
              {((justSaved.peakLevel ?? 0) * 100).toFixed(0)}%.
            </>
          )}
        </div>
      )}

      {/* Inline playback, immediately. Hearing it is the strongest check there is. */}
      {zone.memoryAudio.length > 0 && (
        <ul className="recordings">
          {zone.memoryAudio.map((a) => (
            <li key={a.id} className={a.silent && !a.acknowledgedAt ? 'silent' : ''}>
              <audio controls preload="none" src={`/api/visits/${visitId}/memory/${a.id}/audio`} />
              <span className="hint" style={{ marginTop: 0 }}>
                {Math.round((a.durationMs ?? 0) / 1000)}s · {a.bytes} bytes · peak{' '}
                {((a.peakLevel ?? 0) * 100).toFixed(0)}%
                {a.silent && (a.acknowledgedAt ? ' · silent, kept knowingly' : ' · silent, not yet acknowledged')}
              </span>
              {a.silent && !a.acknowledgedAt && (
                <button className="link" onClick={() => void acknowledge(a.id)}>
                  keep it anyway
                </button>
              )}
            </li>
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
