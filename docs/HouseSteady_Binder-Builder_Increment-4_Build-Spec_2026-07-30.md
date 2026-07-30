# Binder Builder — Increment 4 Build Spec: Carried Items

**Date:** 2026-07-30
**Scope:** the client-facing **gap report** and **session plan v0** — same underlying data, two outputs. **This is the v0.5 finish line.**
**Retargeted by:** Design v1.1 Amendment §B1. Design v1 §4 called this "the gap report editor"; the amendment widened it to carried items and added the session plan, because this repo emits what the field app's import consumes.
**Binds to:** Increment 3's audit output · Design v1 §4 (the editor surface) · Baseline Inspection Process Phase 11 (the three columns) · House Style v1.1 (every rendered word) · Manifest Contract §7a and §7a-ii (the session plan half) · Observed Addendum 2026-07-27 §3a and §3b (what a gap is)

**Version skew, stated up front.** The reference export carries field config **v1.2.1**; the master is at **v1.11**. Three consequences bind this increment: the export declares no `config.snapshot.provenance`, so every transcribed value on it reads `unknown-provenance` · `pin.label` shipped after that export, so nicknames are absent from it · no `measure` resolution has ever fired. Any item below that can only be exercised by a newer export says so.

---

## 0. Non-negotiables

1. **Nothing client-facing renders unsigned.** The signature is the render gate, not a step after it.
2. **No path assigns or changes an honesty label at render.** Carried from Increment 3, still held by a doctrine scan.
3. **Four streams, never collapsed:** Gaps · Findings · Triggered flags · Concerns. **Gaps never become concerns** — a missing photograph is not a problem with the house.
4. **"Concern," never "issue."** Schema and client-facing copy alike.
5. **Never claim what we did not do.** A row saying a thing was not reached says so; it never implies it was checked and found acceptable.
6. **Identification, never assessment.** A gap report row may say a specialist assessment is recommended. It may never say what the specialist would conclude.

---

## 1. The three columns, and their real build state

Phase 11 defines the report as three columns. **Two of them are not built, and the spec that assumes otherwise under-reports silently.**

| Column | Source | State entering Increment 4 |
|---|---|---|
| **Missing from you** | The intake document checklist, minus documents received | **No source exists.** The intake form is not a table; six of the binder's inputs are unwired and the audit says so per slot |
| **Missing from us** | §3b: unresolved items **plus** `na` where `feedsGapList` is true | **Not built.** Increment 3 built binder-*slot* completeness, which is a different thing |
| **Triggered flags** | Property flags and specialist referrals | **Built.** The trigger evaluator is shared and standalone, and a scan keeps it that way |

### 1a · The named failure that makes §1b necessary

*If the gap report is assembled from Increment 3's slot states, it reports twenty fewer items than exist on the reference export, and every one of the twenty is a real thing the client should have been told.*

Measured on the reference export: **19 unresolved items** (all in the ensuite) **plus 1 `na` carrying `feedsGapList`** — `ses.termination-reconcile`, deferred. Twenty items. The audit output carries none of them as a gap.

The reason is worth stating because it is two correct rules producing a false picture, and it will recur. Increment 3 §2 says a coverage slot is complete when every applicable item has a **state** — and `not-found` is a state. So `na / no-access` resolves the *slot* correctly while leaving a *gap* nobody can see. **Neither rule is wrong.** Verification Discipline rule 5: a fix that removes a symptom has not removed a class.

### 1b · Build the field-checklist gap stream as its own thing

**Do not read it off slot states, and do not merge its vocabulary with theirs.**

Increment 3's three causes — *nothing captured* · *captured but short* · *never reached* — describe why a **binder slot** is short. The field-checklist stream answers a different question about a different object. Its own reasons, at minimum:

- **Not reached** — item was due and has no resolution record
- **Not accessible** — `na` with reason `no-access`
- **Deferred** — `na` with reason `deferred`

**Read `feedsGapList` from each import's config snapshot; never hardcode the list.** Two reasons carry it today (`no-access`, `deferred`) and the field app will add more. This is instance six of *before building a check, look for whether the config already declares it.*

**Do not classify from the reason id.** Classify from the boolean. A reason id is vocabulary and fails open; the boolean is the declaration.

### 1c · `proposed` is a fourth state, and the spec takes it — decided

Field Code offered `status` on the v4 active-item set and asked whether the builder wants it, noting that **`proposed`** — matching evidence exists on a pin, one human tap confirms it — is the only value this repo cannot reconstruct.

**Take it.** The named failure: *a photograph of the water heater nameplate is sitting on the pin, unconfirmed. Without `proposed`, it is indistinguishable from an item nobody touched, and the client reads "we did not capture this" about a photograph we are holding.*

That is Verification Discipline rule 6 — where a missing state would read as a confident answer, add the state — and it is the fifth instance. It is also the difference between a client-facing gap and a desk-side triage item, which is the whole basis of what belongs in this report.

**How to take it without creating a second source of truth.** Field Code's own principle for excluding item bodies applies here — a second copy is a second thing that can disagree. So:

- **`resolutions[]` remains authoritative** for `satisfied` and `na`.
- **The builder reads only `proposed` from `status`**, and derives everything else as it does today.
- **A cross-check compares the two and reports disagreement rather than picking a winner.** Same treatment as `zones[].audit` in the Zone-Audit Reconstruction note: store what the field exported verbatim, compute alongside, surface divergence. The duplication becomes a free oracle instead of a hazard.

**Recorded, not specced:** whether `proposed` items appear in the client-facing report at all. My reading is they should not — an unconfirmed photograph is our work, not the client's. But that is a wording and policy call that wants the first real report in front of a person, so build the distinction and default `proposed` out of the client render.

### 1d · "Missing from you" ships, and ships honestly

The intake table does not exist and building it is not this increment's job. **Two readings, and I mean the second:**

The column could ship empty, or it could ship as a manually-entered list the concierge types from the intake form. **Ship it manual.** A document checklist the client can act on is the single most useful thing in this report, and the row model already supports manual rows for exactly this reason. What it must not do is render an empty column with a heading, which reads as *you owe us nothing*.

**The state must be visible in the record**, not just the render: a manual row carries provenance `human-entered`, not `evidence-bound`, so that when the intake table lands nothing has to be untangled.

---

## 2. The composer boundary — the failure this increment is most likely to ship

*If the gap report renders the audit's sentences, the client reads item ids and enum values.*

Increment 3's `sentenceOf()` produces, correctly and by design:

> nameplate photograph on the water heater (wh.nameplate) was recorded none-present on this pin

**Internally that is right.** It quotes `derivedFrom` from `config.snapshot.provenance` instead of paraphrasing, which is Verification Discipline rule 4 working exactly as intended — the producer wrote the relationship down, so quoting beats paraphrasing, and when the wording changes it changes upstream once.

**Client-facing it is a failure.** `wh.nameplate`, `none-present` and `unknown-provenance` are internal vocabulary. A homeowner learns nothing from them except that we discuss their house in a language they do not speak.

### 2a · Two composers over one set of parts

**Do not lint the internal sentence into a client-facing one, and do not re-parse it.** `SlotAssessment.missing` already carries `{ what, why? }` structured, and `derivedFrom` is available beside it. That is the composition boundary.

- **`sentenceOf()`** stays as it is. Internal, quotes the producer, unchanged.
- **A second composer** reads the same structured parts and writes for the client, under House Style.

This is rule 4 applied at a boundary the rule did not anticipate. The internal composer knew the parts and composed them; a client-facing consumer that un-composes that sentence is doing the same information destruction the rule names, one layer out.

**Outcome, not mechanism:** what matters is that no client-facing string is derived by transforming an internal string. How that is enforced is Code's call; a doctrine scan is the obvious shape and is requested in §8.

### 2b · Only two honesty labels reach this report

The schema declares eight. The gap report uses **`not-accessible`** and **`not-inspected`**, and they derive from the na reason, which the audit already reads.

**A gap row never carries a positive label.** `observed`, `measured`, `documented`, `reported-by-homeowner` and `inferred` are assertions about the house, and a gap report asserts nothing about the house. `specialist-assessment-recommended` belongs to the triggered-flags column, which is a referral rather than an absence.

**`unknown-provenance` never renders client-facing at all.** On any export predating config v1.9 that is every transcribed value, so this is not a rare path — on today's reference export it is the normal one.

---

## 3. Session plan v0

**Session data, never config.** It rides into the field app as its own import artifact, never touches the generated config or its hash, and is provenance-tagged `system` with its source binder id.

**Naming trap:** `src/engine/plan.ts` in the field repo exports `SessionPlan` and `compilePlan`. **That is the v1 slot-model plan compiler and is unrelated to this.** Do not bind to it, do not mirror its shape.

**No receiver exists yet.** Field Code confirms the import is scoped in detail at `PLAN-STAGE-1` §7a and §7a-ii but not built. **Specify and emit as though no receiver exists** — that is the correct sequencing and it is what §7a anticipated, since the import cannot be built until something emits an artifact to build against.

### 3a · The named failure: decisions must travel, not just identity

*A concierge ticks `has_mechanicals` on the basement during the baseline. Visit two replays the zone as identity only. The attribute arrives absent, falls through to a default — and twelve of thirteen zone types have no default. The mechanical checklist is empty on visit two, and an empty checklist reads as already handled.*

**The test for what belongs in the plan: could the app work this out again by looking at the house?** If no, carry it explicitly.

Both halves already ship in the manifest — `zones[].attributes` verbatim, and `resolutions[]` with `{kind: "na", reasonId}`. **This is an obligation on the emitter, not a gap in the contract.**

### 3b · Payload

Per Amendment §B1, plus §B3:

- **Carried gaps** — the §1b stream, with their reasons
- **Zone attributes as decided**, per §3a
- **Monitors due for re-measure** and **comparison positions due for re-shoot**
- **Prior whole-unit photographs**, per §B3 — see below
- **Open concerns** — *recorded, not specced.* Concerns are Increment 5 and gated on manifest v4. The plan's shape should leave room; nothing is built from this line.

**§B3 is a payload item, not a nicety.** `.unit` items are the object-level comparison position — what makes *"here is your water heater, and here is what it looked like last year"* a real binder page. Nothing in the field app can enforce consistent framing unaided; at hour three the concierge will not recall the angle. **The prior unit photograph must ride back into the visit and display beside the capture prompt.** Without it the archive accumulates the same object photographed differently every month and no comparison is ever possible.

Note the two canonical photographs per object stay distinct and are never conflated: the **unit shot** (condition over time) and the **nameplate shot** (identity and age evidence, per Manifest Contract §7b).

### 3c · The active item set, and the adapter that absorbs it

The *unresolved* half of a gap requires the active item set — property flags × zone attributes including `defaultsTrueFor` × `pin.*` and `house.*` refs × list gates × component inheritance. **Deriving that here would be a second implementation of the field's trigger engine, whose failure mode is silent divergence: two apps disagreeing about whether an item was ever due, with nothing to error.**

Ratified with Field Code 2026-07-30 (their PR #65): **v4 ships the field's resolved active item set per scope, for every scope, open zones included.** Classification stays here. Shape: flat top-level `activeItems[]`, keyed identically to `resolutions[]` on `itemScopeKey(scope) + itemId`, carrying `scope` + `itemId` + advisory `group`. Ids only, never item bodies.

**Increment 4 does not wait for v4.** Design v1.1 §C3 gives one thin adapter per manifest version, with everything downstream reading this repo's own tables and never knowing which version produced them. So:

- **v3 adapter:** computes the active item set locally, and marks it as computed.
- **v4 adapter:** reads it from the manifest, and marks it as received.
- **Nothing downstream distinguishes them** except a provenance field that says which.

**Two bounds worth carrying.** `zones[].audit` covers closed zones only, so on a real walk most zones are absent from it at the moment of import — it stays a close-out snapshot and is explicitly not a gap source. And the active set is a **snapshot at export time**: a pin created and retired mid-walk had items due that the set will not show. The event log stays the record of what happened, and carry-forward logic must not assume otherwise.

---

## 4. Two items claimed from Increment 3

Both were specced there and deliberately not built, because the spec placed them with the session plan.

**§1d — cross-visit discontinuity display.** The rule is implemented; showing Table F lineage to a person is not. **Internal surface only.** A retired item id is a discontinuity in our record, not something the client did or failed to do, and it must never reach the client-facing report.

**§1f — `answer.*` operators.** The trigger evaluator is shared and standalone and the grammar needs nothing new; these plug into it. They are the builder's permanently.

---

## 5. The editor surface

From Design v1 §4, unchanged in substance: **an editor over pre-populated rows, not a static render.**

- Every row carries a **source chip** and traces back to its pin or item on click
- Rows **toggle in and out**; wording is **editable**; **manual rows addable** (§1d's column depends on this)
- Footer: **Sign and render** → branded HTML/PDF in the brand system
- **Human signs; nothing auto-sends**
- Late results append as they land, via the edition mechanism (Design v1 §6)

**Editing wording does not edit evidence.** A reworded row is an overlay over the composed sentence, never a change to `{ what, why }`. The parts stay as the producer wrote them; §2a's boundary holds through the editor as well as through the render.

**One addition:** every row shows which of the three columns it belongs to and why it landed there, so a concierge can see a misclassification rather than only a wrong sentence.

---

## 6. The two gates before anything client-facing ships

**Neither is negotiable and both are named in the register.**

1. **The golden set ratified past zero.** At zero ratifications it gates nothing, because a known-correct answer only counts once a human has confirmed it.
2. **The house-style lint in a render path.** Not in a test, not at author time — in the path that produces the client's document. It is the mechanism by which *"monitor"* never takes a home as its object and *"issue"* never appears at all.

**A third, from the AI Processing Decision.** §2.3 makes loose-photo routing conditional on §3's client disclosure being in place. The gap report is the first client-facing artifact this repo produces, so the disclosure sentence must exist before it runs on a real client's visit. **The code existing does not make running it permitted.**

---

## 7. Desk-work timing

The effort map in `baseline-v1.json` holds four work classes and deliberately no hour figures, because they belong to the owner and were to come from a mock run.

**Field timestamps cannot supply them.** They measure capture; most of the effort map is desk work — rules-generated content, AI drafts a human signs, the irreducibly human ordering of the top items — and none of that happens in the field app.

**So: timestamp desk work per section.** Start and stop against the section being worked, actor already attached per Increment 2c. This is a column and a pair of timestamps, not a feature. Ten houses in, the pricing basis exists without anyone having sat and measured it, and it keeps calibrating as concierges get faster.

**Recorded, not specced:** what gets reported from it. Collect first.

---

## 8. Tests, and the scans worth asking for

**Behavioural tests:**

- The reference export produces **20 field-checklist gaps** — 19 unresolved, 1 `feedsGapList` na. This number changes when the export changes; the test asserts the derivation, and names its evidence per rule 2 (*"19 of N applicable items in this zone have no resolution record"*), so an implausible result is visible as implausible.
- A `na / no-access` item produces a **complete slot and a gap simultaneously**. This is the §1a failure, pinned so it cannot silently return.
- A `proposed` item is **distinguishable from an unresolved item** at every layer, and defaults out of the client render.
- A session plan round-trip preserves **zone attributes as decided** — the §3a basement case, asserted directly.
- The v3 and v4 adapters produce **the same downstream shape** from the same logical content, differing only in the provenance field.

**Doctrine scans — the durable half, and the highest-leverage request available:**

- **No client-facing string is derived by transforming an internal composed sentence.** §2a.
- **No client-facing render path can reach an item id, an na reason id, or a provenance state name.** §2b.
- **The gap report reads `feedsGapList` from an import's config snapshot, never from a literal.** §1b.
- **No gap row carries a positive honesty label.** §2b.
- **Nothing renders client-facing without a signature.** §0.

---

## 9. Out of scope

The concern register and dashboard (Increment 5, gated on manifest v4) · the intake form as a table · binder section rendering · AI drafting of gap-row wording · the monthly report · client delivery and portal access · anything about who may *see* a rendered report, which belongs with hosting.

**`satisfied_by_visit_id` exists per slot and answers *what did this visit change*.** The monthly report will need it. **The gap report must not use it as a filter** — a gap that has been open for three visits is still a gap, and filtering to this visit's changes would quietly drop it.

---

**Status:** ready for Builder Code. **Two gates in §6 stand between this and anything a client sees.**
