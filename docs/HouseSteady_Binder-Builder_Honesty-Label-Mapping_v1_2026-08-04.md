# Binder Builder — The Honesty-Label Mapping (v1)

**Date:** 2026-08-04
**Status:** design decision. **The mechanism is decided; the per-slot assignment is not** — §5 names what must be measured first.
**Resolves:** Document Register §6 #19 · Session Handoff §7's first unfinished item.
**Supersedes the test in:** `Increment-3_Note_Honesty-Label-Mapping` (2026-07-26). That note's reasoning stands and is the origin of everything here. **Only its proposed test is replaced** — see §4.
**Binds to:** Binder Schema v1.1 §3 · `binder-schema-v1.json` v1.0.0 `labelRules` · Increment 4 Amendment 1 §B.
**Due:** before Increment 6. Not blocking Increment 5.

---

## 0. What was checked, and against what

**Checked** — every count below read from `schema/binder-schema-v1.json` v1.0.0 (2026-07-27) and `schema/profiles/baseline-v1.json` v1.0.0, parsed, on 2026-08-04.

| | |
|---|---|
| Slots in the schema | **41** |
| Declare `defaultLabel` | **19** — 18 non-null, **1 explicit null** (`s1.response-procedures`) |
| Declare nothing | **22** |
| Profile coverage | **41 of 41** — 28 required, 7 present-when-populated, 6 out of scope. No slot unaccounted for |
| Labels in use across the 18 | observed 6 · documented 5 · reported-by-homeowner 4 · inferred 2 · measured 1 |
| Labels in the vocabulary used by **zero** slots | `not-inspected` · `not-accessible` · `specialist-assessment-recommended` |

**The handoff's numbers were exactly right.** This document does not correct them. It corrects what they were taken to mean.

---

## 1. The finding — the 22 silent slots are not a backlog

**They were read as unfinished work.** They are not. Sorted by slot kind:

| kind | declares a label | silent |
|---|---|---|
| coverage | 10 | 1 |
| record-set | 5 | 5 |
| fixed | 2 | 2 |
| **derived** | **2** | **11** |
| narrative | 0 | 3 |

**Eleven of the 22 are `derived`** — *"computed from other sections; never independently missing."* A derived slot's label is a function of the labels of its inputs. `s2.property-summary` composes from sections whose labels differ; declaring one constant for it asserts a single kind of knowing over a value that has several.

**So filling in all 22 is not the completion of this work — it is the failure the note exists to prevent**, arriving through the schema instead of through a render path. That matters because it is the shape rule 12 names: *the name of an act is part of what it claims.* Writing `defaultLabel: observed` on a derived slot is a claim, made by a schema author, that nobody checked.

### 1a · And kind is a proxy, not the rule

**Kind predicts the split well and does not determine it**, which is exactly the trap rule 10 names — *read the structure, not a plausible field name.* Two derived slots do carry a constant: `s11.lifespans` and `s19.replacement-windows`, both `inferred`. They are not exceptions. **Every input to both is research**, so the constant is honest.

The same test explains the record-sets. The five that declare — warranties, tests, requirements, readings, programs — are **homogeneous**: every record in them arrives the same way. Every warranty is a cited document; every test is a measurement. The five that are silent — components, findings, concerns, directory, projects — are **heterogeneous**: one component record holds a nameplate reading (Observed), a decoded serial (Inferred), and an install date off a permit (Documented), all at once.

**The rule, stated as an invariant rather than an inventory:**

> **A slot may declare a constant honesty label exactly when every value it can ever hold arrives from the same kind of knowing. Where it cannot, the label is carried per value, and the slot declares which mechanism it uses.**

That holds at 41 slots and at 141, and it does not fire on a legitimate addition — the CLAUDE.md discipline for tests, applied to a schema.

---

## 2. Four mechanisms, not three outcomes

The handoff recorded *"three outcomes per slot, not two."* Measured, it is four mechanisms, and three of them already exist.

| # | Mechanism | Where it is declared | State |
|---|---|---|---|
| **1** | **Constant** — the slot's source implies one label always | `slot.defaultLabel` | **Built.** 18 slots |
| **2** | **Per row, from the na-reason map** — absence claims | `labelRules.naReasonLabels` | **Built.** Increment 4 Amendment 1 §B |
| **3** | **Per record / per claim** — heterogeneous sets and derivations | **Nothing declares it today.** This is the gap | **Not built** |
| **4** | **Per source, resolved by declared preference** — dual-sourced facts | `preferredLabel`, proposed in `dualSourcedFacts` | **Not built.** Recorded, not specced |

**Mechanism 3 is the whole of the remaining work**, and it is smaller than 22 blanks. `s1.response-procedures`' explicit `null` is the one slot that already says *"deliberately no constant"* — it is mechanism 3 declared by absence, and it is the shape the other silent slots need made explicit.

### 2a · The composition rule for derived slots

**A derived value is never labelled more strongly than its weakest input.** Under-claiming is the safe direction — the same asymmetry Increment 4 Amendment 1 §A3 holds for `not-inspected` versus `not-accessible`.

Two shapes, and **which one each derived slot takes is a render question I have not measured** (§5):

- **Renders as discrete claims** → each claim carries its own input's label. Preferred wherever the render supports it, because it loses nothing.
- **Renders as one block** → the block carries the weakest label among its inputs.

**Neither may be assigned at render.** The label is computed when the derived value is computed, and travels with it — Binder Schema v1.1 §3's rule is unchanged and this is the point where it would be easiest to break.

---

## 3. Two vocabulary findings

**Neither is a ruling. Both are questions, because both may be deliberate.**

### 3a · `specialist-assessment-recommended` may not be an honesty label

It sits in `honestyLabels` and **no slot declares it.** An honesty label answers *what kind of knowing does this rest on.* This one answers *what should happen next* — which is the **triggered-flags** stream in the Object/Concern Model §5, a stream the model says must never collapse into another.

If it stays in the vocabulary, a label can be a recommendation, and the vocabulary means two things. **Question for the owner, not a change I would make unilaterally**, since Binder Schema v1.1 §3 lists it deliberately.

### 3b · There is no label for our own judgement, and two required slots need one

`s2.next-review` and `s19.reserve-figure` are `fixed`, silent, and **required in the baseline profile.** Neither is knowledge about the house. A reserve figure is a professional judgement HouseSteady makes; a next-review date is a decision HouseSteady takes. **None of the eight labels fits**, and the profile's own effort map classes the reserve figure as `classD_irreduciblyHuman`.

**This is the slot most likely to be read as a fact about the house when it is an opinion about the house** — a homeowner reading an unlabelled dollar figure in a binder reads it as derived from evidence. Naming the gap here rather than letting mechanism 3 quietly absorb it.

**Recorded, not specced:** whether the answer is a ninth label, or an explicit `null` per `s1.response-procedures`, or something outside the label system entirely.

---

## 4. The test, replaced

**The Increment-3 note proposed:**

> *Every slot in the Binder Schema declares an honesty label, and no code path assigns or changes a label anywhere other than at the point the value enters the system.*

**The first clause is wrong in the direction that matters.** Implemented as written it forces a constant onto eleven derived slots and five heterogeneous record-sets — which is the laundering the note was written to prevent. **The second clause is right and should not be touched.**

**Replacement, in two parts:**

1. **Every slot declares its label mechanism.** Silence about the mechanism is the schema bug, not silence about the label. A slot declaring mechanism 3 and no constant is complete and correct.
2. **No code path assigns or changes an honesty label anywhere other than the point the value enters the system** — unchanged, and extended: a derived value's label is computed with the value, never at render.

Plus one scan that did not exist before, and it is the one that catches the failure this document is about:

3. **No slot of kind `derived` or `narrative` carries a `defaultLabel` unless every declared input to it resolves to that same label.** `s11.lifespans` and `s19.replacement-windows` pass it today. A future author writing `observed` on `s2.property-summary` fails the build.

**Negative-test all three when written, per §9b.** For scan 3 specifically: it must be shown failing against a constructed derived slot with mixed-label inputs, because **the shipped file today has only two labelled derived slots and both pass** — rule 11, and it would otherwise be idle from birth.

---

## 5. What I need measured before per-slot assignment — three questions

Per Builder Code's own request: naming both readings rather than asking for a preference.

**Q1 · Do the eleven silent derived slots render as discrete claims or as one block?**
Reading A: each renders a list of items, each traceable to one source → mechanism 3 per claim, and 2a's weakest-input rule is never needed.
Reading B: some render as composed prose → those need the weakest-input rule and the composition has to be built.
**I do not know which, and the two need different code.** The §15 schedule slots and `s2.property-summary` are the ones I would check first.

**Q2 · Does the Increment-3 note's test exist as an implemented scan today?**
The note says *"test to write at Increment 3."* The handoff says the test is wrong as written. **If it was built as written, it is either failing or it was built against 19 slots and is idle on the other 22** — and idle is the answer I would expect. If it does not exist, this document is a spec rather than a correction.

**Q3 · Is any of the five heterogeneous record-sets already carrying per-record labels in practice?**
`s7.components` is the likely one, since nameplate readings already arrive with provenance from 2b's assist machinery. **If per-record labelling already exists there, mechanism 3 is partly built and this is smaller again.**

---

## 6. What is decided, and what is not

**Decided:**
- The invariant in §1a — constant only where the slot is homogeneous
- Four mechanisms, and mechanism 3 is the remaining work
- Derived values are labelled no more strongly than their weakest input; never assigned at render
- The test replacement in §4, including the third scan and its negative test

**Recorded, not specced:**
- Which shape each derived slot takes — gated on Q1
- `preferredLabel` and the dual-sourced machinery — a schema addition, unchanged from the 2026-07-29 correction
- Whether narrative slots carry a slot-level label at all
- §3a and §3b — both owner questions

**Not touched:** the label vocabulary itself, `labelRules.neverUpgraded`, the na-reason map, and Binder Schema v1.1 §3's source table. All stand.

---

**Status:** v1. **Mechanism decided, assignment gated on §5.** Nothing here blocks Increment 5.
