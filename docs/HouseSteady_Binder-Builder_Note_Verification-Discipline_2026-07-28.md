# Note — verification discipline: how to run a check in this repo

**Date:** 2026-07-28
**Written because** five checks against the Checklist Master produced confident wrong
answers in a single session before producing the right one. None reached a report, but
that was diligence, not design — and diligence does not survive being busy.
**Filed here rather than in the schema findings** because it is not a schema fact. It
applies to any check this repo runs against any document, import or fixture.

---

## Why this repo in particular

Most software fails loudly. The checks in this repo fail *plausibly*.

A parse that slices a markdown table one row too far does not crash — it reports eight
extra retired ids, and every one of them looks exactly like a real defect. A regex that
finds zero property flags does not error — it reports that seventeen declared flags are
undeclared, which reads as a serious finding. The output of a broken check and the output
of a real defect are the same shape, and the shape is *alarming*, which is precisely the
state in which a person stops checking and starts acting.

This matters more here than in most codebases because of what the checks are *for*.
CLAUDE.md §4.6 — never drop anything silently — is enforced by exactly this kind of
check. A gap report, an audit run, §1g.2's stale-binding check: each one's job is to tell
a human that something is wrong. **A check that cries wolf degrades the one thing it
exists to provide.**

---

## The five errors, and their single cause

| # | What the check did | What it reported | Why it was wrong |
|---|---|---|---|
| 1 | Regex for `` `property.x` `` in Table A | **0 flags declared** | Table A writes ids bare, without backticks |
| 2 | Line-range window over Table A | 3 flags missing (`finished`, `has_stairs`, `sleeping`) | The window ran into Table B |
| 3 | Table F slice to end of file | **16** retired ids instead of 8 | No lower boundary |
| 4 | Bindings checked against that slice | `pnl.service` is a **broken binding** | It is not retired at all — error 3, one layer downstream |
| 5 | Section 7 slice past `## 8` | Wrong component-type count | No lower boundary |

Errors 1, 3 and 5 are the same error. Error 2 is its mirror — a boundary guessed at
rather than found. Error 4 is the interesting one: **a broken parse that produced a
finding indistinguishable from a real defect, one step removed from the parse itself.**
Nothing about `pnl.service` looked wrong. The number upstream of it did.

**One cause: a boundary assumed rather than located.**

---

## The three rules

### 1. Locate every boundary; never assume one

A slice of a structured document has two ends and both must be *found in the document*,
not inferred from what is nearby. `## 8` may not exist. A table may end at a blank line,
a new heading, or the file. Backticks may or may not be there.

In practice: find the start marker, find the end marker, assert both were found, and fail
if either was not. A slice that silently runs to end-of-file is the single most productive
source of false findings in this repo's history.

### 2. A check must name the evidence behind its verdict

Not `pnl.service: broken binding`.
But `pnl.service: absent from the import's snapshot, which declares 409 items`.

The second version is checkable by a reader who knows nothing about the parser. When the
denominator is 409, it is a real defect. When the denominator is 16, or 0, the check is
broken and the reader can see it without reading the code.

This is the rule that turns a wrong answer into an obviously wrong answer. **Every one of
the five was caught this way** — by a number being implausible against something already
known: 17 flags, 8 lineage rows, 409 items, 61 types.

Applies directly to §1g.2 when it is built, at the owner's explicit instruction:

> a broken-binding report produced by a broken parse reads exactly like a real defect.
> When you build that check, make it name the evidence — "this id is absent from the
> import's snapshot, which declares N items" — so an implausible result is visible as
> implausible.

### 3. Establish an independent count before trusting a parse

A check needs an anchor it did not compute itself. 17 Table A flags, 8 Table F rows, 409
live items, 61 typed headings — each was known from the document's own prose or from a
prior round, and each caught a parse that disagreed with it.

Where no independent count exists, produce one *by a different method* before reporting.
Two parses that agree are worth far more than one parse that looks right.

---

## Consequences already in the code

**Nothing in the builder parses the Checklist Master at runtime.** It is read-only
reference in `/docs/reference/`, and a doctrine scan asserts that nothing under
`server/src` or `web/src` references it. The runtime path reads `triggerVocabulary`, which
is structured, has one declaration site, and has no boundaries to locate. Every one of
these five errors is impossible against structured data.

**Per-import snapshots, never a hardcoded list.** CLAUDE.md §5 already requires this for
`naReasons`; the same reasoning covers component types and trigger vocabulary. A parse of
a document can be wrong about what exists; an import's own config snapshot cannot.

**Fail open on vocabulary — with three branches, not two.** A component type is *typed*,
*stub* (declared, ids reserved, no items) or *undeclared*. A stub silently passing as
"declared" looks resolved and is not. Recorded in the fourth addendum to the load-check
findings.

---

## The uncomfortable part

I found all five myself, and reported none of them. That is the good outcome and it is
also the fragile one: it depended on noticing that a number felt wrong, which is not a
process. Rules 1–3 exist to make the same catch without depending on the noticing.

The same discipline appears elsewhere in this repo under different names, which is some
evidence it is the right one:

- **the golden set refuses to let a model judge a model** — a judgement needs an
  independent anchor;
- **unratified expectations gate nothing** — a check whose ground truth nobody has
  confirmed does not get to fail a build;
- **abstention is success** — a wrong answer costs more than no answer, because the blank
  gets chased and the wrong one gets believed.

Rule 2 is the same sentence a third time. A check that names its evidence is abstaining
from the part it cannot support.
