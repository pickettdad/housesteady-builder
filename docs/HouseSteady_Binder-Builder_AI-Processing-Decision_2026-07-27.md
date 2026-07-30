# Binder Builder — AI Processing & Data Handling Decision

**Date:** 2026-07-27
**Status:** decision record, **ratified by the owner 2026-07-30.** Satisfies `CLAUDE.md` §14 (nothing goes to a third-party service without an explicit decision recorded in `/docs`). §5's transcription vendor was decided 2026-07-29 and is ratified with the rest.
**Ratification is not authorization to run.** §5.4 and §6 carry obligations that fall due before the first real client recording, and §2.3's loose-photo routing stays conditional on §3's client disclosure existing.
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

- **Hosting** — **the trigger has fired.** Design v1 §8 named a second operator as a trigger; a concierge in training is planned immediately after launch, so hosted deployment is a **launch requirement**, not a later decision. Two consequences that bind what gets built from now: **every record carries who acted**, uniformly rather than nearly; and **nothing is built that works only because one particular person knows something.** Build for the second concierge.
- **Managed or hosted agents** — a hosted configuration would put prompt instructions outside version control, which breaks the golden-set mechanism. Separate decision if it is ever wanted; see the Open Items note.
- **Retention of what we send** — §2.5 is an obligation to establish and record, not an assertion of what the terms currently are.

## 5. Transcription — DECIDED 2026-07-29: a cloud transcription vendor

**Authorized:** memory audio and field voice notes go to a purpose-built cloud transcription vendor (Deepgram or AssemblyAI are the candidates in the options report).

**The reasoning is multi-operator, not technical.** Local transcription makes every concierge's hardware a support surface. Apple's on-device engine needs current macOS and exists nowhere else; whisper.cpp needs a compiler and an 800 MB model on each machine, is slow without a GPU, and **fabricates fluent sentences from silence** — which collides directly with 2a's silent-recording safeguard, turning an obvious blank the concierge chases into a plausible sentence they never said. A cloud vendor is identical on every machine, strongest on the material that actually matters (a person in a basement with a furnace running, saying *"Kinetico"* and a household surname), and costs roughly **$0.25–0.40 per visit** — noise against a retainer.

**5.1 · Key-point extraction is separately authorized.** The chosen flow is: audio → verbatim transcript → **AI-extracted key points** → concierge verification. The extraction step goes to Anthropic, and a transcript of a concierge describing a client's home was **not** covered by §2. It is now.

**5.2 · The transcript stays verbatim.** Extraction pulls key points; it never tidies the transcript. Audio is evidence; the transcript is derived from audio; key points are derived from the transcript. **Two derivations, each provenance-tagged, the original never discarded.**

**5.3 · Verification is against the audio, never against the text.** Checking extracted details against the transcript cannot catch a transcription error — a wrong sentence would be faithfully summarised and would match. **The audio must be one tap away at the point of verification**, and the concierge's question is *"did I say this"* rather than *"does this match what's written."* This is required regardless of vendor.

**5.4 · Obligations before the first real client recording.** A full entry on the model of §2.1–2.3: what is sent, on what terms, and **the vendor's retention and training terms established in writing** — the same obligation §2.5 places on the Anthropic account, with more force, because this is audio of people in their homes. The §3 client disclosure sentence extends to cover it, through the lawyer pass. *"Recordings of our concierge describing your home"* is a different sentence from *"photographs of equipment labels."*

**5.5 · A transcript is a proposal.** Quarantined and unsigned until a human accepts it, exactly like a nameplate reading. It is not the concierge's words until the concierge says so. The manual path stays: the pass works with transcription unavailable.

## 6. Review triggers

A second operator · document extraction being built · a client portal · **any change to the retention terms established under §2.5** · the lawyer pass, whichever comes first.

---

**Status:** drafted, awaiting ratification. §2.5 must be completed before the first real client import — it is the only item here that cannot be deferred.
