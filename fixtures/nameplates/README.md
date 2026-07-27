# /fixtures/nameplates — the golden set for nameplate reading

Real photographs of the owner's own equipment, supplied deliberately messy. This is the
fixture set that gates every change to the nameplate classification and extraction
prompts (Increment 2b §3, §8).

## Why these images and not clean ones

> A fixture set of clean, square, well-lit plates produces something that appears perfect
> and then confidently invents a serial the first time it meets a real furnace in a dark
> corner. **The abstention path cannot be tested with legible inputs.**
> — Increment 2b spec §8

The hard cases are **acceptance criteria, not extras**. Specifically:

- **The genuinely illegible ones must abstain.** Not "produce a low-confidence guess" —
  abstain, in words, with nothing entered.
- **The non-nameplate must classify as `no`** and never reach extraction at all.
- **No field is ever populated with a plausible guess.** A field the plate does not show,
  or shows too poorly to read, comes back `unknown`.

A run where every field is filled is a **failing** run, not a good one.

## What lives here

```
/fixtures/nameplates/
  images/          the photographs, as supplied
  expected.json    approved outputs, one entry per image
```

`expected.json` is the approved half of the golden set. It is **owner-approved data, not
a guess** — each entry records what a correct reading of that image looks like, including
the entries whose correct reading is "can't read it". The test harness compares against
this file; a prompt change that alters any entry produces a reviewable diff and does not
ship until the diff is reviewed.

### Shape of an entry

```json
{
  "file": "images/<name>.jpg",
  "note": "what makes this one hard, in plain words",
  "classification": "yes | no | unsure",
  "fields": {
    "make":        "Waterite"  | "unknown",
    "model":       "WDBT PC1"  | "unknown",
    "serial":      "153713"    | "unknown",
    "capacity":    "unknown",
    "installDate": "unknown"
  },
  "abstains": true
}
```

`"unknown"` is a **correct** value wherever the image does not legibly show the field.
`abstains: true` means the whole image is expected to come back with nothing entered.

## Orientation — read this before feeding anything to a model

**Twelve of the fifteen are EXIF-rotated.** Orientation `6` on twelve, `3` on
`IMG_0033`, absent on the other two. Photo viewers apply the tag, which is why they look
upright on a phone; reading the raw bytes does not, which is why they arrive sideways.

Anything that hands these to a model must normalise orientation first — `sharp().rotate()`
with no argument applies the EXIF tag, which is already how `pass/thumbs.ts` does it. Skip
it and a legibility test quietly becomes a test of reading upside-down text, and every
abstention in `expected.json` becomes meaningless because the failure had nothing to do
with the plate.

## Status

All fifteen images are present. `expected.json` is written but **`approved: false`** — the
readings are proposed, not ratified. Three questions are open for the owner and they are
listed in the `notes` array at the bottom of that file. The two that matter:

- which image is the intended "not a nameplate at all" (proposed: `IMG_0009`), and
- whether any image was meant to be illegible *end to end*. On the reading recorded here
  none is; six have individual fields that genuinely cannot be read, which is a different
  and weaker claim than the one the spec asks the set to make.

Until those are settled the golden set can be run, but a difference against it is not yet
evidence of a regression — the harness enforces this rather than relying on anyone
remembering it: with `approved: false`, a run cannot report itself clean even when
nothing differs, and it says so in capitals.

**A third question has since been settled by the harness itself.** Three `capacity`
values here had been tidied — `4.8 gal` where the plate says `4.8 Gal`. The extraction
prompt asks for a character-for-character copy, so the tidied version was wrong and has
been corrected. Formatting differences are reported in their own column rather than
passing or failing silently, because which side is wrong is a judgement.

## Running it

    npm run golden --workspace @housesteady/server
    npm run golden --workspace @housesteady/server -- --version v001

Deliberately not part of `npm test`: the suite has to run with no API key and no network,
so it exercises the comparison logic with a stubbed model and this command is the one
that spends money.

## Privacy

These are the owner's own equipment in the owner's own house, supplied as fixtures, and
they are committed to the repository — unlike `/data`, which is gitignored and holds real
client houses. Do not add client photographs here.
