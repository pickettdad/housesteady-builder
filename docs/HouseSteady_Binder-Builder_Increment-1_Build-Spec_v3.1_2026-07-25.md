# Binder Builder — Increment 1 Build Spec: Import (v3.1)

**Date:** 2026-07-25
**Supersedes:** Increment-1 v1, v2, v3. (v3.1 adds §8 — the AI provenance table, created empty now to avoid a migration later.)
**Supersedes note:** v1 and v2 Both were written against the contract *document*; this one is written against a **real v3 export** and the Observed Addendum that corrects the contract.
**Read first:** `CLAUDE.md` · `/docs/HouseSteady_Manifest-Contract_v3_Observed-Addendum_2026-07-25.md` (authoritative on shape) · `/docs/HouseSteady_Binder-Builder_Design_v1_*.md` (§5 is the storage doctrine) · `/fixtures/reference/housesteady-019f9a33-manifest.json` (the real export — **read it before writing the data model**).

**Scope:** repo skeleton, data model, manifest v3 import with validation, import report screen. Nothing else.

---

## 0. Non-negotiables

1. **The manifest is immutable evidence.** Store the raw JSON verbatim and whole. Media copied byte-identical. Nothing from an import is ever mutated — future edits are overlay records (later increments). Build the tables that way now.
2. **Never silently drop anything.** Unknown fields preserved (raw JSON is the fallback of record). Inbox, orphan events, and unrecognized vocabulary surface in the report.
3. **Fail open on vocabulary, fail closed on structure.** An unknown resolution kind or pin type imports fine and is counted as unrecognized. A wrong schema version refuses the import.
4. **Recoverable failures are informative, not fatal.** One bad checksum fails that file loudly and imports the rest.

## 1. Stack and repo

Node 20+ · Express or Fastify (thin) · **better-sqlite3** · Vite + React + TypeScript · plain CSS, desktop width. `npm run dev` runs API and UI together. Layout per `CLAUDE.md` §11. `/data` gitignored.

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
- `pins` — pin_id, import_id, property_id, visit_id, **number** (INTEGER — permanent cross-visit join key), zone_id, **type_kind** (`component` | `freeform` | NULL), **component_type** (nullable), **freeform_label** (nullable), **nickname** (nullable — reserved; see Addendum §1), flag (`issue` | `monitor` | NULL), retired_at (nullable), media_ids (JSON), note_ids (JSON), chat_thread_ids (JSON)
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
   - **Pin number integrity:** unique within the import; a collision with a *different* pinId on the same property from a prior visit warns loudly.
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

- **The reference export imports successfully in manifest-only mode.** This is the primary acceptance test: `/fixtures/reference/housesteady-019f9a33-manifest.json` → status `ok_with_warnings` (media absent), all ten totals reconcile, integrity clean, 2 typeless pins and 2 retired pins and 4 unanchored pins reported, 28 zone-owned photos reported, 20 resolutions with 2 fails and 3 na (one `deferred` feeding the gap list, two `none-present` recording findings).
- **`server/scripts/make-fixture.ts`** generates a **complete synthetic v3 export** — manifest plus real media files with correct checksums — modelled exactly on the reference export's conventions: UUIDv7 ids, `source` blocks on everything, the same path shapes, a lifecycle with a reopen, a config snapshot including `naReasons` and `layers`. Include what the reference lacks: **a `measure` resolution with a numeric value, an exterior zone, a voice note, and a nickname on one pin** — so the untested paths have coverage.
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

**Status:** ready for Claude Code. Increment 2 (Triage) is specced after this lands, and re-baselined against a richer export once the field app produces one with measurements and an exterior zone.
