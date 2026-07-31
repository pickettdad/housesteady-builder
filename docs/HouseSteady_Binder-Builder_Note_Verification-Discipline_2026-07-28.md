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

## The rules

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

### 4. Never re-derive a boundary the producer already has

*(Added 2026-07-30, after a third and fourth instance.)*

Four now, from one cause:

- **Escaped pipes** in a master table cell — `choice (ball\|gate\|other)`. A naive split
  dropped every such row silently and produced a phantom stale-id report that stood for days.
- **A NUL byte used as a map-key separator**, which collided with the data it separated.
- **A dash inside a composed sentence** — the gap list rendered
  `"Water heater shutoff — water and fuel/power — binding refers to wh.shutoff"`, and the
  screen split it on the dash to group by reason. The **label** contains a dash, so it split
  in half and the item took another item's reason. Splitting on the *last* dash fails too,
  because the reasons contain dashes as well.
- **A section end assumed rather than located**, which miscounted component types by one.

The delimiter framing is too narrow, and rule 1 already covers it. **The sharper form: the
producer knew the parts, composed them into one string, and the consumer tried to
un-compose it.** That is information destruction followed by guessing — and no amount of
care in the guessing recovers what the composition threw away.

**Carry the parts; compose in one place.** It is the same rule as verbatim extraction, which
this repo already ratified for a different reason: normalise at query time, never at write
time, because the write is where the original is lost. A composed sentence is a normalised
value, and re-parsing it is the same mistake wearing different clothes.

The fix is structural rather than careful. `SlotAssessment.missing` carries
`{ what, why? }` and `sentenceOf()` is the one place either becomes prose.

### 5. A fix that removes a symptom has not removed a class

*(Added 2026-07-30.)*

The sentence *"its inputs have not been assessed"* was removed once in Increment 3, when
derived slots gained a fixed-point resolution. It came back in the same increment from a
different direction: a derived slot with no slot-level inputs at all, whose unwired-source
note could not be reached because **§0.5's ordering guarantee ran first.**

**Neither rule was wrong.** The guarantee is correct — a derived slot must return before
any independent emptiness is reachable — and the note is correct. Two correct rules
combined to produce a false sentence, which no test asserted because no test knew to ask.

Only running it showed that. So: after fixing a symptom, ask what *class* it belongs to and
where else that class could surface. And prefer a fix that makes the class unreachable over
one that makes this instance correct.

### 6. Where a missing state would read as a confident answer, add the state

*(Added 2026-07-30.)*

Four instances, all the same shape:

- **typed / stub / undeclared** for a component type — a stub passes a name check and can
  never satisfy a checklist expectation, so two states report it as valid.
- **declared-and-false / never-declared** for a property flag — collapsing them turns every
  vocabulary the builder has not caught up with into a silent *"does not apply"*.
- **verified / unverifiable / unknown-provenance** for a transcribed value — a config
  declaring no capturing item cannot say a value is verified, and two states say it is.
- **superseded / unrecognised** for an answer recorded under a retired item — one says the
  record is malformed, the other says the question moved.

In every case the two-state version reports the unknown case **as the safe one**, which is
exactly backwards: the unknown case is where confident wrongness lives. The third state is
almost never expensive and is almost always where the honesty is.

### 7. A fallback whose input is always present is not a fallback

*(Added 2026-07-31.)*

**It is the only path, and it never announces itself.**

Three instances, and what makes them one rule is that all three produced **fluent,
plausible output that no behavioural test could fail**:

- **`proposed`.** Without the state, an item with a photograph sitting on its pin
  unconfirmed is indistinguishable from an item nobody touched. The report reads *"we did
  not capture this"* about a photograph we are holding — a correct-looking sentence about
  a real item, wrong only in a way you have to already know to look for.
- **The twenty.** Zone scope alone produces the reference export's twenty carried items,
  because the other two scopes happen to be fully answered. A stream two-thirds unbuilt
  passes a total-of-twenty check and stays silent until an export arrives with an
  unanswered component item.
- **The client-facing name.** The composer read each checklist item's `text` as its name,
  with a withholding branch for items that had none. **All 266 items have one**, so the
  branch never ran and the report rendered concierge instructions verbatim — *"Windows
  operated, locked, latched; seal-fog noted — pin defects"*, four of them containing the
  word *issue*, which House Style bans outright.

**The tell is structural, not behavioural, which is why the check is a count.** In each
case there is a branch written for the case where the input is missing, and the input is
never missing — so the branch is dead code that reads as prudence, and the path that
actually runs was never the one anybody reviewed. **Count how often the safe branch
fires.** If it is zero, the safe branch is decoration; if it is everything, the mechanism
is not doing what its name says. Both are invisible until counted.

This is rule 3 pointed at control flow rather than at data: *establish an independent
count before trusting a parse* becomes **establish which branch actually runs before
trusting a design.**

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
