# Walk fixture — the pins, parsed

**Date:** 2026-08-04
**Answers:** `Walk-Fixture-Parse-Request` Subject 1, §3a–§3f and §5.
**Source:** `/fixtures/walk-2026-07-31/housesteady-019fb92d-manifest.json`. **Field config v1.11.0** — every count below is against that version and no other.
**Method:** parsed. **No interpretation, no clustering, no normalisation.** Verbatim strings are verbatim.

**17 pins total. 16 live, 1 retired.** Nine component, five freeform, three untyped — the retired one is untyped, so **live: 9 / 5 / 2.**

---

## 0. What the redaction kept, checked rather than assumed

The fixture is redacted, so before counting anything I compared it against the unredacted original in `/data`:

| | |
|---|---|
| Pin `type` blocks — every `kind`, `componentType` and `label` | **identical** |
| Zone `label` and `type` | **identical** |
| Note ids, and every note's character length | **identical** |
| Note **text** | **differs — redacted** |

**So the freeform labels below are the concierge's own words**, not redaction output. That matters because §3b is the half of this request that depends on it.

---

## 3a · Typed pins — 9, across 8 distinct component types

| componentType | n | zone (label / type) |
|---|---:|---|
| `appliance-dishwasher` | 1 | kitchen / kitchen |
| `appliance-dryer` | 1 | mudroom w/ washer / laundry |
| `appliance-range-hood` | 1 | kitchen / kitchen |
| `appliance-refrigerator` | 1 | kitchen / kitchen |
| `furnace` | 1 | mechanical room / utility |
| `receptacle-gfci` | 1 | full bath / bathroom |
| `receptacle-gfci` | 1 | kitchen / kitchen |
| `register` | 1 | full bath / bathroom |
| `sink` | 1 | kitchen / kitchen |

**8 of 62 typed component types fired.** One pin carries `flag: issue` — pin #3, `sink`, kitchen.

---

## 3b · Freeform pins — 5, labels exactly as typed

| label | n | zone (label / type) |
|---|---:|---|
| `Ceiling stains` | 1 | entry / circulation |
| `Floor` | 1 | kitchen / kitchen |
| `Receptacle` | 2 | kitchen / kitchen |
| `Zone notes` | 1 | full bath / bathroom |

**Not clustered and not tidied.** The two `Receptacle` rows are byte-identical strings, so they are one row with n=2 rather than a normalisation — there is no casing or spacing variant in this export to collapse.

---

## 3c · Untyped pins — 3, all in the kitchen

| pin # | zone | media attached | flag | retired |
|---:|---|---:|---|---|
| 7 | kitchen | 3 | `fine` | — |
| 10 | kitchen | 0 | — | **retired 17:53:22** |
| 11 | kitchen | 0 | — | — |

Two live. **Pin 7 carries three photographs and no type** — a thing captured and never classified.

---

## 3d · Where pinning stopped — **visible, and it is a real measurement**

**You named two readings; the first is true.** `pinId` is a UUIDv7, so creation time is in the identifier. **Validated before use:** decoded times were compared against 40 media rows carrying *both* a v7 id and a declared `capturedAt` — **maximum drift 7 milliseconds.** This is measured, not an inferred curve.

| # | created | +min | zone | kind / what |
|---:|---|---:|---|---|
| 1 | 17:19:33 | 0.0 | kitchen | freeform `Receptacle` |
| 2 | 17:19:53 | 0.3 | kitchen | freeform `Receptacle` |
| 3 | 17:22:05 | 2.5 | kitchen | component `sink` |
| 4 | 17:28:10 | 8.6 | kitchen | component `appliance-dishwasher` |
| 5 | 17:34:50 | 15.3 | kitchen | component `receptacle-gfci` |
| 6 | 17:36:20 | 16.8 | kitchen | component `appliance-refrigerator` |
| 7 | 17:37:52 | 18.3 | kitchen | untyped |
| 8 | 17:39:04 | 19.5 | kitchen | component `appliance-range-hood` |
| 9 | 17:45:22 | 25.8 | kitchen | freeform `Floor` |
| 10 | 17:51:17 | 31.7 | kitchen | untyped *(retired 2 min later)* |
| 11 | 17:55:38 | 36.1 | kitchen | untyped |
| 12 | 18:03:20 | 43.8 | full bath | freeform `Zone notes` |
| 13 | 18:09:47 | 50.2 | full bath | component `register` |
| 14 | 18:11:47 | 52.2 | full bath | component `receptacle-gfci` |
| 15 | 18:16:15 | 56.7 | mudroom w/ washer | component `appliance-dryer` |
| 16 | 18:26:16 | 66.7 | entry | freeform `Ceiling stains` |
| 17 | 18:49:18 | 89.8 | mechanical room | component `furnace` |

### The cause is the owner's, and the export cannot see it

**Added 2026-08-04, after the owner read this parse.** His account, in his words:

> *The pinning only happened in the kitchen because that was what I was supposed to be doing and testing. I would have stopped pinning sooner if I wasn't still trying to follow the original inspection process. Capture with next to no pinning is what felt natural. Pretty much after I had made that decision I just coasted through the rest of the inspection trying out the other things that needed to be tested.*

**This is testimony, not measurement — and it changes the reading, not the numbers.** Everything below was and is true. What it means is different:

- **The kitchen is not where pinning "kept up". It is where pinning was the exercise.** A protocol being followed, then a decision being made.
- **The six non-kitchen pins are incidental** — things noticed while other features were being tested — rather than a systematic attempt thinning under load.
- So the pin set is **evidence about the kitchen, deliberately, and close to no evidence about the other seven zones.** That is a stronger caveat than the one this document originally drew, not a weaker one.

**And it makes the kitchen worth more, not less.** It is the one room where someone deliberately tried to type everything they saw. **Three untyped pins and two freeform `Receptacle`s came out of the room where the taxonomy was tried hardest** — which is a better signal about what the taxonomy fails to cover than the same counts spread thinly would be.

**The shape, stated without reading anything into it:**

- Walk span **101 minutes** (17:17:20 → 18:58:00, from media). Pinning span **90 minutes** — so pinning did not stop early in wall-clock terms; **only 13 of 163 photographs (8%) were taken after the last pin.**
- **11 of 17 pins are in the kitchen**, the first zone, inside the first 36 minutes. The remaining 6 are spread across 5 zones over the next 54.
- Zone-by-zone, first photograph against pin count:

| first photo | zone | pins |
|---|---|---:|
| 17:17:20 | kitchen | **11** |
| 17:58:34 | full bath | 3 |
| 18:15:59 | mudroom w/ washer | 1 |
| 18:22:56 | bedroom | **0** |
| 18:25:58 | entry | 1 |
| 18:28:07 | mechanical room | **1** |
| 18:54:42 | front | **0** |

**The single fact this parse most wants read carefully:** the **mechanical room has 59 media rows and one pin.** It is where the densest equipment in the house is, and it is where the taxonomy was least exercised — **because pinning had already been decided against by the time that room was reached**, not because the room defeated it. The photographs are there; nothing has read them.

---

## 3e · Pin notes — **the redaction stripped the text; the structure survived**

**8 notes, all pin-targeted, on 6 pins. Every note id and character count is preserved; every note body is redaction output.**

That is a fact about the fixture, not a gap in the export — and the ids make the real ones findable. **The unredacted original is at `/data/incoming/2026-07-31-walk/manifest-closed.json`, on the owner's machine, and holds the same 8 notes with their real text.**

| note id | on the pin | length |
|---|---|---:|
| `019fb934…` | kitchen — `sink` | 141 |
| `019fb93a…` | kitchen — `sink` | 57 |
| `019fb93e…` | kitchen — `receptacle-gfci` | 37 |
| `019fb945…` | kitchen — `appliance-range-hood` | 43 |
| `019fb958…` | full bath — `Zone notes` | 31 |
| `019fb95b…` | full bath — `Zone notes` | 23 |
| `019fb95f…` | full bath — `register` | **358** |
| `019fb96e…` | entry — `Ceiling stains` | 112 |

**The 358-character note on the bathroom `register` is the longest thing anybody typed on this walk** — worth reading in the original if any note is.

---

## 3f · Zones — 8, three with no pins

| label | type | pins |
|---|---|---:|
| kitchen | `kitchen` | 11 |
| full bath | `bathroom` | 3 |
| mudroom w/ washer | `laundry` | 1 |
| entry | `circulation` | 1 |
| mechanical room | `utility` | 1 |
| **bedroom** | `living-space` | **0** |
| **attic** | `attic` | **0** |
| **front** | `elevation` | **0** |

---

## 5 · Observed Addendum Q1 — **No.** Closed.

Every key present on any of the 17 pins, at config v1.11.0:

```
anchors · chatThreadIds · flag · mediaIds · noteIds · number · pinId · retired · type · zoneId
```

**There is no pin-level `label`.** The label lives at `type.label`, appears on **5 pins — all freeform — and on 0 component pins.**

**So: nine config versions after the reference export, a separate nickname field is still not implemented, and the freeform label is not doing both jobs — it does not exist on typed pins at all.** Q1 closes the second way: **recurring nicknames are not the split signal §7b assumed**, because there is nothing to recur.

---

## What this parse cannot say

Restating your §4 rather than relying on it being remembered: **the fixture is manifest-only, 163 media rows all `file_status: absent`.** This names **what was pinned, never what was photographed.** The mechanical room's 59 photographs are invisible here and that is exactly where §3d says the taxonomy was least exercised — **the two facts compound, and this floor is lower than the pin count alone suggests.**

**And a third thing, which the owner's account adds: intent is not in the export.** A pin count of one in the mechanical room and a pin count of one in the entry look identical here and are not the same fact — one is a room reached after pinning was abandoned, the other a room where a single stain was worth marking. **No parse of this file can tell those apart**, which is why §3d now carries testimony beside the measurement rather than instead of it.

The general form is worth keeping: **the export records what was done, never why**, so any reading of a *pattern* in operator behaviour needs the operator. This one had a live one to ask.

---

**Status:** parse complete. §3a–§3f and §5 answered; §3d resolved to *visible* with the validation behind it.
