# `/docs/reference` — documents this repo reasons against but does not own

Everything in this folder is **input**. It is written by the business session or the
field track, it governs what the builder is for, and **no Code session edits it** —
a change goes back through the owner and returns as a new dated file.

That is the same rule the manifest contract already carries, applied to the rest of
the documents the builder has to be correct against.

---

## Why the folder exists

Handovers failed twice on documents that had gone stale in the project folder while
the service moved underneath them. The fix runs both directions:

- **The business session keeps its documents current** — and marks what is superseded
  at the top of each, rather than leaving a reader to discover it.
- **This repo holds a copy of the ones it reasons against**, so staleness shows up as
  a diff instead of as a wrong answer three weeks later.

The second half is what this folder is. It is not an archive — it is the set of
documents a Code session is expected to have read.

---

## What is here

| | What it governs |
|---|---|
| `Baseline-Service-Design` | How a house **enters** the service |
| `Baseline-Process` | How the three baseline visits run |
| `Monthly-Service-Design` | What happens **every month after** — the recurring service |
| `Scope` | What the service *is* — promises, boundaries, mechanisms |
| `Scope-Pending-Changes` | Scope amendments staged but not yet cut into a revision |
| `Plan` | Strategy and numbers. Least load-bearing here; kept for the institutional doctrine and the aggregate-as-asset thesis, which is where the future equipment registry attaches |
| `Checklist-Master` | The field checklist library |
| `Component-Types_config` | The field app's component vocabulary — **§1a's independent side** |
| `Brand-Guide` | Voice and visual reference for anything rendered |

---

## Read the banner first

**`Scope v4`, `Plan v4` and `Scope-Pending-Changes` each open with a superseded
banner naming what is still authoritative and what is not.** They predate the
baseline redesign, the concierge role change, and the engine, and they are kept
because each is still the only home of live doctrine — not because they describe
the service as it stands.

Reading past that banner is how a Code session builds against a service that no
longer exists.

---

## Two cautions that have already cost something

**A version here can lag the business session's copy.** `Baseline-Process` is `v2-1`
in this folder and has been cited elsewhere as `v2-2`. Check the version line before
treating a detail as current.

**A question these documents route to a Code session may already be answered in the
repo.** It has happened: the monthly design routed a parse that had been completed
here the day before, and `Monthly-Service-Design` §14 now records that failure
directly. **Search the repo before answering anything marked open.**

---

## What these documents are not

They are not specs. A build spec is a dated document in `/docs` and says what to
build; these say what the service is and what it is for. **Where the two disagree,
`CLAUDE.md` wins on doctrine and the build spec wins on detail** — and either way
the conflict gets flagged rather than resolved quietly.
