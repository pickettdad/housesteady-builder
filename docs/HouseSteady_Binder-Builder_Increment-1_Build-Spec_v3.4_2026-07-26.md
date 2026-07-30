# Binder Builder — Increment 1 Build Spec: Import (v3.4)

**Date:** 2026-07-25
**Supersedes:** Increment-1 v1, v2, v3. (v3.1 adds §8 — the AI provenance table, created empty now to avoid a migration later.)
**v3.2 adjudications** (2026-07-25, after Claude Code's pre-build read of the real manifest) are in §9. Where §9 and an earlier section differ, §9 wins.
**Supersedes note:** v1 and v2 Both were written against the contract *document*; this one is written against a **real v3 export** and the Observed Addendum that corrects the contract.
**Read first:** `CLAUDE.md` · `/docs/HouseSteady_Manifest-Contract_v3_Observed-Addendum_2026-07-27.md` (authoritative on shape) · `/docs/HouseSteady_Binder-Builder_Design_v1_*.md` (§5 is the storage doctrine) · `/fixtures/reference/housesteady-019f9a33-manifest.json` (the real export — **read it before writing the data model**).

**Scope:** repo skeleton, data model, manifest v3 import with validation, import report screen. Nothing else.

---

## 0. Non-negotiables

1. **The manifest is immutable evidence.** Store the raw JSON verbatim and whole. Media copied byte-identical. Nothing from an import is ever mutated — future edits are overlay records (later increments). Build the tables that way now.
2. **Never silently drop anything.** Unknown fields preserved (raw JSON is the fallback of record). Inbox, orphan events, and unrecognized vocabulary surface in the report.
3. **Fail open on vocabulary, fail closed on structure.** An unknown resolution kind or pin type imports fine and is counted as unrecognized. A wrong schema version refuses the import.
4. **Recoverable failures are informative, not fatal.** One bad checksum fails that file loudly and imports the rest.

## 1. Stack and repo

Node 20+ · Express or Fastify (thin) · **better-sqlite3** · Vite + React + TypeScript · plain CSS, desktop width. `npm run dev` runs API and UI together. Layout per `CLAUDE.md` §13. `/data` gitignored.

Media stored at `data/properties/<propertyId>/visits/<visitId>/` — verbatim `manifest.json` plus the media tree at the export's own relative paths (`media/<zoneId>/pin-7/<mediaId>.jpg`, `media/<zoneId>/_canvas/…`, `media/<zoneId>/_zone/…`, `media/_misc/_inbox/…`).

## 2. Data model (SQLite, migration 001)

All tables carry `created_at`; visit-scoped tables carry `property_id` and `visit_id`. Many visits per property from the first commit.

**Core**
- `properties` — id, address, label
- `visits` — id, property_id, kind (baseline | monthly | other), visit_date, notes
- `imports` — id, visit_id, imported_at, manifest_schema_version, app_version, config_id, config_version, config_hash, raw_manifest (TEXT verbatim), validation_report (JSON), status (ok | ok_with_warnings | failed)
- `session_meta` — import_id, session_id, property_label, flags (JSON), started_at, completed_at, exported_at, lifecycle (JSON), totals (JSON), orphan_events (JSON), events_count
- `config_snapshots` — import_id, config_id, config_version, config_hash, snapshot (JSON — full, includes `naReasons`, `layers`, all item definitions)

**Captured entities**
- `zones` — zone_id, import_id, property_id, visit_id, type, label, level, attributes (JSON), closed_at, close_note, audit_summary (JSON — `coreUnresolved`, `standardUnresolved`, `naCount`)
- `canvases` — canvas_id, zone_id, import_id, kind, retired (0/1), media_id, file
- `pins` — pin_id, import_id, property_id, visit_id, **number** (INTEGER — **session-scoped display label, NOT a join key**; the counter restarts at 1 each visit. Cross-visit identity is `pin_id`, the field-minted uuid), zone_id, **type_kind** (`component` | `freeform` | NULL), **component_type** (nullable), **freeform_label** (nullable), **nickname** (nullable — reserved; see Addendum §1), flag (`issue` | `monitor` | NULL), retired_at (nullable), media_ids (JSON), note_ids (JSON), chat_thread_ids (JSON)
- `anchors` — anchor_id, pin_id, canvas_id, **x REAL, y REAL** (normalized 0–1), import_id
- `media` — media_id, import_id, property_id, visit_id, kind (photo | voice | video | other), **owner_kind** (zone | pin | canvas | inbox), owner_zone_id, owner_pin_id, **owner_pin_number**, owner_canvas_id, group_key, file (rel path), mime, bytes, sha256, sha_verified (0/1), captured_at, duration_ms, source (JSON)
- `notes` — note_id, import_id, target_kind, target_id, text, at, source (JSON)
- `chat_threads` — thread_id, import_id, target_kind, target_id; `chat_messages` — thread_id, seq, role (user | assistant), text, media_ids (JSON), model (nullable), at, source (JSON)
- `inbox_refs` — import_id, ref_kind (media | note), ref_id, assigned_zone_id (nullable), assigned_pin_number (nullable) *(assignment is Increment 2; columns exist now)*

**The checklist state**
- `resolutions` — import_id, property_id, visit_id, **scope_kind** (zone | pin | session), scope_zone_id, scope_pin_id, **item_id**, **kind** (satisfied | na | *unrecognized values preserved verbatim*), via (check | pin | photo | note | null), result (pass | fail | null), note, reason_id, evidence (JSON), at, source (JSON), **is_recognized** (0/1)
- `events` — import_id, event_id, seq, type, at, event_schema_version, source (JSON), payload (JSON — the whole event verbatim)

**Derived-at-import convenience columns** on `resolutions`, computed by reading the import's own `config_snapshot.naReasons` — never hardcoded:
- `feeds_gap_list` (0/1) — true when `kind = na` and the matching reason has `feedsGapList: true`
- `records_finding` (0/1) — true when `kind = na` and reason has `recordsFinding: true`, **or** when `result = 'fail'`

These two columns are what Increments 3–4 read. Getting them right here is the point of the increment.

**`imports.raw_manifest` is the record of truth.** Every column above is a query convenience.

## 3. Import flow

**UI:** minimal shell — Properties nav · property page (visit list + "Import visit") · import page.

1. **Choose/create property → create visit → upload.** Accept: a manifest JSON alone (**manifest-only dev mode** — media rows created, files marked absent, clearly reported), or a manifest plus media zips (per-zone + `_misc`), or one combined zip. All three paths must work; manifest-only exists so the real reference export can be imported today, before media zips are available.
2. **Validate.** Every check writes a structured entry in the validation report:
   - `manifestSchemaVersion === 3` → else **refuse**, naming the version found.
   - JSON parses; expected top-level sections present (`session`, `config`, `zones`, `pins`, `media`, `resolutions`, `totals`, `events`). Missing optional sections warn.
   - **Every `totals` key reconciles against actual array counts** — zones, pins, canvases, photos, voiceNotes, notes, chats, inboxItems, mediaFiles, mediaBytes. Report each mismatch individually. *(The reference export reconciles perfectly on all ten; treat any mismatch as a real signal.)*
   - **Referential integrity:** pin→zone, pin→media, pin→note, pin→chat, anchor→canvas, canvas→media, note→target, chat→target, inbox→media/note. Dangling references are warnings that name both ends, never silent drops.
   - **Anchor bounds:** x and y within 0–1. Out-of-range warns and stores anyway.
   - **Checksums:** sha256 recomputed per media file when files are present; mismatches quarantine to `media/_failed/` and list. In manifest-only mode, mark all as `sha_verified = 0, files absent`.
   - **Event sequence** contiguous from 1; gaps warn.
   - **Resolutions vs events:** count `ItemResolved` minus `ItemReopened` and compare to `resolutions[]` length. Report both numbers when they differ — this is expected reconciliation, not necessarily an error.
   - **Vocabulary check:** every `resolution.kind`, `resolution.via`, `resolution.reasonId`, `pin.type.componentType`, `pin.flag`, `media.kind`, and `event.type` checked against the import's config snapshot and the known set. Unknown values are **imported, flagged `is_recognized = 0`, and listed in the report as "unrecognized vocabulary"** — never a failure.
   - **Pin number integrity:** unique *within the import* only. **Do not compare pin numbers across visits** — numbers are session-scoped and restart at 1, so a different pin carrying number 1 next visit is correct behaviour, not an anomaly. Cross-visit identity is the uuid.
   - **Config hash** recorded; a different hash from a prior import on this property is noted informationally.
3. **Persist** — one transaction: media copied first, DB committed last. A failed import leaves no partial DB state.
4. **Import report screen** — the visible deliverable:
   - Status banner (ok / warnings / failed) · property label · schema version · app version · config id, version, hash · property flags.
   - **Lifecycle timeline** — completed / reopened with reasons and times.
   - **Counts grid:** zones · canvases · pins (with typeless, retired, and unanchored called out separately) · media by kind and by owner kind, with verified vs failed vs absent checksums and total bytes · notes · chat threads and messages · inbox refs · events · orphan events.
   - **Checklist summary:** resolutions by kind and scope · pass vs fail counts · **gap-feeding count** · **finding-recording count** · per-zone unresolved core and standard counts from the zone audit summaries.
   - **Warnings list** — each specific, naming the entities involved.
   - **Unrecognized vocabulary list** — what appeared that the builder doesn't know.
   - Read-only browse stub: zone list with per-zone pin and media counts. *(Click-through detail is Increment 2 — do not build it.)*

## 4. API surface

`POST /api/properties` · `GET /api/properties` · `POST /api/properties/:id/visits` · `POST /api/visits/:id/import` (multipart) · `GET /api/imports/:id/report` · `GET /api/visits/:id/summary`

## 5. Fixtures and testing (part of done)

- **The reference export imports successfully in manifest-only mode.** Primary acceptance test: `/fixtures/reference/housesteady-019f9a33-manifest.json` → status `ok_with_warnings` (media absent), all ten totals reconcile, integrity clean, **4 distinct anomalous pins** — 2, 8, 10, 11 — reported without double-counting (2 typeless, 2 retired, 4 unanchored; the union is 4, not 8), 28 zone-owned photos reported, 20 resolutions, **4 records_finding (2 failed checks + 2 confirmed absences)**, 1 na feeding the gap list, zone 2 reported as closed-with-no-work, zone 1 reported with its full close/reopen rework history.
- **`server/scripts/make-fixture.ts`** generates a **complete synthetic v3 export** — manifest plus real media files with correct checksums — modelled exactly on the reference export's conventions: UUIDv7 ids, `source` blocks on everything, the same path shapes, a lifecycle with a reopen, a config snapshot including `naReasons` and `layers`. Include what the reference lacks: **a `measure` resolution with a numeric value, an exterior zone, a voice note, a nickname on one pin, and a `.unit` whole-object photo item satisfied via photo** — so the untested paths have coverage.
- **Broken variants:** wrong schema version · corrupted checksum · totals mismatch · event-sequence gap · dangling pin→media reference · out-of-range anchor · **unknown resolution kind `choice`** (must import cleanly and appear as unrecognized vocabulary).
- Tests: reference import · synthetic import with media · each broken variant behaves as specified · re-import of the same export to the same visit refused.

## 6. Out of scope

Triage UI · verification overlays · inbox assignment actions · canvas rendering or pin overlay · Binder Schema and audit · gap report · any rendering · any AI · auth/hosting.

## 7. Done means

`npm run dev` → create a property → import the real reference manifest → the report shows correct counts, the lifecycle timeline, the gap-feeding and finding-recording splits, and every anomaly named. The synthetic fixture imports with media and passes checksum verification. Broken variants behave as specified. Tests green.

## 8. Forward compatibility — the AI provenance table

No AI logic in this increment. **One table, created empty**, so the shape exists before Increment 2 writes to it and no migration is needed later. See `/docs/HouseSteady_Binder-Builder_AI-Assist-Plan_v1_2026-07-25.md`.

- `ai_generations` — id, property_id, visit_id, import_id, **task** (nameplate_extract | photo_route | transcribe | pin_type_suggest | slot_bind | draft_row | lint | …), **target_kind** + **target_id** (what it was about), **model**, **prompt_id**, **prompt_version**, **prompt_hash**, input_refs (JSON — the media/pin/item ids fed in), output (JSON or TEXT), **abstained** (0/1), confidence (nullable), input_tokens, output_tokens, cost_estimate, created_at, **human_decision** (pending | accepted | edited | discarded), human_decided_at, human_note

Two rules that follow from doctrine and should be enforced by the schema's shape from the start: an `ai_generations` row is **never** itself client-facing content — client-facing content is an overlay record that a human signed, which may cite a generation id as its origin. And `abstained = 1` is a **successful** outcome, not an error state.

Also create `/prompts/README.md` stating that prompts are versioned, content-hashed config files and that no model call may use an inline prompt string. No prompts yet.

---

## 9. Adjudications (v3.2 — these override earlier sections where they differ)

Claude Code read the real manifest before building and raised nine points. All accepted; four amended.

**9.1 · Findings count is 4, not 2.** §5's earlier wording described only the not-applicable side; §2's column definition is correct — `records_finding` is true for `na` with `recordsFinding` **and** for `result = 'fail'`. The reference export has 2 + 2 = **4**.

**9.2 · "Finding" does not mean "problem" — this is a naming trap.** Two of those four are failed checks (defects: `int.receptacles`, `int.lighting`); two are **confirmed absences** (`liv.fireplace`, `int.moisture-suspect`) — substantive facts that belong in the binder and are not trouble. **The report must show the total and the breakdown, and must never place them under a heading implying problems.** Suggested wording: *"4 recorded findings — 2 failed checks, 2 confirmed absences."*

**9.3 · Property identity: correct, and add a soft guard.** The manifest carries no property id or address — only `session.propertyLabel`, free text. Matching an export to a house is permanently a human decision at import. Real labels will be better than the test one, but remain free text and will vary between visits ("443 Wannamaker Rd" / "443 Wannamaker Road" / a typo). **Never match on the label string.** Show it prominently as specified, and additionally: **on import, fuzzy-compare the label to the chosen property's address and warn on a poor match** — a dismissible "this doesn't look like this property, continue?" This guards the one error in the system with no recovery: misfiling visit two into the wrong property silently corrupts the pin-number join for both houses, permanently.

**9.4 · Zone close/reopen rework history — elevate from note to report feature.** Correct that it lives only in `events[]` (zone 1: closed, reopened "Test", closed, reopened "Test ai", closed). Read it from events and **show a per-zone close/reopen count** in the report. Rationale beyond correctness: with several concierges, rework patterns are a quality and training signal, and a heavily-reworked zone that displays as pristine hides exactly the information the audit exists to surface.

**9.5 · Zone closed with no work is a first-class report category.** Correct, and it is the most consequential shape in the file — zone 2: closed, 0 pins, 0 resolutions, 19 items outstanding, 25 photos, 2 canvases. **This is what a rushed or undertrained visit produces**, so name it explicitly in the report rather than leaving it implied by counts. Add to the anomaly list in §3.4: *zones closed with no resolutions recorded.*

**9.6 · Distinct-vs-overlapping pin counts.** *(corrected 2026-07-26: v3.2 said 5; the union of {10,11} ∪ {2,10} ∪ {2,8,10,11} is 4. Claude Code caught this against the real file.)* Report **4 distinct anomalous pins** — 2, 8, 10, 11 — with the overlap shown (pin 10 is typeless + retired + unanchored; pin 2 is retired + unanchored). Never present 2 + 2 + 4 as if it were 8.

**9.7 · Accepted without amendment:** chat messages have no `seq` (derive order from array position and store it as `seq`) · `resolution.evidence` exists and must not be dropped — the §2 table is right, the Addendum's shorthand was short · `type` is **absent**, not null, on typeless pins — handle a missing key · canvases are nested inside zones, no top-level array.

**9.8 · Do not recompute the zone audit summaries in this increment.** Code proposed verifying them by recomputing from the config's rules rather than copying, having done so manually and found them exact. That verification is genuinely valuable — and it **is the audit engine**, which is Increment 3's entire subject (item applicability from zone-type inheritance, zone attributes, and property flags). **Store and display the summaries as given; record the manual verification as a note for Increment 3.** Don't build ahead.

**9.9 · Media kinds are open vocabulary and about to change.** The field app is adding **video** evidence, and `voice` may be renamed (audio / "audio evidence"). `media.kind` is fail-open like every other vocabulary field — unknown kinds import, store, count, display as unrecognized; never switch on an exhaustive list. **Report bytes broken out by kind** from the start: video changes the storage arithmetic materially, since minutes of it can outweigh an entire visit's photos.

---

## 10. Model correction (v3.4 — 2026-07-26, after the Object/Concern Model was ratified)

The ratified cross-app model (`/docs/HouseSteady_Object-Concern-Model_v1_2026-07-25.md`) corrects an identity assumption that ran through v1–v3.3 of this spec and through the manifest contract itself.

**10.1 · Pin numbers are session-scoped, not permanent.** The counter lives on the session row and restarts at 1 every visit. **The uuid is the cross-visit identity; the number is a display label.** Everywhere this spec previously called the number a join key is wrong and is corrected above.

**10.2 · Delete the cross-visit pin-number warning.** The check that reports *"pin 1 in this export is a different pin from the one that carried number 1 on the prior visit"* describes **correct, expected behaviour** as an anomaly. It is not to be collapsed to a summary line — it is removed. Retain: uniqueness of numbers within a single import.

**10.3 · A valid replacement check exists.** The same **uuid** appearing across two visits with a materially different type, label, or zone *is* worth a warning — that is the same identity describing a different thing. Cheap, and it protects what the number check was reaching for.

**10.4 · "Pin" means the canvas marker, not the entity.** From v4 the entities are Zone, Object, Concern, Capture. Naming in this repo should follow.

**10.5 · Manifest v4 is coming and breaks cleanly.** No dual support required — one real v3 export exists and it is archived. **But the parsing layer must be a thin versioned adapter**, with everything downstream reading this repo's own tables rather than manifest JSON, so v4 is a new adapter module rather than a rewrite. See `CLAUDE.md` §8.

**10.6 · Hold the two-visit fixture generator.** Its whole shape depends on what persists across visits, which is v4-shaped. Building it now means building it twice. The single-visit synthetic fixture (measure resolution, exterior zone, voice note, nickname) still proceeds.

---

**Status:** ready for Claude Code. Increment 2 (Triage) is specced after this lands, and re-baselined against a richer export once the field app produces one with measurements and an exterior zone.
