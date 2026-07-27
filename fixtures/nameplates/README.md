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

## Status

**Images not yet present.** They were attached to the conversation three times and each
time arrived as conversation content without landing on the filesystem, so there was
nothing to copy. See the session notes — the fixture set is pending delivery by a route
that produces actual files (committed through the GitHub web UI is simplest, since this
directory is where they end up regardless).

Nothing here is generated, substituted, or synthesised in the meantime. A synthetic
stand-in for an illegible plate would test the harness and prove nothing about the model,
which is the one thing this directory exists to do.

## Privacy

These are the owner's own equipment in the owner's own house, supplied as fixtures, and
they are committed to the repository — unlike `/data`, which is gitignored and holds real
client houses. Do not add client photographs here.
