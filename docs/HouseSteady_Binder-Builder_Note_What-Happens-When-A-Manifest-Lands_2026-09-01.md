# What happens today when a manifest lands

**2026-09-01 · Builder Code · repo state `c7d8bfd` (PR #127 merged).** A report on what is built, for
the design session to write the desk-pass-one process against.

⚑ **Everything here is measured, not remembered.** Table counts come from importing three real
manifests into a fresh database and diffing row counts. Route reachability comes from enumerating
`app.<verb>(` in `index.ts` against every URL literal in `web/src`. Module reachability comes from
walking the import graph from all 18 npm entry points. Where a number is a heuristic I say so.

**The three manifests used:** `fixtures/walk-2026-07-31` (baseline, 163 media),
`fixtures/reference` (37 media), and the Discovery walk of 2026-08-30 in `/data` (548 media). Three,
because one manifest cannot distinguish *"the import never writes this table"* from *"this export
had none of those."*

---

## 1 · The chain, and where it stops by itself

**A manifest landing does exactly one thing. Everything after it is a person pressing something.**

| # | step | how it starts | what it writes |
|---|---|---|---|
| 1 | **Import** | `POST /api/visits/:id/import` (screen) or `runImport()` | 7–14 tables · §3 |
| 2 | **Import report** | `GET /api/imports/:id/report` — the screen opens it | nothing |
| 3 | **Assists** — nameplate classify · photo routing · pin types | ⛑ **`POST /api/visits/:id/assists/run`** — a button | `ai_jobs`, then `ai_generations` |
| 4 | **The pass** (desk walk, zone by zone) | `POST /api/visits/:id/pass/start` — a button | `passes`, `pass_zone_opens`, `pass_events` |
| 5 | **Accept / correct** | `POST .../assists/:id/accept`, `POST .../overlays` | `overlays` (+ `objects` on an object accept) |
| 6 | **Audit** | `POST /api/properties/:id/audit` — a button | `audit_runs`, `audit_slots`, `audit_carried_items` |
| 7 | **Gap report** | `GET /api/properties/:id/report`, sign, render | `report_row_edits`, `report_editions` |
| 8 | **Session plan** | `GET /api/properties/:id/session-plan?download` | nothing |

⛑ **The import route does not queue anything.** Verified at `index.ts:262–315`: it calls `runImport`,
returns `{importId, status}`, and stops. `queueAssists` has exactly one caller in the repository —
`index.ts:628`, inside the assists-run route.

⚑ **And Amendment 11's three passes are not on that list at all.** Pass 1 (read surfaces), pass 2
(resolve product) and pass 3 (match/complete) are **CLI-only** — `npm run read`, `npm run resolve`,
`npm run match`, or `npm run passes` for all three in order. No screen and no route queues them.
`identify_objects` (stage 4) is likewise CLI-only, by the ruling of 2026-08-12.

**So the honest sequence today is: import on a screen → press assists → work the pass on a screen →
drop to a terminal for passes 1–3 → back to a screen for the audit and the gap report.**

---

## 2 · What the importer actually does, in order

*Read at source, `server/src/import/runImport.ts`.*

1. **Property and visit exist.** A visit is optional — a manifest belongs to a property; where a
   visit is named it must belong to that property.
2. **Parse and fail closed on structure** — `parseToCanonical`. ⚑ **Before anything touches the
   database or the disk**, so a refused import leaves no row and no directory. Three distinct refusal
   messages: unparseable JSON, missing top-level section, unknown version.
3. **Media, only if supplied.** Zips extracted to `.staging`, files matched by declared path, staging
   removed in a `finally`. An unreadable or hostile archive is a warning, not a failure — its files
   are reported absent. Path-escape entries are skipped and named.
4. **Thirteen check groups**, all of which run and all of which are recorded in `checksRun`: totals,
   referential integrity, anchor bounds, event sequence, resolutions-vs-events, pin numbers, pin
   identity across visits, capture window, config hash, vocabulary, property label, and either media
   checksums (with media) or media presence (without).
5. **Refuse a re-import** of the same `sessionId` into the same visit.
6. **Persist**, then write the verbatim `manifest.json` to disk beside where its media live.

**Refusals are structural only** — unparseable, missing section, unknown version, no such
property/visit, duplicate session. Everything else is a warning or an info and the import proceeds.

---

## 3 · The tables — 43 after 27 migrations

### Written by the import

| always | when the manifest carries them |
|---|---|
| `imports` · `media` · `pins` · `zones` · `events` · `config_snapshots` · `session_meta` | `anchors` · `canvases` · `notes` · `chat_threads` · `chat_messages` · `inbox_refs` · `resolutions` |

⛑ **`active_items` is written by the import and was empty on all three manifests.** It carries the
field's own `activeItems[]`, which is a **manifest v4** field — Object/Concern Model v1.1 §7 change 2.
`persist.ts:334` says so: *"Empty on every v3 export, in which case the audit computes the set."*
**The audit computes it in memory and does not write it**, so the table is v4-or-nothing.

### The 24 downstream tables, and what writes each

| table | written by | reached how |
|---|---|---|
| `ai_jobs`, `ai_generations` | `ai/queue.ts`, `ai/worker.ts`, `ai/accept.ts` | assists button, or any pass CLI |
| `readings`, `reading_fields` | `ai/tasks/readSurfaces.ts` | **CLI only** — `npm run read` |
| `product_resolutions` | `ai/tasks/resolveProduct.ts` | **CLI only** — `npm run resolve` |
| `objects`, `object_media` | `ai/tasks/identify.ts`, `matchComplete.ts` | **CLI only** — `npm run identify` / `match` |
| `object_decisions`, `object_provenance` | `engine/confirm.ts` | ⛑ **nothing reaches it** — §5 |
| `resolution_sources` | `engine/sources.ts` | `npm run sources` |
| `overlays` | `overlay/store.ts` | overlay routes (screen) |
| `passes`, `pass_zone_opens`, `pass_events` | `pass/store.ts` | pass routes (screen) |
| `desk_media` | `pass/memory.ts` | memory routes (screen) |
| `audit_runs`, `audit_slots`, `audit_carried_items` | `audit/run.ts` | audit route (screen) |
| `report_row_edits`, `report_editions` | `report/draft.ts`, `report/render.ts` | report routes (screen) |
| `client_names` | `report/names.ts` | `POST /api/client-names` (screen) |
| `desk_work` | `desk/work.ts` | ⛑ route exists, **no client calls it** — §4 |
| `active_items` | `import/persist.ts` | v4 manifests only |
| **`object_states`** | ⛑ **nothing, anywhere** | — |

⚑ **`object_states` is created by migration 023 and no production code names it.** Not a writer, not
a reader. The only file in the repository that mentions it is `server/test/operating-state.test.ts`.
**And `engine/operatingState.ts`, the module that exists for it, does not touch the table and is
itself unreachable** — it is one of the ten in §5. *Operating state is Baseline Service Design
§4.1c-i's fourth attested field; it has a table, a vocabulary module and a test, and no path.*

---

## 4 · What is reachable

**45 route registrations, 41 distinct paths.** `web/src/api.ts` names 26 of them; three more are
built inline elsewhere in `web/src` (`session-plan`, `house-style` is not one of them).

⛑ **Eight paths have no caller in the web app**, verified by grepping every URL literal in `web/src`:

| path | note |
|---|---|
| `/api/health` | infrastructure |
| `/api/operators`, `/api/operators/:id/deactivate` | ⚑ covered by `npm run operator` — not a gap |
| `/api/house-style/rules` | `report/houseStyle.ts` is imported only by `index.ts` |
| `/api/properties/:id/item-series` | ⚑ **confirmed again** — audit finding 2 of the twelve |
| `/api/properties/:id/desk-work`, `.../desk-work/start`, `/api/desk-work/:spanId/stop` | `desk/work.ts` is imported only by `index.ts` |
| `/api/visits/:id/summary` | — |

**Six web views exist:** properties, one property, an import report, the pass, the audit, the gap
report. **There is no screen for readings, product resolutions, objects, sources, the review queue,
the binder draft, or the session plan** — the last is a download link on the property page.

**18 npm entry points:** `dev` · `start` · `operator` · `golden` · `golden:approve` ·
`golden:standing` · `identify` · `preflight` · `smoke` · `compare` · `proposals` · `score` · `read` ·
`resolve` · `match` · `passes` · `binder` · `plan-fixture` · `sources`.

---

## 5 · Built but uncalled — ten modules

*Measured by walking the `import` graph from all 18 entry points. **96 modules under `server/src`;
86 reachable; 10 not.** Every one of the ten has a test.*

| module | what it is |
|---|---|
| `engine/plan.ts` | reads an import into the assembly's inputs — the only DB-touching half of the send side |
| `engine/assembly.ts` | ⚑ **what an identification call would contain, worked out without making one** |
| `engine/runRecord.ts` | what a run sent, what came back, what it cost, per zone |
| `engine/confirm.ts` | ⚑ **the confirmation surface — Increment 5 §6.** The only writer of `object_decisions` and `object_provenance` |
| `engine/completeness.ts` | whether a property is complete enough for the property pass to run |
| `engine/operatingState.ts` | §4.1c-i's fourth attested field |
| `engine/reviewQueue.ts` | ⚑ **the frame review queue** — §8 binder item 6 |
| `audit/provenance.ts` | §1g.1 — unverifiable provenance surviving aggregation |
| `report/renderGate.ts` | the render gate for slots outside the honesty vocabulary |
| `ai/golden-routing.ts` | the golden set for loose-photo routing |

⛑ **Three of these are load-bearing for desk pass one as §5 of the service design describes it.**
`engine/confirm.ts` is the *confirm* stage's writer. `engine/plan.ts` and `engine/assembly.ts` are
what would let a person see a call's cost before paying for it. **None has a route, a script or a
screen.**

*A caveat on the method: this is module-level reachability through static `import` statements. It
proves nothing is wired; it does not prove the code is wrong or unwanted. Every one of the ten was
built deliberately and every one is tested.*

---

## 6 · The four places the chain does not connect

Stated as gaps rather than as defects — each is a decision nobody has made yet, not a thing that broke.

1. ⛑ **Passes 1–3 are terminal-only.** The screen can queue nameplate classification, photo routing
   and pin types. It cannot queue read, resolve or match. So the desk pass a person can *do* on a
   screen and the desk pass the documents describe are different passes.
2. ⛑ **Confirm has no surface.** Objects are written by the identify and match passes; the module
   that turns a proposal into a confirmed object with its provenance is unreachable.
3. ⛑ **Nothing computes what a run will cost before it runs.** `engine/plan.ts` and
   `engine/assembly.ts` exist to answer exactly that and are not wired to anything.
4. ⛑ **The import writes no `readings`, no `objects`, no `product_resolutions`.** A manifest landing
   produces a faithful record of *what the field said* and nothing about *what any of it is.* Every
   step from evidence to identity is a separate, manual invocation.

---

## 7 · What this report does not cover

- **`web/src` internals.** Reachability of routes was measured; component-level dead code was not.
- **Whether the ten unreachable modules are correct.** They are tested; I did not re-derive them.
- **The desk pass as a design.** This says what exists. What *should* happen at desk pass one is the
  design session's, and Baseline Service Design §5 and §5a are the documents that own it.
