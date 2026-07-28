# Binder Schema — Reconciliation against Checklist Master v1.6.2

**Date:** 2026-07-27
**What this is:** the result of reading the real Checklist Master rather than the manifest's embedded snapshot. Closes Open Items **B1** and **B2**; corrects both schema files.
**Updated 2026-07-27 to v1.6.2**, which landed after four revisions driven by this reconciliation. Everything below reflects v1.6.2.

**Verdict:** the design holds. **Two things I had invented turned out to already exist in better form**, and one vocabulary I made up was 26 flags too large.

---


## 0. What v1.6.2 changed, and the count settled

**The zone-dependency defect is fixed, and the field session called it the largest since G1.** The `utl.*` mechanical items lived in the `utility` zone list, so a house with its mechanicals in an open basement corner — most of the regional stock — produced an **empty shutoff map** if the concierge created a `basement` zone. And they would, because "utility room" implies a room.

Fixed two ways: **`mechanical-base`**, a base list carrying every mechanical item, inherited by all 13 zone types and gated on **`zone.has_mechanicals`**; plus **`ses.shutoff-map`**, a session item asserting §1 completeness house-wide regardless of zone naming. **Zone type is now a labelling convenience and the attribute drives content** — the more honest model regardless.

**All ids carried, and it is verifiable rather than asserted:** base 33 → 57, zone 76 → 52. **109 both sides.** "Moved, not duplicated" is true, and §1's binding by item id is untouched.

**The count discrepancy was mine.** Re-parsed with a corrected regex, v1.5.1 gives **377 rows, 377 unique ids** — exactly the field session's number. My earlier 345 dropped rows carrying a trailing scope or trigger column. v1.6.2 is **384**, no duplicate ids in either. **Settled; §9.8 can close.**

## 1. The biggest finding — the checklist already declares the binding

**36 items carry `satisfy: pin <type>`.** `utl.main-shutoff` reads *"Main water shutoff pinned, photographed wide, tagged"* and is satisfied by `pin water-main`. That is exactly the §1 `main-water` coverage entry, declared in the field master, with its own id, already enforcing the wide photo.

My `bindsTo` map was reinventing it. **A §1 item now binds by `pinnedBy` — the field item id that requires the pin — plus `viaItems`, the component items carrying the shutoff detail.**

**This is the fourth instance of the same lesson**, and at this point it is a rule rather than a coincidence:

| # | The rule I was about to build | Where it already lived |
|---|---|---|
| 1 | Which N/A reasons become gaps | `naReasons.feedsGapList` |
| 2 | The locating-photo requirement | `wm.wide`, `gs.wide`, `ft.wide`, `pnl.wide` |
| 3 | The unit-photo requirement | 23 `.unit` items |
| 4 | **Which component satisfies which §1 entry** | **36 `satisfy: pin` items** |

**Before building a check, look for whether the config already declares it.** The field master owns §1's coverage, and §1 is now its standing acceptance test — so re-deriving it in the builder would create a second authority that drifts.

## 2. The trigger vocabulary was three namespaces, not one

**Table A carries 14 property flags.** My schema declared **40**. I invented 26.

But §3 explains where they belong: the closed vocabulary is **`property.*`** (Table A) · **`zone.*`** (Table B) · **`pin.*`** — *presence of a pin type in the zone.*

**The distinction is real and worth keeping.** `property.*` is what the intake form tells you **before you arrive**. `pin.*` is what you **found**. A sump is not an intake fact; it is something you discover. So `property.sump` was wrong twice over — wrong namespace and a flag that doesn't exist.

**Remapped to `house.*`, both files** — the field session added the namespace in v1.6 precisely because a maintenance schedule asks whether the *house* has a sump while a zone checklist asks whether *this room* does. Neither is a superset of the other.

**Earlier remapping, now corrected to `house.*`:** `property.sump` → `pin.sump-pump` · `property.forced_air` → `pin.furnace` · `property.central_ac` → `pin.heat-pump` (`heat-pump` serves AC condensers) · `property.water_treatment` → `pin.water-treatment` · `property.mature_trees` → `pin.tree` · `property.natural_gas` → `property.gas` · and fifteen more.

**Eight had no home anywhere. Resolved in v1.6:** `seasonal_vacancy` and `secondary_suite` are now Table A flags — **both had been asked on the intake form for weeks with no flag to receive the answer**, which is a failure mode worth sweeping the form for. `flat_roof` was added but nothing can set it yet. `dehumidifier`, `humidifier` and `leak sensors` become `house.*`. `elevated radon` and `higher-risk lateral` are `answer.*` and therefore the builder's.

*(Superseded paragraph:)* Eight had no home anywhere and their conditions were removed, so those items now apply universally with a note saying why: dehumidifier · humidifier · leak sensors · flat roof · elevated radon · higher-risk lateral · seasonal vacancy · secondary suite. **Several are real service considerations** — a secondary suite changes alarm and egress requirements, seasonal vacancy drives §16 — so they are candidates for Table A rather than mistakes on my part. Routed to the field session as **B4**.

## 3. Component inheritance — binding is a graph walk

Declared exactly as described: `` ### `child` — inherits `parent` ``, the child's list being the parent's items followed by its own, ids globally unique. **11 relations** — four water-treatment sub-types, seven appliance sub-types.

**A binding target matches a type OR any descendant.** A `water-softener` pin satisfies a `water-treatment` expectation. Flat string equality would report every softener as an unmatched gap. The graph is now in the schema and belongs in the shared evaluator beside the trigger logic.

## 4. Counts, verified rather than reported

| | v1.5.1 |
|---|---|
| Component types | **58** *(field reported 73 — the difference is likely base and zone lists, worth confirming)* |
| Inheritance relations | 11 |
| Item rows parsed | 345 *(field reported 427 — same discrepancy)* |
| `satisfy: pin` items | 36 |
| **`.unit` items** | **23** *(field reported 14 — more than reported, which is good)* |
| `measure` items | 11 — units `in`, `psi`, `%RH`, `year`, `mm` |
| Property flags | 14 |
| Zone attributes | 5 *(2 reserved, not yet consumed)* |
| N/A reasons | 4 |
| Layers | 8 *(`plumbing-fixtures` is new)* |

**`fc.width` — measure (mm)** — is the foundation-crack width. That is the Master Spec §10 specificity example made literal: *"1.5 mm at its widest, re-measured every April and October."* The measurement path the whole longitudinal design rests on **exists and has never fired in any export.**

## 5. Two things in the master that bind the builder

**The id lifecycle rule (§2, v1.4.1) governs our cross-visit joins.** *"An item that moves keeps its id; an item that is redefined retires, and the replacement takes a new id. A retired id is never reissued."* The reason given is exactly the builder's problem: *"a resolution recorded against a retired id becoming attached to a differently-meaning item is false continuity, and a stale test result silently vouching for something nobody checked is worse than an honest orphan."*

**So the builder must not treat an unrecognized item id as merely unknown.** It may be a *retired* id, which means the question changed, which means the cross-visit series for that item ends there rather than continuing. **Report it as a discontinuity, not a gap.** Added to Increment 3.

**Two layers are scheduled to break, with no error.** `issues` and `monitor` read a pin flag the Object/Concern model retires. The master says plainly they must be rewritten in the same pass that lands the concern entity — `issues` becomes *entity = concern*, `monitor` becomes *concern severity = monitor*. **The builder derives layer views from the config snapshot, so our layer derivation breaks in the same silent way.** Already tracked; now confirmed from the source.

## 6. What is still owed

- **B4** — eight conditions with no flag. Some are real service considerations and want Table A entries.
- The 58-vs-73 and 345-vs-427 count discrepancies — probably parsing, worth confirming.
- §7 `expectedComponents` sets still need review against how the field app actually creates pins for a well or a septic system.
- **A fresh export** carrying this config — still the only way to exercise `measure` and an exterior zone.

---

**Status:** B1 and B2 closed. Both schema files rewritten. B4 opened.


---

## 7. Two things worth carrying into the builder's own validator

**A consistency check cannot catch a transformation applied uniformly.** The field session found a generator change had silently corrupted three attribute ids in main — undetected because the corruption was applied identically to the ids *and* to every reference to them. Everything agreed with everything else and everything was wrong. **Our schema loader should validate against the master's declared vocabulary rather than only checking internal consistency**, for exactly this reason.

**Every structural fact has exactly one parsed home, and prose never substitutes for it.** Four consecutive field revisions shipped the same defect class — prose asserting something the machine-read tables did not say. **Where a fact lives only in a sentence, that is a missing declaration site.** Our schema files have the same exposure: several rules currently live in a `note` string rather than in a field an evaluator reads. Worth an audit before Increment 3 builds.
