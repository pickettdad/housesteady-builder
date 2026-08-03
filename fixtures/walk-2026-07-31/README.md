# The first real walk — redacted

**Source:** a real baseline walk of a real house, 2026-07-31, field app 0.5.0, checklist config **v1.11.0**.
**Status:** derived artifact. **The raw exports live on the owner's machine and Drive**, not here — confirmed before this was cut, because a derived artifact should never be the thing that survives its original.

---

## Why it exists

Everything in `/fixtures` before this came from one test-build session with two rooms. **This walk exercises more than all of it combined**, and several things nothing had ever exercised:

| | reference | this walk |
|---|---|---|
| config version | v1.2.1, 266 items | **v1.11.0, 409 items** |
| zones | 2 | **8**, seven types |
| pins | 12, one typed | **17** — 9 component, 5 freeform, 3 typeless, 1 retired |
| `measure` with a value | **never** | **`liv.egress-sill` = `26 in`** |
| `choice` | kind does not exist at v1.2.1 | **`att.access-honesty` = `no access`** |
| video | **never** | **4** |
| voice notes | 2 | 2 |
| `fine` flag | **never** | **6 pins** |
| `ZoneReopened` · `PinRetired` · `ItemReopened` · `MediaDiscarded` | none | 3 · 1 · 1 · 3 |
| zones carrying an audit summary | 2 of 2 | **8 of 8** |

**It found a four-increment-old bug on first contact.** The zone-audit oracle had agreed on every run since Increment 3 — because the reference export has one typed live pin whose five items are all resolved, so the fold it was missing contributed exactly zero. Verification Discipline rule 11.

## What it must keep doing

A change that breaks any of these has changed the fixture's purpose, not just its data:

- **8 of 8 zones agree** with the exported audit summaries, item for item
- **213 items due** — 156 zone, 52 pin, 5 session — and **208 carried gaps** from 5 resolutions
- `evidence.value` reads `26` and `no access`; `evidence.unit` reads `in`
- 157 photos · 4 videos · 2 voice notes · 529 MB, `mediaBytes` unchanged

Pinned in `server/test/walk-fixture.test.ts`.

## What was redacted, and what deliberately was not

**Redacted, by field path and never by content match:**

| Field | Treatment |
|---|---|
| `session.propertyLabel`, `events[].propertyLabel` | replaced — it carried the owner's name |
| `notes[].text`, `events[].text` | replaced with synthetic prose **at the original character length** |
| `resolutions[].resolution.note`, `events[].note`, `events[].resolution.note` | same |
| `zones[].closeNote` | same — **missed on the first cut**, see below |
| `media[].sha256`, `events[].media.sha256`, `events[].manifestSha256` | rehashed from the original, so shape and uniqueness survive and nothing links to a real photograph |

**Same length, and that is not fussiness.** A note whose length changes is a different test — truncation, wrapping and layout all read it.

**One mapping applied everywhere**, so a note in `notes[]` and the same note replayed in `events[]` stay identical. **A fixture whose state and history disagree is a broken fixture**, and `resolutions[]` is state while `events[]` is history.

**Deliberately NOT redacted:**

- **The config snapshot — byte-identical.** It is checklist vocabulary from the Checklist Master, holds no house data, and is the most valuable thing in the file. Two of the original content probes matched *here* — `GFCI`, `range hood` in item text — which is precisely why the redaction works by path.
- **The chat thread — byte-identical.** One user message and one AI reply about mineral scale on a sprayer head. It names nobody, and it is the only captured AI thread that exists anywhere.
- **Zone labels** (`kitchen`, `full bath`, `mudroom w/ washer`, `attic`, `front`) and **freeform pin labels** (`Receptacle`, `Ceiling stains`). Generic vocabulary, and the label-versus-type distinction is a live test.
- **Every uuid.** Identity across visits is the thing this repo is built on; random uuidv7s identify nobody.

## How the redaction was checked

**By shape, not by a list — and the first two attempts show why both alternatives fail.**

Attempt one grepped for **content** and flagged `GFCI` and `range hood` as leaks. Those are in the config's own checklist item text, written for a concierge. Content matching cannot tell a house from a checklist.

Attempt two checked **a list of field paths I had written down** — and missed `zones[].closeNote` entirely, because a check that only inspects keys you already thought of cannot flag the one you did not. Verification Discipline rule 11, inside the redaction's own verification: its discriminating power depended on my memory being complete.

**What holds it now** finds every prose-like string in the file — three or more words, not a uuid, hash, timestamp or lowercase token — and requires each to sit at a path **declared** either redacted or deliberately kept. A new free-text field in a future export fails the test rather than shipping. Negative-tested: planting one fires it.

Alongside that, both documents are walked in lockstep, leaf by leaf:



- every leaf is either byte-identical or sits at a redacted key
- every leaf at a redacted key **did** change
- every replaced string has its original length

**10,235 leaves identical, 362 changed, zero problems** — and 36 prose fields accounted for by shape. Then the real manifest and this one were imported side by side and produced **identical** zone agreement, due counts, gap counts and recorded values.

## The other manifest

The same session was exported **twice** — once with the inspection still open, once after closing. Only the closed one is here. Closing changed exactly two things: `session` gained `completedAt` and a lifecycle entry, and `events` gained `ExportProduced` (which records the *open* export's own files and hash) and `SessionCompleted`. Everything else was byte-identical, so a second fixture would be 493 KB to test two events.

## `photo-dimensions.csv` — 157 rows, measured on the owner's Mac

The redacted manifest carries no media, so nothing here can say how large the
photographs actually are — and that number decides what a vision call costs.
This file is `sips` output over the unzipped originals: `mediaId,width,height`.

**It is not house data.** Pixel dimensions describe a camera, not a home, and
every id in it already appears in the manifest beside it.

The measurement is uniform to a degree worth recording: **every photograph is
4032 on the long edge** — 143 landscape, 14 portrait, zero variation. One device,
one walk. That makes cost per image a constant *on this export only*, which is
precisely why the run record still refuses to derive cost from a photograph
count: a second iPad, a client's phone or a scanned spec sheet breaks it, and the
moment it breaks is the moment nobody is watching.

Its ids are an exact set match with the manifest's 157 `kind: photo` rows —
asserted by a test rather than checked once by hand.
