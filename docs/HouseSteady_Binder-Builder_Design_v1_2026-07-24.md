# Binder Builder — Design v1: The Working Surface

**Date:** 2026-07-24
**What this document is:** the design decision record for the binder builder's working surface, data model, and build ladder. Answers the concept doc's open questions D-by-D. Supersedes nothing; pairs with Binder-Builder Concept v1, Manifest Contract v3, Master Spec v1 (definition of done), Baseline Process v1 (Phase 11), Client Intake Form v1.

---

## 1. The central decision — what the working surface is

**The spine of the app is the binder's own table of contents**, driven by a machine-readable **Binder Schema** (the Master Spec as data: section → required slots → source mapping → completeness rule). On that spine sit **two workspaces with different rhythms**, plus renders:

| Surface | Rhythm | Job |
|---|---|---|
| **Triage** | Fast verb — bulk, keyboard, photo-centric | Verify what the field captured, right after import. Phase 11's human pass. |
| **Section Workbench** | Slow verb — one section, text-centric | Assemble, enrich, draft, write, sign. Builds the binder. |
| **Renders** | Outputs, not places | Gap report (v0.5) · binder physical + digital (v1) · monthly report (v2). |

This resolves the concept's editor/database/queue question: it is a **review queue inside a section-structured workbench, backed by a database** — not any one of the three alone. The symmetry that makes it coherent: the field app renders the Process doc as config; the builder audits and assembles against the Master Spec as config. Same architecture philosophy, one level up. Improving the binder = editing the schema, not shipping code.

**One state, many views.** A missing schema slot appears simultaneously as: a dashed slot card in the workbench, a completeness pip in the TOC rail, and a row in the gap report. Nothing is tracked twice.

## 2. Triage (the post-import verify pass)

- **Layout:** top status bar (property · visit · import validation chip · config hash) · left queue rail · center record detail.
- **Queue rail groups:** Inbox (unassigned at export — first-class, never buried) · Exceptions (checklist items na/unresolved/deferred with reasons) · Zones with unverified counts.
- **Record detail:** photos large, structured fields beside, provenance chip (AI-read / human-entered / human-confirmed) and honesty label always visible.
- **Keyboard loop:** j/k navigate · c confirm · e fix · f flag · i assign inbox item (pick zone, optional pin) · a note. Target: 200–500 items in ~1 hr.
- **Confirming does two things:** marks the evidence verified, and advances the completeness of whatever schema slots the record feeds (via source mappings). No manual filing of pins into sections — the schema knows equipment pins populate §7. Inbox items are the only manual placement.
- **Exceptions pass:** a yes-that's-right review; confirmed exceptions seed "missing from us."

## 3. Section Workbench (the binder builder proper — v1)

- **Left rail:** the Master Spec TOC — Quick Layer, Tabs A–E — with live status pips (empty · partial · ready · signed) and per-section gap counts. **The rail is the audit, permanently visible.**
- **Center:** the open section as **slot cards**. Each slot: content · provenance chip · honesty label · state (empty / evidence-bound / AI draft / signed). Required-but-empty slots render dashed. Section header shows n-of-m slots + missing count.
- **Right:** evidence drawer, pre-filtered by the schema's source mapping for this section — tabs: Pins / Photos / Documents / Intake / Results. Bind evidence to a slot by click.
- **Top:** Edit ⇄ Preview toggle (preview = the section as it will render) · output profile switch (Digital master / Physical).
- **Draft/write mechanic (the builder's attest):** AI-proposed content arrives visually quarantined ("AI draft — review"), editable, and **nothing renders client-facing until signed**. Signing flips provenance to human-confirmed and is the render gate. v0.5 ships the mechanic's data model with no AI drafting wired; drafting lands v1.5 per the concept ladder — the state machine exists from day one so nothing retrofits.

## 4. Gap report editor (the v0.5 deliverable)

An editor over pre-populated rows, not a static render:
- **Missing from you** ← intake Tier 3 document checklist minus documents received.
- **Missing from us** ← checklist exceptions (no access / deferred / weather) + anything flagged unreadable at import.
- **Triggered flags** ← pin flags + trigger items (WETT, ESA, septic assessment, asbestos-suspect, tap-lead…).
- Every row carries a source chip and traces back to its pin/item on click. Rows toggle in/out; wording editable; manual rows addable. Footer: **Sign and render** → branded HTML/PDF. Lab results append as they land (edition mechanism, §6). Human signs; nothing auto-sends.
- **Client-facing from the first render:** brand system applies, and the Scope's language lint applies to templates (banned-words check; the "monitor"-as-equipment-noun nuance is David's call, queued).

## 5. Data model — the load-bearing rule

**The manifest is immutable evidence; the builder writes overlays.**
- Imports stored verbatim: raw manifest JSON retained whole; media untouched at contract paths (`media/<zone>/pin-<n>/…`, `_canvas/`, `_zone/`, `_misc/`); per-file sha256 verified at import and kept.
- Every builder-side act — confirmation, field fix, draft, signature, gap-row edit, slot binding — is a **layered record referencing manifest entities by ID**. The original value is never mutated; a "fix" is an overlay with its own provenance.
- Consequences bought structurally, not as features: provenance is a property of storage · "never launder an inference into an observation" is enforced because the observation cannot be edited · re-import/re-open (session lifecycle[]) reconciles cleanly · **binder editions are snapshots of the overlay set** — dated, diffable.

**Core tables (SQLite v0.5):** properties · visits · imports (raw manifest JSON + validation result) · zones · pins · media (path, sha256, mime) · notes · chat_threads/messages · checklist_items (tier, attest, status, via, naReason) · inbox_items · verifications (overlay: entity ref, action, actor, at) · field_fixes (overlay) · documents · intake_responses · results (labs) · schema_versions · slot_states (property × schema slot: bindings, draft, signed) · gap_rows · renders/editions (dated, changelog entries). Property-scoped everything; **pin number is the cross-visit join key** (contract §7b) — unique per property, stable across visits.

## 6. Editions and late results (D6, decided)

A shipped binder is a **dated edition** — a snapshot render with a changelog. The digital master is the always-current layer above editions. Late results (chemistry 1–2 wk, radon ~3 mo) land as new evidence → affected slots re-open to *underway → resolved* → next edition renders with changelog entries. Phase 13 doctrine holds throughout: in-flight items render as *underway* with dates, never omitted, never claimed done. The transfer package (§23) hands over a named edition — "which binder did the buyer receive" always has an answer. Same instinct as the dated-file governance running the whole business.

## 7. Physical/digital split (D5, mechanism decided)

One assembly, **two output profiles at render** (Digital master = everything; Physical = the profile's section/slot subset). The content question — physical = Quick Layer + summaries, ~40–60 pp — stays David's ratification on the business track; either outcome is a profile config change, not a rebuild.

## 8. Platform (D8, decided)

- **Local-first now:** Vite + React front · small Node/Express API · SQLite (better-sqlite3) · media on disk mirroring contract paths · runs on David's machine, browser UI. Evenings-buildable in Claude Code. Separate repo: **housesteady-builder**.
- **Longitudinal schema from commit one:** property-scoped, pin-number join key, content-addressed media, many-visits assumption.
- **Lift triggers to hosted (Postgres + S3-class object storage):** a second operator · client-portal delivery (D7) · offsite-backup risk unacceptable. Until then: routine backup of the SQLite file + media directory to external/cloud storage is an operating discipline, not optional.
- Nothing assumed from the field app's stack, per the concept.

## 9. Delivery and access (D7, deferred with constraints)

Portal vs PDF vs print decided at v1 render work — but bound now: access maps the Scope's authority framework (flows from the homeowner's explicit delegation; payment does not purchase authority; the builder adds no new audience). The lawyer-pass items (AI-processing consent, data-handling disclosure, retention/breach posture) bind **before real client data enters the builder** — test-house data gets the same discipline first, per the field spec's own rule.

## 10. Build ladder (each increment = one bounded Claude Code handoff, each usable alone)

| # | Increment | Delivers |
|---|---|---|
| 1 | **Import** | Repo skeleton · data model · manifest v3 zip ingest with validation (schema version, per-media sha256, config hash) · import report screen. Proves the contract first. |
| 2 | **Triage** | Zone-grouped queue · keyboard verify loop · inbox assignment · exceptions review. |
| 3 | **Binder Schema + audit** | Schema v1 as versioned data in-repo · per-section completeness engine. Schema *content* drafted with Claude in-session, coarse first — v0.5's gap report runs mostly on intake checklist + exceptions + flags, so full 23-section mapping is not a blocker. |
| 4 | **Gap report editor + branded render** | The three-column editor · sign · HTML/PDF in brand system. **= v0.5 complete; the loop with visit two closes.** |
| 5 | **Workbench shell + first sections + editions** | TOC rail · slot cards · evidence drawer · §1 emergency sheet + shutoff map (from the shutoffs layer) · §7 systems inventory (from pins) · §10 condition assessment (from flags/findings) · edition snapshots. Start of v1. |

Session-plan export (contract §7a, builder → field) stays v2 per the concept ladder; v0.5 needs only the import direction.

## 11. Open items and routed questions

- **Anchor coordinate semantics:** the contract lists `pins[].anchors[]` without a shape. Increment 2 renders per-canvas pin *lists* without spatial overlay; spatial placement on canvas photos waits on the anchor spec — **change-request/clarification to the field session via David.**
- Language lint nuance ("monitor" as equipment noun) — David adjudicates before Increment 4's templates.
- Binder Schema content passes — with Claude, in-session, iterative (coarse for Increment 3, full for Increment 5+).
- Physical-profile content ratification — business track (Roadmap §5).

---

**Status:** v1 — the builder track's design truth document. Next file: Increment-1 build spec (the Claude Code handoff).
