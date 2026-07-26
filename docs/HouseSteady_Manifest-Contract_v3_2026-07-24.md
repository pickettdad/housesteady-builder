# HouseSteady — Manifest Contract v3 (carried copy)

**Date extracted:** 2026-07-24
**What this file is:** the interface contract between HouseSteady Field (capture) and the binder builder (assembly) — export manifest one way, session plan the other. Extracted verbatim from PLAN-STAGE-1 §7, §7a, §7b (the Field app build session).
**Source of truth:** PLAN-STAGE-1 §7 remains authoritative until David ratifies promotion of this file to standalone contract status (see Launch Brief, Governance). If this file and PLAN-STAGE-1 disagree, PLAN-STAGE-1 wins.
**Change control:** neither session edits the contract unilaterally. Change requests route through David to the owning session; a new version of this file is cut only when the source changes.

---

## 7. Manifest v3 (the binder-builder contract)

MANIFEST_SCHEMA_VERSION = 3. Keeps the self-contained doctrine: full config snapshot + verbatim event log + per-media sha256. Top level:

session (+ lifecycle[]: {type: completed|reopened, at, reason?} — the full
         complete/reopen history, so re-work is auditable, owner req 2026-07-24) ·
config (checklist snapshot + hash — includes the layers definitions) ·
zones[]: {zoneId, type, label, level?, attributes, closedAt?, closeNote?,
          canvases[], audit: {items: [{itemId, tier, attest, status:
          satisfied|na|unresolved, via?, evidence?, naReason?}]}} ·
pins[]:  {pinId, number, zoneId?, type?, label?, flag?, anchors[], mediaIds[],
          noteIds[], chatThreadIds[]} ·
sessionAudit · inbox[] (unassigned at export — explicitly listed, never dropped) ·
notes[] · chats[]: {threadId, target, messages[] with per-message Source} ·
media[] (paths: `media/<zone-or-_misc>/pin-<number>/<mediaId>.<ext>`; canvas photos
under `media/<zone>/_canvas/`; zone-targeted media with no pin under
`media/<zone>/_zone/`) · totals · orphanEvents · events

**Vocabulary telemetry** (owner req 2026-07-24, manifest-only — no UI). The type field on each pin must make two things machine-identifiable so the component library can grow from real usage:

- Freeform types are flagged distinctly with their verbatim text (e.g. type: {kind: "freeform", label: "mystery box"} — do NOT collapse to a bare string). Aggregated across visits, recurring freeform labels are the signal a new component type is warranted.
- Nicknames (pin.label) export as their own field, never merged into the type. Repeated nicknames under one component type are the split signal — three "softener" nicknames under water-treatment means water-softener wants its own component list. This is the empirical input to the CHECKLIST-MASTER-REVIEW §8 sub-type request; the taxonomy is decided in the content pass, not invented here.

Zip grouping stays per-zone (+ one _misc/inbox zip); exportSession.ts needs only the grouping key and path fn swapped. Layer views need no separate manifest section because the manifest carries both the ingredients (pins with type/flag/anchors) and the definitions (the config snapshot's layers) — the binder builder derives the shutoffs map / issues index from those two, and the schema comment says so.

## 7a. The manifest is a ROUND TRIP, not a one-way export (owner, 2026-07-25)

Field → binder builder is the manifest above. Binder builder → field is a **session plan**: a per-property, per-visit list of carried items imported at session start and surfaced alongside the standard checklist:

- deferred / no-access gaps from prior visits, monitors due for re-measure, comparison positions due for re-shoot, owner-flagged follow-ups, equipment service verifications.

Contract — specify both sides in step 7 even though the import can't be built until the binder builder exists:

- **Session plan is SESSION DATA, never config.** Config stays versioned / content-hashed / byte-identical everywhere; the session plan is per-property and must never touch the generated config or its hash. It rides in as its own import artifact, folds into session state as (probably) session-scoped items + pre-seeded pin expectations, and is provenance-tagged system with its source binder id.
- **Why this is load-bearing, not a nicety:** it is the recurring-visit mechanism. A monthly visit = standard monthly-scope items + this house's open items. Without the import the app can only run generic visits — it can't know this house carried three deferred gaps and a monitor due for re-measure. Design the import shape now so step 7's manifest is the matching half of the contract.

## 7b. Equipment-registry guarantees (future third product: regional equipment analytics)

Cross-client regional equipment analytics is a future product; the manifest is its data source, so every equipment pin must carry, guaranteed:

- canonical component type where one exists (not just the freeform/nickname);
- verbatim nickname and freeform text (already in §7 telemetry);
- a nameplate photo reference (the mediaId of the nameplate shot);
- any age evidence — install date, serial — captured as structured fields, not buried in a note.

**Longitudinal identity:** permanent pin numbers already give a pin the same identity across visits — preserve that explicitly in the manifest (pin number is the join key a cross-visit/cross-client aggregator relies on).

---

**Status:** carried copy at v3, extracted 2026-07-24. Pairs with: Binder-Builder Launch Brief v1 · Binder-Builder Concept v1 · Baseline Inspection Process v1 (Phase 11) · Home Binder Master Spec v1.
