# Class-frame content artifacts — the provenance of `schema/class-frame-v1.json`

**Filed:** 2026-08-07, on the design session's ruling that this is their canonical home.
**Class:** records of an event, per Document Register rule 2. **Every date here is fixed and never moves.**
**Why they exist at all:** the frame's own prose blocks carry some of the reasoning. These carry the rest — **the review triage, both correction passes, the reuse measurement, the audience-distribution argument, and which findings were acted on versus checked and rejected.** Without them the content pass has no provenance beyond `git blame`.

**Numbered, because they only mean anything in order.** Each was cut from the *merged state* of the one before it, and several are not append-only. Read as a chain, not as nine independent documents.

---

## The chain, verified against the merge history

| # | Artifact | Cut from | Classes after | Merged |
|---:|---|---|---:|---|
| 00 | **Whole-file send** | — | 68 | 2026-08-05 |
| 01 | Heating and cooling | 32 | **68** | 2026-08-05 |
| 02 | Electrical | 68 · PR #61 | **79** | 2026-08-06 |
| 03 | Appliances | 79 · PR #63 | **101** | 2026-08-06 |
| 04 | Plumbing | 101 · PR #64 | **124** | 2026-08-06 |
| 05 | Envelope, site and waterfront | 124 · PR #66 | **155** | 2026-08-06 |
| 06 | Safety and tier two — *final* | 155 · PR #67 | **173** | 2026-08-06 |
| 07 | Audience and review — Amendment 8 §C | 173 · PR #69 | 173 · **71 care** | 2026-08-06 |
| 08 | Regional pass | 173 · PR #69 | **176** | 2026-08-06 |

**Dates are the merge dates of the corresponding commits**, read from `git log` on `schema/class-frame-v1.json` — not from the artifacts' own headers, several of which carry an authoring date instead. The event a record of an event records is the merge.

**07 and 08 were both cut from the same 173-class state.** They are siblings rather than a sequence, which is why 07 leaves the class count unchanged while 08 adds three.

---

## 00 is not a step in the chain, and that is the point

**`00_Whole-File-Send` is the artifact the two-author rule exists because of.** It carries 68 classes — the same content as the 32-class state plus artifact 01 — and it is a **whole file**, not a delta.

Artifact 01 says why, in its own `_why`:

> *"A whole-file send from the design session would revert structural work, which it very nearly did: the copy this delta was cut from still carried the pre-PR-#60 `workedClass` block, with `componentType 'none'` and three restated inspection points the new example scan is written to catch. **Content deltas from here.**"*

**So 00 is filed as evidence of a near-miss, not as a build step.** It was superseded by 01 before it landed. Anyone reconstructing the frame from these files should skip it and start at 01 against the 32-class state.

> **One discrepancy, flagged rather than reconciled.** The design session described the whole-file drop as *"32 classes (water heating, wells and septic)."* **The artifact supplied carries 68**, and its own `status` reads *"68 of 173 — water heating, wells and water treatment, septic, and heating and cooling with fuel are written."* Either the description is of the earlier 32-class state and this file is a later whole-file, or the description is off by one system. **Not resolved here** — Builder Code holds the artifact, the design session holds the memory of cutting it.

---

## What each artifact carries that the frame does not

The frame holds the *result*. These hold the *argument*, and several hold findings that were checked and **rejected** — which is the part no other record keeps.

| # | Beyond the content itself |
|---|---|
| 01 | The two-author rule, stated at the moment it became necessary. `register-airflow`'s **deliberately null unit** — second instance, and why the instrument decides the scale |
| 02 | **The owner's electrical ruling, 2026-08-05, in full** — and the line it draws: *operating a device to learn is inspection; altering a circuit is licensed work.* Why `electrical-panel` declares **zero care** and it is a ruling, not an omission. And `_noStatusBlock` — the first delta to deliberately omit a status restatement because the guard derives it |
| 03 | **Three passes in one delta**, each finding what the last could not. The correction pass (the owner's gas-fireplace example — trade care written, household care under-written, across ten classes). The **reason pass** — writing a reason for every zero-care class found five more omissions, *found by having to justify the emptiness rather than by reviewing it*. And the first **outside-review pass**. Plus `_theMostValuableSingleCorrection`: `washer-top-load` declared zero care **with a stated reason and the reason was wrong** — a ruling with a reason is harder to catch than an omission, because it looks considered. Two scope questions recorded and **not decided** — induction, and heat-pump dryers |
| 04 | Rule 13 applied to the frame's own notes: **eight carried appended corrections, the sweep found exactly one whose leading claim was false.** The general form — *a corrected note is authored whole, never appended*, third instance of that shape. And the **third question** now asked of every class: what does the owner remove, empty or clear |
| 05 | 31 classes across four systems in one append-only pass — the largest single delta |
| 06 | The content pass declared complete at 173 |
| 07 | **The audience-distribution argument** and Amendment 8 §C's 71 values, with 69 care categories modified in place |
| 08 | The regional pass, 3 classes and 14 modifications — and the finding that **173 was a projection, not a target**, which is why 176 is past it rather than over it |

---

## Applying them is not appending them

**Four of the nine modify existing entries.** `03` replaces 45 classes by id, `04` replaces 1, `06` replaces 1, `07` replaces 10 classes and 69 care categories, `08` replaces 14. Each carries its own `_howToApply`; read it rather than assuming append-only. Only `01`, `02` and `05` are purely additive.

**Do not rebuild the frame from these.** `schema/class-frame-v1.json` is the source and it is current at 176 classes. These are the record of how it got there.
