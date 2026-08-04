# Binder Builder — The Honesty-Label Mapping (v1.2)

**Date:** 2026-08-04
**Version:** v1.2 — v1.1 revised against Builder Code's task-table confirmation of the same day. **Two changes: §2b's enumeration becomes a structural rule, and §6a's gap is corrected — half of it is already declared.** Everything else stands as ratified in v1.1.
**Status:** design decision. **Mechanism decided. Assignment ordered but not made** — §7.
**Resolves:** Document Register §6 #19 · Session Handoff §7's first unfinished item.
**Relationship to `Increment-3_Note_Honesty-Label-Mapping` (2026-07-26):** its reasoning stands. **Its proposed test was never implemented** — §5. This document specifies rather than corrects.
**Binds to:** Binder Schema v1.1 §3 · `binder-schema-v1.json` v1.0.0 `labelRules` · Increment 4 Amendment 1 §B.
**Due:** before Increment 6. Not blocking Increment 5.

---

## 0. What was checked

**Checked twice, independently** — parsed from `schema/binder-schema-v1.json` v1.0.0 and `profiles/baseline-v1.json` v1.0.0 by the design session on 2026-08-04, and re-derived from the file by Builder Code the same day. Every figure agrees.

| | |
|---|---|
| Slots | **41** — profile covers all 41 |
| Declare `defaultLabel` | **19** — 18 non-null, **1 explicit null** (`s1.response-procedures`) |
| Declare nothing | **22** |
| Labels across the 18 | observed 6 · documented 5 · reported-by-homeowner 4 · inferred 2 · measured 1 |
| Declared by **zero** slots | `not-inspected` · `not-accessible` · `specialist-assessment-recommended` |

**Two agreeing readings are one check where the method is the same.** Both parsed the same file the same way. The interpretation is §1, and that is where they differed.

---

## 1. The finding — the 22 silent slots are not a backlog

| kind | declares | silent |
|---|---|---|
| coverage | 10 | 1 |
| record-set | 5 | 5 |
| fixed | 2 | 2 |
| **derived** | **2** | **11** |
| narrative | 0 | 3 |

**Eleven of the 22 are `derived`** — computed from other sections. A derived slot's label is a function of its inputs' labels; declaring one constant asserts a single kind of knowing over a value that has several. **Filling in all 22 is the failure the note exists to prevent**, arriving through the schema rather than a render path.

### 1a · Kind is a proxy, not the rule

`s11.lifespans` and `s19.replacement-windows` are derived and both carry `inferred` — **not exceptions: every input to both is research.** The five declaring record-sets are **homogeneous** (every warranty a cited document, every test a measurement); the five silent ones are **heterogeneous** — one component record holds a nameplate reading, a decoded serial and a permit date at once.

> **A slot may declare a constant honesty label exactly when every value it can ever hold arrives from the same kind of knowing. Where it cannot, the label is carried per value, and the slot declares which mechanism it uses.**

---

## 2. Four mechanisms

| # | Mechanism | Declared where | State |
|---|---|---|---|
| **1** | **Constant** | `slot.defaultLabel` | **Built.** 18 slots |
| **2** | **Per row, from the na-reason map** | `labelRules.naReasonLabels` | **Built.** `carried-items.test.ts:530` |
| **3** | **Per value** | `defaultLabel: null`, plus a carrier | **Declared and defended; no mapping.** §2a |
| **4** | **Per source, by declared preference** | `preferredLabel`, proposed | **Not built.** Recorded, not specced |

### 2a · Mechanism 3 is further along than v1 assumed

Two scans from 2026-07-30 already defend it: `doctrine.test.ts:1972` types a declared null as a value rather than an absence, `:2009` forbids reading `defaultLabel` for truthiness. **`s1.response-procedures`' explicit null is load-bearing in the type system before it has a caller.** What is missing is the mapping.

### 2b · The rule, not the list — **adopted, and it replaces v1.1's enumeration**

**The carrier exists and is richer than a label.** `AssistModel.provenance` is per *field*, carrying task, model, prompt version, the human decision and whether the model abstained. The accept overlay stores proposed and accepted values both, so *accepted as-is* and *edited* are different rows.

**v1.1 said "two of Increment 2b's four tasks need a label." Builder Code confirmed all four claims and then proposed something better, which is adopted:**

> **A task needs a row in the label table exactly when its acceptance routes through `acceptReading` — that is, writes `kind: 'accept'` carrying a `field`.**

**Why the rule beats the list, and it is this repo's own discipline one level up.** `CLAUDE.md`'s test rule is *state the invariant, not the inventory* — a test enumerating what currently exists fires on every legitimate addition. **A list of two task names is an inventory.** It is a fact about today that a scan can only restate; the rule is a thing a scan can hold.

It also **fails in the safe direction.** A new task writing a field with no row is a *missing* label, which is loud. The enumeration fails silently, which is the shape of every idle check this fortnight.

**And the narrowing is the evidence the rule needed.** Builder Code's first version — *any overlay carrying a `field`* — was too broad: `memory` overlays carry `field: 'text'` and `field: 'audio'`. Narrowing to `accept` excludes them. **It was caught by checking the corner marked unchecked**, which is the third time this fortnight that corner was the wrong one.

**Today the table still has two rows** — `nameplate_extract` and `pin_type`. `nameplate_classify` never becomes a proposal; `photo_routing` writes an `assign` on the media with no field. Serial decoding arrives at Increment 5+ and is the row that is `inferred`.

**The other four heterogeneous sets have no carrier at all.** Findings and concerns are gated on manifest v4 regardless.

---

## 3. Four inputs carry no label anywhere

Resolving every silent derived slot's declared `sources` turned up inputs that are **not slots**: `reference:maintenance-schedule-v1` · `property.triggers` · `intake.diy-appetite` · `edition`. **§4's weakest-input rule assumes labelled inputs; for four of eleven there is nowhere to declare one.** A schema gap upstream of every derived assignment.

| Source | Proposed | Why |
|---|---|---|
| `reference:maintenance-schedule-v1` | **`inferred`** | Generic guidance for a class of equipment, not a fact about this house |
| `intake.diy-appetite` | **`reported-by-homeowner`** | The intake form, per Binder Schema v1.1 §3 |
| `edition` | **none — and it may not be a source** | A container, not a kind of knowing |

**`property.triggers` is contentious and I am not ruling.** Binder Schema v1.1 §4 derives the expectation set from **two** places — the session's flags and the intake form's services block — and already treats disagreement between them as a first-class output.

> **Reading A:** it resolves to one label and needs a decision on which.
> **Reading B:** it is **the first real instance of mechanism 4**, the shape `preferredLabel` was proposed for.

**Reading B is where my instinct points**, because the electrical-service example in `dualSourcedFacts` is the same shape — but it pulls unbuilt machinery into the critical path of the schedule slots. **Owner's call.**

**Noted:** `s15.both-realities` declares a `rule` and **no sources at all** — a fifth shape.

---

## 4. Composition for derived slots

**A derived value is never labelled more strongly than its weakest input.** Under-claiming is the safe direction, per Increment 4 Amendment 1 §A3.

- **Discrete claims** → each carries its own input's label. Preferred wherever the render supports it.
- **One block** → carries the weakest label among its inputs.

**Neither may be assigned at render.**

**Only one slot is genuinely mixed at the top level:** `s2.property-summary`, which sources `s4` — three labels on its own — plus a silent `s7`. **If `s15` renders as discrete dated items, composition is a special case rather than a system.** That is a render decision, mine at Increment 6.

---

## 5. The test — a specification, not a correction

**The Increment-3 note's test was never implemented.** I predicted *failing* or *idle*; it is absent, and the reason is recorded — writing it would have required deciding `s2.property-summary`'s constant, and nobody could.

**What exists is the better half:** `doctrine.test.ts:709` forbids the audit engine from assigning a label at all; `:1324` forbids a positive label onto a gap row. **My second clause was already enforced. Only the first was ever in question, and it was never written.** Nothing has to be unbuilt.

Three tests to write:

1. **Every slot declares its label mechanism.** Silence about the *mechanism* is the bug, not silence about the label.
2. **No code path assigns or changes a label other than at the point the value enters** — extend to derived computation.
3. **No `derived` or `narrative` slot carries a `defaultLabel` unless every declared input resolves to that same label.**

Plus, from §2b:

4. **Every task whose runner reaches `acceptReading` has a row in the label table.**

**Scan 3 is the valuable one and it is cheap.** It cannot resolve the four non-slot inputs, so **it forces §3 to be answered** — a check that cannot be satisfied without fixing the schema is a better prompt than a note.

**Negative-test all four.** Scan 3 is **idle from birth** unless shown failing against a constructed derived slot with mixed-label inputs — `s11.lifespans` and `s19.replacement-windows` both pass today. Rule 11 on schedule.

---

## 6. The vocabulary gap — **corrected in v1.2, and it is two gaps, not one**

Builder Code found that a `memory` overlay carries a value and no honesty label, and proposed that it and `s19.reserve-figure` may be **one gap** — the vocabulary having no slot for a HouseSteady-originated statement — which would make §6a cheaper than it looks.

**Checked against Binder Schema v1.1 §3, which Builder Code does not hold: half of it is already declared.**

> | Source | Label | Note |
> |---|---|---|
> | Desk memory note (2a) | **Observed** | Provenance carries *desk, from recall* — **the label says who perceived it, the provenance says when it was written down** |

**So the design already answers the case where a concierge recalls their own perception.** Nothing maps it in code, but the mapping exists and does not need inventing — the project's own recurring lesson, now at its seventh instance: *before building a check, look for whether the config already declares it.*

**What the schema does not cover is Builder Code's actual example.** *"The previous owner said the roof was done around 2019"* is not the concierge perceiving anything — it is the concierge recording what someone told them. **That is a real gap and it is narrower than proposed.**

**And my reading is that it resolves without a new label.** An honesty label answers *what kind of knowing this rests on.* A fact the homeowner supplied is `reported-by-homeowner` whether they wrote it on a form or said it in a hallway — **the channel is provenance, not honesty.** Builder Code's objection was that the concierge is the reporter, not the homeowner; that conflates *reporter of record* with *source of fact*, and the label describes the second.

**So a memory overlay is `observed` or `reported-by-homeowner` depending on what is being recalled — which makes it mechanism 3, not a ninth label.** Proposed rather than decided, because it wants the concierge to say which at capture, and that is a screen question.

### 6a · `s19.reserve-figure` — the real gap, unchanged and still first

`fixed`, silent, **required in the baseline profile**, and a dollar figure. `CLAUDE.md` §9's *never AI* list names it; the profile classes it `classD_irreduciblyHuman`.

**The absence of a label is itself a claim** — a homeowner reading an unlabelled dollar figure reads it as evidence-derived when it is a judgement HouseSteady makes. Rule 12 at the slot that can least afford it. `s2.next-review` is the same shape: a decision we take, not knowledge.

**Decided: this does not wait for mechanism 3.** Two slots, and the answer is a ninth label, an explicit null, or something outside the label system.

### 6b · `specialist-assessment-recommended` — owner's

Declared by zero slots. **The only member of `honestyLabels` answering *what happens next* rather than *what kind of knowing*** — and the Object/Concern Model §5 already gives that answer its own stream. Builder Code declined a view on purpose: vocabulary is the owner's. **Recorded as a question.**

---

## 7. What is left, in the order it has to happen

**`s2.services-due` and `s3.calendar` both source `s15`; `s15.owner-pro-split` sources `s15.custom-schedule`.** `s15` resolves before three other slots can — assignment worked top-down starts at the wrong end.

| # | Step | Owner |
|---|---|---|
| 1 | **`s19.reserve-figure` and `s2.next-review`** — ninth label, explicit null, or outside the system. §6a | **Owner** |
| 2 | **`property.triggers`** — reading A or reading B. §3 | **Owner** |
| 3 | The other three non-slot inputs, and whether `edition` is a source at all | **Design session**, on step 2 |
| 4 | **`s15`'s four slots**, then their three dependents | **Design session** |
| 5 | The `task → label` table, built to §2b's rule rather than the two-row list | **Design session** |
| 6 | **Memory overlays** — whether the concierge declares perceived-versus-told at capture. §6 | **Design session**, and it is a screen question |
| 7 | Scans 1–4, negative-tested | **Builder Code** |

**One free win, already taken.** `s2.tests-in-flight` sources `s13`, which is `measured` throughout — **homogeneous, and it can take a constant today** under §1a's own invariant. Eleven becomes ten with no new machinery.

**Not decided, mine at Increment 6:** whether `s15` renders as discrete dated items or prose.

---

**Status:** v1.2. **Mechanism decided, order established, two owner questions blocking steps 1 and 2.** Nothing blocks Increment 5.
