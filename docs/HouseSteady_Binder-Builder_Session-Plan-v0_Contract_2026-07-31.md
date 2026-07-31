# Session Plan v0 — the contract

**Date:** 2026-07-31 · revised three times the same day — the design session's four answers, Field Code's review of those, then Field Code's four findings and the `since` ruling
**Emitted by:** the binder builder, at `GET /api/properties/:id/session-plan`
**Consumed by:** nothing yet. `PLAN-STAGE-1` §7a and §7a-ii scope the field-side import in detail but it is not built.
**Status:** **specified and emitting.** Increment 4 §3 says to emit as though no receiver exists, and that is the correct sequencing — the import cannot be built until something emits an artifact to build against. **This document is the thing to review before the receiver is written**, and the field session should disagree with it here rather than after both halves exist.

---

## 1. What it is, and what it is not

**It is the return leg.** The manifest is the field's export; this is what goes back. §1 of the Object/Concern Model makes it structural rather than a convenience:

> Without it a five-year-old leak is minted fresh every visit and nothing lines up.

**It is session data, never config.** It never touches the generated config or its hash. A plan that modified the config would make the config a function of what the builder thinks, and that is backwards: the config is the field's declaration of *what a visit asks*, and the plan is *one visit's starting state*. A doctrine scan gives the emitter no write path into a config snapshot, and a test asserts no config key appears anywhere in the payload.

**Naming trap.** `src/engine/plan.ts` in the field repo exports `SessionPlan` and `compilePlan`. **That is the v1 slot-model plan compiler and is unrelated to this.** Nothing here binds to it or mirrors its shape, and a scan keeps the word `compilePlan` out of this module — two things with one name is how somebody eventually binds to the wrong one.

**It is a to-do list, not a diff.** There is deliberately no changelog between two plans. *Recorded, not specced:* if one is ever wanted, Design v1 §6's edition mechanism already does this for the binder and the pattern copies.

## 2. The failure it exists to prevent

> **Rewritten 2026-07-31 on Field Code's evidence.** The previous version of this section argued from three item-level gates in field config v1.2.1 and treated the count of defaulting zone types as the load-bearing fact. **The real evidence is stronger and differently shaped**, and footnoting it would have left the weaker argument as the one a reader takes away.

From Increment 4 §3a:

> A concierge ticks `has_mechanicals` on the basement during the baseline. Visit two replays the zone as identity only. The attribute arrives absent, falls through to a default — and twelve of thirteen zone types have no default. **The mechanical checklist is empty on visit two, and an empty checklist reads as already handled.**

### 2a · The strongest evidence is a list gate, not an item gate

Field Code, reading master v1.11: **seven surfaces where a zone attribute decides something**, and among them —

> **`base:mechanical-base` is gated on `zone.has_mechanicals`.**

That is a **list gate, not an item gate**, and the distinction is the whole argument:

| | What is lost when the attribute does not survive replay |
|---|---|
| **Item gate** | one question stops being asked |
| **List gate** | **the entire list stops being asked** |

So the spec's sentence is not a figure of speech. Lose `has_mechanicals` on replay and *the mechanical checklist is empty on visit two* is literally what happens — the base list never composes, no item under it is ever due, and the audit reports full coverage of a list that was never asked. **That is the named failure, reproduced exactly, from one boolean.**

*(This document cites Field Code's count of seven surfaces and the one gate that matters most. It does not enumerate the other six, because they were not enumerated to this repo and inventing a table to look complete is the error this whole contract is written against.)*

### 2b · What this repo can measure, on the config it actually holds

Field config v1.2.1 declares **no `defaultsTrueFor` anywhere at all**, and **no `has_mechanicals` attribute** — the sixth zone attribute arrives at v1.11. So the list gate above cannot be demonstrated here; what can be measured is three item-level gates:

| Item | Gate |
|---|---|
| `liv.egress` | `zone.sleeping` |
| `bsm.finished-behind` | `zone.finished` |
| `cir.stairs-rails` | `zone.has_stairs` |

The reference export's ensuite carries `finished: true`. Lose that on replay and anything gated on it stops being due, in a room where it applies, with nothing to say so. **Three questions, not a whole list — which is why §2a and not this is the argument.**

**On the count of defaulting zone types:** Field Code reads 12 of 13 at v1.11; measured here on v1.2.1 it is 13 of 13, because the mechanism does not exist yet. Both are true of the version they were read from. **The count is no longer the load-bearing fact** — one list gate on one attribute is enough on its own, and it does not depend on how many other types default.

**The test for what belongs in the plan:** *could the app work this out again by looking at the house?* If no, carry it explicitly.

## 3. The trap inside "carry the attributes"

**A recorded key and an absent key are different things. That is all the record supports, and it is enough.**

> **Corrected 2026-07-31, and the correction matters more than the conclusion.** An earlier version of this section said the bedroom's `sleeping: false` meant *somebody was asked and said no.* **It does not.** Field Code: zone creation writes `attributes[a.id] = attrs.has(a.id)` for every `askAtCreation: true` attribute and **there is no skip path**, so an untouched toggle and a considered *no* produce the same `false`. The bedroom's three falses are almost certainly three toggles nobody moved.
>
> The verbatim map is still right — **it preserves the field's own ambiguity faithfully**, which is the most any emitter can do. But the earlier reason licensed rendering `false` as *"we established there is none"*, which is the proposed error a third time: a value read as more definite than its provenance supports.

So, precisely:

- **A recorded `false`** is what the field wrote down. It does **not** say whether anybody moved the toggle, and nothing downstream may claim it does.
- **An absent key** means `askAtCreation: false` for that attribute, so zone creation never wrote one. `has_plumbing` and `exterior_wall` are absent from both zones for this reason.

An emitter that carries truthy keys only would collapse those two, and the receiver would lose the one distinction the record genuinely supports. So the plan carries **the recorded map verbatim, falses included, and asserts nothing about how any value got there.**

A doctrine scan forbids filtering the map to its true values, and asserts the positive form — the test is `typeof value === 'boolean'`, not whether the value is true, which is the part that survives somebody optimising the payload later.

*(Third time this distinction has decided a design here, after declared-and-false in the trigger evaluator and typed/stub/undeclared for component types.)*

### 3a · There is no `unanswered` field, and the emitter cannot honestly send one

It was here, derived from this config's declared attributes minus the keys the zone recorded. **Field Code's evidence removes it:**

> v1.2.1 declares **five** zone attributes. v1.11 declares **six**, and the sixth is **`has_mechanicals`** — the only attribute in the whole config carrying a `defaultsTrueFor`, and per §2a the one carrying a list gate.

**An emitter always reads a past config**, so any list it derives is systematically under-inclusive — and across exactly these two versions it is missing exactly the attribute §2 is named after. A receiver trusting it would be told nothing is unanswered about the one thing most worth asking.

**The receiver derives it, from its own current vocabulary:**

```
unanswered = its own declared attributes − keys(zone.attributes)
```

The verbatim map is what makes that derivation possible, and it is all the emitter can honestly send.

## 4. The payload

```jsonc
{
  "planSchemaVersion": 1,
  "kind": "session-plan",

  // Provenance-tagged `system`, per §3.
  "source": {
    "actor": "system",
    "binderId": "…",        // the property id — see §5
    "propertyId": "…",
    "auditRunId": "…",      // which audit run the carried gaps came from
    "generatedAt": "…",
    "generatedBy": "…"      // the operator who generated it
  },

  "property": { "id": "…", "label": "…" },

  // §3a. One entry per zone uuid across every visit — the field-minted uuid is
  // the cross-visit identity, so the same ensuite seen twice is one ensuite.
  "zones": [{
    "zoneId": "…",
    "label": "ensuite",
    "type": "bathroom",
    // Verbatim, falses included. No `unanswered` — see §3a; the receiver
    // derives it from its own vocabulary minus these keys.
    "attributes": { "finished": true, "sleeping": false, "has_stairs": false }
  }],

  // Live typed pins, by uuid. Retired pins are not carried — a removed water
  // heater is house history, not an outstanding question.
  "objects": [{
    "pinId": "…",
    "componentType": "smoke-alarm",
    "label": null,
    "priorUnitPhoto": null      // §B3 — see §6 below
  }],

  // The §1b stream, with the config's own reason verbatim.
  "carriedGaps": [{
    "scopeKind": "zone",
    "zoneId": "…",
    "pinId": null,
    "itemId": "int.canvas",
    "reason": "not-reached",      // or the na reason id, e.g. `deferred`

    // §7 — the first visit of the CURRENT UNBROKEN RUN of being outstanding.
    "since": "2026-07-25",        // null on every basis but `dated`
    "sinceBasis": "dated",        // dated | undated | predates-record | no-visit
    "sinceVisitId": "…",          // the visit the run began at, where known
    "sinceRunVisits": 3,          // consecutive visits this record sees it open
    "sinceNote": "…",             // why, in a sentence — never a bare null

    // Renamed from `sinceImportedAt` — see §7c. When the import that FIRST made
    // this item due was read here. A different visit from `since`, now that
    // `since` means the run rather than the first time ever.
    "firstDueImportedAt": "…"
  }],

  "monitorsDue": [{ "pinId": "…", "componentType": "…", "label": null }],
  "comparisonPositionsDue": [{ "pinId": "…", "itemId": "wh.unit" }],

  // Recorded, not specced. Increment 5, gated on manifest v4 — but see §9a:
  // this is where `monitorsDue` is re-sourced from.
  "openConcerns": [],

  "sections": { /* see §8 */ },
  "warnings": []
}
```

## 5. `binderId` is the property id, and that is named rather than assumed

A binder is a property's record and no separate binder entity exists in this build. **If a binder ever becomes its own row, `binderId` is the field that changes** — so it is a distinct key rather than a second name for `propertyId`, and a receiver must not infer the equivalence.

## 6. §B3 — prior unit photographs, built and unexercised

`.unit` items are the object-level comparison position: *"here is your water heater, and here is what it looked like last year."* The prior photograph must ride back into the visit and display beside the capture prompt, because nothing in the field app can enforce consistent framing unaided and at hour three the concierge will not recall the angle.

**The mechanism is built. It has never run.** **Field config v1.2.1 declares none**, so there is no comparison position to carry and `priorUnitPhoto` is null on every object.

**The count is settled and can now be stated:**

| Config | `.unit` items |
|---|---|
| Master **v1.11** | **27**, plus 5 `.wide` |
| Master v1.5.1 | 23 — the earlier reading here, correct at the version it was read from |
| Field config **v1.2.1** *(what this repo holds)* | **0** |

*(The dispute was a version skew, not a disagreement — the same shape as the zone-attribute count in §2b and the `defaultsTrueFor` range. Both readings were right about their own version, and neither said which version it read.)*

**Null here is not a failure to find one**, and the plan says so in `sections.comparisonPositionsDue` and in `warnings` rather than leaving an empty array to be read either way.

**There is deliberately no fallback to "the most recent photo on this pin."** The two canonical photographs stay distinct — the **unit shot** (condition over time) and the **nameplate shot** (identity and age evidence, Manifest Contract §7b) — and inventing a comparison position from an arbitrary photograph would conflate them. A scan holds it.

## 7. `since` — the current unbroken run

> **Ruled 2026-07-31. This replaces what the previous revision of this document specified**, which read the import that first made an item due. That is *the first time it was ever outstanding*, and it is wrong in both directions.

**`since` is the walk date of the visit at which the item's CURRENT UNBROKEN RUN of being outstanding began.**

> A gap deferred on visit one and again on visit two appears in several audit runs, and *"the visit date"* does not say which visit.
>
> **Not the first time it was ever outstanding** — an item satisfied on visit two and unanswered again on visit three would tell a client it has been open for a year when it was closed for eleven months of it.
>
> **Not the most recent carry either**, or the clock resets every visit and the sentence stops meaning anything.
>
> The outcome is that *"open since your March visit"* is true.

### 7a · What breaks a run, and what does not

- **An answer breaks it.** Satisfied, failed, or an `na` whose reason the config does not mark `feedsGapList`. A later reopening starts a **new** run.
- **A visit that did not ask it is transparent** — stepped over, not counted, and it does not break the run. A pin retired for one visit and back the next was never *answered* in between, and treating silence as an answer would reset the clock on a question nobody closed. `sinceRunVisits` counts only visits where it was genuinely outstanding, so it can be smaller than the span it covers.
- **Membership is read per visit from that import's own config**, via the `feeds_gap_list` written at import time. Re-deciding history with today's config would be *the config decides* pointed backwards.
- **Chronology is the walk, not the upload.** Visits sort on `session.startedAt` where there is one and `imports.imported_at` where there is not — a baseline walked in March and imported in June happened before a monthly walked in April. Where the two orders differ, the plan says so in `warnings`.

### 7b · Four bases, because `null` was four different facts

| `sinceBasis` | `since` | Means |
|---|---|---|
| `dated` | a date | the run's first visit is known and its walk date is on record |
| `undated` | null | the run's first visit is known; no import for it records a session start |
| `predates-record` | null | the run reaches this record's earliest visit **and that visit is not a baseline** |
| `no-visit` | null | no visit on record has the item due — a visit-less import |

**`predates-record` is the state the ruling insisted on.** Where the property's first import is visit three, `since` cannot be known and must say so rather than defaulting to the earliest visit that happens to exist. **The test is whether the record's earliest visit is a `baseline`** — a baseline is a property's first visit by definition, so a record starting at one reaches all the way back, and a record starting at a `monthly` had visits this database never saw.

`visits.kind` is operator-entered and can be wrong, but the failure direction is the safe one: a first visit mistyped as `monthly` yields *"we cannot say how far back this goes"* rather than a confident wrong date. **This is Verification Discipline rule 7 in its purest form** — the old code's fallback had an input that is always present, so it never once announced that it could not answer.

**One thing `predates-record` is careful not to over-claim.** A run that starts *later* than the record's earliest visit is dated normally, even on a record that does not reach back: there is a visit on file where the item was not due or was answered, and that is positive evidence from held data. A water heater first pinned on visit three could not have been outstanding on visit two, and visit two is right there. Only a run reaching the record's own left edge has nothing behind it.

`sinceNote` carries the reason in a sentence on every row, in all four states. A receiver never has to interpret a bare null.

### 7c · `sinceImportedAt` is renamed to `firstDueImportedAt`

**The rename is the point, not housekeeping.** While `since` meant *first ever due*, the two fields described one import and the shared prefix was accurate. They now describe **different visits** — a demo export has an item whose `since` is July and whose first-due import is March — and a name still reading `since…` would invite exactly the collapse this change removes.

It is kept because it is the ordering key this repo actually sorts on. It has no meaning in the field: the reference session was walked on the 25th and imported days later. **It is not a fallback for `since`.**

### 7d · The typed-visit-date defect, and the reconciliation question answered

**`visits.visit_date` is hand-typed and nothing checks it.** It is filled from `req.body.visitDate` at `POST /api/properties/:id/visits`.

It had already gone wrong in a client's document. The reference session began `2026-07-25T16:55:14Z`; the Observed Addendum records the export as 2026-07-25. **The first signed gap report rendered *"visited 2026-07-24."*** That date came from a seed script's literal and contradicted the manifest by a day, in a client-facing artifact, with no path that could have caught it.

**Asked: does the import reconcile the typed date against `session.startedAt`, or does the disagreement persist forever?**

**Answered from the code: it persists.** `visits.visit_date` has **exactly one write site** in the whole server — `server/src/index.ts:236`, the visit-creation route — and **no import path touches the column.** A typed 24th and a walked 25th stay disagreeing indefinitely.

The client-facing and field-facing paths are protected: the signed edition and this plan both resolve the date through `walkedAt()`, which reads `session_meta.started_at` and reports the disagreement in `warnings`. **A doctrine scan forbids `visit_date` anywhere under `report/` or `plan/`.**

**Three desk-facing read sites still consume the typed value**, and one composes it into a sentence:

| Site | What it does with it |
|---|---|
| `server/src/import/report.ts:308` | `visitDate` on the import report |
| `server/src/pass/read.ts:380` | `visit.visitDate` on the pass read model |
| `server/src/import/integrity.ts:422` | **renders it**: *"…on this property's baseline visit of 2026-07-24…"* |

The third is the live one. It is a warning a person reads and acts on, and it can name a day nobody was in the house.

**Recommendation, not built — this is outside the current slice and the decision is the owner's.** Do **not** reconcile by overwriting at import. The typed date is a real fact (a visit booked for next Tuesday genuinely has one and no manifest) and overwriting destroys the disagreement, which is itself information. Instead **make `walkedAt()` the single accessor** and point those three sites at it, leaving `visit_date` explicitly the *planned* date. Fewer moving parts than reconciliation, nothing overwritten, and no read site left able to pick the wrong one.

## 8. Every section says why it is empty

**Three of five sections are empty on the reference export**, and an empty section is identical whether the mechanism works and found nothing, was never built, or cannot be expressed by this config. That is Verification Discipline rule 7 at the payload level.

So `sections` carries a count **and a sentence** per section, and the sentence distinguishes the cases:

| Section | On the reference export |
|---|---|
| `carriedGaps` | *"…`since` basis: 20 dated · each date is the first visit of the item's current unbroken run of being outstanding — not the first time it was ever due, which would age a reopened item by the months it spent closed"* |
| `monitorsDue` | *"no live pin carries the monitor flag — the mechanism ran and found none, which is not the same as it being unbuilt · flags on live pins: 2 issue"* |
| `comparisonPositionsDue` | *"this config declares no `.unit` items, so there is no comparison position to be due — unexercised rather than empty"* |
| `openConcerns` | *"recorded, not specced — concerns are Increment 5 and gated on manifest v4"* |

`carriedGaps` reports **a count per `sinceBasis`, always** — not only when something is missing — and spells out each silence in words. A count alone cannot say whether the mechanism ran. A scan asserts `SectionReport` carries both.

## 9. Pin flags — three values, not two

> **Corrected 2026-07-31 on Field Code's evidence, and this is a live problem today rather than a v4 one.**

**The field's flag type is three values, not two:**

```ts
"fine" | "monitor" | "issue"      // events.ts:28 · PinScreen.tsx:12
```

**`fine` is settable in the shipping app right now.** This build knows `monitor` and `issue` — taken from the Manifest Contract, which does not list `fine` — so **the first time a concierge taps it, this builder will report it as unmet vocabulary.** That is the fail-open path working exactly as designed: preserved, displayed, counted, marked, never dropped and never guessed into being a monitor. But it will read as a surprise on a report, and it should not, so it is written down here first.

- **The pin `flag` has no declared vocabulary in the config.** `propertyFlags[]` is a different thing entirely: house-level facts like `well` and `municipal_sewer`. So the values this build knows come from a **document** rather than from data — which is precisely why the document being one value short was invisible until Field Code read the source.
- `sections.monitorsDue` lists **every flag value present with its count**, whatever this build does with it.
- A value this build has never met is additionally **named in `warnings`** and marked *not treated as a monitor*.

### 9b · The change request going to the field session, in full

`fine` is **deliberately not added to `KNOWN_FLAGS`.** That list is sourced from the Manifest Contract, whose source of truth is **`PLAN-STAGE-1` §7 in the field repo**, and adding a value read out of the field's source would make this repo depend on a source it does not hold. `CLAUDE.md` §2: *"if something about it seems wrong, say so and stop — the owner routes the change to the Field team."*

**And a contract listing three values today would go stale by design**, because `monitor` and `fine` both retire at v4. So the request is not "add `fine`" — it is the full form, versioned:

> **Pin `flag` vocabulary.**
>
> - **At manifest v3:** `fine` · `monitor` · `issue`. All three settable in the shipping app.
> - **At manifest v4:** `monitor` and `fine` retire. What remains is stated by the field session, not inferred here.
> - **Archived v3 exports carry all three forever.** Retirement changes what a new export may contain; it does not reach backwards into one already written. A reader of a 2026 manifest in 2031 needs the 2026 vocabulary to be documented, and the only place that can live is the contract.

**When the Contract carries that, `KNOWN_FLAGS` takes it** — versioned the same way, so a v3 import and a v4 import are each read against the vocabulary of their own manifest version. Until then the fail-open path runs and this document is the advance notice.

### 9a · `monitorsDue` is re-sourced at Increment 5, and the problem dissolves rather than defers

**Design record §1 retires `monitor` and `fine` at v4.** The previous revision of this document left that as an open question — *what a monitor becomes under the ratified model* — with a third-state sentence covering the gap. **Field Code has answered it, and the answer is better than a successor vocabulary:**

- **`monitorsDue` becomes a query over this repo's own `openConcerns`, with no field input at all.** A thing being watched is a concern with an open lifecycle — which is what the ratified object/concern model already says, and the builder already owns the concern record. Nothing needs to arrive from the field for the section to be correct.
- **`fine` decomposes into nothing.** A satisfied checklist item already records it. There is no successor to design because there was never a second fact.

**So §C5's problem dissolves rather than defers.** The `monitor` flag is not replaced by another flag; the section stops reading a flag. Until Increment 5 lands, the third-state sentence stays in place for v4 exports:

> this property has evidence at manifest v4 or later, where the design record retires the `monitor` flag — so an empty list here may mean the vocabulary is gone rather than that nothing is being watched.

## 10. Open, and what a receiver does for itself

**Settled:** `unanswered` left the payload (§3a); `since` is the current unbroken run with four bases (§7); `sinceImportedAt` is renamed `firstDueImportedAt` (§7c); the typed-visit-date question is answered — the import does not reconcile, and the recommendation is a single accessor rather than an overwrite (§7d); the changelog is not built (§1); the `.unit` count is 27 at v1.11 (§6); the flag vocabulary is three values (§9); `monitorsDue` is re-sourced from `openConcerns` at Increment 5 (§9a); the bedroom's reason is corrected (§3); §2 is rewritten around the `base:mechanical-base` list gate (§2a).

**The receiver derives `unanswered` itself** — its own declared attributes minus `keys(zone.attributes)`. Stated here as a derivation rather than sent as a field, because an emitter reads a past config and its answer is systematically under-inclusive.

**Still open:**

1. **Whether the three desk-facing `visit_date` read sites get pointed at `walkedAt()`** (§7d). Not built — outside the current slice, and the owner's call. One of the three renders the typed date into a sentence.
2. **`monitorsDue` reads the field's `flag` vocabulary without interpreting it** until Increment 5 re-sources it. A value this build has not met is counted and reported, never guessed into being a monitor. If the field app expects a new flag to behave like one, it has to say so — the builder will not infer it.
3. **`fine` will surface as unmet vocabulary the first time it is tapped** (§9). Expected, correct, and written down here so it is not read as a fault. **The change request is §9b** — the full versioned form, not a third value, because a contract listing three today goes stale at v4.

---

**Status:** emitting, unreviewed by a receiver. **This document is the review surface.**
