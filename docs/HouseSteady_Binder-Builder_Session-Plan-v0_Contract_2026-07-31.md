# Session Plan v0 — the contract

**Date:** 2026-07-31 · revised three times the same day — the design session's four answers, Field Code's review of those, then Field Code's four findings and the `since` ruling · **revised 2026-08-14: the golden fixture (§11), the `planSchemaVersion` proposal (§12), `priorUnitPhoto`'s non-null shape (§4), and all seven `sections` keys instead of four by example (§8)**
**Emitted by:** the binder builder, at `GET /api/properties/:id/session-plan` — `?download` sets a `Content-Disposition`. **There is no CLI command; HTTP is the only way out.** The route resolves an acting operator and answers 409 if none is set.
**Built by:** `buildSessionPlan()` — `server/src/plan/sessionPlan.ts`. **That interface is the executable truth; build a receiver against it.** This document is the reasoning.
**Bound by:** `fixtures/session-plan/session-plan_walk-2026-07-31_v1.json` — see §11, and §11a for what it does not do.
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

### ⚑ 3b · The guarantee begins with post-fix exports, and the fixture is not one

> **Added 2026-08-15 on Cloud Field's review (field-side F-20).** The correction above said a recorded `false` does not tell you whether anybody moved the toggle. **This says when that stops being true**, and the answer is *not yet*.

**Capture mode no longer asks zone attributes at creation** (`CaptureModeScreen.tsx:508`) — an unset attribute is now **honestly absent** rather than a false false. That is the fix, and it is on the field side where it belongs.

So there are two eras of export and the payload cannot tell them apart:

| Written | What a recorded `false` means |
|---|---|
| **Before the capture-mode fix** | **Either.** A considered *no* and an untouched control are the same byte, and nothing in the manifest separates them |
| **After the capture-mode fix** | **A decision.** An attribute nobody set is absent, not false |

⚑ **The golden fixture is a pre-fix export, on all eight zones.** `fixtures/session-plan/session-plan_walk-2026-07-31_v1.json` is emitted from the July walk — the same walk whose bedroom recorded `finished: false, sleeping: false` from toggles nobody touched. **The artifact that proves the emitter works carries decisions that were never made.**

**Nothing about the format changes and nothing is being asked for.** The verbatim map is right, `boolean` is the right type, and both falses must keep travelling — an emitter that dropped or reinterpreted them would destroy the ambiguity rather than report it. What changed is that **the claim is now scoped**:

- **The emitter says it in the payload.** `sections.zones.note` used to end *"a recorded false is a decision and must not arrive as an absence."* The second half was right; the first half was an overclaim, and it was sitting in the payload — **the one place a wrong claim reaches a reader who never opens this document.** It now states both eras and which one it cannot identify.
- **This emitter cannot detect the era.** A post-fix absent key and an `askAtCreation: false` absent key are also identical, so there is no signal to read. If the field side ever publishes a version boundary, that is a contract change routed through them — not something inferred here from an app version this repo does not hold the mapping for.
- `fixtures/session-plan/README.md` says it beside the file, so a reader who opens the JSON does not have to find this section.

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
  //
  // Renamed from `objects` by Increment 5 Amendment 1 §A. Under the class frame
  // an *object* is the desk's confirmed entity; this key holds what the field
  // recorded. `objects` is RESERVED for the desk's own, which the plan may one
  // day carry alongside this — two names because two things.
  "typedPins": [{
    "pinId": "…",
    "componentType": "smoke-alarm",
    "label": null,

    // The field's own flag, VERBATIM and uninterpreted — `fine`, `monitor`,
    // `issue`, or whatever the field adds next. `monitorsDue` below is the
    // DERIVATION of this; the raw value outlives it, and at Increment 5 the
    // derivation stops reading flags while this field does not change. See §9c.
    //
    // Always present, `null` where the pin carries no flag. NOT an optional
    // key: absent would mean "no flag" and "this emitter does not send flags"
    // identically, which is the distinction §3 spends its whole length on.
    "flag": "issue",

    // §B3 — see §6. NULL on every pin in both fixtures, and a receiver that
    // only ever sees the null has still not seen the shape. The non-null form:
    //
    //   "priorUnitPhoto": {
    //     "mediaId": "…",           // the photograph to display beside the prompt
    //     "capturedAt": "…"|null,   // when it was taken; null where the manifest carried none
    //     "itemId": "wh.unit"       // the `.unit` item it satisfies
    //   }
    //
    // Resolved through the component-type graph, so a softener's unit item may
    // be its PARENT type's id — the `itemId` here is the one that matched, not
    // one derived from `componentType`.
    "priorUnitPhoto": null
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

So `sections` carries a count **and a sentence** per section, and the sentence distinguishes the cases.

**There are seven keys, and all seven are listed here.** An earlier revision showed four as examples, which read as the whole set to anybody building a receiver from this document rather than from the interface — the field session would have written a type with three keys missing and found out at parse time.

| Section key | Counts | On the walk export *(the golden fixture, §11)* |
|---|---|---|
| `zones` | zones carried | *"7 attribute(s) recorded true and 25 recorded false travel explicitly, verbatim… A recorded FALSE is not necessarily a decision: exports written before the field-side capture-mode fix wrote a false for every unset toggle…"* — **§3b** |
| `typedPins` | live typed pins | *"…Each carries the field's own `flag` verbatim… · 3 live pin(s) carry a flag and have no component type, so they are NOT in this array"* — **§9c** |
| `carriedGaps` | carried gaps | *"…`since` basis: 208 dated · each date is the first visit of the item's current unbroken run of being outstanding — not the first time it was ever due, which would age a reopened item by the months it spent closed"* |
| `monitorsDue` | pins flagged `monitor` | *"no live pin carries the monitor flag — the mechanism ran and found none, which is not the same as it being unbuilt · flags on live pins: 6 fine · 1 issue · 6 pin(s) carry a flag this builder does not recognise (fine) — not treated as monitors"* |
| `comparisonPositionsDue` | positions with a prior photograph | *"27 `.unit` item(s) declared; positions with a prior photograph to compare against"* |
| `priorUnitPhotographs` | pins carrying one | *"a prior whole-unit photograph to display beside the capture prompt, so the same object is photographed from the same position rather than differently every month"* |
| `openConcerns` | always 0 | *"recorded, not specced — concerns are Increment 5 and gated on manifest v4. The key exists so the shape has room; nothing writes to it."* |

**`priorUnitPhotographs` has no array of its own.** It counts a field on `typedPins`, which is why a receiver reading only the top-level arrays would not find it. It is a section because the reason it is zero needs saying.

⚑ **On the walk export, `comparisonPositionsDue` is empty for a reason the reference export never showed.** At config v1.2.1 it was *"this config declares no `.unit` items"* — the mechanism could not run. At v1.11 the config declares **27**, so the mechanism ran and found none: the walk is a **baseline**, and there is no prior visit to compare against. Same empty array, two different facts, and the sentence is the only thing that separates them. **A second visit populates it; no code change will.**

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

### 9c · The raw flag travels too, on `typedPins`

> **Added 2026-08-15 on Cloud Field's review.** The plan carried `monitorsDue` and nothing else — **a derivation of the flag with the flag thrown away.**

The consequence is one visit deep: visit two could say *check this one* and could **never** say *you flagged this an issue last time.* And the field app cannot recover it, because **nothing about a house survives a visit on that side** — which is the reason the return leg exists at all.

So `PlanTypedPin.flag` carries the field's own value **verbatim and uninterpreted.** Three properties of it, each load-bearing:

- **It is not filtered to `KNOWN_FLAGS`.** `fine` travels even though this build does not act on it. Doctrine 7 — `monitorsDue` is where interpretation happens; this is evidence.
- **It is always present, `null` where there is no flag.** Cloud Field asked for an optional field; this is the one deviation, and the reason is §3's: an absent key would mean *this pin has no flag* and *this emitter does not send flags* identically.
- **It survives Increment 5.** When `monitorsDue` re-sources from `openConcerns` and stops reading flags (§9a), this field does not change — it is what the field recorded, not what this repo concluded. **The raw value outlives the derivation**, which is the whole argument for carrying both.

#### ⚑ And it is not the property's whole flag record

Found while building it, and it is the field session's call rather than this repo's:

**`typedPins` is live *typed* pins.** A live pin with **no component type** is not in the array — so its flag does not travel with it, while `monitorsDue` reads every live pin and would carry it.

**The walk export has exactly this case.** Six live pins carry `fine`; **three of them are typed.** A receiver reading `typedPins[].flag` as the complete record would conclude the other three were never flagged.

`sections.typedPins` counts them and says so on every plan, computed rather than remembered. **A second array is deliberately not invented here** — *which* pins the plan should carry is a seam question, and answering it alone is the thing this contract exists to stop either side doing.

## 10. Open, and what a receiver does for itself

**Settled:** the `planSchemaVersion` policy is **accepted as proposed** — breaking-only, with refuse-loudly on an unknown version, ignore-and-count on an unknown field, preserve-and-mark on an unknown value (§12, ratified by Cloud Field 2026-08-15); the raw pin flag travels on `typedPins` (§9c); the attribute guarantee is scoped to post-fix exports (§3b); `unanswered` left the payload (§3a); `since` is the current unbroken run with four bases (§7); `sinceImportedAt` is renamed `firstDueImportedAt` (§7c); the typed-visit-date question is answered — the import does not reconcile, and the recommendation is a single accessor rather than an overwrite (§7d); the changelog is not built (§1); the `.unit` count is 27 at v1.11 (§6); the flag vocabulary is three values (§9); `monitorsDue` is re-sourced from `openConcerns` at Increment 5 (§9a); the bedroom's reason is corrected (§3); §2 is rewritten around the `base:mechanical-base` list gate (§2a).

**The receiver derives `unanswered` itself** — its own declared attributes minus `keys(zone.attributes)`. Stated here as a derivation rather than sent as a field, because an emitter reads a past config and its answer is systematically under-inclusive.

**Still open:**

1. **Whether the three desk-facing `visit_date` read sites get pointed at `walkedAt()`** (§7d). Not built — outside the current slice, and the owner's call. One of the three renders the typed date into a sentence.
2. **`monitorsDue` reads the field's `flag` vocabulary without interpreting it** until Increment 5 re-sources it. A value this build has not met is counted and reported, never guessed into being a monitor. If the field app expects a new flag to behave like one, it has to say so — the builder will not infer it.
3. **`fine` will surface as unmet vocabulary the first time it is tapped** (§9). Expected, correct, and written down here so it is not read as a fault. **The change request is §9b** — the full versioned form, not a third value, because a contract listing three today goes stale at v4.
4. **Whether flags on untyped live pins should travel** (§9c). Three of the walk's six `fine` pins are untyped and their flags reach `monitorsDue` but not `typedPins`. Counted and stated on every plan; **not fixed with a second array, because which pins the plan carries is the field session's call.**

## 11. The golden fixture — the binding artifact

> **Added 2026-08-14.** Until now this seam was described in four places — the `SessionPlan` interface, this document, the field receiver, and the field's copy of this document — and **nothing bound any of them.** A fifth description would have made it worse.

```
fixtures/session-plan/session-plan_walk-2026-07-31_v1.json
```

**One artifact, emitted from `fixtures/walk-2026-07-31/` — eight zones, nine typed pins, 208 carried gaps, one warning.** This repo commits it and tests that the emitter still reproduces it byte for byte. The field side commits a copy and tests that its receiver still parses it.

| | |
|---|---|
| **Regenerate** | `npm run plan-fixture` — `--check` diffs and writes nothing |
| **This repo's test** | `server/test/session-plan-fixture.test.ts` |
| **Emitted from** | the walk export, through the real import and audit — not hand-written |

**Run-dependent values are substituted, not the fields carrying them.** Minted uuids and wall-clock timestamps become fixed stand-ins of the same shape, so a regenerate produces a byte-identical file unless the *shape* moved and the diff stays readable. Substitution is by value across the whole payload rather than by a list of field paths: a path list only covers the fields somebody remembered, and a value landing in a new field would churn the file silently. A genuinely new volatile value fails the comparison — **that is the tripwire working, and the fix is to extend the substitution, never to loosen the check.**

### ⚑ 11a · It is a tripwire, not a cross-repo guarantee

Stated plainly because a green tick is exactly how the distinction gets lost:

- **Nothing on either side can see, run, or fail the other's build.**
- The whole mechanism is: **when the emitted shape changes, the emitting side's own suite fails first.** That forces a regenerate. The regenerate is what forces a note to the other side.
- **That note is a person's.** If nobody sends it, or the other side does not update its copy, the fixture does nothing at all.

What it buys is *when*: a drift fails on the side that drifted, on the day it drifts, naming the key that moved — instead of surfacing as a parse failure weeks later with no way to tell which side changed.

## 12. `planSchemaVersion` — ratified 2026-08-15

> **Accepted as proposed by Cloud Field and confirmed separately.** Until 2026-08-14 **nothing specified it**: `PLAN_SCHEMA_VERSION = 1` carried one comment — *"the plan's own version, independent of the manifest's"* — and no policy about when it moves. That gap is invisible until the first bump, and then both sides act on their own reading of it.

**The rule, binding on both sides:**

> **`planSchemaVersion` bumps on breaking changes only.** A change is breaking if a receiver correct at version *N* would be wrong at *N+1* — a field removed, renamed, retyped, or given a new meaning under the same name. **Adding a field is not breaking and does not bump it.**

The receiver rule that pairs with it is doctrine 7 — *fail open on vocabulary, fail closed on structure*:

| What arrives | What a receiver does |
|---|---|
| **An unknown `planSchemaVersion`** | **Refuse the import, loudly.** Structure. Do not attempt a best-effort parse — a plan half-understood seeds a visit with decisions half-carried, which is §2's failure with extra steps |
| **An unknown field at a known version** | **Ignore it, and count it.** Additive changes must never break a receiver, and a silent ignore is not fail-open — the rule is preserve, display, count, mark unrecognised |
| **An unknown value inside a known field** — a new `sinceBasis`, a new pin flag | **Preserve, display, count, mark unrecognised.** Never coerce to a default. `monitorsDue` already does exactly this with `fine` |

**First exercised 2026-08-15.** Adding `typedPins[].flag` (§9c) is additive, so `planSchemaVersion` stayed at 1 and the golden fixture caught the change instead — `Changed at the top level: sections, typedPins`. That is the pairing working as designed on its first real use.

**And the version is deliberately not carrying the whole job — §11 is the other half.** An additive change does not bump the version, so the version alone would let a field appear with nothing announcing it. It fails the golden fixture instead. **The version tells a receiver whether it can parse at all; the fixture tells both sides that anything moved.** Neither covers the other's case.

## 13. The payload takes no position on rendering

> **Added 2026-08-15 on Cloud Field's review.** Not a disagreement — a hazard worth naming before somebody reads one as the other.

**`carriedGaps` is 208 items on the walk export, and that is correct as payload.** Every one is a real unanswered item and dropping any of them would be the thing this whole document argues against.

**It is also, rendered literally, the debt screen that ended the first walk.**

⚑ **This contract describes what travels, not what a concierge is shown.** A list in the payload is not a list on a screen. Grouping, paging, ordering, deferring, showing a count instead of a list, showing nothing until asked — **every one of those is the field side's to decide, and none of them is a departure from this contract.**

The only thing the contract asks is the thing it asks everywhere else: **whatever is not shown is not thereby resolved.** A gap hidden behind a count is still open, and the next plan will carry it again with its `since` run one visit longer.

*(The same applies in the other direction and is worth saying once: this repo renders the gap report, and that rendering is not a claim about what the field app should display either.)*

---

**Status:** **reviewed and bound**, 2026-08-15 — Cloud Field's review is in, two findings taken (§3b, §9c) and §12 ratified.

**The standing contract is `fixtures/session-plan/session-plan_walk-2026-07-31_v1.json`, with this document as the reasoning behind it.** A shape change fails the emitting side's suite first; **§11a says exactly how far that reaches and where a person is still required.**

**Still not consumed.** The receiver is not built, and reviewed is not the same as running — the first real import will find things a review cannot.
