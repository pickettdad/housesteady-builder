# Note — extraction is verbatim; normalisation happens at query time

**Date:** 2026-07-27
**Status:** **ratified by the owner 2026-07-30.** *(An earlier line said "during Increment 2b" — the rule is unchanged; the date was wrong.)*
**Binds:** the extraction prompts, the golden set, and the equipment registry when it is built

---

## The decision

**Extraction transcribes exactly what is printed. Nothing normalises a value on the
way in.** `A.O. Smith`, `AO Smith` and `A. O. SMITH` are stored as they appear on
their plates, character for character.

**Grouping them is a query-time concern**, and it belongs to whatever is doing the
grouping — the registry, a report, a search box. Not to extraction, and not to
storage.

## Why, in the terms this repo already uses

This is the same rule as everywhere else here, applied to a new place.

The manifest is stored verbatim and derived shapes are computed from it. The overlay
layer adds a correction as a layer rather than overwriting the value it corrects. The
prompt library hashes the file rather than a tidied version of it. In every case the
captured thing stays exactly as captured, and interpretation happens downstream where
it can be re-done differently without going back to the source.

Normalising at extraction time breaks that in a way that cannot be undone. Once
`A. O. SMITH` has been written into the record as `A.O. Smith`, the plate's actual
text is gone. The next question — *was that plate really printed in caps, or did our
normaliser do that?* — has no answer. And a normaliser is exactly the kind of thing
that gets a rule added to it every few months, silently changing what earlier values
would have become.

There is a sharper version of the same point. Extraction is **transcription of an
image** (§0.3 of the 2b spec) and carries the honesty label that goes with reading.
Deciding that two differently-printed strings name the same manufacturer is an
**inference** — usually a correct and useful one, but a different kind of claim, made
by different evidence. Collapsing them at read time would launder the second into the
first, which is the thing doctrine 2 exists to stop.

## What this means in practice

- **The extraction prompt says "copy values character for character, including spaces
  and punctuation as printed. Do not tidy, normalise, expand abbreviations, or change
  case."** That wording is load-bearing, not stylistic.
- **The golden set compares exactly**, and reports a case-or-spacing difference in its
  own column rather than passing it. This has already caught the approved values
  themselves being tidied — three `capacity` entries said `4.8 gal` where the plate
  says `4.8 Gal`.
- **The registry, when it is built, does the grouping** — and can change its mind about
  how, at any time, because the underlying values never lost anything.

## Where this does not apply

One normalisation happens at extraction and is deliberate: an empty answer, a blank
string and the word `unknown` all become the single sentinel `unknown`. That is not
tidying a value; it is collapsing three spellings of *"there is no value"* so that
nothing downstream has to know about all three. No printed characters are lost,
because there were none.
