# Honesty-Label Mapping v1 — Builder Code's measured reply

**Date:** 2026-08-04
**Answers:** `Honesty-Label-Mapping_v1` §5, three questions.
**Method:** every number below **checked** — parsed from `schema/binder-schema-v1.json` v1.0.0 and read from the test suite on 2026-08-04. Nothing here is recalled.

---

## 0. Your §0 verifies, every number

Re-derived independently rather than carried. **41 slots · 19 declare `defaultLabel` · 18 non-null · 1 explicit null (`s1.response-procedures`) · 22 silent.** The kind table matches exactly — coverage 10/1, record-set 5/5, fixed 2/2, derived 2/11, narrative 0/3. Label counts match: observed 6, documented 5, reported-by-homeowner 4, inferred 2, measured 1. The three unused labels are `not-inspected`, `not-accessible`, `specialist-assessment-recommended`.

**The two labelled derived slots are `s11.lifespans` and `s19.replacement-windows`, both `inferred`**, as you have them.

---

## Q2 · Was the Increment-3 test built? — **No, and neither branch of your prediction holds**

You expected *failing* or *idle*. **It was never implemented, and something better was built in its place.**

There is no scan anywhere asserting *every slot declares an honesty label*. What exists:

| scan | what it holds | your mechanism |
|---|---|---|
| `doctrine.test.ts:709` — *never lets the audit engine assign an honesty label* | your second clause, unchanged and enforced across all of `server/src/audit` | — |
| `doctrine.test.ts:1324` — *never lets a positive honesty label onto a gap row* | a gap is not a claim about the house | — |
| `carried-items.test.ts:530` — *the na-reason honesty-label mapping* | **mechanism 2, built** | 2 |
| `doctrine.test.ts:1972` — *types a declared-null default label as a value rather than an absence* | `defaultLabel?: string \| null`, and a live assertion that the schema really holds one | **3, by absence** |
| `doctrine.test.ts:2009` — *nothing reads `defaultLabel` for truthiness* | forbids `if (slot.defaultLabel)`, `?? `, `&&` — the shapes that collapse null into undefined | **3, by absence** |

**So your §4 is a specification, not a correction.** Nothing has to be unbuilt. The first clause was never written down in code, which is why it never fired — and the reason is recorded in the repo: writing it would have required deciding what `s2.property-summary`'s constant is, and nobody could.

**One thing worth knowing, because it changes what mechanism 3 costs.** The two null-vs-absent scans were written 2026-07-30 with this comment: *"Nothing reads the field yet. That is exactly when to fix the type — the first reader would have had `null` narrowed away and would have treated *no label applies* as *nobody said*."* **`s1.response-procedures`' explicit null is already load-bearing in the type system.** Mechanism 3 has a declared shape and two scans defending it before it has a single caller.

---

## Q3 · Per-record labels on the heterogeneous sets — **the carrier exists; the mapping does not**

**Partly built, and in a more useful form than a label.**

`AssistModel.provenance` is `Record<string, Provenance>` — **per field, not per record**, keyed by the thing it describes. And `Provenance` is richer than an honesty label:

```ts
interface Provenance {
  task: string; model: string | null
  promptId: string | null; promptVersion: string | null
  decision: string; abstained: boolean; createdAt: string
}
```

Plus the accept overlay stores **both** values — `prior_value` is what the AI proposed, `new_value` what the human accepted, so *accepted as-is* and *edited* are distinguishable rows rather than a flag.

**But nothing maps provenance to an honesty label.** One reference exists across the whole of `server/src`, and it is a comment saying the label stays put. So:

> **The mechanism-3 carrier is built for AI-sourced values on `s7.components`. What is missing is the function from provenance to label — and that function is a design decision, not a lookup.**

A nameplate reading accepted unedited and a decoded serial accepted unedited have identical provenance shape and **different honest labels** — `observed` and `inferred`. The discriminator is the *task*, which `Provenance.task` carries. So the mapping is `task → label`, declared once, and it is small: 2b has four tasks.

**That is a real reduction in your §2.** Mechanism 3 for `s7.components` is a declared task→label table plus a reader, not a per-record labelling system.

The other four heterogeneous sets — findings, concerns, directory, projects — have **no carrier at all**. Findings and concerns are gated on manifest v4 anyway.

---

## Q1 · Discrete claims or one block — **not readable from code, and the schema answers the question underneath it**

**The direct answer first: no binder section renders today.** `server/src/report/` renders the gap report and nothing else — Increment 6 is *workbench + first sections*. There is no render path for `s2`, `s3`, `s15` or `s23`. **"Discrete or block" is an unmade decision, not a fact waiting to be read**, and I am not going to infer a render shape from a slot id.

**But the schema does answer how many slots the question even applies to**, and it is fewer than eleven. Every silent derived slot declares `sources` (except `s15.both-realities`, which declares a `rule` and no sources at all). Resolving each:

| slot | sources | resolves to |
|---|---|---|
| `s2.tests-in-flight` | `s13` | **one label — `measured` throughout.** Homogeneous; §2a never fires |
| `s2.top-items` | `s10.concerns` | a silent record-set — inherits its problem |
| `s2.missing-records` | `s5` | one silent slot |
| `s2.property-summary` | `s4`, `s7` | **`s4` alone carries three labels** — documented, observed, reported-by-homeowner — plus `s7` silent. **Genuinely mixed; your worked example is the right one** |
| `s2.services-due` · `s3.calendar` | `s15` | **all four `s15` slots are silent derived.** Unresolvable until `s15` resolves |
| `s15.owner-pro-split` | `s15.custom-schedule`, `intake.diy-appetite` | silent derived + a non-slot |
| `s15.custom-schedule` | reference lib, `property.triggers`, `s7.components` | reference + non-slot + heterogeneous set |
| `s15.default-schedule` | `reference:maintenance-schedule-v1` | a non-slot |
| `s23.package` | `edition` | a non-slot |
| `s15.both-realities` | — | declares a rule, no sources |

**Three findings from that table, all of which change the shape of the work:**

**1 · Only one of the eleven is a clean single-label derivation.** `s2.tests-in-flight` composes from `s13`, which is `measured` throughout — it could take a constant honestly today, by your own §1a invariant. It is silent for the same reason the others are: nobody worked out which were homogeneous.

**2 · Four inputs are not slots and carry no label at any level** — `reference:maintenance-schedule-v1`, `property.triggers`, `intake.diy-appetite`, `edition`. **§2a's weakest-input rule assumes its inputs are labelled, and for four of the eleven they are not.** The maintenance schedule library is research; the intake form is homeowner-reported; property triggers are derived from field answers; an edition is a container. Each has an obvious label and **none of them has anywhere to declare it.** That is a gap in the schema, not in the assignment.

**3 · There is a dependency order, and it is not obvious.** `s2.services-due` and `s3.calendar` both source `s15`, whose four slots are themselves all silent derived, one of which (`s15.owner-pro-split`) sources another `s15` slot. **`s15` has to resolve before three other slots can**, and assignment done in section order would hit the dependents first. Worth a topological pass rather than a list.

**What I would measure next, and cannot yet:** whether `s15` renders as a schedule of discrete dated items or as prose. If discrete — which is what a maintenance calendar wants to be — then three of the eleven collapse to per-claim labelling and §2a's composition rule is needed for **one slot**, `s2.property-summary`. That is a render decision and it is yours; I flag only that the answer to it decides whether composition is a system or a special case.

---

## Two things outside your three questions

**§3b is the sharper of your two vocabulary findings and I would raise its priority.** `s19.reserve-figure` is required in the baseline profile, unlabelled, and a dollar figure. Your sentence — *a homeowner reading an unlabelled dollar figure in a binder reads it as derived from evidence* — is rule 12 exactly: the absence of a label is itself a claim. CLAUDE.md §9's *never AI* list already names the reserve figure. **It is the one slot where the missing label is a liability rather than an incompleteness**, and it does not need mechanism 3 to be finished before it is fixed.

**On §3a — I have no view, and that is deliberate.** Whether `specialist-assessment-recommended` is an honesty label is a question about what the vocabulary means, and CLAUDE.md puts vocabulary with the owner. I will say the structural test is clean: it is the only member of `honestyLabels` that answers *what happens next* rather than *what kind of knowing this rests on*, and the Object/Concern Model already gives that answer its own stream.

---

## What I would build, and when

**Nothing yet, and nothing blocks Increment 5** — agreed.

When it comes: **scan 3 is the valuable one and it is cheap.** *No `derived` or `narrative` slot carries a `defaultLabel` unless every declared input resolves to that same label.* I can implement it against the resolution table above, and you are right that it must be negative-tested against a constructed slot — `s11.lifespans` and `s19.replacement-windows` both pass today, so it would be **idle from birth** exactly as rule 11 predicts. That is now the fourth time §9b would have caught a scan that could never fail.

The scan also has a side effect worth having: **it forces the four non-slot inputs to acquire labels**, because it cannot resolve them otherwise. A check that cannot be satisfied without fixing the schema is a better prompt than a note.

---

**Status:** reply to §5. **Q2 answered — never built. Q3 answered — carrier built, mapping is a `task → label` table. Q1 not measurable, with the schema evidence that narrows it from eleven slots to roughly one.**
