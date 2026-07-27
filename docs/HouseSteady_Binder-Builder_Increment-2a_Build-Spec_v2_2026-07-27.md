# Binder Builder — Increment 2a Build Spec: The Fresh Pass

**Date:** 2026-07-26
**Read first:** `CLAUDE.md` · `/docs/HouseSteady_Binder-Builder_Design_v1-1_Amendment_2026-07-26.md` · the Object/Concern Model.
**Supersedes:** Design v1 §2, which described triage as a task-batched queue rail. That framing is replaced — see §1.
**Scope:** the desk-side pass a concierge makes within a day or two of a visit, entirely manual. AI assists are **Increment 2b**, same screen, same overlay model.

---

## 1. What this is, and why the queue design was wrong

Design v1 modelled triage as a queue of decisions batched by task, optimised for speed. That optimises the wrong thing.

**Memory is the only input that decays.** The manifest holds what was captured; it cannot hold why a photo was taken, what the owner said at the door, the smell in the crawlspace, or the thing noticed and never shot. On day one the concierge has all of it. By day five most is gone permanently, and the Baseline is the most labour-intensive and highest-stakes visit there is.

So this screen is **a fresh pass, not a queue**: zone by zone, in visit order, walking the record while the house is still in mind. Decisions surface in context as the concierge arrives at them. Budget is up to an hour, and that hour is the highest-value hour in the process — not overhead to be minimised.

**Baseline and monthly are different jobs.** Baseline is the full walk. A monthly visit is smaller and mostly *what changed* — the short queue belongs there. Same screen; `visits.kind` sets the default mode. Change detection needs cross-visit identity and therefore manifest v4, so **2a ships the full walk for both**, with the monthly mode noted as pending.

## 2. Verification — what a signature actually claims

**"The record matches the evidence."** Narrowly: the characters read what the field says they read; the pin labelled water heater is a water heater; this photo depicts the thing this pin refers to.

**Never**: condition, adequacy, age, safety, or completeness. Serial-decoded age stays `Inferred` after a human agrees the sentence reads correctly — confirmation means a human agreed with the sentence, not that the fact changed origin (`/docs` honesty-label note, Increment 3).

**The button label is the claim.** It reads **"Matches the photo"** — not "Verify", not "Approve", not "Confirm". This is a copy requirement, not a suggestion: the phrasing is what keeps the narrow reading the only one available, and it is covered by the doctrine scan on headings implying trouble.

**The desk/field line.** Correcting a *reading* of evidence already present is desk work and is allowed. Adding *new* evidence or spatial data is field work and is not:

| Allowed at the desk | Not allowed |
|---|---|
| Correct a pin type, label, nameplate text, serial | Create a pin or any new entity *(deferred to v4 — see below)* |
| Attach a loose photo to a pin | Record a measurement |
| **Place or move an anchor on a canvas** *(see below)* | Change any captured value in place |
| Flag something for a closer look | Create anything not bound to evidence in hand |
| Record what the concierge remembers | |

### Anchor placement at the desk (revised 2026-07-26)

An earlier version of this spec blocked anchor placement outright on the grounds that the builder was not there. That reasoning holds for the *claim* but not for the *work*: the requirement is that desk placement must never be **indistinguishable** from field placement, not that it be prevented. Leaving a pin in the wrong room for a month because of a rule is the wrong trade.

**Placing or moving an anchor is allowed, as an overlay, and it says so.** The manifest is untouched; the overlay records `placed at the desk, from recall`, with the prior position stored where one existed. Honesty label is **Observed** — the concierge did see the thing — with provenance carrying the desk context. Same treatment as the zone memory note.

**It closes on the round trip.** A desk-placed or desk-moved anchor rides into the next visit's session plan flagged **confirm on site** (Increment 4). Once the concierge is standing in front of it, confirmation promotes it to field-observed. Better than either blocking the work or pretending it happened on the day.

**The governing line is evidence versus recall, not desk versus field.** Anything the builder creates or positions must point at evidence already in hand — a photo, a note, a chat thread, a lab report. Placing an unanchored pin whose photo is on screen is grounded. Recording a shutoff the concierge merely remembers being behind the furnace is not, and must not become a record: it becomes a **carried item for the next visit**, pinned properly by someone standing there.

**Entity creation stays deferred, for sequencing not doctrine.** Under manifest v4 the question stops being "add a pin" and becomes "is this an object or a concern?" — and the answers differ. A desk-created *object* is strange; the concierge did not see the thing. A desk-created *concern* is ordinary — a stain noticed in the photos, a lab result arriving. Building creation against v3's pin model means building it twice.

Unplaced pins that the concierge cannot place from evidence remain **reported, not placed**, and carry forward.

## 3. Four acts, four overlay kinds

Never collapsed into one "verified" flag:

- **confirm** — the record matches its evidence
- **correct** — a value was wrong; **the prior value is stored in the overlay** ("was freeform *receptacle*, corrected to component *junction-box* at the desk")
- **assign** — a loose capture or inbox item attached to a pin or zone
- **flag** — needs a closer look; carries a short reason
- **place** — an anchor set or moved at the desk; stores prior position where one existed, and always carries `from recall` provenance

**Undo is a superseding overlay, never a deletion.** The trail should honestly read *assigned, unassigned, reassigned*. Undo must be one keystroke and instantly available — at this pace mis-taps are certain, and if undo is awkward people slow down to avoid needing it.

## 4. Data model (migration 003)

Increment 1 created `verifications` and `field_fixes` as separate empty tables, guessed before the model settled. **Replace with one `overlays` table**, because current state is *latest wins across all overlay kinds for an entity*, and that query is awkward across tables. The two earlier tables are empty; dropping them in 003 is Code's call.

- `overlays` — id, property_id, visit_id, **kind** (confirm | correct | assign | flag | memory | place | undo), **target_kind** (pin | media | zone | resolution | note | inbox_ref), **target_id**, **field** (nullable — which attribute, for `correct`), **prior_value** (JSON, nullable), **new_value** (JSON, nullable), reason (nullable), **supersedes_id** (nullable — set by undo and by re-decisions), actor, actor_context (`desk`), created_at

**Current state is computed on read**, not maintained in a separate table — hundreds of rows per visit, not millions. Add a source-scan doctrine test: **nothing outside the overlay layer may write a derived-state column.**

**Zone memory** is an overlay of kind `memory` targeting the zone: free text, and/or an audio file stored like any other media with `origin = desk`. Honesty label is **Observed** — the concierge did see it — with provenance recording `human-entered, desk, from recall`. That distinction is the honest one: the label describes who perceived it, the provenance describes when it was written down.

**Record, never live dictation.** The audio is the evidence; the transcript is derived from it, provenance-tagged, and correctable like any other value. Live speech-to-text makes the recognizer's error *the record* with no original to fall back on. Audio is retained permanently even after transcription, and a corrected transcript stores its prior value like any other correction.

**Transcription is Increment 2b.** 2a records and plays back — audio is never lost, only not yet searchable. When transcription lands, **the transcript must be surfaced for review, never silently filed**: the only person who can catch a mishearing is the one who spoke, and only for a short while.

## 5. The screen

**Left rail:** zones in **visit order** (derived from the event log, not alphabetical), each showing done / in-progress / untouched and a decision count. Sequential is the default; jumping is allowed.

**Zone page, top to bottom:**

1. **Canvas with pins placed.** Anchors are normalized 0–1 floats against the canvas photo — render markers directly. Flagged pins render distinctly. Beside it, a tray of **pins not placed on the plan**, labelled as a field task rather than something to fix here. Manifest-only imports (no media on disk) degrade to a pin list with a plain explanation.
2. **Needs a decision here** — in context, not batched: typeless pins, unassigned inbox items belonging to this zone, failed checks with their evidence and field notes, `na` items with their reasons, pins carrying `issue`. Each is one of the four acts.

   **Nameplates in 2a show the photo and nothing else.** The real v3 export carries **no structured nameplate fields** — pins have a type, anchors, and media; there is no make, model, or serial to confirm. Those values arrive from AI extraction in 2b, and the confirm/correct pair applies to them then. What 2a confirms is what the field entered: component types picked from a list, labels, `na` reasons, failed-check notes — all tapped or typed at hour three, all capable of being wrong.

   *(Routed to the field session, non-blocking: Manifest Contract §7b requires serial and install date as structured fields and names the manifest as the equipment registry's data source. The field app does not capture them and the AI plan assigns extraction to the builder — so the registry's source is the builder's enriched record, not the manifest. Either the field app captures them, or §7b's guarantee needs rewording.)*
3. **Room photos** — the zone-owned captures (28 of 37 in the reference export; likely 200+ in a real baseline). Browsable, attachable. **Leaving a photo attached to the room is a valid final state**, not an unresolved one — most room photos are context, and requiring assignment would turn the pass into the chore this design exists to avoid.
4. **What do you remember about this room?** — the memory capture. Prompted every zone, always skippable. Record (audio stored, transcribed in 2b) or type.

**Capture assurance — required, not optional polish.** The failure this guards against is walking the whole pass and discovering the mic was muted. Same discipline as checksum verification: do not assume capture worked, prove it.

- **Mic check before zone one** — two seconds, once per pass. Catches wrong input device or ungranted permission systemically rather than nine times over.
- **Record disabled until permission is actually granted.** Never a button that pretends.
- **Live level meter while recording** — a moving level, not a status dot. A flat line is visible immediately.
- **Duration and byte size shown on stop.** Near-zero is obviously wrong.
- **Silence detection on stop** — an essentially silent recording says so at once and offers a re-record. This is the specific catch for a muted mic.
- **Inline playback immediately after.** Hearing it is the strongest verification available.
- Per-zone rail indicator showing a note exists and its length.

**Backstop:** the pass cannot be marked complete with a zero-length or silent recording sitting unacknowledged.

**Keyboard throughout:** `j`/`k` move, `c` matches the photo, `e` correct, `a` assign, `f` flag, `u` undo, `n` next zone. The pass must be completable without the mouse except for placing an assignment.

**Session-scoped items** (alarm coverage, termination reconcile) have no zone. They get a final page after the last zone.

## 6. Done, and what "done" is not

The pass is complete when: every zone has been opened, every inbox item decided, every typeless pin decided, every failed check and `na` acknowledged, session items reviewed. **Room-photo assignment is never required. Memory capture is prompted, never required.**

Completion is not a claim about the binder — what *must* be verified for binder content is decided by the Binder Schema in Increment 3, and this increment must not pre-empt it. A pass can be complete while the binder is still short.

Show progress honestly: zones walked, decisions made, decisions remaining, time in pass.

## 7. Out of scope

All AI (2b) · binder assembly · gap report · concern register (v4) · pin creation · anchor placement · measurements · editing any captured value in place · monthly change detection (needs v4).

## 8. Tests

Behaviour: each of the four acts writes an overlay and never mutates a captured row · undo supersedes and the trail reads honestly · corrections retain prior values · current state resolves latest-wins across mixed kinds · canvas markers land at the right normalized coordinates · a zone with no canvas and a manifest-only import both degrade gracefully · the reference export walks end to end.

Capture assurance: permission-denied disables record · a silent recording is detected and reported · a zero-length file cannot be left unacknowledged at completion · audio survives transcription.

Placement: a desk-placed anchor is visually and structurally distinguishable from a field anchor everywhere it appears · prior position retained on a move · a placement with no evidence binding is refused.

Doctrine scans: **no write path to a captured table from the overlay layer** · **no button, heading, or label in the verification path uses "verify", "approve", or "certify"** · **no overlay kind can set a condition, grade, or adequacy field** · nothing outside the overlay layer writes derived state.

---

**Status:** ready for Claude Code. Increment 2b (nameplate extraction, loose-photo routing suggestions, memory transcription, pin-type suggestion) is specced after this lands.
