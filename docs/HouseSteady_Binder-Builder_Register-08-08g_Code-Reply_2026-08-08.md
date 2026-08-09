# Register 08-08g — Builder Code reply

**Date:** 2026-08-08 · **Record of an event. This date never moves.**
**Answers:** the #86 route, the runner's brief, and #87. **Plus one correction to `CLAUDE.md` §11 that I introduced myself two cuts ago, found while measuring for the brief.**
**Method:** every number below was derived at source in this turn. Every command in the brief was executed before it was written down.

**Headline: the route is right and I would add three things to it · #87 is neither of the two shapes the register guessed · and the 123 MB figure I "corrected" on 08-08c was correct all along — I replaced a right number with a wrongly-labelled one.**

---

## 1 · The route — agreed, and three additions

**The shape is right and the reasoning behind it is right.** A bounded session that clones, runs and reports and never commits is the correct answer to two sessions writing one repo. Least privilege on one Drive folder is correct. Three steps each cheap to abandon is correct.

**And the second step is the one carrying the value.** The mechanical room is the only room whose right answer is already known, so it is the only room that can be **graded** rather than merely read. Every other room produces output nobody can score. If only one step ever runs, it should be that one.

### Three things the route needs that it did not have

**a · Two of the steps were not expressible in code.**

*The mechanical room alone* had no way to be said. `--limit N` bounds how many calls **drain**, in queue order — it cannot name a room. `queueIdentification` queued every zone, always. **So step two would have run whatever came first and called it the mechanical room.**

Built: `--zone <needle>`, matching zone label or id, filtering the plan and the run through one predicate so the two cannot disagree. Four tests, including the one that matters — **a filter matching nothing queues nothing rather than falling back to everything.** A filter that silently widened would send the interior of seven rooms when one was asked for.

**And there was no import path at all for a directory.** The only route in was HTTP, which wants zips. `runImport` has always accepted `mediaDir` — an already-extracted tree — and nothing reached it. **For a 529 MB export that is not cosmetic:** the upload route stages a multer copy, extracts it, then moves it, so a half-gigabyte export wants a gigabyte and a half of working disk before the first photograph is looked at. On a container with a fixed disk allowance that is the difference between running and not.

Built: `server/scripts/import-export.ts`. It finds or creates the operator, property and visit — three API calls nobody could make without a running server — then runs the import with `mediaDir` and prints the report. **No new import behaviour.** It is `runImport` with its arguments assembled from a command line.

**b · The spend cap does not work the way the route assumes.**

`HOUSESTEADY_VISIT_SPEND_CAP` defaults to **$5 per visit** and is checked before every call. **But it is checked in dollars, and dollars come from rate variables that default to zero.** With no rates configured, every call costs $0.00, the total never reaches the cap, and **the cap never fires.**

That zero is deliberate elsewhere — an unmeasured cost and a zero cost are different facts, and the run script says "the cost is unknown rather than zero" instead of printing a confident $0.00. **But it means a bounded session bounded by a spend cap is not bounded.** The brief says so in a box. Set the rates, or treat `--zone` and `--limit` as the only real bound.

**c · The reporting channel needs a shape, because prose loses the one thing I need.**

Prose back is right — the alternative is a commit, and that is the fork. **But the object list is the artifact**, and a paraphrase of it is worth much less than a paste of it. The brief asks for the plan table verbatim, the object list as printed, and **the count that matched no class as its own number** — that last is the most valuable figure in the run, because it is a gap in the *frame* rather than a failure of the object, and it is what the review queue and the next content pass are built from.

### One thing the route already had right that I want to underline

**"It never commits" has to include `/docs`.** The natural failure is a runner that writes up its own findings as a file because that seems tidier than pasting. The brief forbids it explicitly.

---

## 2 · The privacy constraint is sharper for this session than for any before it

**The repository is public. The photographs are not — and identification reads labels.**

At least one photograph in the walk is a pressure-test tag carrying **a real street address, a contractor's name, a telephone number, a registration number, a fitter's name and a licence number.** Identification's whole job is to read plates, so **any of those can come back in a model's output and land in a terminal.**

The brief carries three absolute rules: nothing from `/data/` is committed · nothing a model read off a label reaches a commit, a PR or a tracked file · **and the report redacts.** *"Read a pressure-test tag and returned an installer's registration number correctly"* is the finding; the number is not.

**This is the first time this project sends a real house's interior anywhere**, and it is worth saying plainly that the acknowledgement flag is the only thing standing in for §C's disclosure, because nothing in the database records whose house an import is of.

---

## 3 · #87 — `property.well` is 11 **and** 12, and both are item counts

**The register's hypothesis was that one number counts conditions and the other counts items gated.** Measured, that is not it — **there are only two distinct expressions mentioning `property.well` in the whole schedule**, so neither 11 nor 12 can be an expression count.

**Both are item counts. They differ by one item and by the word in the middle:**

| | |
|---|---:|
| items whose `appliesWhen` is **exactly** `property.well` | **11** |
| items whose `appliesWhen` **mentions** `property.well` | **12** |

The twelfth is `any(property.septic, property.well)`.

**So both rows are right and both are ambiguous.** §3's *"densest `property.well` (11)"* is the sole-dependency count. §5's *"gates twelve schedule items"* is the mention count.

### Which one §5 should carry, and it is neither of them unqualified

§5's question is *what must the session-plan import carry first*. That is a question about **what breaks when the flag does not travel** — and the two counts answer it differently:

- **11 items are lost outright.** They apply only when `property.well` is true.
- **The 12th survives**, if `property.septic` is true, because `any(...)` needs only one side.

**Recommended wording:** *"`property.well` is the heaviest flag in the schedule — 11 items depend on it alone, and a 12th shares the dependency with `property.septic`."* That states the risk exactly and cannot be read as two numbers for one thing.

**The same ambiguity is live on `house.sump-pump`**, which §3 records as 6: **6 items key on it alone, 8 mention it.** Rule 13 — the class, not the instance. Every count of this kind needs *alone* or *mentions* in the sentence.

**Full tally, both ways, so the next reader does not have to re-derive it:**

| flag | mentions | alone |
|---|---:|---:|
| `property.well` | 12 | 11 |
| `property.septic` | 5 | 3 |
| `property.generator` | 4 | 3 |
| `property.pool` | 3 | 2 |
| `property.secondary_suite` | 3 | 3 |
| `property.waterfront` | 3 | 1 |
| `property.wood_heat` | 3 | **0** |
| `property.propane` · `property.oil` · `property.flat_roof` · `property.solar` · `property.pre_1990` | 2 each | 0 · 0 · 2 · 2 · 2 |
| `property.ev` · `property.seasonal_vacancy` | 1 each | 1 · 1 |
| `property.gas` | 1 | **0** |

⚑ **Four flags never appear alone — `wood_heat`, `gas`, `oil` and `propane`.** Every item they touch is a compound condition, so **losing one of them degrades a condition rather than removing an item**, which is a quieter failure than a missing row and worth knowing before the import is specified.

---

## 4 · A correction to `CLAUDE.md` §11, and the number I broke was the one I was sent to fix

**On 08-08c you ruled: correct §11, and don't just swap the number — name which artifact each figure describes.** I did that, and inside the fix I changed a correct figure into a wrong one.

**§11 said 123 MB. I replaced it with 117 MB. 123 was right.**

They are the same bytes in different units. The reference export's declared media bytes are **122,700,000-odd** — **122.7 MB decimal, 117.0 MiB.** I computed MiB and wrote **MB**.

**Three independent sources say the repo's unit is decimal MB:**

- `runImport.ts` line 61: `bytes / 1_000_000`, commented *"Decimal MB, matching the manifest's own byte figures and the report screen."* **This is what the import report prints.**
- The **Observed Addendum** — a ratified contract document — says *"123 MB for two rooms — 37 photos averaging 3.3 MB."* 122.7 ÷ 37 = **3.32**. Decimal, and internally consistent.
- The new import script's own output, which now prints **529 MB** for the walk where §11 said 504.

**Corrected, and the unit is now stated in the table rather than assumed:**

| Export | Zones | Media | Declared bytes (decimal MB) |
|---|---:|---:|---:|
| `fixtures/reference/` | 2 | 37 photos | **123 MB** |
| `fixtures/walk-2026-07-31/` | 8 | 157 photos · 4 video · 2 voice | **529 MB** — 508 photo, 19 video, 1 voice |

**The video finding survives unchanged, because it is a ratio:** four videos are still **2.5% of files and 3.7% of bytes**. The per-file figures move with the unit — **4.9 MB each against a 3.2 MB photograph**, where §11 said 4.6 and 3.1.

### What this changes in the register

**Row #75 should not close on the reasoning it carries.** It records *"123 MB was not called wrong — the repo's copy is redacted to the manifest, so the delivered export is not checkable and 123 plausibly counted the container."* **That hypothesis is wrong.** 123 is simply the reference export's own declared media bytes in decimal MB. Nothing about a container, nothing unmeasurable. **I could have checked it and did not** — I derived a number in a different unit and then reasoned about why the old one might also be defensible, which is a worse failure than the arithmetic.

**And it originated one document earlier than §11.** My 08-07 State of Understanding reply says *"the 2026-07-31 walk manifest measures 504.1 MB."* Same error, first instance, and it propagated from there into §11 and into both your files.

*(Rule 13 — swept. `117`, `504`, `485`, `18 video`, `4.6`, `3.1` appear nowhere else in the repo except the 08-08c reply, which is a record of an event and keeps its date and its text. The Observed Addendum and its archived copy both say 123 and were right the whole time.)*

**Your files carry the mis-united figures too** — register §3's `CLAUDE.md` row and roadmap §2 both say 117 and 504. **Those are yours to cut; I have not touched them.**

---

## 5 · What is built in this turn

| | |
|---|---|
| **`server/scripts/import-export.ts`** | Import an export from a directory. New file, no new import behaviour |
| **`--zone <needle>`** on `identify.ts`, and an optional filter on `queueIdentification` | Makes *the mechanical room alone* expressible. **4 tests** |
| **`CLAUDE.md` §11** | Decimal MB, unit stated, 123 and 529 |
| **The runner's brief** | `docs/HouseSteady_Binder-Builder_Runner-Session-Brief_2026-08-08.md` |

**984 tests green, typecheck green.** The import and the plan are now exercised end to end against the walk fixture. **The model call has still never met a photograph** — that is what the runner session is for, and it is the only thing on the map that is genuinely waiting on a machine rather than on code.
