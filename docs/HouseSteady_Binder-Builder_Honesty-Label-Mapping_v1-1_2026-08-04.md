# Binder Builder — The Honesty-Label Mapping (v1.1)

**Date:** 2026-08-04
**Version:** v1.1 — v1 (2026-08-04) revised against **Builder Code's measured reply of the same day**, which answered §5's three questions and returned four things v1 had wrong or had not seen. **Nothing in v1's §1 finding changed; the shape of the remaining work did.**
**Status:** design decision. **Mechanism decided. Assignment ordered but not made** — §7 names what is left and who owns it.
**Resolves:** Document Register §6 #19 · Session Handoff §7's first unfinished item.
**Relationship to `Increment-3_Note_Honesty-Label-Mapping` (2026-07-26):** its reasoning stands and is the origin of everything here. **Its proposed test was never implemented** — see §5. This document specifies rather than corrects.
**Binds to:** Binder Schema v1.1 §3 · `binder-schema-v1.json` v1.0.0 `labelRules` · Increment 4 Amendment 1 §B.
**Due:** before Increment 6. Not blocking Increment 5.

---

## 0. What was checked, and by whom

**Checked twice, independently.** Every count below was parsed from `schema/binder-schema-v1.json` v1.0.0 by the design session on 2026-08-04, and **re-derived from the file rather than carried** by Builder Code the same day. The two readings agree on every figure.

| | |
|---|---|
| Slots in the schema | **41** |
| Declare `defaultLabel` | **19** — 18 non-null, **1 explicit null** (`s1.response-procedures`) |
| Declare nothing | **22** |
| Profile coverage | **41 of 41** — 28 required, 7 present-when-populated, 6 out of scope |
| Labels across the 18 | observed 6 · documented 5 · reported-by-homeowner 4 · inferred 2 · measured 1 |
| Declared by **zero** slots | `not-inspected` · `not-accessible` · `specialist-assessment-recommended` |

**Two agreeing readings are one check where the method is the same.** Both parsed the same file the same way, so this establishes the file's contents, not the interpretation. The interpretation is §1, and it is where the two readings did differ.

---

## 1. The finding — the 22 silent slots are not a backlog

Sorted by slot kind:

| kind | declares a label | silent |
|---|---|---|
| coverage | 10 | 1 |
| record-set | 5 | 5 |
| fixed | 2 | 2 |
| **derived** | **2** | **11** |
| narrative | 0 | 3 |

**Eleven of the 22 are `derived`** — *"computed from other sections; never independently missing."* A derived slot's label is a function of the labels of its inputs. Declaring one constant asserts a single kind of knowing over a value that has several.

**So filling in all 22 is not the completion of this work — it is the failure the note exists to prevent**, arriving through the schema instead of through a render path. Rule 12: writing `defaultLabel: observed` on a derived slot is a claim, made by a schema author, that nobody checked.

### 1a · Kind is a proxy, not the rule

Two derived slots carry a constant — `s11.lifespans` and `s19.replacement-windows`, both `inferred`. **Not exceptions: every input to both is research**, so the constant is honest.

The same test explains the record-sets. The five that declare are **homogeneous** — every warranty is a cited document, every test a measurement. The five that are silent are **heterogeneous**: one component record holds a nameplate reading (Observed), a decoded serial (Inferred), and an install date off a permit (Documented), at once.

> **A slot may declare a constant honesty label exactly when every value it can ever hold arrives from the same kind of knowing. Where it cannot, the label is carried per value, and the slot declares which mechanism it uses.**

Holds at 41 slots and at 141, and does not fire on a legitimate addition.

---

## 2. Four mechanisms

| # | Mechanism | Declared where | State — **corrected in v1.1** |
|---|---|---|---|
| **1** | **Constant** — one label always | `slot.defaultLabel` | **Built.** 18 slots |
| **2** | **Per row, from the na-reason map** | `labelRules.naReasonLabels` | **Built.** `carried-items.test.ts:530` |
| **3** | **Per value** — heterogeneous sets and derivations | `defaultLabel: null`, plus a carrier | **Declared and defended; no mapping.** See §2a |
| **4** | **Per source, by declared preference** | `preferredLabel`, proposed | **Not built.** Recorded, not specced |

### 2a · Mechanism 3 is further along than v1 assumed

**v1 called it "not built." That was wrong.** Two scans written 2026-07-30 already defend it: `doctrine.test.ts:1972` types a declared null as a value rather than an absence, and `:2009` forbids reading `defaultLabel` for truthiness — no `if (slot.defaultLabel)`, no `??`, no `&&`. Those are the shapes that collapse *no label applies* into *nobody said*.

**`s1.response-procedures`' explicit null is load-bearing in the type system before it has a single caller.** Mechanism 3 has a declared shape and two guards; what is missing is the mapping.

### 2b · And for `s7.components` the mapping is one small table

**The carrier exists and is richer than a label.** `AssistModel.provenance` is per *field*, not per record, and carries task, model, prompt id and version, the human decision, and whether the model abstained. The accept overlay stores both the proposed and the accepted value, so *accepted as-is* and *edited* are different rows rather than a flag.

**Nothing maps provenance to a label, and that function is a design decision rather than a lookup.** Builder Code's example is the proof: a nameplate reading accepted unedited and a decoded serial accepted unedited have **identical provenance shape and different honest labels** — `observed` and `inferred`. The discriminator is already on the record: `Provenance.task`.

> **Mechanism 3 for `s7.components` is a declared `task → label` table plus a reader.** Not a per-record labelling system.

**Reasoned, not checked — for Builder Code to confirm:** of Increment 2b's four tasks, read from `Note_Assist-Screen`, only two produce a value that makes a claim about the house. `nameplate_extract` and `pin_type` need labels. `nameplate_classify` is a gate whose decision stays pending forever, and `photo_routing` is a filing decision, not a claim. **If that holds, the first table has two rows.** It must still be declared as a table, because serial decoding arrives at Increment 5+ and is the row that is `inferred`.

**The other four heterogeneous sets have no carrier at all.** Findings and concerns are gated on manifest v4 regardless.

---

## 3. The gap v1 did not see — four inputs carry no label anywhere

**§4's weakest-input rule assumes its inputs are labelled. For four of the eleven derived slots they are not.** Resolving every silent derived slot's declared `sources` turned up inputs that are **not slots**: `reference:maintenance-schedule-v1` · `property.triggers` · `intake.diy-appetite` · `edition`.

**Each has an obvious kind of knowing and none of them has anywhere in the schema to declare it.** That is a schema gap, not an assignment gap — and it is upstream of every derived assignment, because a derivation cannot resolve through an input that carries nothing.

**Proposed, and three of the four are not contentious:**

| Source | Label | Why |
|---|---|---|
| `reference:maintenance-schedule-v1` | **`inferred`** | Generic guidance for a class of equipment. Not a fact about this house — the same reasoning that makes `s11.lifespans` inferred |
| `intake.diy-appetite` | **`reported-by-homeowner`** | The intake form, per Binder Schema v1.1 §3 |
| `edition` | **none — and it may not be a source** | A container, not a kind of knowing. `s23.package` sourcing an edition is a structural relationship |

**`property.triggers` is the contentious one and I am not ruling on it.** Binder Schema v1.1 §4 derives the expectation set from **two** places: the session's flags, and the intake form's services block. So a trigger may be homeowner-reported or field-observed, and §4 already treats disagreement between them as a first-class output.

> **Reading A:** `property.triggers` resolves to one label and needs a decision on which.
> **Reading B:** it is **the first real instance of mechanism 4** — a genuinely dual-sourced fact, and the shape `preferredLabel` was proposed for.

**Reading B is where my instinct points**, because the electrical-service example in `dualSourcedFacts` is the same shape. But that would pull unbuilt machinery into the critical path of the schedule slots, which is a material cost. **Owner's call, and it wants the two readings in front of him rather than my preference.**

**A fifth shape, noted:** `s15.both-realities` declares a `rule` and **no sources at all.** It resolves through none of the above.

---

## 4. The composition rule for derived slots

**A derived value is never labelled more strongly than its weakest input.** Under-claiming is the safe direction — the asymmetry Increment 4 Amendment 1 §A3 holds for `not-inspected` versus `not-accessible`.

Two shapes, and which one each slot takes is a **render** question:

- **Discrete claims** → each claim carries its own input's label. Preferred wherever the render supports it; loses nothing.
- **One block** → carries the weakest label among its inputs.

**Neither may be assigned at render.** The label is computed when the value is computed and travels with it.

**How often this rule actually fires is now nearly answered.** Builder Code resolved all eleven and only one is genuinely mixed at the top level: **`s2.property-summary`**, which sources `s4` — three labels on its own — plus a silent `s7`. If `s15` renders as discrete dated items, **composition is needed for one slot and is a special case rather than a system.** That is a render decision, and it is mine to make when Increment 6 specs the sections.

---

## 5. The test — a specification, not a correction

**Builder Code answered Q2: the Increment-3 note's test was never implemented, and neither branch of my prediction held.** I expected *failing* or *idle*. It is absent, and the reason is recorded in the repo — writing it would have required deciding what `s2.property-summary`'s constant is, and nobody could.

**What exists instead, and it is the better half:** `doctrine.test.ts:709` forbids the audit engine from assigning a label at all, across `server/src/audit`; `:1324` forbids a positive label onto a gap row. **My second clause was already enforced. Only the first was ever in question, and it was never written.**

So nothing has to be unbuilt. Three tests to write:

1. **Every slot declares its label mechanism.** Silence about the *mechanism* is the schema bug, not silence about the label. A slot declaring mechanism 3 and no constant is complete and correct.
2. **No code path assigns or changes an honesty label other than at the point the value enters the system** — already enforced for the audit engine; extend to derived computation.
3. **No `derived` or `narrative` slot carries a `defaultLabel` unless every declared input resolves to that same label.**

**Scan 3 is the valuable one and it is cheap.** It also has a side effect worth having, which Builder Code named: **it cannot resolve the four non-slot inputs, so it forces §3 to be answered.** A check that cannot be satisfied without fixing the schema is a better prompt than a note.

**Negative-test all three, per §9b.** For scan 3 specifically: `s11.lifespans` and `s19.replacement-windows` both pass today, so it is **idle from birth** unless shown failing against a constructed derived slot with mixed-label inputs. Rule 11, arriving on schedule. Fourth time §9b would have caught a scan that could never fail.

---

## 6. Two vocabulary findings

### 6a · `s19.reserve-figure` — raised to first, and separable

**Builder Code raised this above the rest and I agree.** It is `fixed`, silent, **required in the baseline profile**, and a dollar figure. `CLAUDE.md` §9's *never AI* list already names it; the profile classes it `classD_irreduciblyHuman`.

**The absence of a label is itself a claim** — a homeowner reading an unlabelled dollar figure reads it as derived from evidence, when it is a professional judgement HouseSteady makes. That is rule 12 at the slot that can least afford it.

**None of the eight labels fits**, and neither does `s2.next-review`, which is a decision rather than knowledge.

**Decided: this does not wait for mechanism 3.** It is one slot, it is the one where the gap is a liability rather than an incompleteness, and it can be fixed the moment the owner picks between a ninth label, an explicit null, or something outside the label system.

### 6b · `specialist-assessment-recommended` — owner's, and the structural test is clean

Declared by zero slots. **It is the only member of `honestyLabels` that answers *what happens next* rather than *what kind of knowing this rests on*** — and the Object/Concern Model §5 already gives that answer its own stream, which the model says must never collapse into another.

Builder Code declined to hold a view on purpose: vocabulary is the owner's. **Recorded as a question, not proposed as a change.**

---

## 7. What is left, in the order it has to happen

**There is a dependency order and it is not the section order.** `s2.services-due` and `s3.calendar` both source `s15`; `s15.owner-pro-split` sources `s15.custom-schedule`. **`s15` resolves before three other slots can.** Assignment worked top-down would start at the wrong end.

| # | Step | Owner |
|---|---|---|
| 1 | **`s19.reserve-figure`** — a ninth label, an explicit null, or outside the system. §6a | **Owner** |
| 2 | **`property.triggers`** — reading A or reading B. §3 | **Owner** |
| 3 | The other three non-slot inputs, and whether `edition` is a source at all | **Design session**, on step 2 |
| 4 | **`s15`'s four slots**, then their three dependents | **Design session** |
| 5 | The `task → label` table for `s7.components` | **Design session**, Builder Code confirms the task list |
| 6 | Scan 3, negative-tested | **Builder Code** |

**One free win available now.** `s2.tests-in-flight` sources `s13`, which is `measured` throughout — **it is homogeneous and can take a constant today** under §1a's own invariant. It is silent for the same reason the others are: nobody worked out which were homogeneous. **Eleven becomes ten with no new machinery.**

**Not decided, and mine when Increment 6 specs the sections:** whether `s15` renders as discrete dated items or as prose. It decides whether §4's composition is a system or a special case.

---

**Status:** v1.1. **Mechanism decided, order established, two owner questions blocking steps 1 and 2.** Nothing here blocks Increment 5.
