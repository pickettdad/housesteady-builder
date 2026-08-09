# The reverse-osmosis false positive, and the tier doctrine re-derived

**Date:** 2026-08-09 · **Record of an event. This date never moves.**
**Answers:** whether the frame offered the model anything closer than `reverse-osmosis`, and what identification actually costs per baseline.
**Method:** the frame read at source; the cost derived from the four measured calls rather than estimated.

**Headline: the menu hypothesis is half right and the half it gets wrong is the important half — `iron-filter` and `sulphur-treatment` are both in the frame, so the RO is a real model error · and the tier doctrine's premise does not survive current prices, but the sentence that has to change is not the one about tiering.**

---

## 1 · The frame did offer something closer. Three things, in fact.

**Checked at source. The frame carries 25 classes touching water, and three of them beat `reverse-osmosis` for a well-water iron/sulphur train:**

| id | label |
|---|---|
| `iron-filter` | Iron filter |
| `sulphur-treatment` | Sulphur and odour treatment |
| `water-treatment-other` | Water treatment system |

**So the model was not choosing from a menu that offered RO and nothing closer.** It had `iron-filter` in the projection — every one of the 176 classes is in it, `projectClasses` filters nothing — and **it used `water-treatment-other` elsewhere in the same room**, for *"Water treatment cabinet with multiple filters"*. It knew that class existed and reached for it once.

**That makes the RO a genuine identification error rather than a menu artefact**, and the design session is right that it matters more than the 23 no-classes. **A no-class is a question. A confident wrong class is a maintenance rhythm and a replacement horizon attached to a thing that does not exist.**

### But the locality reading is not wrong — it is pointing at different neighbours

**Five of the train's components genuinely have no home**, and the frame has nothing remotely close for any of them:

| what the model saw | frame carries |
|---|---|
| Stenner pump — a **chemical injection pump** | **nothing.** No `inject`, `chemic`, `dose` or `feeder` class exists |
| Waterite **multiport valve** | **nothing.** No `multiport` or control-valve class |
| Water softener **control valve with meter** | **nothing** |
| Water softener **backwash discharge** | **nothing.** No backwash or drain-line class |
| *"White plastic storage tank"* — in a well room, most likely a **brine or retention tank** | **nothing.** No `brine`, `salt`, `retention` or `contact` class |

**So the correct statement is narrower and more useful than either version:** the frame has the *treatment vessels* — softener, sediment, iron, sulphur, UV, RO — and **none of the plumbing that makes a well-water train work**: the chemical feed, the control valves, the brine and contact tanks, the backwash drain.

**That is the locality axis exactly as the outside review found it.** These are not obscure components; they are what a Bay of Quinte well house has in its basement. **A frame authored against municipal-water assumptions has treatment appliances and no treatment *system*.**

**⚑ Recommended for the building-fabric content pass, or its own: a chemical-feed / injection pump class, a treatment control-valve class, and a brine/retention tank class.** Three classes would have given five of these proposals a home. **Not built — the frame is the design session's.**

### And it sharpens what "23 no-class" means, again

Between this and the concern/consumable/contents split in the previous note, **the 23 is now at least four different things**: frame gaps that a content pass fixes (these five), concerns, consumables, and contents. **Reporting it as one review-queue number is the fifth instance of a count answering a different question from the one it is asked.**

---

## 2 · The tier doctrine — the arithmetic holds, and the doctrine sentence does not

**Derived from the four measured calls rather than estimated.** Solving across the two distinct image counts gives a model that predicts every call to within 43 tokens:

| | |
|---|---:|
| **per photograph** | **1,591 input tokens** |
| **per call, fixed** | **3,701 input tokens** (prompt + the 1,527-token projection + facts) |
| per photograph, output | ~110 tokens |

*Predicted against actual: 48,238 / 48,238 · 48,238 / 48,237 · 19,607 / 19,607 · 5,292 / 5,249.*

**Scaled to a 500-photograph baseline** — 21 calls as a floor, before per-zone splits:

| | |
|---|---:|
| **input** | **~0.97 M tokens** |
| **output** | **~0.062 M tokens** |

### The cost is a multiplication, and the rates are yours

**I am not going to state current model prices** — they change, and a wrong rate here makes the spend cap wrong in both directions. **What is mine is the token count; what is yours is the rate.** So:

> **cost per baseline = 0.97 × (input $/Mtok) + 0.062 × (output $/Mtok)**

| at | per baseline | × 20 clients/yr |
|---|---:|---:|
| $1 / $5 | **$1.28** | **$26** |
| $3 / $15 | $3.85 | $77 |
| $15 / $75 | $19.25 | $385 |
| $30 / $150 | $38.50 | $770 |

**The design session's arithmetic holds** — a dollar-ish on the cheap tier, and my 500-photo figure lands a little above their estimate because canvas frames ride every batch and the per-call overhead is 3,701 rather than nothing.

### What this does to CLAUDE.md §9, precisely

**§9 says: *"At 400–600 photos per baseline the difference is the whole operating cost."***

**That sentence is true at a 30× spread and false at 3×.** Between the top and bottom rows above the difference is **$744 a year across twenty clients**; between the first two it is **$51**. **A sentence that decides a build choice cannot straddle both.**

**But the sentence to change is not *"tier deliberately."*** Tiering is still right, for a reason that survives the price change entirely: **the strong tier is where client-facing prose and synthesis belong, and the cheap tier is where extraction belongs, because that is what each is for.** What has stopped being true is the *justification offered* — that tier is where the operating cost lives.

**So my read matches the design session's: at current prices tier is a quality decision, not a cost one.** The doctrine survives; its stated reason does not.

**Not changed here.** §9 is doctrine, the rates are a business fact, and CLAUDE.md §12 says economics is not mine. **What I can say is that the number the sentence rests on is now measured rather than assumed, and it no longer supports the sentence.** The re-cut is the design session's.

---

## 3 · Built for the next run: `--tier strong`

**The next run wants a stronger model on the mechanical room. There was no honest way to ask for one.**

The only lever was pointing `HOUSESTEADY_MODEL_FAST` at a strong model. **That works and records the wrong thing** — every row in `ai_generations` would say fast tier, and *"why did the mechanical room read better in August"* would be unanswerable from the ledger, which is the one question the ledger exists for.

```bash
npm run identify -- --visit <id> --zone mechanical --run --owner-property --tier strong
```

Reads `HOUSESTEADY_MODEL_STRONG`, refuses clearly if it is unset, and prints which model it is using before spending anything. **`--tier fast` remains the default and the doctrine is unchanged** — this is the escape hatch for a measurement, and a measurement wants its own model id recorded against it.

### The three grading questions, and what each one settles

| question | if it persists |
|---|---|
| **Does the RO persist?** | The frame's water-train gap is implicated, not just the model — because a stronger model choosing RO over `iron-filter` with both on the menu says the *menu* is not the problem twice over |
| **Does the Vanée persist?** | The class/label contradiction is not a small-model artefact, and the cheap validator earns its place |
| **Do the four pressure tanks persist?** | **The ceiling question closes as architectural.** A stronger model that still proposes one tank four times inside three batches is not going to be fixed by raising 24 |

**One thing to hold onto while reading the comparison:** the first run's 60 proposals came from `claude-haiku-4-5-20251001`, and that model id is on every one of the four generation rows. **The comparison is answerable from the database rather than from anyone's memory of which run was which** — which is what `ai_generations` was built for and the first time it has had two runs to tell apart.

---

**991 tests green, typecheck green.**

*(One process note against myself: I reported "typecheck clean" one step before it was. The command was `tsc --noEmit | head -5; echo CLEAN` — the `;` prints the word whichever way the compiler exits. **A check whose output does not depend on the thing it checks is not a check**, which is rule 11b arriving in my own shell rather than in a test. Both figures above were re-run against a real exit code.)*
