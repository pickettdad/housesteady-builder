# Binder Builder — AI Processing & Data Handling Decision

**Date:** 2026-07-27
**Status:** decision record, **pending David's ratification.** Satisfies `CLAUDE.md` §14 (nothing goes to a third-party service without an explicit decision recorded in `/docs`).
**Why now:** Increment 2b sends photographs to the Anthropic API. Today those are photographs of the owner's own equipment. **The first time it runs in anger it will send photographs of a client's home**, and by our own rules that needs a written decision first.
**Scope:** what leaves the machine for AI processing, and on what terms. Does not authorize hosting, and does not modify the Backup Decision, which remains narrowly scoped to encrypted backup archives.

---

## 1. What is actually sent

| Task | What leaves the machine | Sensitivity |
|---|---|---|
| Nameplate classification & extraction | A photograph of a data plate on a piece of equipment, resized to 1568 px, **all metadata stripped** | **Low.** A furnace label. No people, no interior context, no location |
| Pin-type suggestion | Photographs attached to an untyped pin, plus its notes | **Low–moderate.** Usually equipment; occasionally a wider shot |
| Loose-photo routing | **Room photographs** — the general interior of a client's home — plus a written list of pin labels | **Moderate.** This is the inside of someone's house |
| Transcription *(not built — see §5)* | Audio of the concierge describing a room from recall | **Moderate.** May name the household, mention occupants |
| Document extraction *(later)* | Permits, invoices, insurance declarations | **High.** Names, addresses, policy numbers, financial detail |

**The tasks are not equally sensitive and need not be decided together.** Nameplate extraction on a furnace label is a materially different act from sending the interior of a client's home, and the decision below treats them separately.

## 2. What is decided

**2.1 · Nameplate classification and extraction are authorized.** A data plate carries no personal information; metadata including any location is stripped before transmission and this is enforced by a test and a source scan. The uplift is direct — it removes the largest re-keying task in the build.

**2.2 · Pin-type suggestion is authorized** on the same basis, since its inputs are pin-attached photographs of equipment.

**2.3 · Loose-photo routing is authorized with a condition.** These are interior photographs of a client's home, and that is a different claim than a furnace label. It proceeds **only once §3's client disclosure is in place**, not before.

**2.4 · Document extraction is NOT authorized by this record.** Permits, invoices and insurance declarations carry names, addresses, policy numbers and financial detail. It gets its own decision when it is built, informed by the lawyer pass.

**2.5 · No client data is used for model training.** The retention and training terms of the API account tier in use **must be established in writing and recorded here before the first real client import.** If a zero-retention arrangement is available on the account, take it — this is the single cheapest reduction in exposure available and it should not be left to default.

**2.6 · The binder itself is never sent.** AI reads individual pieces of evidence to propose values. **No assembled binder, no concern history, no client record, and no cross-client data ever leaves the machine.** The record stays local; only its raw inputs are ever processed.

## 3. What the client is told

**Plainly, in the service agreement, before the first visit.** Not buried, not a checkbox.

The substance: *photographs taken during the visit may be processed by an AI service to read equipment labels and help file them; the concierge reviews and approves everything before it reaches your binder; nothing is used to train anyone's AI; your binder and your records stay on our systems.*

**Wording is a Scope matter and goes through the lawyer pass.** The obligation this record creates is that the sentence exists and is true — no service ships without it.

**A client who declines should still be serviceable.** Every AI feature has a manual path by doctrine, so an opt-out means a slower binder rather than no binder. **Confirm that the opt-out is real before offering it** — a promise the software can't honour is worse than no promise.

## 4. What is deliberately not decided

- **Hosting** — unchanged. Design v1 §8's triggers stand.
- **Managed or hosted agents** — a hosted configuration would put prompt instructions outside version control, which breaks the golden-set mechanism. Separate decision if it is ever wanted; see the Open Items note.
- **Retention of what we send** — §2.5 is an obligation to establish and record, not an assertion of what the terms currently are.

## 5. Transcription remains open, and this record does not settle it

Increment 2b §6 holds it deliberately. Audio of a concierge speaking from recall is different in kind: it may name the household, mention occupants, or carry a stray remark never meant for a record. **A local model keeps it on the machine entirely and is the preferred outcome if one is workable.** Code investigates and reports; David decides; that decision is added here.

## 6. Review triggers

A second operator · document extraction being built · a client portal · **any change to the retention terms established under §2.5** · the lawyer pass, whichever comes first.

---

**Status:** drafted, awaiting ratification. §2.5 must be completed before the first real client import — it is the only item here that cannot be deferred.
