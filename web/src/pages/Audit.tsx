/**
 * The audit screen — Increment 3 §4.
 *
 * **Read-only and deliberately plain.** This is not the gap report; that is
 * Increment 4, client-facing and branded. This one is for the person running the
 * audit, and its job is to make every answer traceable back to why.
 *
 * Three things here are requirements rather than layout choices:
 *
 *   **The resolved trigger facts are collapsible but always present.** *"Why is
 *   this house being asked about a sump"* must be answerable, and an answer
 *   nobody can reach is not one.
 *
 *   **Not-applicable sections are greyed, never hidden.** A silently absent
 *   section is indistinguishable from one nobody thought of — and the second is
 *   a defect the first would conceal.
 *
 *   **The binding report lists unmatched evidence individually.** §1a makes the
 *   unmatched rate a decision input, and a decision input that says only "9"
 *   cannot be chased.
 */

import { Fragment, useEffect, useState } from 'react'
import { api, fmtTime, type AuditRun, type AuditSlot } from '../api.js'

const STATE_LABEL: Record<string, string> = {
  complete: 'complete',
  partial: 'partial',
  empty: 'nothing yet',
  'not-applicable': 'not applicable',
  // Its own word, because "not applicable" would say *this house does not have
  // one* and the truth is *this can never be finished, by design*.
  'n-a-narrative': 'open-ended',
}

const stateClass = (state: string): string => `pip pip-${state}`

export function AuditView({ propertyId }: { propertyId: string }) {
  const [run, setRun] = useState<AuditRun | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openSection, setOpenSection] = useState<string | null>(null)
  const [showFacts, setShowFacts] = useState(false)

  const runAudit = async () => {
    setBusy(true)
    setError(null)
    try {
      setRun(await api.runAudit(propertyId))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { void runAudit() }, [propertyId])

  if (error) {
    return (
      <section className="card">
        <p className="refusal">{error}</p>
        <button onClick={() => void runAudit()}>Try again</button>
      </section>
    )
  }
  if (!run) return <p className="muted">Running the audit…</p>

  const slotsBySection = new Map<string, AuditSlot[]>()
  for (const section of run.sections) slotsBySection.set(section.sectionId, [])
  for (const slot of run.slots) {
    // The section a slot belongs to is derivable from its id — `s7.components`
    // is §7 — and the server already grouped the rollups, so this only has to
    // put the detail under the right heading.
    const sectionId = slot.slotId.split('.')[0] ?? ''
    slotsBySection.get(sectionId)?.push(slot)
  }

  return (
    <>
      <section className="card">
        <div className="row-between">
          <h2>Audit</h2>
          <button onClick={() => void runAudit()} disabled={busy}>
            {busy ? 'Running…' : 'Run again'}
          </button>
        </div>

        {/* §0.1 — every result records which schema and which profile produced
            it. A gap report from March has to stay explicable in September, and
            that is only true if the run says what it was run against. */}
        <p className="muted small">
          schema {run.provenance.schemaVersion}
          <span className="hash"> ({run.provenance.schemaHash.slice(0, 8)})</span>
          {' · '}profile {run.provenance.profileId} {run.provenance.profileVersion}
          <span className="hash"> ({run.provenance.profileHash.slice(0, 8)})</span>
          {' · '}{run.triggerFacts.visitKind} visit
          {' · '}read {run.binding.context.importsRead} import
          {run.binding.context.importsRead === 1 ? '' : 's'}
        </p>

        {run.warnings.length > 0 && (
          <ul className="warnings">
            {run.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}

        <button className="link" onClick={() => setShowFacts(!showFacts)}>
          {showFacts ? 'Hide' : 'Show'} what this house is being asked about
        </button>

        {/* Collapsible, but PRESENT. §4 — "why is this house being asked about a
            sump" must always be answerable, and the answer is this list. */}
        {showFacts && (
          <div className="facts">
            <Facts label="Property flags set" values={run.triggerFacts.property} />
            <Facts
              label="Flags this config declares but this house does not have"
              values={run.triggerFacts.propertyVocabulary.filter((f) => !run.triggerFacts.property.includes(f))}
              muted
            />
            <Facts label="Component types pinned anywhere" values={run.triggerFacts.pinsAnywhere} />
            <Facts label="Zone types walked" values={run.triggerFacts.zoneTypesWalked} />
            <div className="fact-row">
              <span className="fact-label">Imports read</span>
              <ul className="imports">
                {run.triggerFacts.importsRead.map((i) => (
                  <li key={i.id}>
                    {fmtTime(i.at)} · {i.producer ?? 'unknown producer'}
                    {i.configVersion ? ` · config ${i.configVersion}` : ''}
                    {i.visitId ? '' : ' · no visit (property artifact)'}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h3>Sections</h3>
        <table className="sections">
          <tbody>
            {run.sections.map((section) => {
              const slots = slotsBySection.get(section.sectionId) ?? []
              const open = openSection === section.sectionId
              // Greyed, never hidden — a silently absent section is
              // indistinguishable from one nobody thought of.
              const inapplicable = section.rollup.state === 'not-applicable'
              return (
                // Keyed on the fragment, not the row inside it: React reuses
                // rows by key, and an unkeyed fragment lets an expanded
                // section's detail land under the wrong heading when the list
                // changes.
                <Fragment key={section.sectionId}>
                  <tr
                    className={`section-row${inapplicable ? ' inapplicable' : ''}`}
                    onClick={() => setOpenSection(open ? null : section.sectionId)}
                  >
                    <td className="num">§{section.number}</td>
                    <td className="title">{section.title}</td>
                    <td className="state">
                      <span className={stateClass(section.rollup.state)} />
                      {STATE_LABEL[section.rollup.state] ?? section.rollup.state}
                    </td>
                    <td className="counts muted small">
                      {section.rollup.complete > 0 && `${section.rollup.complete} complete`}
                      {section.rollup.partial > 0 && ` · ${section.rollup.partial} partial`}
                      {section.rollup.empty > 0 && ` · ${section.rollup.empty} nothing yet`}
                      {section.rollup.notApplicable > 0 && ` · ${section.rollup.notApplicable} n/a`}
                    </td>
                  </tr>
                  {open &&
                    slots.map((slot) => (
                      <tr key={slot.slotId} className="slot-row">
                        <td />
                        <td colSpan={3}>
                          <SlotDetail slot={slot} contribution={run.contributions[slot.slotId]} />
                        </td>
                      </tr>
                    ))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h3>
          Gap list <span className="muted small">— required, applicable, not complete</span>
        </h3>
        {run.gaps.length === 0 ? (
          <p className="muted">Nothing required is outstanding.</p>
        ) : (
          <ul className="gaps">
            {run.gaps.map((gap) => (
              <li key={gap.slotId}>
                <code>{gap.slotId}</code> <span className="muted small">({gap.kind})</span>
                {/* Never "§1 incomplete". §3 requires each gap to name what
                    specifically is short — so every item is still named, and
                    identical reasons are gathered under the reason they share
                    rather than repeated. Thirteen lines of the same sentence
                    buries the two that differ. */}
                <GroupedReasons missing={gap.missing} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <BindingReport run={run} />
    </>
  )
}

/**
 * Every item named, grouped by the reason they share.
 *
 * The alternative is what this screen did first: thirteen consecutive lines
 * reading "no utility zone has been walked on this property", with the two
 * items that failed for a different reason lost among them. Grouping loses
 * nothing — every item is still named — and it makes the exceptions visible,
 * which is the only reason to read the list.
 */
function GroupedReasons({ missing }: { missing: { what: string; why?: string }[] }) {
  // The parts arrive separately. An earlier version split the server's sentence
  // on its dash and cut "Water heater shutoff — water and fuel/power" in half,
  // giving the item another item's reason — the same class of error as §1g.2's
  // escaped pipes, and fixed the same way: stop re-deriving a boundary the
  // producer already knows.
  const groups = new Map<string, string[]>()
  for (const m of missing) {
    const why = m.why ?? ''
    const list = groups.get(why) ?? []
    list.push(m.what)
    groups.set(why, list)
  }

  return (
    <ul>
      {[...groups].map(([why, whats], i) => (
        <li key={i}>
          {why ? (
            <>
              <span>{why}</span>
              <div className="grouped">{whats.join(' · ')}</div>
            </>
          ) : (
            whats.join(' · ')
          )}
        </li>
      ))}
    </ul>
  )
}

const Facts = ({ label, values, muted }: { label: string; values: string[]; muted?: boolean }) => (
  <div className="fact-row">
    <span className="fact-label">{label}</span>
    {values.length === 0 ? (
      <span className="muted small">none</span>
    ) : (
      <span className={muted ? 'muted small' : 'small'}>{values.join(' · ')}</span>
    )}
  </div>
)

function SlotDetail({
  slot,
  contribution,
}: {
  slot: AuditSlot
  contribution?: { visitId: string | null; at: string }
}) {
  return (
    <div className="slot-detail">
      <div className="row-between">
        <span>
          <code>{slot.slotId}</code>
          <span className="muted small"> · {slot.kind}</span>
          {slot.required && <span className="tag">required</span>}
        </span>
        <span className="state">
          <span className={stateClass(slot.state)} />
          {STATE_LABEL[slot.state] ?? slot.state}
        </span>
      </div>

      {/* §1i's contribution dimension — what did this visit change, without
          narrowing what the audit saw. Absent where nothing has satisfied it,
          which is the honest answer rather than a fallback. */}
      {contribution && (
        <p className="muted small">satisfied {fmtTime(contribution.at)}</p>
      )}

      {slot.missing.length > 0 && <GroupedReasons missing={slot.missing} />}
    </div>
  )
}

/**
 * §1a's measurement, on screen.
 *
 * **The three states are kept apart here exactly as they are in the data.**
 * "Nothing was captured", "something was captured and falls short", and "this
 * evidence matches nothing" are different problems with different fixes, and a
 * single unmatched number would send somebody to the wrong one.
 */
function BindingReport({ run }: { run: AuditRun }) {
  const { binding } = run
  const { rate, context } = binding

  return (
    <section className="card">
      <h3>
        Binding <span className="muted small">— what the schema found, and what it did not</span>
      </h3>

      {/* The context the rate has to be read against. A bare 100% reads as a
          case for AI when it is a fact about which rooms were walked. */}
      <p className="muted small">
        config {context.configVersion} · schema reconciled against {context.schemaReconciledAgainst}
        {' · '}
        {context.zoneCount} zone type{context.zoneCount === 1 ? '' : 's'} walked
        {context.zoneTypes.length > 0 && `: ${context.zoneTypes.join(', ')}`}
        {context.producers.length > 0 && ` · from ${context.producers.join(', ')}`}
      </p>

      <p>
        <strong>{rate.itemsBound}</strong> of {rate.itemsApplicable} applicable items bound
        <span className="muted small">
          {' '}({rate.itemsConsidered - rate.itemsApplicable} do not apply to this house)
        </span>
        <br />
        <strong>{rate.evidenceBound}</strong> of {rate.evidenceConsidered} pins bound to a slot ·{' '}
        <strong>{rate.evidenceUnmatched}</strong> matched nothing ({rate.unmatchedPercent}%)
      </p>

      <Bucket
        title="Broken references"
        note="the schema names a field item this config does not declare — not a gap"
        rows={binding.brokenBindings.map((b) => `${b.itemId} → ${b.brokenRefs.join(', ')}`)}
      />
      <Bucket
        title="Nothing captured"
        note="no candidate evidence at all"
        rows={binding.noCandidate.map((b) => b.label)}
      />
      <Bucket
        title="Captured but short"
        note="evidence exists and a required field item is unresolved"
        rows={binding.candidateShort.map(
          (b) => `${b.label} — pin ${b.matched.map((m) => m.number).join(', ')} lacks ${b.unresolvedItems.join(', ')}`,
        )}
      />
      <Bucket
        title="Evidence matching no slot"
        note="listed individually — a count cannot be chased"
        rows={binding.unmatchedEvidence.map(
          (e) => `pin ${e.number} — ${e.describedAs} (${e.reason.replace(/-/g, ' ')})`,
        )}
      />
    </section>
  )
}

const Bucket = ({ title, note, rows }: { title: string; note: string; rows: string[] }) => {
  if (rows.length === 0) return null
  return (
    <div className="bucket">
      <h4>
        {title} <span className="muted small">({rows.length}) — {note}</span>
      </h4>
      <ul>
        {rows.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </div>
  )
}
