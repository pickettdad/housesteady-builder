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
  "ratifications": [
    { "key": "serial", "act": "ratify", "value": "153713",
      "by": "david", "at": "2026-07-27T14:02:11.000Z" }
  ]
}
```

`"unknown"` is a **correct** value wherever the image does not legibly show the field.
`abstains: true` means the whole image is expected to come back with nothing entered.

`ratifications` is an append-only log of every act on this entry — each carrying a copy of
the value approved and who approved it. In the entry above only the serial has been
ratified; everything else is a proposed reading that gates nothing. If someone later
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

**Seventeen images, 102 values, none of them ratified.** One question stays open for the
owner — which image is the intended "not a nameplate at all" (proposed: `IMG_0009`).

### The whole-image abstention gap, closed 2026-07-28

Every abstention in the first fifteen was **field-level**: a model number unreadable on an
otherwise readable plate. The **whole-image** path had no fixture at all — classifier says
nameplate, extraction returns nothing, and the screen says *"the plate is there but the
lettering can't be made out."* It was built, unit-tested against a stubbed model, and had
never met a real photograph.

The two photographs that closed it turned out to be **different cases**, which is more
useful than two of the same:

| | What it is | Why it matters |
|---|---|---|
| `20260727_223947.jpg` | Motion-blurred end to end. Plainly a printed label — two barcodes, a certification mark — and not one character resolves at any magnification. | The whole-image abstention proper. `classification: yes`, `abstains: true`. |
| `20260727_223836.jpg` | Dark, at a steep angle, and legible **in part**. The support line reads; the model code is visibly present, begins `43S5`, ends `G-CA`, and the characters between do not resolve. | The more valuable of the two. A plate you can plainly see whose identifying values you cannot read is where invention is most tempting and most damaging. |

A test asserts the set holds at least one of the first kind, and that it is
`classification: yes` rather than a non-nameplate — because a non-nameplate abstains
trivially by never being extracted, and counting that as coverage would let the set claim
a fixture it does not have.

**These two readings are the shakiest in the file.** Both needed enhancement before
anything could be read at all — the fixture is the untouched original, but the reading is
not. Two calls want the owner's eye: whether `TCL` counts as the make when it appears
inside a bilingual support line rather than as a brand field, and whether a television
service label belongs in a house-equipment set. It is a fine legibility fixture either
way; that is a separate question from whether it is representative.

### Privacy — changed by these two

The first fifteen carried **no GPS block at all**. Both new ones carry one, **zeroed** —
longitude 0°0′0″E, no latitude, which is what a phone writes with location services off.
Nothing real is committed.

But the block being present means the next photograph taken with location **on** will
carry coordinates, and a committed fixture with real coordinates publishes the address of
the house it was taken in — in git history, where deleting the file does not remove it.
A doctrine test now walks every committed fixture photograph and refuses one. Transmission
was already safe and separately tested: `prepareImage` strips everything before an image
reaches a model.

## Ratification is an append-only log, per value

Each entry carries a `ratifications` array — every act of ratifying or withdrawing one
value, with a **copy of the value approved**. Whether a value counts as ratified is
computed from the log: the latest act must be a ratify, and its copy must still equal the
value beside it. So editing a value lapses its ratification automatically, and a
ratification can never drift onto something nobody looked at.

**Withdrawing appends; it never deletes.** The same doctrine that governs overlays: an
undo is a superseding record. Every golden run between a ratification and its withdrawal
validated against that value, and binders may have shipped on that basis — erasing the
approval would erase the only evidence that a window of false confidence existed.

This replaces a single set-wide flag, which was not really approval: forty values went
in on one action, and one wrong entry rode in with thirty-nine right ones and became
permanent truth. Per value is slower once and correct afterwards.

Each act records **who made it and when**. Not for blame — for tracing. If
a wrong value is ever ratified, the question that matters next is which review it came
through, so the rest of that sitting can be re-checked. That is not reconstructible
afterwards, so it is recorded now. Ratifying without a ratifier is refused: set
`HOUSESTEADY_RATIFIER` or pass `--by`.

**Nothing here is ratified yet.** All ninety values are proposed readings made by
Claude. Unratified differences are reported by the harness but gate nothing.

### The set completes itself through use

Nothing earns ratification except somebody looking at it, so left alone the unratified
values would sit forever. The trigger is the diff: **any unratified value that produces a
difference is summoned for ratification at that moment**, because either the model changed
its answer or the expectation was wrong and there is no third possibility. The golden run
prints those values with the command to ratify each one, so the set fills in the order the
work actually surfaces rather than in one ninety-value sitting nobody schedules.

`--as` exists for the same reason: at that moment the model may be the one that is right,
and correcting the expectation then ratifying it is one decision, so it is one action.

### Where to start

Not all ninety. In priority order:

1. **The abstentions** — the three unreadable models, the three plates with no serial, and
   the `IMG_0009` classification. This is where a prompt change does the most damage:
   abstention collapse turns declines into invented values, and invented values get
   believed.
2. **The serials.** A serial is the value most likely to regress by a single character and
   the most consequential when it does — it feeds decoding, which feeds install dates,
   which feeds the capital plan. A one-digit drift on an otherwise clean plate is exactly
   the regression that would otherwise pass unnoticed.

That is roughly twenty values. Everything else can wait for the diff that summons it.

### The commands

    export HOUSESTEADY_RATIFIER=david

    npm run golden:approve                     # what is still unratified
    npm run golden:approve -- IMG_0029         # ratify that image's values
    npm run golden:approve -- IMG_0029 serial  # ratify one value
    npm run golden:approve -- IMG_0029 serial --as 153713   # correct, then ratify
    npm run golden:approve -- --revoke IMG_0029

You look at the photograph and decide; the command copies the value across. Never
hand-transcribe an approval — a mistyped one is a wrong value that has been blessed,
which is the failure this whole design exists to prevent.

**One question has since been settled by the harness itself.** Three `capacity`
values here had been tidied — `4.8 gal` where the plate says `4.8 Gal`. The extraction
prompt asks for a character-for-character copy, so the tidied version was wrong and has
been corrected. Formatting differences are reported in their own column rather than
passing or failing silently, because which side is wrong is a judgement.

## One set, not one per concierge

**The golden set is a company artifact.** Concierges will run this against their own
clients' equipment, so *proposing* is distributed — every visit can contribute a
candidate — but *ratifying* is central. It is a role rather than a person: today David,
later whoever holds that review function.

The reason is the same one behind AI assist existing at all. At one concierge the binder
sounds like one person; at five, without intervention, clients receive documents that read
like different companies. A golden set that forked per operator would fragment accuracy
the same way — each fork drifting toward what that operator happens to accept, with no
single answer to "is the model getting better". Ratifications record who made them partly
so that drift is visible before it becomes structural.

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
