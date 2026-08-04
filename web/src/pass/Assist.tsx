import { useState } from 'react'
import { Lightbox } from './Lightbox.js'
import {
  fmtTime, thumbUrl,
  type AssistModel, type Classification, type EntityState, type NameplateProposal, type NotRead,
  type ProposedField, type Provenance, type RoutingBatch, type RoutingSuggestion,
  type TypeProposal, type Uncertainty,
} from '../api.js'

/**
 * The assists, on the fresh pass. No new screen (§7).
 *
 * Three states, and each has its own presentation because they are three
 * different things:
 *
 *   **PROPOSED** — visually quarantined, labelled in plain words, *not yours
 *   yet*. Nothing here is a value until somebody says so.
 *   **ACCEPTED** — reads as yours, with a quiet provenance line and an undo.
 *   Rendered from the pass model's own state, not from here: an accepted value
 *   is an overlay like any other and there is nothing AI-specific left about it.
 *   **ABSTAINED** — its own presentation, and never an error. The plate is
 *   there, the lettering cannot be made out, nothing has been entered. An
 *   abstention that leads to a carried item is the feature working.
 *
 * CLAUDE.md §9's three guards are the whole layout, not decoration on it:
 *
 *   1. **Evidence first, suggestion second — physically.** The photograph is
 *      large and comes first in the DOM and in the flow; the reading sits beside
 *      it. A confident string next to a thumbnail changes the human's task from
 *      *what does this say* to *does that look right*, and the second is a far
 *      weaker act.
 *   2. **"None of these" is always present and exactly as easy as the top
 *      option.** Same element, same size, same row — never a link underneath.
 *   3. **The suggestion is shown, never pre-filled.** Editing opens EMPTY boxes
 *      with the reading still visible beside them, and adopting the model's text
 *      is a deliberate click rather than the state you start in.
 */

// ------------------------------------------------------------------ the acts

export interface AssistActs {
  acceptReading: (generationId: string, values: Record<string, string>) => void
  acceptType: (generationId: string, value: unknown) => void
  acceptRoute: (generationId: string, pinId: string) => void
  discard: (generationId: string, note?: string) => void
  /** Typing a value yourself — an ordinary correction, no proposal behind it. */
  correct: (targetKind: string, targetId: string, field: string, value: unknown) => void
  /** Carrying something to the next visit. The pass's existing flag act. */
  flag: (targetKind: string, targetId: string, reason: string) => void
}

/**
 * Plain-language field names.
 *
 * `installDate` is deliberately NOT called an install date here. Plates print
 * MANUFACTURE dates — 02/25, oct. 2012 — and a label that says "installed"
 * invites somebody to file one as the other, which is laundering an inference
 * into an observation. The storage keeps the key; the human sees the caveat.
 */
const FIELD_LABEL: Record<string, string> = {
  make: 'make',
  model: 'model',
  serial: 'serial number',
  capacity: 'capacity',
  installDate: 'date printed on the plate',
}

// ------------------------------------------------------------------- the strip

/**
 * What the assists are doing, at the top of the pass.
 *
 * Never a spinner alone. Every state here is a sentence, because every one of
 * them is something a concierge might otherwise misread as the feature being
 * broken: nothing configured, nothing queued, running, finished, failed, and the
 * ceiling reached.
 */
export function AssistStrip({
  assists,
  onRun,
  onRetry,
}: {
  assists: AssistModel | null
  onRun: () => void
  onRetry: () => void
}) {
  if (!assists) return null
  const { queue, spend } = assists
  const waiting = queue.queued + queue.running
  const proposals = assists.nameplates.length + assists.types.length + assists.routing.suggestions.length

  return (
    <div className="assist-strip">
      <div className="assist-line">
        <strong>Assists</strong>
        {assists.blocked ? (
          <span className="muted">{assists.blocked}</span>
        ) : waiting > 0 ? (
          <span>
            {queue.running > 0 ? 'Running' : 'Queued'} — {waiting} to go, {queue.done} done
            {queue.skipped > 0 && `, ${queue.skipped} needed nothing`}.
          </span>
        ) : queue.done + queue.skipped + queue.failed === 0 ? (
          <span className="muted">Nothing has run for this visit yet.</span>
        ) : (
          <span>
            {queue.done} run
            {proposals > 0
              ? `, ${proposals} waiting on you.`
              : '. Nothing is waiting on you.'}
          </span>
        )}
      </div>

      <div className="assist-line">
        {/*
          An unmeasured cost and a zero cost are different facts. Printing a
          confident $0.00 when no rates are configured merges them, and this is
          the wrong codebase in which to be relaxed about that.
        */}
        <span className="muted small">
          {spend.ratesKnown
            ? `$${spend.dollars.toFixed(4)} of $${spend.cap.toFixed(2)} this visit`
            : `${spend.generations} calls — cost unknown, no rates configured`}
          {' · '}
          {spend.inputTokens.toLocaleString()} in / {spend.outputTokens.toLocaleString()} out
        </span>
        <button className="ghost" onClick={onRun} disabled={assists.running}>
          {assists.running ? 'Running…' : waiting > 0 ? 'Carry on' : 'Run the assists'}
        </button>
      </div>

      <div className="assist-line">
        <RoutingQuiet batch={assists.routing} />
      </div>

      <SkipList skips={queue.skips} />

      {spend.capReached && (
        <div className="banner warn">
          <div className="status">This visit has reached its ceiling of ${spend.cap.toFixed(2)}</div>
          <div className="detail">
            The rest of the work is still queued and nothing has been thrown away. Raise the ceiling to carry on.
          </div>
        </div>
      )}

      {queue.failed > 0 && (
        <div className="banner failed">
          <div className="status">
            {queue.failed} assist{queue.failed === 1 ? '' : 's'} could not run
          </div>
          <ul className="small">
            {queue.failures.slice(0, 6).map((f) => (
              <li key={`${f.task}-${f.targetId}`}>
                <span className="mono">{f.task}</span> on {f.targetId} — {f.error ?? 'no reason recorded'}
              </li>
            ))}
            {queue.failures.length > 6 && <li>and {queue.failures.length - 6} more</li>}
          </ul>
          <button className="ghost" onClick={onRetry}>Try these again</button>
        </div>
      )}
    </div>
  )
}

/**
 * Work that was correctly not done, and why.
 *
 * Doctrine 6, and it earns its place on real data rather than in principle. On
 * the reference export 32 of 34 jobs skip, and "32 needed nothing" on its own
 * hides the one sentence that matters — *the photograph is not on this machine*.
 * That is an import to chase, not a feature working quietly, and the two are
 * indistinguishable without this.
 */
function SkipList({ skips }: { skips: { task: string; reason: string; n: number }[] }) {
  const [open, setOpen] = useState(false)
  if (skips.length === 0) return null
  const total = skips.reduce((n, s) => n + s.n, 0)
  return (
    <div className="assist-line">
      <button className="link" onClick={() => setOpen((v) => !v)}>
        {total} needed nothing — why {open ? '−' : '+'}
      </button>
      {open && (
        <ul className="small skips">
          {skips.map((s) => (
            <li key={`${s.task}-${s.reason}`}>
              {s.n} × <span className="mono">{s.task}</span> — {s.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// -------------------------------------------------------------- shared pieces

/** Not shouted, never hidden. §7. */
export function ProvenanceLine({ p }: { p: Provenance | null }) {
  if (!p) return null
  return (
    <div className="provenance">
      {p.model ?? 'model not recorded'} · {p.promptId ?? 'prompt not recorded'}{' '}
      {p.promptVersion ?? ''} · {fmtTime(p.createdAt)}
    </div>
  )
}

/**
 * A card nobody has answered yet.
 *
 * `tabIndex` and the local key handler rather than the pass's global one: §7
 * says proposals do not count as required decisions and never block completion,
 * so they are deliberately outside the j/k walk. Focusing a card is what arms
 * its keys, which also means the keys can never fire at a card nobody is
 * looking at.
 */
function Proposal({
  className = '',
  onAccept,
  onEdit,
  onDiscard,
  children,
}: {
  className?: string
  onAccept?: () => void
  onEdit?: () => void
  onDiscard?: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className={`proposal ${className}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return
        const el = e.target as HTMLElement
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
        if (e.key === 'c' && onAccept) { onAccept(); e.preventDefault() }
        if (e.key === 'e' && onEdit) { onEdit(); e.preventDefault() }
        if (e.key === 'x' && onDiscard) { onDiscard(); e.preventDefault() }
      }}
    >
      {children}
    </div>
  )
}

/** The quarantine label, in plain words. Same sentence everywhere. */
const NotYours = ({ what }: { what: string }) => (
  <div className="not-yours">
    {what} · <strong>not yours yet</strong>
  </div>
)

// ---------------------------------------------------------------- nameplates

export function NameplateCard({
  visitId,
  proposal,
  pinLabel,
  acts,
}: {
  visitId: string
  proposal: NameplateProposal
  pinLabel: string
  acts: AssistActs
}) {
  const [editing, setEditing] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})

  const readable = proposal.fields.filter((f) => f.value !== null)
  const withNotes = proposal.fields.filter((f) => f.value === null && f.uncertain)

  // Abstention is its own card. It is a success, it is not an error, and it
  // ends in an offer rather than in a blank.
  if (proposal.abstained) {
    return (
      <AbstainedCard visitId={visitId} proposal={proposal} pinLabel={pinLabel} acts={acts} />
    )
  }

  const accept = () => {
    const values: Record<string, string> = {}
    for (const f of readable) values[f.field] = f.value!
    acts.acceptReading(proposal.generationId, values)
  }

  const submitEdit = () => {
    const values: Record<string, string> = {}
    for (const [k, v] of Object.entries(draft)) if (v.trim()) values[k] = v.trim()
    if (Object.keys(values).length === 0) return
    acts.acceptReading(proposal.generationId, values)
    setEditing(false)
    setDraft({})
  }

  return (
    <Proposal
      className="nameplate"
      onAccept={accept}
      onEdit={() => setEditing((v) => !v)}
      onDiscard={() => acts.discard(proposal.generationId)}
    >
      {/*
        Guard 1: the photograph is first and it is large — and now legible. It
        opens a magnifier rather than a new tab: a browser fits a 4032px image
        to the viewport, so the tab was the same downscale one click away, with
        the reading left behind on another screen.
      */}
      <button
        type="button"
        className="proposal-evidence"
        onClick={() => setZoomed(true)}
        title="Open the photograph to read the plate"
      >
        <img loading="lazy" src={thumbUrl(visitId, proposal.mediaId, 1200)} alt="" />
        <span className="evidence-hint">Click to read the plate</span>
      </button>
      {zoomed && (
        <Lightbox
          visitId={visitId}
          mediaId={proposal.mediaId}
          caption={pinLabel}
          onClose={() => setZoomed(false)}
        />
      )}

      <div className="proposal-body">
        <NotYours what={`Read from this photograph on ${pinLabel.toLowerCase()}`} />

        <dl className="reading">
          {proposal.fields.map((f) => (
            <FieldRow
              key={f.field}
              field={f}
              editing={editing}
              draft={draft[f.field] ?? ''}
              onDraft={(v) => setDraft((d) => ({ ...d, [f.field]: v }))}
            />
          ))}
        </dl>

        {proposal.notes && <p className="hint">{proposal.notes}</p>}
        {withNotes.length > 0 && !editing && (
          <p className="hint">
            {withNotes.length} field{withNotes.length === 1 ? '' : 's'} could not be read. Nothing has been
            entered for {withNotes.length === 1 ? 'it' : 'them'} — the notes above say what was visible.
          </p>
        )}
        {proposal.classifiedAs?.isNameplate === 'unsure' && (
          <p className="hint">
            This photograph was on the line — {proposal.classifiedAs.reason} — and was read anyway.
          </p>
        )}

        {editing ? (
          <div className="row">
            <button onClick={submitEdit} disabled={Object.values(draft).every((v) => !v.trim())}>
              Record what it actually says
            </button>
            {/*
              Guard 3, and the one deliberate escape from it. Nothing starts
              pre-filled; adopting the model's text is an explicit act. That
              keeps rejection cheap while leaving a one-character correction
              from costing five retypes.
            */}
            <button
              className="ghost"
              onClick={() =>
                setDraft(Object.fromEntries(readable.map((f) => [f.field, f.value!])))
              }
            >
              Start from what was read
            </button>
            <button className="ghost" onClick={() => { setEditing(false); setDraft({}) }}>Cancel</button>
          </div>
        ) : (
          <div className="row">
            <button className="primary" onClick={accept} disabled={readable.length === 0}>
              Matches the plate <kbd>c</kbd>
            </button>
            <button className="ghost" onClick={() => setEditing(true)}>
              Edit first <kbd>e</kbd>
            </button>
            <button className="ghost" onClick={() => acts.discard(proposal.generationId)}>
              Discard <kbd>x</kbd>
            </button>
          </div>
        )}

        <ProvenanceLine p={proposal.provenance} />
      </div>
    </Proposal>
  )
}

function FieldRow({
  field,
  editing,
  draft,
  onDraft,
}: {
  field: ProposedField
  editing: boolean
  draft: string
  onDraft: (v: string) => void
}) {
  return (
    <div className={field.value === null ? 'field unread' : 'field'}>
      <dt>{FIELD_LABEL[field.field] ?? field.field}</dt>
      <dd>
        {/*
          The reading stays visible in edit mode. It is evidence about the
          photograph either way, and hiding it the moment somebody disagrees
          would take away the thing they are checking against.
        */}
        {field.value !== null ? (
          <span className="read-value">{field.value}</span>
        ) : (
          <UnreadValue u={field.uncertain} />
        )}
        {editing && (
          <input
            className="field-edit"
            placeholder="what it actually says"
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
          />
        )}
      </dd>
    </div>
  )
}

/**
 * A field the model declined to read.
 *
 * CLAUDE.md §9 in one component: the stored value stays unknown, and the person
 * is told what could be seen. "Never summon a human to a blank space" and
 * "abstention is success" are not in tension — the record abstains, the prompt
 * does not.
 */
function UnreadValue({ u }: { u?: Uncertainty }) {
  if (!u) return <span className="muted">nothing printed for this</span>
  return (
    <span className="unread">
      <span className="muted">could not be read</span>
      {u.partial && <em> — what can be made out is {u.partial}</em>}
      {u.obscured && <span className="hint">{u.obscured}</span>}
      {u.lookElsewhere && <span className="hint">{u.lookElsewhere}</span>}
      {u.alternatives?.length > 0 && (
        <span className="hint">could be: {u.alternatives.join(' · ')}</span>
      )}
    </span>
  )
}

/**
 * The whole plate came back unreadable.
 *
 * §7's sentence almost verbatim, and then an offer — type it yourself, or carry
 * it to the next visit. Carrying is the pass's existing flag act with a reason,
 * so it lands in the same place every other "somebody look at this again" lands
 * rather than in a mechanism invented for this card.
 */
function AbstainedCard({
  visitId,
  proposal,
  pinLabel,
  acts,
}: {
  visitId: string
  proposal: NameplateProposal
  pinLabel: string
  acts: AssistActs
}) {
  const [typing, setTyping] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const seen = proposal.fields.filter((f) => f.uncertain)

  const submit = () => {
    if (!proposal.pinId) return
    for (const [field, v] of Object.entries(draft)) {
      if (v.trim()) acts.correct('pin', proposal.pinId, field, v.trim())
    }
    setTyping(false)
    setDraft({})
  }

  return (
    <Proposal className="nameplate abstained">
      {/*
        The abstention screen needs this most. The model could not read the
        plate; the concierge may still be able to, and until now they were
        offered the same 1200px rendering that produced the abstention.
      */}
      <button
        type="button"
        className="proposal-evidence"
        onClick={() => setZoomed(true)}
        title="Open the photograph to read the plate yourself"
      >
        <img loading="lazy" src={thumbUrl(visitId, proposal.mediaId, 1200)} alt="" />
        <span className="evidence-hint">Click to read the plate yourself</span>
      </button>
      {zoomed && (
        <Lightbox
          visitId={visitId}
          mediaId={proposal.mediaId}
          caption={pinLabel}
          onClose={() => setZoomed(false)}
        />
      )}

      <div className="proposal-body">
        <div className="not-yours abstain">Nothing has been entered</div>
        <p>
          The plate is there on {pinLabel.toLowerCase()}, but the lettering cannot be made out.
          {proposal.notes ? ` ${proposal.notes}` : ''}
        </p>

        {seen.length > 0 && (
          <dl className="reading">
            {seen.map((f) => (
              <div className="field unread" key={f.field}>
                <dt>{FIELD_LABEL[f.field] ?? f.field}</dt>
                <dd><UnreadValue u={f.uncertain} /></dd>
              </div>
            ))}
          </dl>
        )}

        {typing ? (
          <>
            <dl className="reading">
              {proposal.fields.map((f) => (
                <div className="field" key={f.field}>
                  <dt>{FIELD_LABEL[f.field] ?? f.field}</dt>
                  <dd>
                    <input
                      className="field-edit"
                      placeholder="leave blank if you cannot read it either"
                      value={draft[f.field] ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.field]: e.target.value }))}
                    />
                  </dd>
                </div>
              ))}
            </dl>
            <div className="row">
              <button onClick={submit} disabled={Object.values(draft).every((v) => !v.trim())}>
                Record what you can read
              </button>
              <button className="ghost" onClick={() => { setTyping(false); setDraft({}) }}>Cancel</button>
            </div>
            <div className="hint">
              These are yours, not the model's — nothing was read off the photograph, so there is no proposal
              behind them.
            </div>
          </>
        ) : (
          <div className="row">
            <button className="ghost" onClick={() => setTyping(true)} disabled={!proposal.pinId}>
              Type it yourself
            </button>
            <button
              className="ghost"
              onClick={() =>
                proposal.pinId &&
                acts.flag('pin', proposal.pinId, 'nameplate could not be read — photograph it again next visit')
              }
              disabled={!proposal.pinId}
            >
              Carry it to the next visit
            </button>
          </div>
        )}

        <div className="hint">
          An abstention that becomes a carried item is this working, not failing. A wrong serial gets believed;
          a blank one gets chased.
        </div>
        <ProvenanceLine p={proposal.provenance} />
      </div>
    </Proposal>
  )
}

/**
 * Values that are now yours.
 *
 * Rendered from the PASS model's state, not from the assist model — an accepted
 * value is an overlay like any other and there is nothing AI-specific left about
 * it by the time it gets here. The only thing the assists contribute is the
 * quiet provenance line, joined on the generation id the overlay already
 * carries.
 *
 * A value typed by hand appears here too, and says so. That is the point: one
 * state, many views, and the reader sees where each value came from rather than
 * two separate lists that could disagree.
 */
export function AcceptedValues({
  state,
  provenance,
  onUndo,
}: {
  state: EntityState | null
  provenance: Record<string, Provenance>
  onUndo: (overlayId: string) => void
}) {
  const values = Object.entries(state?.values ?? {}).filter(([field]) => field !== 'type')
  if (values.length === 0) return null

  return (
    <dl className="reading accepted">
      {values.map(([field, o]) => {
        const p = o.generationId ? provenance[o.generationId] : undefined
        const edited = o.generationId
          ? JSON.stringify(o.priorValue ?? null) !== JSON.stringify(o.newValue ?? null)
          : false
        return (
          <div className="field yours" key={field}>
            <dt>{FIELD_LABEL[field] ?? field}</dt>
            <dd>
              <span className="read-value">{String(o.newValue ?? '')}</span>
              <span className="provenance">
                {o.generationId
                  ? `read from the photo${edited ? ', edited by you' : ''}, accepted ${fmtTime(o.createdAt)}`
                  : `typed by you ${fmtTime(o.createdAt)}`}
                {p?.model ? ` · ${p.model} · ${p.promptId ?? ''} ${p.promptVersion ?? ''}` : ''}
                {edited && (
                  <>
                    {' · '}
                    <span className="was">the model read {String(o.priorValue ?? 'nothing')}</span>
                  </>
                )}
                {' · '}
                <button className="link" onClick={() => onUndo(o.id)}>undo</button>
              </span>
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

/** Photographs looked at and deliberately not read. Never silent. */
export function NotReadList({ visitId, rows }: { visitId: string; rows: NotRead[] }) {
  const [open, setOpen] = useState(false)
  if (rows.length === 0) return null
  return (
    <div className="not-read">
      <button className="link" onClick={() => setOpen((v) => !v)}>
        {rows.length} photograph{rows.length === 1 ? '' : 's'} on pins {rows.length === 1 ? 'was' : 'were'} looked
        at and not read {open ? '−' : '+'}
      </button>
      {open && (
        <div className="tiles">
          {rows.map((r) => (
            <figure key={r.mediaId} className="tile-wrap">
              <img loading="lazy" src={thumbUrl(visitId, r.mediaId, 400)} alt="" />
              <figcaption className="hint">{describe(r.classifiedAs)}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  )
}

const describe = (c: Classification): string =>
  c.isNameplate === 'no' ? `not a nameplate — ${c.reason}` : `on the line — ${c.reason}`

// ----------------------------------------------------------------- pin types

export function TypeCard({
  visitId,
  proposal,
  mediaIds,
  acts,
}: {
  visitId: string
  proposal: TypeProposal
  mediaIds: string[]
  acts: AssistActs
}) {
  const [chosen, setChosen] = useState<string | null>(null)
  const [zoomedId, setZoomedId] = useState<string | null>(null)

  const accept = (type: string) =>
    acts.acceptType(proposal.generationId, { kind: 'component', componentType: type, freeformLabel: null })

  if (proposal.alreadyAnswered) {
    // Quiet, not hidden. Doctrine 6 — nothing drops silently — but a pin the
    // concierge has already typed is not an open question and must not read
    // like one.
    return (
      <div className="proposal answered">
        <span className="muted small">
          The model also read this as {proposal.candidates[0]?.type ?? 'something'} — you had already typed it.
        </span>
        <button className="link" onClick={() => acts.discard(proposal.generationId, 'already typed by hand')}>
          clear
        </button>
      </div>
    )
  }

  return (
    <Proposal
      className="type-suggestion"
      onAccept={() => proposal.candidates[0] && accept(proposal.candidates[0].type)}
      onDiscard={() => acts.discard(proposal.generationId, 'none of these')}
    >
      {zoomedId && (
        <Lightbox visitId={visitId} mediaId={zoomedId} onClose={() => setZoomedId(null)} />
      )}
      {mediaIds.length > 0 && (
        <div className="proposal-evidence strip">
          {mediaIds.slice(0, 4).map((id) => (
            <button key={id} type="button" onClick={() => setZoomedId(id)} title="Open the photograph">
              <img loading="lazy" src={thumbUrl(visitId, id, 400)} alt="" />
            </button>
          ))}
        </div>
      )}

      <div className="proposal-body">
        <NotYours what="What this might be" />
        {proposal.shows && <p className="shows">{proposal.shows}</p>}

        {/*
          Guard 2. "None of these" is the same element as every candidate, in
          the same row, at the same size. Anything quieter and acquiescence sets
          in — the model's framing quietly becomes the answer.
        */}
        <div className="chips candidates">
          {proposal.candidates.map((c) => (
            <button
              key={c.type}
              className={`chip candidate${chosen === c.type ? ' selected' : ''}`}
              onClick={() => setChosen(c.type)}
            >
              <strong>{c.type}</strong>
              <span className={`conf ${c.confidence}`}>{c.confidence}</span>
            </button>
          ))}
          <button
            className="chip candidate none"
            onClick={() => acts.discard(proposal.generationId, 'none of these')}
          >
            <strong>None of these</strong>
          </button>
        </div>

        {chosen && (
          <div className="row">
            <button className="primary" onClick={() => accept(chosen)}>
              Record it as {chosen}
            </button>
            <button className="ghost" onClick={() => setChosen(null)}>Cancel</button>
          </div>
        )}

        <ul className="whys">
          {proposal.candidates.map((c) => (
            <li key={c.type}>
              <span className="mono">{c.type}</span> — {c.why}
            </li>
          ))}
        </ul>

        {proposal.unsure && <p className="hint">{proposal.unsure}</p>}
        {proposal.offList && proposal.offList.length > 0 && (
          <p className="hint">
            It also named {proposal.offList.join(', ')}, which this visit's checklist does not have. Not offered.
          </p>
        )}
        <ProvenanceLine p={proposal.provenance} />
      </div>
    </Proposal>
  )
}

// ------------------------------------------------------------------- routing

const DISMISSAL_LABEL: Record<string, string> = {
  'none-of-these': 'None of these',
  // The owner's condition on extending routing to inbox photographs: the
  // grouping key that put this photograph in this room can be wrong, and the
  // "none of these" guard has to survive the extension.
  'belongs-elsewhere': 'Belongs in another room',
}

export function RouteCard({
  visitId,
  suggestion,
  acts,
}: {
  visitId: string
  suggestion: RoutingSuggestion
  acts: AssistActs
}) {
  const [expanded, setExpanded] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const lead = suggestion.candidates[0]
  const rest = suggestion.candidates.slice(1)
  if (!lead) return null

  return (
    <Proposal
      className="route"
      onAccept={() => acts.acceptRoute(suggestion.generationId, lead.pinId)}
      onDiscard={() => acts.discard(suggestion.generationId, 'none of these')}
    >
      <button
        type="button"
        className="proposal-evidence"
        onClick={() => setZoomed(true)}
        title="Open the photograph"
      >
        <img loading="lazy" src={thumbUrl(visitId, suggestion.mediaId, 400)} alt="" />
        <span className="evidence-hint">Click to see it full size</span>
      </button>
      {zoomed && (
        <Lightbox visitId={visitId} mediaId={suggestion.mediaId} onClose={() => setZoomed(false)} />
      )}

      <div className="proposal-body">
        <NotYours
          what={
            suggestion.origin === 'inbox'
              ? 'This was filed nowhere — it may belong to a pin'
              : 'This may belong to a pin in this room'
          }
        />
        {suggestion.shows && <p className="shows">{suggestion.shows}</p>}

        <div className="chips candidates">
          <button className="chip candidate" onClick={() => acts.acceptRoute(suggestion.generationId, lead.pinId)}>
            <strong>Pin {lead.number ?? '—'} · {lead.label}</strong>
            <span className={`conf ${lead.confidence}`}>{lead.confidence}</span>
          </button>
          {/*
            Once somebody is summoned they get everything: the weaker candidates
            below the lead are shown, not trimmed to the one that cleared the
            bar. A single confident line with the alternatives hidden is exactly
            the framing that makes acceptance the default.
          */}
          {rest.map((c) => (
            <button
              key={c.pinId}
              className="chip candidate"
              onClick={() => acts.acceptRoute(suggestion.generationId, c.pinId)}
            >
              <strong>Pin {c.number ?? '—'} · {c.label}</strong>
              <span className={`conf ${c.confidence}`}>{c.confidence}</span>
            </button>
          ))}
          {suggestion.dismissals.map((d) => (
            <button
              key={d}
              className="chip candidate none"
              onClick={() => acts.discard(suggestion.generationId, DISMISSAL_LABEL[d] ?? d)}
            >
              <strong>{DISMISSAL_LABEL[d] ?? d}</strong>
            </button>
          ))}
        </div>

        <button className="link" onClick={() => setExpanded((v) => !v)}>
          why {expanded ? '−' : '+'}
        </button>
        {expanded && (
          <ul className="whys">
            {suggestion.candidates.map((c) => (
              <li key={c.pinId}>
                <span className="mono">pin {c.number ?? '—'}</span> — {c.why}
              </li>
            ))}
            {suggestion.unsure && <li className="muted">{suggestion.unsure}</li>}
          </ul>
        )}
      </div>
    </Proposal>
  )
}

/**
 * A room's routing batch.
 *
 * §1: "present as a small batch — *6 photos look like they belong to pins* — and
 * stay silent below a high confidence bar." The batch is per room because that
 * is where the photographs are; the counts of what stayed quiet are per visit
 * and live in the strip, since repeating "16 matched nothing" in every room
 * would state a visit-wide figure as though it were a local one.
 */
export function RoutingBatchView({
  visitId,
  suggestions,
  acts,
}: {
  visitId: string
  suggestions: RoutingSuggestion[]
  acts: AssistActs
}) {
  if (suggestions.length === 0) return null
  const one = suggestions.length === 1
  return (
    <div className="routing-batch">
      <p className="hint">
        {suggestions.length} photograph{one ? '' : 's'} in this room look{one ? 's' : ''} like{' '}
        {one ? 'it belongs' : 'they belong'} to a pin. Leaving one with the room is still a finished state.
      </p>
      <div className="routes">
        {suggestions.map((s) => (
          <RouteCard key={s.generationId} visitId={visitId} suggestion={s} acts={acts} />
        ))}
      </div>
    </div>
  )
}

/**
 * Everything routing looked at and stayed quiet about.
 *
 * THE COUNTS ARE NOT DECORATION. Doctrine 6: nothing drops silently. Without
 * them a quiet feature and a broken one look identical, and "it never suggests
 * anything" is impossible to tell from "it never ran".
 */
export function RoutingQuiet({ batch }: { batch: RoutingBatch }) {
  if (batch.belowBar === 0 && batch.silent === 0) return null
  return (
    <span className="muted small">
      {batch.belowBar > 0 && (
        <>
          {batch.belowBar} photograph{batch.belowBar === 1 ? '' : 's'} had a possible pin but not confidently
          enough to interrupt you — the bar is <em>{batch.bar}</em>.{' '}
        </>
      )}
      {batch.silent > 0 && (
        <>
          {batch.silent} {batch.silent === 1 ? 'was' : 'were'} looked at and nothing in the room matched.
        </>
      )}
    </span>
  )
}
