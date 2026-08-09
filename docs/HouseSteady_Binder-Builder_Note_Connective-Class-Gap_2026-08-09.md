# The method gap is measurable, and `boiler-zone-valve` is not a stub

**Date:** 2026-08-09 · **Record of an event. This date never moves.**
**Answers:** the two rulings of 2026-08-09 — §9's re-cut and the five classes — plus the frame evidence behind the method-gap reading.
**Method:** the frame read at source with `Object.keys` before anything was counted. **My first pass used four key names that do not exist** (`care`, `inspection`, `opportunity`, `accessEvents`); the real ones are `careCategories`, `inspectionPoints`, `opportunityConditions`, `ownerQuestions`. Rule 15, caught by printing the shape.

**Headline: the method-gap reading is right and there is a number for it — connective classes are 38% thinner than the rest of the frame and five times more likely to carry no replacement horizon · and `boiler-zone-valve` is not a stub, it is absent, which is your own point one step further along.**

---

## 1 · §9 — landed as ruled

**The tiering stays; the reason is now fitness.** *"Extraction, classification, transcription → cheap fast model. Client-facing prose and synthesis → strong model. **They are different acts**, and that is the whole reason — not price."*

**The cost sentence is gone**, with the reason recorded in place: *a rule that cites a market price has a shelf life, and this one expired without anyone noticing.*

**And the procedural half, which is the part that will still be true in a year:** at a 30× spread cost decided and quality justified the exceptions; at 3× quality decides and cost is a rounding error.

**The derivation stays as a dated measurement**, with its unit named and no dollar figure carried: **1,591 input tokens per photograph, 3,701 fixed per call, ~0.97 M input and ~0.062 M output for a 500-photograph baseline, measured 2026-08-09.** Multiply by the rates of the day.

---

## 2 · The method-gap reading — right, and `boiler-zone-valve` is a sharper example than intended

**It is not a stub. There is no class with `zone` anywhere in its id or label.** Three boiler classes exist — `boiler-gas`, `boiler-oil`, `outdoor-wood-boiler` — and nothing for a zone valve at all.

**That is your point one step further along.** The three questions are asked *of a class*, so a missing class is never asked about — and a class that is missing entirely is not merely unasked, **it is invisible to every check the frame has.** A stub at least appears in a count.

### The signature is measurable, and it is not one example

**Classes whose job is joining two other things** — anything matching *line, drain, valve, pipe, connector, discharge, fitting, duct, cleanout, vent, hose, tubing, conduit, wiring, flue*:

| | count | mean content | no replacement horizon |
|---|---:|---:|---:|
| **connective classes** | 26 | **4.3** | **7 of 26 — 27%** |
| everything else | 150 | **6.9** | 8 of 150 — **5%** |

**Connectives carry 38% less content and are five times more likely to have no replacement horizon.** The thinnest entries in the whole frame are connectives, in order: `drain-cleanout` (1), `sump-discharge` (1), `condensate-drain` (2), `oil-tank-fittings` (2), `sump-check-valve` (2).

**That is the method gap with a number on it.** The four questions have less to say about a thing whose whole purpose is to connect — *what care does a drain line need, what is its replacement horizon* — so where a connective class exists it comes out thin, **and where one does not exist nothing asks.**

**Zero of 176 classes score zero**, so this is not authoring fatigue reaching some classes and not others. **Every class was worked; the connectives just had less to answer.** The gap is in the question set, exactly as ruled.

### And it explains the pass-two result

**Wells / Water Treatment / Septic had its own pass and still came out vessel-only.** That now reads as inevitable rather than as an oversight: **a pass that walks the class list and asks four questions of each entry cannot discover an entry that is not there.** The system was covered; its connective tissue was not, because nothing in the method looks for the thing between two objects.

**⚑ It will recur wherever a system is more plumbing than appliance.** Hydronics is the obvious next one — no zone valve, and `mixing-valve` scores 4 against `water-softener`'s 11.

---

## 3 · The five classes — recorded, and deliberately not authored

**Ruled:** `chemical-injection-pump` · `treatment-control-valve` · `brine-tank` · `retention-tank` · `treatment-drain-line`.

**Brine and retention as separate classes is right and I would not have split them.** A salt reservoir gets refilled by the homeowner on a schedule they can feel; a chlorine contact tank is sized for dwell time and inspected for a completely different reason. **Same shape, same room, different care — collapsing them would have put one care rhythm on two unrelated objects**, which is the same arithmetic error as one object counted four times, from the other direction.

**And `treatment-drain-line`'s inspection point being the cross-connection is the sharpest of the five.** It is the one place in that room where a failure is a health matter rather than a maintenance one, and **it is precisely the kind of fact a vessel-only frame has nowhere to put.**

### What I have not done, and why

**I have not added them to `class-frame-v1.json`.** Five ids with thin content would manufacture five more of the thinnest class in the frame — **the defect, added deliberately, in the name of fixing it.**

The frame's own `theVocabulariesMustComeFirst` says it: vocabularies are authored **from** the systems, and a class whose care and inspection content is filled in afterwards to satisfy a schema is a stub with a full-looking row. **These five need the content pass, not a placeholder.**

**What they also need is the question that produced them**, which does not exist yet. *"What connects these objects to each other"* is not one of the four, and adding five classes without adding it leaves the next system to be discovered the same way — by a model inventing a reverse osmosis.

**Both are the design session's.** Recorded here so the five ids and their reasons survive the conversation that produced them.

---

## 4 · Rule 16 — landed

Added to the verification-discipline note as **rule 16: a check whose output does not depend on what it checks is not a check.**

**Written against myself**, with the shell that did it (`cmd | head -5; echo CLEAN` — the `;` prints the word whichever way the compiler exits), the tell that is available before running anything (**the verdict is a separate statement from the check; `A; echo OK` cannot fail, `A && echo OK` can**), and the three forms it takes in this repo.

**Named as the third instance**, after Table G's retired-value guard and the four no-op generator fixtures — **and the note says why the class was not recognised as general sooner: both prior instances were in test code**, so it read as a testing problem rather than a reporting one. It is neither. It is rule 11b, wherever a verdict is produced.

> ⚑ **One count of yours moves:** the register's §3 row reads `Note_Verification-Discipline | 15 rules`. It is **16** now. The note states no count internally, so nothing inside it drifted — the cell is the only place, and it is yours to cut.

---

**991 tests green, typecheck green — and that verdict came from an exit code this time.**
