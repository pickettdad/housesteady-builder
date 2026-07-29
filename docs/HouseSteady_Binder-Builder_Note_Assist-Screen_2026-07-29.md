# Note — the assist screen: six decisions worth knowing about

**Date:** 2026-07-29
**Increment:** 2b §7, the last feature piece before the transcription report.
**Everything here is reversible.** None of it is doctrine; all of it is a reading
of doctrine, and a reading can be wrong. Filed so the readings are visible rather
than buried in the code that implements them.

---

## 1. Proposals and accepted values live in different payloads

The pass screen now fetches two things: `GET /api/visits/:id/pass` and
`GET /api/visits/:id/assists`.

**Accepted values are in the pass model.** They arrive as `accept` and `assign`
overlays, resolve through the same `resolveState` as a correction typed by hand,
and land in the same `values` bag. Nothing about rendering one is AI-specific.

**Pending proposals are only in the assist model.** A proposal is not state — it
is a thing a model said, sitting beside the record and not in it.

Spec §2 already forbids rendering a generation as current state without an
accept overlay, and a doctrine scan already stops any file but three from
touching `ai_generations`. This adds the layer above: **`server/src/pass/` may
not import from `server/src/ai/` at all**, enforced by a new scan.

The reasoning is about how the rule would actually break. Nobody is going to
decide to render unsigned proposals. What happens is that someone folds
proposals into `buildPass` to save an HTTP request, and from that moment the
front end is the only thing keeping signed and unsigned values apart. Separate
payloads make the mistake require an import that fails the build.

**Cost:** two requests instead of one, and the front end joins them by pin id.

## 2. One photograph, one signature

A nameplate generation proposes up to five fields. Accepting is **one act over
the whole plate**, not five.

CLAUDE.md §6 says signing means *"I observed this, and this description matches
what I saw."* That is one claim about one plate. Asking for it five times gets a
weaker signature each time.

It is also what the storage requires: `human_decision` is one value per
generation, so the first single-field acceptance would settle the row and the
second would be refused as already decided. `acceptReading` writes every field
while the proposal is still open and settles once.

**The rule for the record is unanimity.** `accepted` means every field went in
exactly as proposed; one corrected character in a serial makes the whole reading
`edited`. "The model got this plate right" has to mean the plate, not four
fifths of it.

A field the concierge leaves alone is simply absent — no overlay, no claim.
Doctrine 4: an explicit unknown is information.

## 3. §9's third guard, and the one deliberate reading of it

> **The suggestion is shown, never pre-filled.** A guess sitting in the input box
> makes acceptance the default and rejection work.

The card obeys this exactly: values are **text, not inputs**. There is no box to
tab past. "Edit first" opens empty boxes with the reading still visible beside
each one.

**The deliberate part:** the editor carries a *"Start from what was read"*
button that fills every box at once.

The guard protects against ratifying a wrong value by inaction. The dangerous
act is Accept-without-reading, and "Edit first" is by construction an act of
reading — the person got there by declining the default. Without the button, a
plate with one wrong character costs five retypes from memory of a thumbnail,
which manufactures a different class of error and pushes people back toward
Accept.

So: nothing starts pre-filled, and adopting the model's text is one explicit
click. **If this is the wrong call, it is one button to delete.**

## 4. Abstention ends in the flag act, not a new mechanism

§7: *"Offer: type it yourself, or carry to the next visit. An abstention that
leads to a carried item is the feature working, not failing."*

- **Type it yourself** writes ordinary `correct` overlays on the pin. No
  generation is cited, and the card says so — these are yours, nothing was read
  off the photograph.
- **Carry it to the next visit** writes the pass's existing `flag` act with the
  reason *"nameplate could not be read — photograph it again next visit"*.

No new table, no new kind. Carrying lands where every other *somebody look at
this again* already lands. When Increment 3's gap report exists, it reads flags
and this item appears in it without anything being rewritten.

## 5. A classification is evidence, never a proposal

`nameplate_classify` writes an `ai_generations` row whose `human_decision` stays
`pending` forever, because nobody accepts a classification — it is the gate that
decided whether extraction ran.

So the screen indexes classifications and renders them **beside** the extraction
they gated, never in the proposal list. Putting one in front of a person as
something to accept would be a question with no answer.

Photographs classified as *not a plate* get their own quiet list: **"N
photographs on pins were looked at and not read"**, each with the reason. §11
requires the non-nameplate to be "not extracted at all"; a row saying so is how
that becomes provable, because an absent job and a job that decided not to run
look identical from outside.

## 6. Skipped work now says why — found by running it, not by reasoning about it

Running the whole flow against the real reference export:

```
queued: 34   (5 nameplate · 28 routing · 1 pin type)
drained: 36 ran, 0 failed
  7 done
 32 skipped:
     28 × photo_routing      — the photograph is not on this machine (absent)
      3 × nameplate_extract  — classified as not a nameplate
      1 × pin_type           — nothing was captured for this pin
```

The screen said **"32 needed nothing"** and stopped. That reads as a feature
working quietly. What it actually is, in the 28-photograph case, is **a media
import worth chasing** — the reference archives only cover two rooms, so most
files are absent.

`queueProgress` now returns skip reasons grouped and counted, and the strip
renders them behind a *"32 needed nothing — why"* toggle. Doctrine 6 was already
satisfied at the row level: every skip wrote its reason. It was not satisfied at
the screen, and only running it on real data showed the difference.

**The generalisable bit:** a reason written to a row that no screen reads is a
reason nobody has. Doctrine 6 is not discharged by storing the explanation.

---

## What this does not do

- **No transcription.** §6 is next: investigate providers and report options with
  trade-offs. Audio leaving the machine needs its own recorded decision.
- **No routing on real photographs yet.** Every routing job on the reference
  export skips for want of files, so the batch UI has been exercised against
  stubs and unit tests, not against a visit with media.
- **The confidence bar is still `certain`** (`HOUSESTEADY_ROUTING_BAR`), which
  with the current data means routing suggests nothing at all. That is the
  intended starting position — silence is a valid output for the whole task —
  but it means the bar has not yet been tested against evidence.
- **AI Processing Decision §2.3 still binds:** loose-photo routing is authorised
  only once §3's client disclosure is in place. The code exists; running it on a
  real client's visit does not become permitted by that.
