# Binder Builder — Increment 3 Build Spec: The Audit Engine

**Date:** 2026-07-27
**Read first:** `CLAUDE.md` · `/docs/HouseSteady_Binder-Schema_v1-1_2026-07-27.md` (the design — slot kinds, source→label mapping, the four resolved conflicts) · `/docs/HouseSteady_Binder_Baseline-Profile-and-Effort-Map_v1_2026-07-27.md` (why the profile exists).
**Ships with this spec:** `/schema/binder-schema-v1.json` and `/schema/profiles/baseline-v1.json`.

**Scope:** load the schema and profile, evaluate which slots apply to this property, bind evidence deterministically, compare against the builder's own tables, emit completeness and a gap list. **No rendering, no editing, and no AI — see §1a for why, which corrects the AI Assist Plan.** The output is data that Increment 4's gap report and the workbench's status pips both read.

---

## 0. Non-negotiables

1. **The schema and profile are config, not code.** Versioned and content-hashed exactly like the field checklist config. **Every audit result records which schema version and which profile produced it** — a gap report from March must stay explicable in September.
2. **The profile is read, never inferred.** If a slot is not classified, that is a schema error and it is reported loudly, not guessed at.
3. **Honesty labels are assigned at ingest from the source, never at render.** The mapping is in the schema. **A label can never be upgraded by a later step** — acceptance means a human agreed with the sentence, not that the fact changed origin.
4. **`narrative` slots never produce a gap.** Ever. Regardless of profile. §8 can never be complete because a house always has one more quirk, and software that reports it 80% done is lying.
5. **`derived` slots never report independently.** They are complete when their inputs are.

## 1. The trigger evaluator — build it once, shared

**This is the piece with the longest reach in the whole product.** It answers *"does X apply to this house"* and it has two consumers:

- **This increment:** does this binder slot apply (`appliesWhen` on coverage items, `expectationSource` on record-sets).
- **The maintenance schedule** (`/schema/maintenance-schedule-v1.json`, not yet written): does this maintenance item apply. Master Spec §15's eighteen property triggers.

**Same inputs, same grammar, same eighteen conditions.** Build it as a standalone module with no knowledge of binders or schedules, or it gets built twice and the two drift.

**Inputs to the fact set:** the session's `flags[]` · the config snapshot's `propertyFlags` · the intake form's services block (water source, sewage, heat, fuel, electrical, generator, sump, pool). Where the manifest and intake disagree — intake says well, no wellhead pin exists — **that disagreement is a gap and a good one.** Record both sides; never silently pick.

**Grammar:** `always` · a flag id · `any(...)` · `all(...)` · `not(...)`. Nothing more. Unknown flag ids **fail open** — the item applies and is reported as *applicability uncertain*, because wrongly excluding a shutoff is worse than wrongly asking about one.


## 1a. Binding, and why there is no AI here (corrects the AI Assist Plan)

The AI Assist Plan places two tasks at Increment 3: evidence-to-slot binding proposals, and freeform-vocabulary clustering. **Both are moved, and this section supersedes that row.**

**Binding is deterministic, and it is a design failure if it isn't.** The schema knows §1's `main-water` item is satisfied by a pin whose component type is a main water shutoff carrying the shutoffs layer predicate. That is a lookup, not a judgement. The field config's canonical component types and layer definitions exist precisely so binding does not require inference. **Build the lookup; do not reach for a model to do a join.**

AI is only needed for the residue — freeform pin types, ambiguous cases, evidence matching nothing.

**The size of that residue is diagnostic, and an AI assist would hide it.** If a real visit leaves 5% of evidence unmatched, manual binding is trivial and an assist is over-engineering. If it leaves 40%, that is not a case for AI — it is a signal the schema's source mappings are wrong, and an assist would paper over the defect and make it permanent.

**So the unmatched rate is a first-class output of this increment, not a debug figure.** Report per visit:

- evidence bound deterministically, by slot
- **evidence matching no slot**, listed individually with its type and label
- **slots with no candidate evidence at all**, distinguished from slots whose evidence failed a requirement — *"nothing was captured for this"* and *"something was captured but it lacks a locating photo"* are different problems with different fixes

Decide on the AI binding assist once that number exists from a real visit. **Freeform-vocabulary clustering moves to 2b** — it never needed the schema, reads pin types straight from imports, and uses the same cheap batch machinery already being built there.


## 1b. Component inheritance — binding is a graph walk, not string equality (added 2026-07-27)

**The field master moved to v1.5.1 while this was being specced: 48 component types became 73, 266 checklist items became 427, and component types can now inherit another type's items.** Eleven sub-types use inheritance today.

**This breaks flat binding.** If `water-softener` inherits from `water-treatment`, then a §7 expectation for `water-treatment` must be satisfied by a `water-softener` pin — and string equality would report it unmatched. Every softener in every visit would appear as a gap that isn't one.

- **A binding target matches a component type OR any of its descendants.** Build the type graph from the config snapshot's inheritance declarations and walk it. Nothing new is needed from outside — the snapshot already carries the definitions.
- **The graph lives in the shared evaluator**, beside the trigger logic. Both answer *does this thing satisfy that expectation*, and both must move together when the field vocabulary changes.
- **Confirmed 2026-07-27 against Checklist Master v1.6.2.** Declared as `` ### `child` — inherits `parent` ``; the child's rendered list is the parent's items followed by its own; ids stay globally unique. 11 relations. The graph is in `binder-schema-v1.json` under `componentInheritance`.

**Aliases are field-app-only and the builder must never bind to one.** v1.5 added a component-alias table — 56 search synonyms that resolve to a canonical type. They **never appear in the manifest and never carry items.** They exist so a concierge typing "air conditioner" finds `heat-pump`. **If an alias ever reaches a binding rule, that is a bug**, not a fallback.

## 1c. `.unit` items — bind, do not re-implement (added 2026-07-27)

v1.4 and v1.5 added **14 `.unit` whole-object photo items** — `fur.unit`, `wh.unit`, `sp.unit` and others. The schema's §7 requirement that every component record carry a unit photo is **already a field checklist item.**

**23 `.unit` items exist as of v1.5.1.** **Bind to them rather than checking the photo independently.** Same as `wm.wide` for §1's locating photo, and same as `naReasons.feedsGapList` for the gap list. **This is the third instance of the same lesson: before building a check, look for whether the config already declares it.** Where a component type has no `.unit` item, that is a field-config gap and gets reported as one — never something for the builder to police.


## 1d. Retired item ids are a discontinuity, not a gap (added 2026-07-27)

Checklist Master §2 (v1.4.1): *an item that **moves** keeps its id; an item that is **redefined** retires, and the replacement takes a new id. A retired id is never reissued.* The master's stated reason is the builder's problem exactly — *"a resolution recorded against a retired id becoming attached to a differently-meaning item is false continuity, and a stale test result silently vouching for something nobody checked is worse than an honest orphan."*

**So an unrecognized item id must not be treated as merely unknown.** It may be retired, which means the question changed, which means **the cross-visit series for that item ends there rather than continuing.**

- Report it as a **discontinuity**, distinct from both a gap and unrecognized vocabulary.
- **Never carry a prior visit's answer forward across a retirement**, and never show the series as unbroken.
- Fail open as always — import it, count it, display it — but do not silently join it to anything.


## 1e. Two evaluator requirements from v1.6.2 (added 2026-07-27)

**1e.1 · Compose the list gate with the item trigger.** A list heading may carry `— gated on <ref>`, conditioning every item in it. Where an item *also* has a trigger cell, the effective condition is **`allOf(list gate, item trigger)`** — the cell's own `|` remains `anyOf` internally. `mechanical-base` is gated on `zone.has_mechanicals`, and its Fuel items additionally carry `property.gas|propane`. **Evaluate the gate alone and every fuel item fires in every zone of every house.**

**1e.2 · Four trigger namespaces, and `pin` is not a weaker `house`.**
- `property.*` — Table A, **17 flags** as of v1.6, declared at intake before the visit
- `zone.*` — Table B, an attribute of this zone
- `pin.*` — a pin of this type **in this zone**. Zone-scoped strictly; the field validator rejects it at session scope
- `house.*` — a pin of this type **anywhere in this visit**

**Neither is a superset of the other.** The zone form silently under-fires a house question; the house form over-fires a zone one. Every maintenance-schedule condition is `house.*`. **`house.*` also changes during a visit** as pins are created — stable at manifest time, which is all the builder sees, but worth knowing when reading an event log.

## 1f. `answer.*` conditions are the builder's, permanently (added 2026-07-27)

The field master places conditions on a *recorded value* deliberately outside its config: **the field app can never evaluate half the inputs.** A radon result arrives three months later; a permit date comes from a document.

**So the builder owns the whole class.** It holds every answer — field, lab, document — evaluates the condition, and emits the resulting item as a **carried item in the session plan**. No new field machinery, and it uses the round trip that already exists for exactly this.

Form: `answer.<itemId> <op> <value>`. Two live cases: `answer.utl.drain-material-id in (clay, orangeburg)` drives Master Spec §13's sewer-camera trigger, and `answer.fc.width > 5` escalates a crack under §10's specificity rule.

**The consequence to hold onto: the master's `choice` option values are now this repo's condition vocabulary.** Renaming or removing an option is a **breaking change here**, not a content edit. Recorded in master §9.

This also delivers what the Master Spec calls *"customized, never blind"* — the schedule is re-derived every visit rather than fixed at intake, so a crack that was 1.5 mm and is now 4 mm changes what the next visit carries.

## 2. Completeness, per slot kind

| Kind | Rule |
|---|---|
| `fixed` | Present, **or** explicitly `unknown`. A blank is incomplete; an explicit unknown is complete and is information. |
| `coverage` | Every **applicable** item has a state: `present` / `confirmed-absent` / `not-found`. `present` items must satisfy `itemRequires`. |
| `record-set` | Every entity in the expectation set has a record, and each record satisfies its required fields. |
| `derived` | Inputs complete. Never independently missing. |
| `narrative` | `empty` or `started` with a count. **Never complete, never a gap.** |

**Two rules that are easy to miss and are tested:**

- **§1's locating-photo rule.** A shutoff item marked `present` with only a close-up of a valve **fails the slot**. The Master Spec is explicit: the photo must be wide enough to locate the item in the room.
- **§10's specificity rule is a completeness rule, not style advice.** A concern carrying a watch schedule must have a measurement, a cadence, and a named escalation trigger. **A concern that says only "watch this" fails the slot.** This is the identification/assessment line made mechanically checkable.

## 3. Output

An `audit_runs` record plus per-slot results. Computed fresh on demand and stored, so a rendered gap report is reproducible.

- `audit_runs` — id, property_id, visit_id, schema_version, schema_hash, profile_id, profile_version, run_at, trigger_facts (JSON — the resolved fact set, so a result is explicable later)
- `audit_slots` — audit_run_id, section_id, slot_id, applicable (0/1), kind, state (`complete` / `partial` / `empty` / `not-applicable` / `n-a-narrative`), required (0/1), missing (JSON — what specifically is short), detail (JSON)

**Per-section rollup is derived from slots, not stored separately.** One state, many views — a missing slot is a dashed card in the workbench, a pip in the table of contents, and a row in the gap report, all reading this.

**Binding report** accompanies every run — bound / unmatched-evidence / no-candidate-evidence, per §1a. It is the measurement that decides whether an AI binding assist is warranted.

**Gap list** = required slots that are applicable and not complete, each naming *what specifically* is short. *"§1 shutoff map — 3 of 19 applicable items have no state: main electrical disconnect, panel directory, sump breaker"* — never *"§1 incomplete."*

## 4. Screen

One read-only page per visit, deliberately plain. This is not the gap report — that is Increment 4, client-facing, branded.

- Header: schema version, profile, run time, and the resolved trigger facts (**collapsible, but present** — "why is this house being asked about a sump" must always be answerable).
- Section list with state and counts. Not-applicable sections shown greyed with their reason, never hidden — a silently absent section is indistinguishable from one nobody thought of.
- Slot detail on expand, naming what is short.
- A re-run control.
- **The binding report** — unmatched evidence listed individually, and slots with no candidate distinguished from slots whose candidate fell short.

## 5. Out of scope

The gap report render · any editing · **any AI, deliberately (§1a)** · session plan emission · the maintenance schedule content (`maintenance-schedule-v1.json` is a separate content pass; **only its evaluator is built here**) · concern lifecycle (Increment 5, gated on v4).

## 6. Tests

Behaviour: the reference visit audits without error and its gap list is inspectable · a `narrative` slot never appears in the gap list under any profile · a `derived` slot never reports independently · a house on municipal water is never asked for a well cap · an unknown flag id fails open and is reported as uncertain · an explicit `unknown` completes a `fixed` slot while a blank does not · a shutoff with only a close-up fails · a watch-schedule concern without a measurement, cadence, or escalation trigger fails · the same visit audited twice with the same schema and profile produces identical results.

Binding: a list gate composes with an item trigger as `allOf` · a `house.*` condition is not satisfied by a `pin.*` evaluation or vice versa · a sub-type satisfies its parent's expectation (a `water-softener` pin satisfies a `water-treatment` expectation) · an alias never binds · a `.unit` item satisfies the unit-photo requirement rather than a separate photo check · a retired item id reports as a discontinuity and never joins across visits · an item whose canonical component type is present binds without inference · unmatched evidence is listed individually, never only counted · a slot with no candidate is distinguished from one whose candidate failed a requirement.

Cross-check on load: **every slot in the schema is classified by the profile.** Unclassified is a loud error, not a default. *(Both shipped files currently pass: 41 slots, 41 classified.)*

Doctrine scans: no hardcoded section, slot, or trigger id anywhere outside the schema loader · no path assigns an honesty label at render · the trigger evaluator imports nothing binder-specific.

## 7. Done means

`npm run dev` → open an imported visit → run the audit → per-section states with counts, the gap list naming specifics, the resolved trigger facts visible, and the schema and profile versions recorded on the run. Swap in a modified profile and the results change with no code edit. Tests green.

---

**Reconciliation done 2026-07-27** against Checklist Master v1.5.1 — see the Reconciliation report. Both schema files rewritten: §1 binds to the field's own item ids, the trigger vocabulary is corrected to three namespaces, the inheritance graph is in place.

**Still wanted, not blocking:** a fresh export carrying this config — the only way to exercise the `measure` path and an exterior zone, neither of which any export has done.

**Status:** ready for Claude Code once 2b lands and the re-reconciliation is done. Increment 4 (carried items — gap report and session plan v0) reads this output.
