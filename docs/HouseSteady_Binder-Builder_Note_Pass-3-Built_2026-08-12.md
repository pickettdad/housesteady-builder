# Pass 3 is built — the enumeration moved inside it, and the empty room gets its own question

**Date:** 2026-08-12 · **Record of an event. This date never moves.**
**Answers:** stage 7 / Amendment 11 §C pass 3, built to the ruling of 2026-08-12.
**Method:** every claim about what runs is a test in `match-complete.test.ts`.

**Headline: two task names against one runner, so the ledger records which question was asked · a known product cannot come back as a duplicate because it is in the question · the two lanes are stored apart and a located entry naming an unknown product is refused rather than absorbed · and the parent relation is populated here and never guessed.**

---

## 1 · What runs

`npm run match -- --visit <id> [--zone mechanical] [--run --owner-property]`

| the room has | task | question |
|---|---|---|
| **a known inventory** | `match_known` | *find these, then tell me what else* |
| **none** | `enumerate_room` | *say what is here, and every answer is a guess* |

### ⚑ Two task names, not one task with a branch

**That is the design decision worth arguing, and the reason is the ledger.** `ai_generations.task` now records **which question was asked.** With one task name, a run whose inventory happened to be empty is **indistinguishable from one where it was not** — which is *an absence indistinguishable from a completion*, arriving in the one table built to answer *why did this room read differently.*

Each also gets its own prompt file, its own version pin and its own golden-set gate, **because they are different instructions with different failure modes** and one of them is the question this pass exists to stop asking.

**And the scaffold itself rides `input_refs`** — the list handed to the call, verbatim, plus `scaffolded: true|false`. *A room that read badly is only diagnosable if the list it was given is on the row.*

---

## 2 · The duplicate is structurally impossible on the plate lane

**`located` may only name a product that was on the list.** An entry naming anything else is **refused and reported** as `unknownProducts`.

⚑ **That one rule is what keeps the lanes from merging.** A `located` entry naming *Well pressure tank* — a product no plate produced — is **an appearance guess wearing the plate lane's badge**, and it is the only shape that could have re-created the four-tank error inside the pass built to prevent it.

**What it does not do is delete anything.** A second tank proposed in `additional` is **kept**, carrying its required `whatMakesItDifferent` clause, because deleting it would be the builder quietly settling an identity a person should settle. *The guard is that it cannot claim to be plate-derived, not that it cannot be said.*

**`whatMakesItDifferent` is required by the schema**, not asked for in prose. *An entry that cannot say how it differs from a known product is probably that product.*

---

## 3 · The two lanes, in the table

| | |
|---|---|
| `derived_from = 'plate'` | class follows from a resolution read off a nameplate. **`resolution_id` is what makes the claim checkable** — a plate-derived object with no resolution behind it is a provenance claim with nothing supporting it |
| `derived_from = 'appearance'` | recognised from shape and context. **Marked as a guess in the row itself** |
| `NULL` | the row predates the lanes. **Not defaulted to `appearance`** — a default that guesses is how a distinction gets lost one migration after it is drawn |

**Before this column every object in the table was appearance-derived and nothing said so**, which is not a labelling omission — it is the entire failure. `reverse-osmosis`, `well-pump-submersible`, `fuel-tank-propane` and four pressure tanks all sat beside real readings at one confidence.

---

## 4 · The parent relation — populated here, never guessed

**§C says this pass populates it rather than hand-filling it, and it does.** `partOf` names another item **in the same answer**, resolved by name after both rows are written.

**Two decisions inside that:**

⚑ **`parent_object_id` is deliberately not a foreign key.** Parent and child are written in one transaction and **the parent may be written second** — the model's answer carries no ordering. A constraint would force an ordering the answer does not have, and the honest failure is a dangling id that gets reported rather than an insert that dies. *A test writes the child first on purpose.*

⚑ **A `partOf` naming nothing in the answer is reported, never resolved to the nearest thing.** **Guessing a parent is how a part joins the wrong system**, and a wrong system renders as a fact.

---

## 5 · What is NOT in this pass, said rather than discovered

**The product-image comparison (#122).** It belongs here by that ruling and it is **not built**, because pass 2 returns no image reference — there is no fetch, no `source_url`, and nothing to compare against. **It arrives with 6b or not at all**, and wiring a comparison against nothing would be the same shape as claiming `Documented` without a source.

**Stage 4 is untouched and still runs.** The ruling supersedes it as a *first step*, not as code. ⚑ *And it is now the only pass that asks the enumeration question with no honest reason to — which is worth a row's attention at the next cut rather than a deletion today.*

**Nothing sequences the passes yet.** `npm run match` prints a warning when **every** zone would get the enumeration question, because that means passes 1 and 2 have not run — but the warning is a sentence, not a gate. *Said plainly: the ordering is still a human typing three commands in the right order, and that is unchanged by this pass.*

---

## 6 · The near-miss from last turn, generalised — because it happened again

**Last turn's rule 18 finding was that a validation which fails can mean the instrument is wrong rather than the claim.** *It recurred here in a smaller way and it is worth naming as a pattern rather than an incident.*

**Two type errors in this build were the test's fault and not the code's:** `MATCH_TASK as const` on a constant that already infers a literal type, and a `base` fixture whose object literal widened `question` to `string`. **Both looked like the runner's types being wrong. Neither was.**

⚑ **The tell is the same one both times: the check's method was never stated.** *A test that asserts a shape without saying where the shape came from is asserting its own restatement of it.* The fix was to derive the fixture's type from the function's own signature — `Parameters<typeof normaliseMatch>[1]` — **so the test cannot disagree with the thing it tests.** That is rule 11b in the type system.

---

**1119 tests green, typecheck green.** Pass 4 (conditions) and stage 9 remain unbuilt, as do 6b's search and #122's image comparison.
