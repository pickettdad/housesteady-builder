# Binder Builder — Design v1.1 Amendment

**Date:** 2026-07-26
**Amends:** `HouseSteady_Binder-Builder_Design_v1_2026-07-24.md`. Everything not listed here stands unchanged.
**Cause:** ratification of `HouseSteady_Object-Concern-Model_v1_2026-07-25.md`, which binds both apps and corrects an identity assumption running through the original design.

---

## A. Corrections to Design v1

**A1 · §5 and §8 are wrong about the join key.** Design v1 states "pin number is the cross-visit join key." It is not. Pin numbers are **session-scoped**: the counter lives on the session row and restarts at 1 every visit. **Cross-visit identity is the field-minted uuid, which this repo adopts as canonical** — no mapping layer, no reconciliation. Read every occurrence of "pin number is the join key" as "the uuid is the identity; the number is a display label."

**A2 · The builder gains an entity it did not have: the concern.** Design v1 modelled findings and gaps as derived views over checklist state. The ratified model adds **concerns** as first-class, persistent things with their own identity and lifecycle — and assigns ownership of that lifecycle to **this repo**. Field owns observations; the builder owns the record. A concern never auto-closes from field data; resolution is always the builder's, always with a reason.

This is genuine new scope, and it is the payload of two things the original design treated as downstream: the session plan and the client dashboard.

**A3 · Four streams, not three.** Gaps · Findings · Triggered flags · **Concerns**. Gaps never become concerns — a missing photo is not a problem with the house.

**A4 · "Concern," never "issue,"** in schema and in client-facing copy alike.

## B. The ladder, revised

| # | Increment | Change |
|---|---|---|
| 1 | Import | unchanged |
| 2 | Triage | unchanged |
| 3 | Binder Schema + audit | unchanged |
| 4 | **Carried items** — gap report **and first session plan** | **retargeted, see B1** |
| 5 | **Concern register + dashboard** | **new; gated on manifest v4** |
| 6 | Workbench + first sections + editions | was 5 |

**B1 · Increment 4 retargets from "gap report" to "carried items."** The session plan carries gaps, open concerns, monitors due, comparison positions, and **prior whole-unit photos** (see B3). The gap report is a client-facing view of the first of those. Same underlying data, two outputs — so Increment 4 should produce **both the client-facing gap report and a machine-readable session plan v0**, at close to no extra cost. v0.5's finish line is unchanged in substance; what ships is strictly more useful.

**Why this matters now:** the field session has raised the session-plan import's priority materially, because it is the cross-visit identity mechanism rather than a convenience. **This repo emits what that import consumes.** Building the first session plan at Increment 4 rather than Increment 6 removes a dependency the field team would otherwise be waiting on. The two halves should be agreed in shape before either is finalised.

**B2 · Increment 5 is the concern register**, and it is **gated on manifest v4** — there are no concerns to adopt until the field app emits them. It carries: adoption of field-minted concern uuids, lifecycle state and resolution reasons, the §18 project register linkage (coordination, quotes, trades, verification), and the dashboard.


**B3 · Whole-unit photos (`.unit`) are the object-level comparison position.** The field app now treats them as a distinct item class. They are what makes *"here is your water heater, and here is what it looked like last year"* a real binder page rather than an aspiration — but only if visit two is framed like visit one. Nothing in the field app can enforce that unaided; at hour three the concierge will not recall the angle.

**Therefore the session plan must carry the prior unit photo back into the visit**, displayed beside the capture prompt. This is a concrete payload item, not a nicety: without it the archive accumulates the same object photographed from a different angle every month and no comparison is possible.

Two further consequences: the systems inventory can select a hero image per object **programmatically**, with no human choosing one, because `.unit` items are findable by class. And an object now carries **two distinct canonical photos** — the unit shot (condition over time) and the nameplate shot (identity and age evidence, per Manifest Contract §7b). Different jobs; never conflated in the schema.

**Honesty line for change detection** (carried to the AI Assist Plan): comparing two unit photos and reporting *"these differ in this region"* is observation. Reporting *"the unit has deteriorated"* is assessment and belongs to a specialist. This is the feature most likely to blur that line.

## C. Sequencing and risk

**C1 · Increments 1–4 proceed against v3 without stalling.** The ratified model lands nothing before the field app's five-zone test, so v4 is weeks out at minimum. There is no reason to wait.

**C2 · But v3 is a proving exercise, not production.** One real v3 export exists and it is archived. The v3 path's job is to make the contract executable and flush out mismatches early. The production path begins at v4.

**C3 · Therefore: one thin versioned adapter per manifest version.** Everything downstream — audit engine, gap report, schema work, workbench — reads this repo's own tables and must not know which manifest version produced its data. v4 becomes a new adapter module rather than a rewrite. **This is the architectural instruction that makes C1 and C2 compatible**, and it should be in place before Increment 3 builds anything on top of the import.

**C4 · Retirement reasons are consumed by the binder, not by the importer.** `misplaced` / `duplicate` → retained in the record, excluded from the binder. `removed` / `replaced` → included as house history. The importer stores the reason; the binder decides inclusion.

**C5 · The `issues` layer predicate breaks silently.** The field config's layer definition selects on `flag = issue`; when concerns become entities that predicate empties with no error. The field master fixes it in the same pass — but the builder derives layer views from the config snapshot, so **layer derivation must handle concerns as entities, not as a flag**, from v4 onward.

**C6 · Recursive canvas is deferred, not dropped.** Canvas ownership stays zone-only for now. The builder should not build for object-owned canvases yet, but should avoid hard-coding zone ownership in a way that makes the change expensive later.

## D. Dashboard constraints (carried into Increment 5)

- **Count only what is yours.** Identified is yours. Coordinated is yours. *Fixed* is the trade's. "34 concerns identified, 28 resolved through coordinated trades" is true and still impressive.
- **Watch the incentive.** A metric counting concerns found rewards finding more.
- **A well-maintained house is a success.** After three years of good stewardship the numbers should *fall* — so at least one headline metric must grow with time rather than with problems: visits completed, months of continuous documentation, systems under active watch.

---

**Status:** v1.1 amendment, ratified changes only. Design v1 stands except where corrected above.
