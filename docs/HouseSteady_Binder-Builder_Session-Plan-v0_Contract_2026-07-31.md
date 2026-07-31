# Session Plan v0 — the contract

**Date:** 2026-07-31 · revised twice the same day — the design session's four answers, then Field Code's review of those
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

From Increment 4 §3a:

> A concierge ticks `has_mechanicals` on the basement during the baseline. Visit two replays the zone as identity only. The attribute arrives absent, falls through to a default — and twelve of thirteen zone types have no default. The mechanical checklist is empty on visit two, and an empty checklist reads as already handled.

**The number is a range across versions, and citing one figure reads as a contradiction to whoever finds it next.**

| Read from | Zone types with no default |
|---|---|
| Master v1.11 *(Field Code)* | **12 of 13** |
| Field config v1.2.1 *(measured here)* | **13 of 13** — `defaultsTrueFor` appears nowhere at all |

Both are true of the version they were read from. The honest statement is *between twelve and thirteen of thirteen, and **none at all** on the config this repo can currently read* — which makes carrying the decisions the only mechanism available, not merely the better one.

Three items in field config v1.2.1 are gated on a zone attribute, so the failure is demonstrable rather than hypothetical:

| Item | Gate |
|---|---|
| `liv.egress` | `zone.sleeping` |
| `bsm.finished-behind` | `zone.finished` |
| `cir.stairs-rails` | `zone.has_stairs` |

The reference export's ensuite carries `finished: true`. Lose that on replay and anything gated on it stops being due, in a room where it applies, with nothing to say so.

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

> v1.2.1 declares **five** zone attributes. v1.11 declares **six**, and the sixth is **`has_mechanicals`** — the only attribute in the whole config carrying a `defaultsTrueFor`.

**An emitter always reads a past config**, so any list it derives is systematically under-inclusive — and across exactly these two versions it is missing exactly the attribute §3a is named after. A receiver trusting it would be told nothing is unanswered about the one thing most worth asking.

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
    "reason": "not-reached",     // or the na reason id, e.g. `deferred`
    "since": "2026-07-25",       // session.startedAt, date part — see §7
    "sinceImportedAt": "…"       // when THIS BUILDER read it. A different fact.
  }],

  "monitorsDue": [{ "pinId": "…", "componentType": "…", "label": null }],
  "comparisonPositionsDue": [{ "pinId": "…", "itemId": "wh.unit" }],

  // Recorded, not specced. Increment 5, gated on manifest v4.
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

*(The master's count is in dispute and this document deliberately does not cite a figure: Field Code counts **27 `.unit` plus 5 `.wide`** at v1.11 against an earlier reading of 23 here. Zero either way in v1.2.1, so nothing binds to it — but a number in prose that two sessions disagree about is worse than no number. Being reconciled separately.)*

**Null here is not a failure to find one**, and the plan says so in `sections.comparisonPositionsDue` and in `warnings` rather than leaving an empty array to be read either way.

**There is deliberately no fallback to "the most recent photo on this pin."** The two canonical photographs stay distinct — the **unit shot** (condition over time) and the **nameplate shot** (identity and age evidence, Manifest Contract §7b) — and inventing a comparison position from an arbitrary photograph would conflate them. A scan holds it.

## 7. `since` — which field it reads, and the defect found underneath

**`since` is `session.startedAt`, date part.** Named explicitly because the choice among three candidates is not obvious and each is wrong in its own way.

**Not `completedAt`, because it moves.** A reopened session has more than one completion. This very export reads:

> completed 17:41:41 · reopened *"Test ai"* 17:42:11 · completed 17:45:18

`completedAt` is when somebody stopped editing. `startedAt` is when the house was walked, and a reopening does not move it.

### 7a · And a real defect underneath, now fixed

**`visits.visit_date` is hand-typed and nothing checks it.** It is filled from `req.body.visitDate` at `POST /api/properties/:id/visits`, and **no import path writes that column at all.**

It had already gone wrong in a client's document. The reference session began `2026-07-25T16:55:14Z`; the Observed Addendum records the export as 2026-07-25. **The first signed gap report rendered *"visited 2026-07-24."*** That date came from a seed script's literal and contradicted the manifest by a day, in a client-facing artifact, with no path that could have caught it.

So **nothing client-facing or field-facing reads the typed field any more** — not this plan's `since`, and not the gap report header. A doctrine scan forbids `visit_date` anywhere under `report/` or `plan/`, and asserts the one module that resolves it reads `started_at` and never `completed_at`.

The column stays. A visit booked for next Tuesday genuinely has a date and no manifest. **It is simply not evidence**, and where the two disagree the plan sends the evidence and reports the disagreement in `warnings` rather than silently preferring one.

**`sinceImportedAt` is when this builder read the import**, under its own name. It has no meaning in the field and is here because it is the ordering key this repo sorts on. `since` is null where no import for that visit records a session start, and **does not fall back** — one field standing for two facts is how a zone `type` ended up doing a nickname's job.

## 8. Every section says why it is empty

**Three of five sections are empty on the reference export**, and an empty section is identical whether the mechanism works and found nothing, was never built, or cannot be expressed by this config. That is Verification Discipline rule 7 at the payload level.

So `sections` carries a count **and a sentence** per section, and the sentence distinguishes the cases:

| Section | On the reference export |
|---|---|
| `monitorsDue` | *"no live pin carries the monitor flag — the mechanism ran and found none, which is not the same as it being unbuilt · flags on live pins: 2 issue"* |
| `comparisonPositionsDue` | *"this config declares no `.unit` items, so there is no comparison position to be due — unexercised rather than empty"* |
| `openConcerns` | *"recorded, not specced — concerns are Increment 5 and gated on manifest v4"* |

A count alone cannot say whether the mechanism ran. A scan asserts `SectionReport` carries both.

## 9. Pin flags — preserved, displayed, counted, marked

`monitorsDue` carries pins the field flagged `monitor`. **Every other flag value is counted and reported rather than ignored**, because *ignored* is none of the four things Observed Addendum §5 requires — it is the safe branch that never announces itself.

- **The pin `flag` has no declared vocabulary in the config.** `propertyFlags[]` is a different thing entirely: house-level facts like `well` and `municipal_sewer`. So the two values this build knows — `monitor` and `issue` — come from the Manifest Contract rather than from data, and anything else is genuinely unmet vocabulary.
- `sections.monitorsDue` lists **every flag value present with its count**, whatever this build does with it.
- A value this build has never met is additionally **named in `warnings`** and marked *not treated as a monitor* — preserved and counted, never dropped, and never guessed into being a monitor either.

### 9a · Empty · unbuilt · **vocabulary-retired**

**Design record §1 retires `monitor` and `fine`.** So on a v4 export, *"the mechanism ran and found none"* would be **true and misleading** — it reads as *nothing is being watched* when the truth is *the word no longer exists.* Amendment §C5's failure one artifact out.

Two states were not enough. Where any import for the property is manifest v4 or later, the section says instead:

> this property has evidence at manifest v4 or later, where the design record retires the `monitor` flag — so an empty list here may mean the vocabulary is gone rather than that nothing is being watched. **What a monitor becomes under the ratified model is an open question with the field session, and this build does not guess.**

**That question is open and its answer decides whether Increment 5 re-sources this section.** An open question stated is information; a confident empty is not.

## 10. Open, and what a receiver does for itself

**Settled since the first draft:** `unanswered` left the payload entirely (§3a); `since` reads `session.startedAt` and the typed-visit-date defect underneath it is fixed (§7a); the changelog is not built (§1); flags are preserved, counted and marked (§9); the bedroom's reason is corrected (§3).

**The receiver derives `unanswered` itself** — its own declared attributes minus `keys(zone.attributes)`. Stated here as a derivation rather than sent as a field, because an emitter reads a past config and its answer is systematically under-inclusive.

**Still open:**

1. **What a monitor becomes under the ratified model.** `monitor` and `fine` are retired at v4 and this build does not guess at the successor. The answer decides whether Increment 5 re-sources `monitorsDue`, and until then a v4 export gets the third-state sentence in §9a rather than a confident empty.
2. **`monitorsDue` reads the field's `flag` vocabulary without interpreting it.** A value this build has not met is counted and reported, never guessed into being a monitor. If the field app expects a new flag to behave like one, it has to say so — the builder will not infer it.
3. **The `.unit` count at master v1.11** — 27 + 5 `.wide` per Field Code against an earlier 23 here. Nothing binds to it (zero in v1.2.1), and no figure is cited in this document until the two readings reconcile.

---

**Status:** emitting, unreviewed by a receiver. **This document is the review surface.**
