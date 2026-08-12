# The scored run did not happen · and the instrument it needed was broken three ways

**Date:** 2026-08-12 · **Record of an event. This date never moves.**
**Answers:** *run pass 3 against the owner's mechanical room and score it — stage 4's deletion condition.*
**Method:** every absence below was checked on this machine, not assumed. Every fix is a test.

**Headline: the run is blocked — the mechanical room's photographs are not on this machine, and there is no API key. ⚑ But going to run it found three defects in the scoring harness, and the first one would have produced a number nobody should have trusted: `npm run score` was adding two passes together and reporting the total as one.**

---

## 1 · Why the run did not happen

**Three things a scored run needs, and this container has none of them.** Checked rather than assumed, because *"it is probably not here"* is not a finding:

| needed | on this machine |
|---|---|
| The mechanical room's **58 photographs** | **0.** `/data` holds one `.mov`, one `.zip` containing a single bedroom canvas frame, and no photograph of the mechanical room at all |
| An **API key** | **absent.** `HOUSESTEADY_ANTHROPIC_API_KEY` is unset |
| A **database** | **absent.** `data/housesteady.db` does not exist — only a stale `-wal` and `-shm` from July |

**This is a container, not a defect.** The photographs were pulled into a *previous* session's machine, which has since been reclaimed; `/data` is gitignored and correctly so. **The eventual run needs a session with the export downloaded and the key set** — the same arrangement as the first real run.

### ⚑ And the reading note cannot stand in for it

There is a **29 KB freehand reading of that exact room** on this machine — `reading_2026-08-07.md`, 25 candidate objects, produced without pass 3's scaffold. It is tempting as a baseline.

**It is unscoreable, and rule 2 is why:** *matching is on photograph overlap, never on names.* **The note names no photographs.** It identifies objects in prose and cites no filenames, so there is nothing for the harness to overlap against.

*That is the rule working, not a limitation to route around.* Scoring it on names would score the model against its own vocabulary — which is exactly what rule 2 was written to prevent. **And it was never stage 4's output anyway**: it was a long-context read of 58 photographs in one conversation, not a batched pass. Scoring it and calling it *the unscaffolded baseline* would be laundering one act into another.

---

## 2 · ⚑ The harness was adding two passes together

**This is the finding, and it has nothing to do with the missing photographs.**

`objects` holds the output of **more than one pass**. The identification pass (stage 4) writes no lane. Amendment 11 pass 3 writes `plate` or `appearance`. **`npm run score` selected every object for the import and scored the union.**

**So on any machine where `npm run identify` had ever been typed, the number named neither pass** — two shots at every key object, twice the false positives, and *nothing in the output said so.*

**And it is generous in exactly the wrong direction.** A test now demonstrates it on the real key rather than arguing it:

> One good pass (34 objects labelled from the key) plus one useless pass (34 objects all labelled *"a piece of equipment"*) scores **32 correct, 0 wrong**. ⚑ **Thirty-four worthless proposals cost the blended score nothing at all.** Scored apart, the useless pass scores 0 and is visibly useless.

*This is the same "two answers to one question" that took stage 4 off the routine path last week, arriving at the measurement instead of at the data.* **Now the passes are scored apart and both are printed, never summed.** `--pass match|identify|all` picks one.

---

## 3 · And it could not name the lane — which is the claim being tested

**Pass 3's whole assertion is that its two lanes are different acts**: `plate`-derived is read off a label and looked up, close to deterministic; `appearance`-derived is recognised from shape, and every one is a guess.

**One blended number cannot test that.** *The scaffold working* and *the enumeration carrying it* produce the same total. So the score now carries a **rule 7** — a score names the lane that earned it:

```
  by lane — which half of the pass earned each outcome:
    lane            props  correct  wrong  uncert  legib  false+
    appearance         12       11      0       2      0       0
    plate              22       21      0       2      0       0
```

**Within pass 3 the lanes are attributed, not scored apart** — and the reason is the opposite of the pass rule. The two lanes are complementary halves of one answer, so scoring them separately would mark everything the other half found as a miss. **Different passes are different answers; different lanes are one answer.**

⚑ **The rows are attributions, not a partition, and the report says so on every run.** Two lanes can cite one photograph, and a key object nothing proposed credits no lane at all — so the rows need not sum, and a reader who assumes they do would read the difference as an error.

**A correct answer is credited to the lane that *matched*, not to every lane standing beside it.** Otherwise a lane that produced noise scores as the lane that made the identification.

---

## 4 · A third defect, and only running it found this one

**`npm run score` has never worked.**

The default key path was a bare relative string — `fixtures/room-records/…` — and `npm run score` runs in `server/`. **It could only ever have been run as `npx tsx server/scripts/score.ts` from the repo root**, which is how it was run the one time it was run.

*Same shape as `binder.ts`'s repo-root bug last week, same fix: a script's own location is knowable and the caller's is not.* **The lesson is the cheaper one** — ⚑ *a command nobody has typed the documented way is a command nobody has tested.*

---

## 5 · Rule 18 — the instrument is now validated against known answers

**`score.test.ts` builds miniature keys deliberately**, and it is right to: the six rules do not need a real basement, and a test that loaded one would be checking a house rather than a rule.

⚑ **But that left the instrument unchecked.** *A measurement is validated against known answers before its number is used* — and the number that will be used is the one `npm run score` prints, through the real SQL, against the real 34-object key, with the real filename shapes. **None of that chain was covered. The rules were tested and the instrument was not.**

`score-pipeline.test.ts` covers it. Every case is a run whose score is derivable by hand *before* it is run:

| the run | the answer, known in advance | got |
|---|---|---|
| one proposal per confirmed object, labelled with its role | **32 correct, 2 key-uncertain** — 34 objects, two with no role | ✓ |
| the same photographs, every label replaced by *"a box"* | **0 correct, 32 wrong** | ✓ |
| no proposals at all | **34 missed** | ✓ |
| a proposal citing a photograph the key does not name | **1 false positive, naming its lane** | ✓ |

⚑ **The second is the one that matters.** It is rule 16 in the harness's own terms: *an instrument whose reading does not move when the thing it measures changes is not measuring it.* The photographs are **identical** across the first two runs and the score goes from 32/0 to 0/32 — which is the only way to know the photograph overlap is not doing all the work and the labels none of it.

---

## 6 · ⚑ What the validation found in the key — the matcher is generous twice

**Found by the test rather than reasoned about, and reported because a number used to judge a scaffold should not carry an unnamed way of being kind to it.**

On a perfect run, **two key objects are matched by a second proposal as well as by their own:**

| key object | also answered by |
|---|---|
| `10% ethanol ground-loop makeup feeder` | `10% ethanol supply for ground-loop makeup feeder` |
| `water softener` | `water-softener brine/salt tank` |

**The cause is the matcher, which asks whether the role's words appear in the label** — and *a part named after its whole contains all of them.*

**The score is unaffected**: the right proposal matched too, so the outcome is `correct` either way. **The lane attribution is not** — a lane that produced only the brine tank is credited with identifying the softener. *Two out of thirty-four, named and tested rather than left to be discovered inside a result.*

**Not fixed, deliberately.** The matcher's own docstring says it is crude on purpose and *anything cleverer should be argued for first*. This is the argument's evidence, not the argument.

---

## 7 · Stage 4 stays, and the deletion condition is still open

**Nothing here satisfies it.** `server/scripts/identify.ts` remains, off the routine path, with its reason at the top of the file — *a pass removed before its replacement is measured is a pass removed on faith*, and the replacement has still not been measured.

**What the real run needs**, so it is one sitting rather than a discovery:

1. A session with the walk export downloaded to `/data` — **58 mechanical-room photographs**
2. `HOUSESTEADY_ANTHROPIC_API_KEY` set
3. `npx tsx server/scripts/import-export.ts --export <dir> --property "<label>"`
4. `npm run passes -- --visit <id> --zone mech --run --owner-property` — **this is the one that costs money**
5. `npm run score -- --visit <id> --zone mech` — the key defaults to the committed room record

**Both passes can be run against the same import now**, precisely because the score no longer blends them: `--pass match` and `--pass identify` produce two comparable numbers on identical photographs. ⚑ *That comparison is the deletion condition, and until this change the harness could not have produced it.*

---

**1155 tests green** (was 1138), typecheck green. Pass 4 (conditions), stage 9, 6b's search and #122's image comparison remain unbuilt.
