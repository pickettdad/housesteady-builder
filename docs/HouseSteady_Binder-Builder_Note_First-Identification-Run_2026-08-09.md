# The first identification run — what it found, and what is fixed

**Date:** 2026-08-09 · **Record of an event. This date never moves.**
**Subject:** the 2026-08-09 runner session, the first time real photographs went through identification.
**Method:** every number below re-derived here from the 60 proposals the runner pasted, against `class-frame-v1.json` at source. **Where the runner's or the design session's count differs from mine, mine is shown with its derivation.**

**Headline: `--run` was broken for everyone and only a real call could find it · the duplication problem is bigger than the ceiling and I agree it comes first · and two of the three defects the runner reported were an artefact of reading a brief against the wrong commit.**

---

## 1 · The foreign-key bug — fixed, and the test is a scan because a test was never going to catch it

**`scripts/identify.ts` passed `process.env.HOUSESTEADY_OPERATOR` straight in as `actorId`.** That variable holds a short code or a display name — never an id — and `ai_jobs.actor_id` is a foreign key to `operators(id)`. **The primary entry point could not insert a job.** The fallback `'unknown-operator'` was worse: it can never be a valid id, so the unconfigured path was equally dead.

**984 tests green, typecheck clean, the plan step perfect.** The design session is right that this justifies the exercise on its own.

**Fixed** by resolving through `currentOperator(db).id`, which already reads that variable, refuses the legacy operator and refuses a deactivated one. `OperatorRefused` is caught and printed rather than thrown as a stack trace.

### The test is a doctrine scan, and the first draft of it was wrong in an instructive way

**A type cannot catch this** — `actorId` is a `string` and so is a short code. What separates them is where the string came from, which is a property of the call site.

**My first scan keyed on the presence of an `actorId` variable — which the fix itself introduced.** The original bug passed the environment string inline and declared no such variable, **so that scan would have passed on the very code it was written to catch.** A scan that reads a symptom of the fix is not watching the defect.

**Rewritten, then verified by putting the original bug back.** With `identify.ts` restored to its broken shape the scan fails; with the fix it passes. *Rule 11b, applied to the check rather than to the code.*

**Exempting takes an entry with a reason**, the same inversion `UNATTRIBUTED` uses — `preflight.ts` prints the variable and stores nothing, and that is written down rather than special-cased silently.

---

## 2 · The test-isolation gap — fixed

**Three tests in `operators.test.ts` failed for any developer with `HOUSESTEADY_OPERATOR` exported.** They exercise the *configuration is silent* path, and `currentOperator` reads that variable.

**Fixed** by saving, clearing and restoring it around that block — plus **a new test that sets it and asserts it is read**, so the clearing cannot be deleted without something failing. *Without that, every test in the block would still pass with the fix removed.*

**991 tests green with the variable set and unset.**

---

## 3 · Two of the three reported defects were a commit mismatch, and that is a process finding

**The design session's read is right and it is the more useful framing.** `npm run preflight` missing and `HOUSESTEADY_ANTHROPIC_API_KEY` unread are one fact: **the runner cloned `main` while the branch carrying both was still an open PR.**

**The brief's own standard is that every command was executed before it was written down — and they were, on a commit nobody else had.** The claim was true and useless.

**Adopted: a brief names the commit it was written against, and the runner checks first.** That is now the first box in the brief.

**And a genuinely useful side-effect, which is the design session's catch rather than mine:** the host **did not** strip `ANTHROPIC_API_KEY`. It reached the child process intact. **So the rename was belt-and-braces, not necessary** — the reasoning for preferring our own name still holds (a name nothing else claims cannot be shadowed, and nobody setting it sees a warning that is true of something else), but it was solving a problem that did not exist. **Recorded as such rather than as a fix.**

---

## 4 · The duplication finding — measured, and I agree it comes before the ceiling

**Re-derived from the 60 proposals rather than taken from the report:**

| | |
|---|---:|
| proposals | **60** — 57 mechanical, 3 bedroom |
| matched no class | **23 (38%)** |
| classed proposals, mechanical room | **35** |
| distinct classes among them | **25** |
| **surplus proposals from repeated classes** | **10** |

**Six classes were proposed more than once**, not the five in the report — `water-heater-gas` is the sixth, and it duplicated **inside a single batch**:

| class | times | as |
|---|---:|---|
| `well-pressure-tank` | **4** | Captive air pressure tank · Water pressure tank assembly · Water pressure tank — well system · Well pressure tank |
| `electrical-panel` | 3 | Electrical panel · Electrical panel — service · Electrical service panel |
| `water-softener` | 3 | Water Depot softener system — Platinum · Water softener · Water softener |
| `water-heater-gas` | 2 | Gas water heater · Gas water heater (additional unit) |
| `fuel-tank-propane` | 2 | Propane tank · Propane tank — blue |
| `sediment-filter` | 2 | Sediment filter or water filter cartridge housing · Water filter cartridges |

### The design session's framing is the right one and it is stronger than the runner's

**This is the engine's arithmetic, not a rendering problem.** The frame's premise is *one identified object produces four streams*. Four `well-pressure-tank` proposals are **four maintenance rhythms, four replacement horizons, four sets of owner questions for one pressure tank** — and the capital plan sums them.

**And it compounds register #82.** A well-kept house already shows more findings because confirmed absences moved into the findings stream. Now it also shows one object counted four times. **Two independent inflations of the same number, arriving from different directions.**

**Agreed: fix dedupe before touching 24.** The runner's reason is right and the design session's sharpening is righter — **duplication happened inside single batches, so the ceiling is not the cause.** Raising it to 54 would remove the cross-batch half and leave the rest. `MAX_MEDIA_PER_CALL` stays 24 until a dedupe pass exists, then re-measure.

**Not built.** Where dedupe lives — prompt instruction, post-pass merge, or a confirmation-surface affordance — is a design decision with real consequences for provenance, since merging two proposals has to keep both evidence sets. **That is the design session's to rule.**

### The contradiction validator — real, and weaker than it looks

**The design session's insight is right: a proposal whose class and label contradict each other is checkable without knowing the truth.** I implemented it as *does the proposal's label share a significant word with its own class label in the frame*, and ran it across all 37 classed proposals.

**It catches exactly one — the Vanée.** `hrv-erv` (frame: *Heat recovery ventilator*) labelled *"Water treatment system — Vanee 100H ERV"*.

**And it misses two others I would call wrong**, both because they share a word:

- `sump-discharge` (*Sump discharge line*) labelled **"Water softener discharge tubing"** — shares *discharge*. A softener drain is not a sump discharge.
- `appliance-water-connector` (*Appliance water connector*) labelled **"Water line from pump"** — shares *water*. A well-pump line is not an appliance connector.

**So: one catch in 37, and it misses two of the three cases a human would flag.** Worth having — it is nearly free and it caught the worst one — but **not worth presenting as a safety net.** Reported at its measured strength rather than its promise.

---

## 5 · "Sediment in water tank" is a concern, and the seam is wider than one proposal

**Agreed, and it is the finding I would have missed.** The model observed a condition, had only the object channel, and filed it there. **Identification cannot propose a concern, so a real finding came back wearing the wrong shape.**

**And it is not alone — there are at least three shapes in that no-class pile, not one:**

| what came back | what it actually is |
|---|---|
| *Sediment in water tank* | **a concern** — an observed condition, no object |
| *Riepert Solar Plus water softener salt* · *ResCare water softener cleaner* | **consumables** — the binder has `s9.consumables`, which is a slot, not an object |
| *Cardboard storage boxes* | **contents** — not a thing the house has, a thing in it |

**Three different wrong shapes, all filed as objects, because the object channel is the only one there is.** Naming that now is cheaper than discovering it when a client's binder lists sediment as equipment and a bag of salt as a component.

**⚑ And it changes what the 23 no-class number means.** It is not one figure. Some of those 23 are **frame gaps** — a Stenner pump, a multiport valve, a three-tank filtration system, ductwork, a softener control valve — which is the review queue doing its job. **Others are not objects at all**, and no amount of frame content will ever classify them. **Reporting 23 as a single review-queue number overstates the gap.**

---

## 6 · Two operational things before the remaining seven calls

**The rates never reached the environment, so the cap never armed.** Measured cost was **$0.16** — 121,331 input and 7,380 output tokens at Haiku's rates — and the full walk lands near **$0.40**. `--zone` did the real bounding, exactly as the brief warned it would have to. Worth setting before the remaining seven calls, though the sums say the exposure was never large.

**⚑ And the container is ephemeral, which the runner flagged and nobody has answered.** The database holding the import, 163 media files, 4 generations and 60 unconfirmed objects **dies with that session.** The seven queued calls die with it too — queueing is idempotent within a database, and there will not be that database.

**So a full walk is not "seven more calls."** It is a fresh session repeating the download, the import and all eleven calls — about **$0.40** and the same setup. **Cheap enough that it does not need solving, expensive enough that it should be a decision rather than a surprise.**

---

## 7 · What is fixed here

| | |
|---|---|
| **`identify.ts`** | resolves the operator through the registry. **`--run` works** |
| **`doctrine.test.ts`** | a scan for the class, verified by restoring the original bug |
| **`operators.test.ts`** | owns `HOUSESTEADY_OPERATOR` instead of inheriting it, plus the test that keeps the clearing honest |
| **The brief** | names its commit · three unrecognized words, not four · the fixture is a redacted derivative and says so |

**991 tests green, typecheck green.**

**The engine is no longer specified — it has run.** 60 proposals, 32 carrying a readable nameplate, 11 `unsure` entries across four generations, and 0 confirmed. **Nothing is ratified, which is correct: confirmation is a human's act and the golden set follows this run rather than preceding it.**
