# The brief was written down · proposals become a file · no number was ever used · and what binds here that CLAUDE.md never said

**Date:** 2026-08-12 · **Record of an event. This date never moves.**
**Answers:** four things — the runner brief, the ruling, the contamination question, and the owed audit.
**Method:** every claim checked at source. Where a premise turned out wrong, the correction is stated before the answer that depends on it.

**Headline: the runner brief exists and always did — but it briefs the pass we are deleting, so there is a v2 · proposals are now a portable fixture and the harness runs with the database deleted, proven · no number this harness produced has ever been used, because it has never produced one · and the audit found seven things that bind here and live nowhere a session reads, including one I made worse this week.**

---

## 1 · The runner brief — it was written down

⚑ **Correcting the premise first, because the rest follows from it.** The design session's read was *"nobody wrote it down, so a reclaimed container erased the knowledge."*

**It was written down.** `docs/HouseSteady_Binder-Builder_Runner-Session-Brief_2026-08-08.md`, 444 lines, committed, and it covers exactly the mechanism described: **a bounded runner session with Drive reachable**, the `drive.usercontent.google.com` allowlist problem and its `curl` workaround, the API key variable and why it is `HOUSESTEADY_ANTHROPIC_API_KEY`, preflight, smoke, the import, and eight numbered rules about what a runner must never touch.

**Nothing was lost. What went wrong is narrower and more interesting.**

> ⚑ **The brief is current on everything except what to run.**
>
> It was written **2026-08-08**. **Amendment 11 landed 2026-08-10** and split identification into four passes. So §5 — the step the whole brief builds toward — briefs `npm run identify`, **which is the pass this repo is trying to delete.**
>
> A runner following it today would spend money on the superseded pass and come back with an answer **that cannot be compared to anything**, because pass 3's output carries a lane and stage 4's does not.

**This is §16's failure exactly, in a document rather than in a rule:** *a decision that exists, is correct, and is invisible at the point where it becomes binding has not been made.* **The brief did not go wrong. It went stale, and nothing was built against it, so nothing could notice.**

**Built:** `…Runner-Session-Brief-v2_2026-08-12.md` — the passes, the fixture, the score, and **nothing else**. It points back at v1 for clone, environment, key, preflight, smoke, transfer and import rather than restating them, *because a restatement is the shape that drifts.* v1 keeps its text and gains a superseded banner at the top.

---

## 2 · ⚑ The ruling, built — and proven with the database deleted

**Generating proposals and scoring proposals are separate jobs, and only the first needs photographs, a key or a database.**

```
npm run proposals -- --visit <id> --zone mech      # generate once, in a runner session
npm run score     -- --proposals <fixture.json>    # score forever, on any machine
```

**Run today against a constructed database, then with that database removed:**

| | |
|---|---|
| through the database | 32 correct · 2 key-uncertain · 0 false positives · plate 21 / appearance 11 |
| through the fixture, **database deleted** | **identical, to the digit** |

**And the equivalence is a test, not an observation** — because if a fixture ever scored differently it would be a second measurement wearing the first one's name, and every number taken from one would be uncomparable with every number taken from the other.

**Why this is worth more than the run it unblocks, in one line:** the harness was **broken three ways and invisible** for two days, and every fix needed the expensive half again. *After this, whatever breaks in the harness is fixable by anyone with two files.*

### ⚠ The fixture is a privacy surface, and the scan says so out loud

**A label is a model's words about a photograph, and identification reads plates.** One photograph in the owner's mechanical room carries an address, a contractor's name and phone, a registration number and a fitter's licence number.

**So the fixture writes under `/data` by default** — gitignored — and every write runs a scan for addresses, phone numbers, postal codes, emails, and licence numbers *that name themselves.*

⚑ **The scan is deliberately narrow, and the narrowness is the design.** `TTV049BGC01ARKS` is a model number and a fitter's licence number is indistinguishable from it as a string. **So the licence rule keys on the word, never the shape.** *"Licence 12345"* fires; `Q13734509` standing alone does not — a known hole, taken deliberately, because the version that catches that also flags every serial in the house and **a scan that fires on every mechanical room is a scan nobody reads by the third run.**

**Seventeen strings from the owner's own room record are a test that the scan stays silent on them.** And five known positives are a test that it is not simply inert.

> ⚑ **A clean scan is not permission to commit, and the tool says so on every clean run.** It cannot see a person's name — there is no shape for one — and *a scan that appears to cover names produces a reviewer who stops looking for them.*

**One conflict flagged rather than resolved:** the ruling says *the runner commits the proposals as a fixture*, and v1 §8 says a runner **never commits anything.** v2 keeps §8 — the runner writes the file, reads it, and pastes it back (~10 KB for one room); **committing is the main session's act, after the labels have been read by a human.** If the intent was to relax §8, that is the owner's to say.

---

## 3 · Has any number this harness produced been used to decide anything?

**No. And not because nothing was contaminated — because the harness has never produced a number at all.**

Checked four ways rather than inferred:

| | |
|---|---|
| **Dates** | The harness was built **2026-08-11** (commit `291128d`). The findings it might have contaminated — the invented reverse osmosis, the doubled Vanée, the four pressure tanks, the 23 no-class proposals — are all in `…Note_First-Identification-Run_2026-08-09.md`, **two days earlier** |
| **That note's own method line** | *"every number below re-derived here from the 60 proposals the runner pasted"* — **a manual read of pasted text.** Your inference was right and it is now checked rather than believed |
| **Every document mentioning `score`** | Three. The note that built it, one line in the pass-1 note about wiring plate models *into* it, and yesterday's note. **None quotes an output** |
| **Runnability** | `npm run score` **could not run from the workspace directory at all** until 2026-08-12. The only database that ever held real proposals was in a container that has been reclaimed |

**The limit of that check, stated:** I can see every committed document and the git history. **A runner session could in principle have run it and reported prose that was never written down** — but the harness postdates the last runner session by two days, and the brief that session followed does not mention scoring. *Nothing published is contaminated.*

---

## 4 · ⚑ The owed audit — what binds here and lives nowhere a session reads

**Run as Field Code ran it.** The argument holds identically: **the roadmap and the register are design-session files, and a code session never opens them.**

**Method: grep, not memory.** Every term below returns **zero** occurrences in `CLAUDE.md`: *Amendment 11 · pass 1 · pass 3 · npm run · runner · branch · verification rule · stage · economics · room record · score.*

| What binds | Where it lives | Consequence |
|---|---|---|
| **The verification rules** | `…Note_Verification-Discipline_2026-07-28.md` | The largest gap. They decide how work is checked here and this file never named them |
| **Identification is four passes** | `…Amendment-11_2026-08-10.md` | §9 reads as though identification were one act. It is read → resolve → match → condition |
| **The commands** | each script's header | §13 lists directories. A session wanting to *run* something goes looking |
| **The build sequence and its stages** | `…Note_Build-Sequence_2026-08-11.md` | Work arrives as numbered stages; nothing says the numbering exists |
| **The runner-session arrangement** | the brief | ⚑ **A whole operating mechanism.** A session that does not know it exists concludes that anything needing photographs or money is impossible — *which is very nearly what happened yesterday* |
| **One session, one branch** | the task framing | Two sessions on one branch is the fork this arrangement prevents |
| **Economics is not a code session's to decide** | conversation only | A code session that prices a decision has made a business call it cannot defend |

**And one contradiction, which is worse than an absence:** §14 read as absolute — *nothing from a real house leaves `/data`* — while `fixtures/room-records/` sits committed in the tree. **A fresh session would conclude the repo violates its own doctrine.** The owner ruled on 2026-08-11 that §14 was written about *other people's* houses; that ruling lived in a script header and a note. **It is now in §14, with the client-record carve-out beside it.**

**Landed:** `CLAUDE.md` §14 corrected, and **§16 added — the inverse of §15.** *§15 is doctrine here that nothing implements; §16 is decisions that bind here and live only somewhere else.* **Both are invisible for the same reason: nothing fails on contact.** §16 is pointers only — no row decides anything, each names where the decision actually lives.

### ⚑ And the audit caught me doing it

**I have been citing "rule 18" as though it were a numbered verification rule. The note stops at rule 16.**

*A measurement is validated against known answers before its number is used* is real, load-bearing, and the reason yesterday's harness fixes exist. **The number was mine and I had no business minting it** — it appeared in a merged note and in two test files I wrote this morning, where a future session would go looking for a rule that does not exist. **Rules 17, 19 and 20 are cited nowhere in the repo at all**; they exist only in conversation.

**Fixed by citing the sentence and withdrawing the number**, in the code and in the note where it stands, with the error left visible. ⚑ **Numbering is the owner's.** *A code session that cites a rule number past the end of the file is asserting that a document says something it does not — which is the same failure as arguing from a governing document without opening it, and I have now made it twice.*

---

**1167 tests green** (was 1155), typecheck green. **The mechanical-room run is still blocked here** — no photographs, no key — and v2 is the brief that unblocks it in a session that has both.
