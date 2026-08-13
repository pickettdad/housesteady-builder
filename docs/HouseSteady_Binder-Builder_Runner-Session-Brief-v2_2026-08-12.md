# Brief for the runner session, v2 — Amendment 11's passes, and the proposals come home as a file

**Date:** 2026-08-12 · **Live operating document.** *Unlike a note, this one is meant to be corrected — it is executed rather than read.*
**Written by:** Builder Code (the main session), for a bounded runner session with Google Drive reachable and an API key set.
**Supersedes:** `HouseSteady_Binder-Builder_Runner-Session-Brief_2026-08-08.md` **for what to run.** ⚑ **Everything about getting to a runnable state still comes from v1 and is not repeated here** — §1 clone and install, §2 environment and the key, §2a preflight and smoke, §2b the Drive transfer, §3 import, §8 what you must not touch.

> ### ⚑ Why there is a v2 at all
>
> **v1 briefs `npm run identify`, which is the pass this repo is trying to delete.**
>
> v1 was written 2026-08-08. **Amendment 11 landed on 2026-08-10** and split identification into four passes — *read · resolve · match · condition*. A runner following v1 today would spend money running the superseded pass and come back with an answer that **cannot be compared to anything**, because pass 3's output carries a lane and stage 4's does not.
>
> *This is the exact failure the design session named on the field side: a decision that exists, is correct, and is invisible at the point where it becomes binding has not been made.* **v1 was not wrong. It went stale, and nothing could notice.**

---

## 0. Read v1 §0 first — it has not changed

**You are a runner, not a developer. You never commit, never push, never open a pull request, never edit a tracked file.**

**The repository is public. The photographs are not.** At least one photograph in the mechanical room carries a **real street address, a contractor's name, a telephone number, a registration number, a fitter's name and a licence number.** Identification reads plates, so **any of those strings can come back in a model's output and land in your terminal.** Redact when you report — *the fact that the model read a plate correctly is the finding; the plate's contents are not.*

---

## 1 · ⚑ The one thing that is new, and it changes what you are for

**Generating proposals and scoring proposals are separate jobs, and only the first needs photographs, a key or a database.** Ruled by the owner, 2026-08-12.

**So your deliverable is a file, not a verdict.**

| | |
|---|---|
| **Yours** | run the passes against real photographs, write the proposals out, report what happened |
| **Not yours** | deciding whether the score is good. **The harness itself was broken three ways until 2026-08-12 and nobody could tell**, because scoring required everything generating required |

**After you hand back the fixture, the harness is fixable, changeable and re-runnable on any machine with two files** — the fixture and the committed room record. **That is why this run is worth more than its own number:** it is the last time this measurement needs a container with half a gigabyte of somebody's house in it.

---

## 2 · Check the tree before you start — this is a command, not a claim

```bash
ls server/scripts/passes.ts server/scripts/proposals.ts server/scripts/score.ts && \
  grep -q "splitByPass" server/src/engine/score.ts && \
  grep -q "scanForPersonalData" server/src/engine/proposalFixture.ts && \
  grep -q "HOUSESTEADY_ANTHROPIC_API_KEY" server/src/ai/models.ts && echo "TREE OK"
```

**`TREE OK` or stop.** Those five carry everything this brief depends on: the three passes' runner, the fixture writer, the two-pass split, the personal-data scan, and the key variable.

**Why a command rather than a commit hash** — *v1's reasoning, and it earned itself twice already.* A runner once cloned `main` while the branch a brief described was an open PR and reported two defects that were real for them and already fixed here. **A hash tells you the same thing one step later; this tells you before you spend anything.**

Then, as in v1:

```bash
npm run typecheck && npm test          # expect clean, and 1167 tests passing
npm run preflight                      # proves the variables arrived. Free.
npm run smoke                          # proves the key is valid. A few cents.
```

---

## 2a · Environment — v1 §2's block stands, with one change and one caveat

**Set the nine variables exactly as v1 §2 lists them**, with a fresh key created for this run and revoked when it finishes. ⚑ *A key that has appeared in a screenshot, a chat, or a log is already spent — revoke it and mint a new one; do not reason about who saw it.*

### ⚑ The spend cap is `5.00` for this run, not v1's `2.00`

**Ruled by the owner, 2026-08-13.** Where v1 §2 and this line disagree, **this one wins.**

**The reason is the shape of the failure, not the price.** v1's `2.00` was about six times a *measured* single-pass cost. **v2 runs three passes and nobody has measured them** — so the old figure is no longer a margin over a known number, it is a guess wearing one.

> ⚑ **A cap firing mid-run is the expensive outcome, not the safe one.** It leaves some zones read and some not — and **pass 3's gate then correctly refuses to match the unread ones**, so the money is spent, nothing is scoreable, and a clean total needs a re-import.
>
> **A cap set against a number nobody has is protecting against runaway, not against a known price.** `5.00` is sized for the first job only.

### ⚠ The tokenizer note — strong tier only, and not this run

**Sonnet 5 emits roughly 30% more tokens for the same input than the previous generation.** So **a cumulative cap fires about 30% earlier** than an estimate carried over from Sonnet 4.6.

**Irrelevant here** — `npm run passes` defaults to the fast tier and §4's command passes no `--tier`. **Relevant the first time anything goes strong**, which is why it is written down before then rather than after.

---

## 3 · Import — unchanged from v1 §3

```bash
npx tsx server/scripts/import-export.ts \
  --export ~/walk-export --property "Owner's own house" --operator "Runner session"
```

**Take only the mechanical room's zip (~178 MB), not all 529 MB.** Partial transfers are a supported state; absent files are recorded and reported. The import prints the visit id — **every command below needs it.**

⚠ **The media files are MOVED out of `--export`, not copied.** Import from a working copy. And `renameSync` cannot cross filesystems — keep the export and `HOUSESTEADY_DATA` on one mount.

---

## 4 · The passes — this replaces v1 §5 entirely

```bash
npm run passes -- --visit <visitId> --zone mech --run --owner-property
```

**Three passes in order, and the order is enforced inside pass 3 rather than by this command.** Typing the individual commands instead is fine and gets the same refusals; `passes` is the convenience.

| | what it does | costs |
|---|---|---|
| **pass 1 · read** | reads surfaces — nameplate, carton, document — and emits **fields**, never a name | model calls |
| **pass 2 · resolve** | text-only lookup, model number → product. **No photographs.** | model calls, cheap |
| **pass 3 · match** | the known inventory as a scaffold, in **two lanes**: `plate` (matched to a resolved product) and `appearance` (the room enumerated) | model calls |

**`--owner-property` is required and the script refuses without it.** Identification sends *the room*, not a data plate, and that is authorized on the owner's own property only. This visit is his house.

> ### ⚑ Expect pass 3 to refuse a zone, and that is the gate working
>
> **A zone whose pass-1 read has not settled is not queued at all** and comes back in `blocked` with its reason. **Do not route around it by typing `npm run match`** — the same gate is inside the pass, so it will refuse there too. If a zone is blocked, report *which* and *why it says*; that is a finding, not an obstacle.
>
> **Two edges that are correct and look wrong:** a zone with no detail photographs plans no pass-1 call and counts as **complete**, not pending. And a **skipped** read counts as settled while a **failed** one does not.

**Report what pass 3 printed** — it groups its output by lane, and the lane split is the single most informative thing in the run. ⚑ *Plate-derived is close to deterministic; appearance-derived is every one a guess. A run that is all appearance means the scaffold was empty, which is a finding about passes 1 and 2, not about pass 3.*

---

## 5 · ⚑ Write the proposals out — this is the deliverable

```bash
npm run proposals -- --visit <visitId> --zone mech \
  --note "pass 3, fast tier, <date>"
```

**Free, no model call.** It writes `<HOUSESTEADY_DATA>/proposals/<visitId>-mech.json` — the labels, classes, photograph ids, lanes and plate models the harness reads, and nothing else. **No photographs, no paths, no manifest.**

**It runs a personal-data scan on every write and prints what it found.**

> ### ⚠ What the scan is and is not
>
> It looks for **addresses, telephone numbers, postal codes, email addresses, and licence or registration numbers that name themselves.**
>
> ⚑ **A clean scan is not permission to send this anywhere.** It cannot see a person's name — there is no shape for one. And it is **deliberately blind to bare licence numbers**, because they are shaped exactly like the model numbers and serials a mechanical room is full of; a scan that flags `TTV049BGC01ARKS` is a scan nobody reads by the third run.
>
> **So read the labels yourself before the file leaves the machine.** The scan tells you where to look first.

**If the scan reports anything, do not paste the file.** Report the hits by *kind* — *"two address-shaped strings in labels"* — and stop. The main session decides what happens next.

**If it is clean and you have read the labels:** paste the file's contents into your report. **For the mechanical room it is roughly 10 KB** — 34-ish proposals, a few hundred bytes each. *(For the whole walk it would be several times that; if it is too large to paste, say so and report the score instead.)*

---

## 6 · Score it yourself — so the number survives even if the paste does not

```bash
npm run score -- --visit <visitId> --zone mech
```

**Free. The key is already in your clone** at `fixtures/room-records/mechanical-room_2026-08-10.json` — the owner's own mechanical room, 34 confirmed objects, committed by his ruling of 2026-08-11.

**Report the whole output verbatim.** Four things in it matter most:

1. **The per-pass blocks.** If `npm run identify` was never run there will be exactly one. **If there are two, say so** — it means stage 4's output is also in the database and the two are being compared.
2. **The by-lane table.** ⚑ *Which half of pass 3 earned the correct answers.* This is what the whole scaffold argument rests on.
3. **`missed`** — key objects no proposal cites a photograph of. **These are the honest failures**; everything else is a wording disagreement.
4. **False positives** — proposals matching no key object, now printed with their lane.

**And the harness gates nothing.** Exit 0 regardless. *The key is one room in one house, and rule 5 says every disagreement is resolvable in both directions — "the key was wrong" is always an available answer.*

---

## 7 · What to report, in this order

1. ⚑ **ACTUAL SPEND AND TOKEN COUNTS, first and prominently.** `npm run passes` prints `visitSpend`. **This is the most valuable number the run produces** — the real cap gets set from it, and it is **the first real input to job costing this business has.** If rates are unset it prints that the cost is unknown; ⚑ **say that rather than reporting zero.** *Break it down per pass if the output allows.*
2. **`TREE OK`**, and the test count you saw.
3. **What `npm run passes` printed** — per pass: queued, ran, failed, and the blocked list if any.
4. **Pass 3's lane split** — how many plate-derived, how many appearance-derived, how many matched no class.
5. **The scan result**, in full.
6. **The proposals fixture**, pasted, if the scan is clean and you have read the labels.
7. **The score output**, verbatim.
8. **Your own read on whether the scaffold helped.** You are the only person who will see both the scaffold pass 3 was given and the answer it produced. *Did the known inventory look like it did any work, or did the enumeration carry the room?*

---

## 8 · What you must not touch — v1 §8, unchanged

- **No commits, no pushes, no PRs, no branches.** Not even to `/docs`. **This now includes the proposals fixture** — you write it, you read it, you paste it. **You do not commit it.**
- **No edits to tracked files.** If something needs changing to run, **stop and report what and why.**
- **Nothing under `/data/`** leaves the machine except the fixture, and only after §5's scan and your own read.
- **Do not ratify anything.** The passes propose; **none is confirmed and confirming is not yours.**

---

## 9 · What is honestly unknown going in

**No pass of Amendment 11 has ever run against a real photograph.** Passes 1, 2 and 3 are built and tested — 1167 tests — **against fixtures.** The model-call half has never met a nameplate.

**And the scoring harness has never produced a number.** It was built 2026-08-11, and until 2026-08-12 it could not be run the documented way at all. ⚑ *So this run is the first time any of it touches a house, and the first honest expectation is that something breaks.* **That is a good outcome, and it is why the deliverable is a file** — whatever breaks in the harness afterwards is fixable without you.
