# The gate is in the pass · stage 4 is off the routine path · the binder draft renders

**Date:** 2026-08-12 · **Record of an event. This date never moves.**
**Answers:** the two rulings from my own flags, and stage 12.
**Method:** every number in the draft is derived from the schema and the profile at run time; every claim about the gate is a test.

**Headline: the gate lives in pass 3 and not in the orchestrator, because a gate only in the combined command is one somebody routes around by typing the individual one · stage 4 is off `npm run passes` with its deletion condition written down · and the binder draft renders 23 sections with 28 gaps, 7 correctly empty and 6 out of scope, partitioned from the profile rather than authored.**

---

## 1 · The gate — and where it had to live

**`npm run passes` runs read → resolve → match in order.** But that command is the convenience, **not** the enforcement.

⚑ **The enforcement is in pass 3 itself, in two places:**

| | |
|---|---|
| **`queueMatch`** | a zone whose pass-1 read has not settled is **not queued at all** — and it comes back in `blocked` with its reason, never silently dropped |
| **`runMatchComplete`** | refuses to *run* one too, because **a job queued when pass 1 had settled can be drained after a re-import when it has not** |

**A gate that only holds inside the combined command is a gate somebody routes around by typing `npm run match`** — which is exactly the difference between a rule being enforced and being remembered.

### What "settled" means, and the two edges that decide it

**A zone is read-complete when every pass-1 batch its plan produces has reached a terminal job.** Two edges, both stated rather than inferred:

⚑ **Zero planned batches is COMPLETE, not pending.** A zone with only canvas frames plans no pass-1 call and never will. *Refusing it forever would block a room on work that is not coming.*

⚑ **`skipped` counts as settled; `failed` does not.** A skip is pass 1 deciding correctly not to run — the photographs are not on this machine — and the zone's scaffold is genuinely empty. **A failure is a call that should have happened and did not**, so matching after it would produce the unscaffolded answer with no record that a scaffold was owed.

### The tests changed shape, and that is the gate working

**Four existing tests broke on the first run**, because they wrote readings straight into the table and queued a match against them. **The gate refused, correctly** — *a reading with no settled pass-1 job is a scaffold that arrived from nowhere.* They now queue and settle a real read, and **four new tests exercise the refusal itself**, including the run-time one and the canvas-only zone.

---

## 2 · Stage 4, off the routine path

**`npm run identify` still works and `npm run passes` does not call it.** The reason is written at the top of the file rather than held in a ruling nobody re-reads:

> Pass 3 labels every object plate-derived or appearance-derived. **This pass asks *what is in this room* and labels nothing** — so every room it touches produces an unlabelled appearance-derived list **alongside** a properly laned one. *Two answers to one question.*

**And the deletion condition is written down rather than assumed:** once pass 3 has run against a real room and been scored against the room record, this file comes out — **or the reason it stayed gets written down.** *Not deleted today, because a pass removed before its replacement is measured is a pass removed on faith.*

---

## 3 · Stage 12 — the binder draft

`npm run binder -- --visit <id> [--out draft.md]` · **free, no model call.**

**23 sections, 41 slots, every heading present.** And an empty house partitions exactly as the profile says:

| | | |
|---|---:|---|
| **gaps** | **28** | owed and not here |
| **correctly empty** | **7** | these appear when the house has something to put in them |
| **out of scope** | **6** | this profile does not fill them. *Reading these as holes would manufacture six problems that do not exist* |

**Nothing here is authored.** Every heading, slot title and emptiness verdict comes from `binder-schema-v1.json` and `profiles/baseline-v1.json`. *This module has no opinion about what a binder contains — that is the Master Spec's, and it is already data.*

### ⚑ And a gap says why it is empty, which is the second distinction

**Three reasons, and only one of them is worth a reviewer's time:**

| reason | what it means |
|---|---|
| **`no-producer`** | **nothing in the builder can fill this, whatever the visit contained.** *No visit to this house would close it* — this is what an outside review is for |
| `no-data-yet` | the producer exists and its input has not arrived. Ordinary, and it resolves with no change to the software |
| `not-captured` | the producer exists and the visit did not supply it |

**A reviewer shown twenty-eight undifferentiated holes reviews the wrong ones.** The footer says so explicitly and points at the `no-producer` set.

### ⚑ The hand-kept list, and the guard it needed on its first use

**`NO_PRODUCER` maps slot ids to reasons, derived from `CLAUDE.md` §15.** It is hand-kept — **which is the exact shape that has drifted four times in this repo** — so every id in it is checked against the schema, and a stale one **exits rather than silently un-marking a gap.**

> **It caught five of my fourteen ids on the first run.** `s5.documents`, `s13.testing`, `s15.checklists`, `s4.property` and `s12.life-safety` are not slot ids — the real ones are `s5.index`, `s13.tests`, `s15.default-schedule`, `s4.profile` and `s12.alarms`.

**Five wrong out of fourteen, caught before the script produced a line.** *The same guard now covers the count map for the same reason: a count keyed on a renamed slot silently reports zero, which the draft would render as a gap that is not one.*

**And the drift is checkable from the other side too**: a test asserts the profile leaves **no slot undeclared**, so if the two files ever separate the draft says so rather than defaulting.

---

## 4 · The panel directory — noted, nothing built

**Recorded because it changes what a capture is worth, not because it needs code today.**

⚑ **A photograph of the panel directory is a text capture that behaves like a table of contents.** Circuits, rooms and equipment **in the household's own words** — and it names things nobody photographed and rooms nobody walked.

**What that makes it, in this pipeline's terms:** it is a `document` surface for pass 1, whose fields are *circuit number → what it feeds*, and **whose value is almost entirely in what it names that nothing else does.** A breaker labelled *pool heater* in a house that declared no pool is **a missing-object finding with no photograph behind it** — which is a shape this repo has no channel for yet. *`couldNotLocate` is its nearest relative and it is not the same thing: that is a known product not found, and this is an unknown object named by a label.*

**Not built, and the reason it is worth knowing early:** ⚑ *it is one photograph, and it is the only capture in the service that can produce a finding about a room nobody entered.*

---

**1138 tests green, typecheck green.** Pass 4 (conditions), stage 9, 6b's search and #122's image comparison remain unbuilt.
