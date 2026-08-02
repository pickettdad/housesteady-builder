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
| `resolutions[].resolution.note`, `events[].resolution.note` | same |
| `media[].sha256`, `events[].media.sha256`, `events[].manifestSha256` | rehashed from the original, so shape and uniqueness survive and nothing links to a real photograph |

**Same length, and that is not fussiness.** A note whose length changes is a different test — truncation, wrapping and layout all read it.

**One mapping applied everywhere**, so a note in `notes[]` and the same note replayed in `events[]` stay identical. **A fixture whose state and history disagree is a broken fixture**, and `resolutions[]` is state while `events[]` is history.

**Deliberately NOT redacted:**

- **The config snapshot — byte-identical.** It is checklist vocabulary from the Checklist Master, holds no house data, and is the most valuable thing in the file. Two of the original content probes matched *here* — `GFCI`, `range hood` in item text — which is precisely why the redaction works by path.
- **The chat thread — byte-identical.** One user message and one AI reply about mineral scale on a sprayer head. It names nobody, and it is the only captured AI thread that exists anywhere.
- **Zone labels** (`kitchen`, `full bath`, `mudroom w/ washer`, `attic`, `front`) and **freeform pin labels** (`Receptacle`, `Ceiling stains`). Generic vocabulary, and the label-versus-type distinction is a live test.
- **Every uuid.** Identity across visits is the thing this repo is built on; random uuidv7s identify nobody.

## How the redaction was checked

Not by grepping for words — the first attempt did, and it flagged the config's own checklist text as a leak. Instead, **both documents are walked in lockstep, leaf by leaf**:

- every leaf is either byte-identical or sits at a redacted key
- every leaf at a redacted key **did** change
- every replaced string has its original length

**10,237 leaves identical, 360 changed, zero problems.** Then the real manifest and this one were imported side by side and produced **identical** zone agreement, due counts, gap counts and recorded values.

## The other manifest

The same session was exported **twice** — once with the inspection still open, once after closing. Only the closed one is here. Closing changed exactly two things: `session` gained `completedAt` and a lifecycle entry, and `events` gained `ExportProduced` (which records the *open* export's own files and hash) and `SessionCompleted`. Everything else was byte-identical, so a second fixture would be 493 KB to test two events.
