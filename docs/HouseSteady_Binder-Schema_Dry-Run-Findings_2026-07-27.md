# Binder Schema — Dry-Run Findings (2026-07-27)

**What this is:** the result of running Increment 3's audit logic by hand against the real v3 export and its embedded config, **before Code builds it.** Answers Open Item **F7** and corrects the schema.
**Data:** `housesteady-019f9a33-manifest.json` — 48 canonical component types, 47 component lists, 7 layer definitions.
**Verdict:** the design holds. **One structural assumption was wrong**, and correcting it made the schema both more accurate and less work. Six specific gaps found in the field config.

---

## 1. F7 is answered — the vocabulary was inside the manifest all along

The self-contained doctrine paid off: the config snapshot carries the full `componentLists`. No separate request was needed.

**48 canonical component types.** Of the 46 the schema proposed, **18 matched exactly** — and most of the rest were my naming being wrong rather than the type being absent (`water-shutoff-main` → `water-main`, `gas-meter` → `gas-shutoff`, `hrv` → `hrv-erv`, `well-pressure-system` → `well-pressure-tank`).

**Three of the field's types answer questions we had open:**

- **`comparison-position`** — the fixed camera points from Master Spec §10's longitudinal protocol. I had flagged this as "a third kind of persistent identity, neither object nor concern, needs defining." **It already exists**, and the `comparison` layer selects it alongside `foundation-crack`. Remove from the cross-app queue.
- **`foundation-crack`** — a crack is a pinnable component. That is the specificity rule's subject given an identity, which is what makes measuring it across visits possible.
- **`receptacle-gfci`** with its own layer — receptacle testing has first-class structure.

**Deliberately broader than I assumed, and correctly so:** `fuel-tank` covers propane and oil; `water-treatment` covers softener, UV, and sediment; `fireplace` covers wood, gas, and pellet. Splitting those is exactly the decision the contract's vocabulary telemetry is designed to make from real usage rather than up front.

## 2. The structural error — and it was mine, though narrower than first written

*(Corrected by the owner, 2026-07-27, the same day. The original wording of this section overstated the finding and is superseded by what follows.)*

**The model is mixed, and the split is sound.**

**Standalone shutoffs ARE their own component types and ARE pinned** — `water-main`, `gas-shutoff`, `fuel-tank`, `backwater-valve`, `hose-bib`, `floor-drain`, `cleanout`, `electrical-panel`. The `shutoffs` layer selects exactly those seven. The map is built from them, and that design is right.

**What I actually found is narrower: controls belonging to a specific appliance are captured as items on that appliance's pin.**

The idiom is unmistakable once seen — **"X located"**:

| Field item | What it captures |
|---|---|
| `fur.switch` | Furnace emergency switch located |
| `wm.curbstop` | Curb-stop location noted if known |
| `gen.transfer` | Transfer switch located |
| `wpt.breaker` | Pump breaker located |
| `fp.gas-valve` | Gas valve located |
| `wt.bypass` | Bypass located |

Every §1 item I had listed as *"no component type exists"* has a home. And the split between the two is principled:

**THE TEST — does this need its own position on the map?** If someone must walk somewhere else to reach it, it is a pin. If it is on or beside the component, an item on that component's pin locates it well enough. A furnace emergency switch is within arm's reach of the furnace; the furnace pin locates it.

**Corrected in the schema.** A §1 item binds to either a component pin directly, or to a **(componentType, viaItems)** pair.

### 2a. The test finds one that is genuinely misplaced

**`wm.curbstop` fails it.** *"Curb-stop location noted if known"* is an item on the `water-main` pin — so it inherits a basement position, while the curb stop is at the street. It also belongs on the **site plan**, not the interior floor plan.

Something the emergency sheet must show, captured somewhere it cannot be shown from. Logged as **G8**.

## 3. The best finding: a rule I invented already exists

The schema required a `locatingPhoto` on every `present` shutoff, from the Master Spec's *"wide enough to locate the item in the room, not a close-up of a valve."*

**The field config already enforces it as a checklist item:** `wm.wide`, `gs.wide`, `ft.wide` — *"photographed wide enough to locate"* — plus `pnl.wide` and `sl.photo` (*"with landmark for relocation"*).

**So the builder binds to those items instead of re-implementing the check.** Less code, one place the rule lives, and it stays correct when the field config changes. **Where a component has no such item, that is a field-config gap rather than something for the builder to police.**

This is the same lesson as the trigger evaluator: **before building a check, look for whether the config already declares it.** The `naReasons.feedsGapList` discovery was the first instance; this is the second. It is turning into a reliable pattern.

## 4. Six gaps in the field config — specific and actionable

Not builder problems. Each blocks a §1 item that a Baseline binder is expected to carry.

| # | Gap | Consequence |
|---|---|---|
| G1 | **`water-heater` has no shutoff item.** `wh.*` covers nameplate, age, TPR, fittings, venting, pan, ownership, anode. §1 requires *water heater shutoff — water and fuel/power*. | The emergency sheet cannot show how to isolate the water heater |
| G2 | **`solar-inverter` has no checklist items** — stub | §1 solar/battery disconnect unreachable |
| G3 | **`pool-equipment` has no checklist items** — stub | §1 pool/spa disconnect unreachable |
| G4 | **`irrigation-backflow` has no checklist items** — stub | §1 irrigation shutoff unreachable |
| G5 | **`septic-lid` covers the lid, not the alarm.** No alarm item exists. | §1 septic alarm unreachable — and it is an alarm, so it matters |
| **G8** | **`wm.curbstop` is misplaced.** Captured as an item on the interior `water-main` pin, so it inherits a basement position; the curb stop is at the street and belongs on the site plan. Needs its own pinnable identity or a site-plan capture path. | Emergency sheet cannot map it |
| G6 | **The locating-photo item is inconsistent.** Present as `.wide` on 4 components and `sl.photo` on septic-lid; **absent on furnace, water-heater, and sump-pump**, which §1 needs. | Those three cannot satisfy §1's locating requirement |

**G1 is the one to fix first.** *"How do I shut off the water heater"* is a question the emergency sheet exists to answer, and right now the capture does not ask.

## 5. The layer question — a change to the schema, not to the field app

The `shutoffs` layer selects only seven types: `water-main`, `gas-shutoff`, `fuel-tank`, `backwater-valve`, `electrical-panel`, `hose-bib`, `floor-drain`. Furnace, water heater, sump pump, boiler, and pool equipment are outside it.

**That is correct for the field app** — the layer is a view of things that are *primarily* shutoffs, and a furnace is not primarily a shutoff.

**But my binding rule required both the component type and the layer predicate.** That `AND` was my invention and it was wrong: it would have excluded the furnace emergency switch from the emergency sheet. **Binding is on the component type and its items; the layer stays a field-app view.** Corrected.

## 6. What still needs a pass

- **§7 `expectedComponents` is only partly reconciled.** Names now check against the real 48, but the *sets* — what `property.well` should expect — need a review against how the field app actually creates pins for a well.
- **A full item-level map** for the remaining §1 items: hose bibs, floor drains, cleanouts, backwater valve, boiler.
- **§12 alarms** binds to `smoke-alarm` and `co-alarm`; the field has no `combination-alarm`. Probably fine — confirm.
- **No `air-conditioner` type exists** in the 48. Either AC lives under `heat-pump` or `appliance`, or it is a genuine omission. Worth asking.

---

## What this exercise cost and returned

An hour of analysis, no code. It found a structural error that would have shaped Increment 3's entire binding layer, six specific field-config gaps, and one place where the builder was about to re-implement a rule the field app already enforces.

**Finding this during Increment 3 would have meant rewriting the binding layer. Finding it now means editing a JSON file.**

---

**Status:** F7 closed. Schema corrected. G1–G6 routed to the field session. Full item-level mapping still owed before Increment 3 builds.
