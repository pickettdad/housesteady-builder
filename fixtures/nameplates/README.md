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

`expected.json` holds what a correct reading of each image looks like — including the
entries whose correct reading is "can't read it". A prompt change that alters a ratified
entry produces a reviewable diff and does not ship until the diff is reviewed.

### Shape of an entry

```json
{
  "file": "images/IMG_0029.jpeg",
  "hard": "handwritten model, smudged; the ink has worn",
  "classification": "yes",
  "abstains": false,
  "fields": {
    "make":        "Waterite Inc",
    "model":       "unknown",
    "serial":      "153713",
    "capacity":    "unknown",
    "installDate": "unknown"
  },
  "approved": {
    "serial": "153713"
  }
}
```

`"unknown"` is a **correct** value wherever the image does not legibly show the field.
`abstains: true` means the whole image is expected to come back with nothing entered.

`approved` holds a copy of each ratified value. In the entry above only the serial has
been ratified; everything else is a proposed reading that gates nothing. If someone later
edits `serial` to `153714`, the copy no longer matches and the ratification lapses on its
own.

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

All fifteen images are present, and **none of the ninety values is ratified**. Two
questions are open for the owner, recorded in the `notes` array at the bottom of the file:

- which image is the intended "not a nameplate at all" (proposed: `IMG_0009`), and
- whether any image was meant to be illegible *end to end*. On the reading recorded here
  none is; six have individual fields that genuinely cannot be read, which is a different
  and weaker claim than the one the spec asks the set to make. The two hard photos that
  would close this — something genuinely blurred, and a plate in the dark at a steep
  angle — have not arrived yet.

## Approval is per value, not per set

Each entry carries an `approved` map holding a **copy of every value a human has
ratified**. A value counts as ratified only while that copy still equals the value
beside it — so editing a value lapses its approval automatically, and an approval can
never drift onto something nobody looked at.

This replaces a single set-wide flag, which was not really approval: forty values went
in on one action, and one wrong entry rode in with thirty-nine right ones and became
permanent truth. Per value is slower once and correct afterwards.

**Nothing here is ratified yet.** All ninety values are proposed readings made by
Claude. Unratified differences are reported by the harness but gate nothing.

    npm run golden:approve                     # what is still unratified
    npm run golden:approve -- IMG_0029         # ratify that image's values
    npm run golden:approve -- IMG_0029 serial  # ratify one value
    npm run golden:approve -- --revoke IMG_0029

You look at the photograph and decide; the command copies the value across. Never
hand-transcribe an approval — a mistyped one is a wrong value that has been blessed,
which is the failure this whole design exists to prevent.

**One question has since been settled by the harness itself.** Three `capacity`
values here had been tidied — `4.8 gal` where the plate says `4.8 Gal`. The extraction
prompt asks for a character-for-character copy, so the tidied version was wrong and has
been corrected. Formatting differences are reported in their own column rather than
passing or failing silently, because which side is wrong is a judgement.

## The set grows from real failures

Fifteen images is a start, not the set. Every plate the model gets wrong in production
is a candidate: an acceptance a human had to edit is a photograph where the model read
something the plate does not say, and `goldenCandidates()` finds them.

Nothing is promoted automatically, and nothing should be. A candidate is a photograph
worth looking at again — the approved reading that would make it an entry has to come
from a person, not from the value they happened to type while doing something else.

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
