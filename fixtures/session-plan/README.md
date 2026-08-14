# The golden session plan

**File:** `session-plan_walk-2026-07-31_v1.json`
**Emitted from:** `fixtures/walk-2026-07-31/` — a real baseline walk, redacted, config v1.11.0
**Regenerate:** `npm run plan-fixture` · `-- --check` diffs and writes nothing
**Contract:** `docs/HouseSteady_Binder-Builder_Session-Plan-v0_Contract_2026-07-31.md`

8 zones · 9 typed pins · 208 carried gaps · 1 warning. Not hand-written — emitted through the real import and audit.

---

## What it is for

**The session plan is described in four places** — this repo's `SessionPlan` interface, the prose contract, the field-side receiver, and the field's copy of the contract — **and nothing bound any of them.** This file is the binding artifact rather than a fifth description.

This repo tests that the emitter still reproduces it byte for byte. The field side commits a copy and tests that its receiver still parses it.

## ⚑ It is a tripwire, not a cross-repo guarantee

Nothing on either side can see, run, or fail the other's build. The whole mechanism is: **a shape change fails the emitting side's own suite first**, which forces a regenerate, and the regenerate is what forces a note to the other side. **That note is a person's.** If nobody sends it, this file does nothing.

What it buys is *when* — a drift fails on the side that drifted, on the day it drifts, naming the key that moved.

## Reading a `false` in `zones[].attributes`

**This is a pre-fix export, so a `false` here is formally ambiguous** — the field app wrote one for every unset attribute at zone creation, with no skip path, so a considered *no* and an untouched control are the same byte. Capture mode has since been fixed (field-side F-20) and now leaves an unset attribute **absent** rather than false.

| Written | A recorded `false` means |
|---|---|
| **Before the fix** — including this file | **Either.** Nothing in the manifest separates them |
| **After the fix** | **A decision.** An unset attribute is absent |

That is a fact about the *era*, read from the field app's source. **It is not a finding about this file.**

> ⚑ **Retracted 2026-08-14.** An earlier version of this section said the walk's bedroom recorded `finished: false, sleeping: false` from toggles nobody touched, and concluded that *"the artifact that proves the emitter works carries decisions that were never made."*
>
> **The file says the opposite.** The bedroom is `finished: true, sleeping: true`. Across all eight zones, **thirty-two values, every one correct about the house**: `sleeping: true` on exactly the bedroom · `has_stairs: true` on exactly the mudroom · `has_mechanicals: true` on exactly the mechanical room · `finished: false` on exactly the entry, mechanical room, attic and exterior.
>
> **This is a carefully walked house, not a screen of defaults.** The claim came from carrying a true observation about the *reference* export's bedroom — which really is three falses — onto this one without opening it. The withdrawal is recorded rather than deleted, because a retraction that leaves no trace is how the original gets repeated.

The format is right and unchanged; the *guarantee* about what a `false` means begins with post-fix exports. `sections.zones.note` in the payload carries the mechanism, and contract **§3b** is the full argument.

## Values that are stand-ins

Minted uuids and wall-clock timestamps are substituted so a regenerate produces a byte-identical file unless the *shape* moved:

| Field | Stand-in |
|---|---|
| `source.propertyId` · `source.binderId` · `property.id` | `00000000-0000-4000-8000-000000000001` |
| `carriedGaps[].sinceVisitId` | `…0002` |
| `source.auditRunId` | `…0003` |
| `source.generatedBy` | `golden-operator` |
| `source.generatedAt` | `2026-08-14T00:00:00.000Z` |
| `carriedGaps[].firstDueImportedAt` | `2026-08-01T00:00:00.000Z` |

Everything else — zone ids, pin ids, item ids, `since` dates — is real, and comes from the manifest.

**Substitution is by value across the whole payload, not by a list of field paths.** A path list only covers the fields somebody remembered. A genuinely new run-dependent value fails the test rather than churning this file; the fix is to extend the substitution in `server/src/plan/goldenFixture.ts`, never to loosen the comparison.

## Four empty arrays, four different reasons

A receiver will see these more often than the populated ones, and `sections` carries a sentence for each because an empty array cannot say which it is:

| | Why |
|---|---|
| `openConcerns` | Typed `never[]`. Increment 5, gated on manifest v4. **Nothing writes to it** |
| `monitorsDue` | No pin carries `monitor` — but **six carry `fine`**, counted and reported as unmet vocabulary, never promoted |
| `comparisonPositionsDue` | The config declares **27** `.unit` items and the mechanism ran. This is a **baseline**: there is no prior visit to compare against. **A second visit populates it; no code change will** |
| `priorUnitPhotographs` | Same reason. It counts a field on `typedPins` and has no array of its own |

## `typedPins[].flag` is not the whole flag record

Each typed pin carries the field's `flag` verbatim — `fine`, `monitor`, `issue`, or anything the field adds next, uninterpreted.

⚑ But `typedPins` is live **typed** pins. **Six live pins on this walk carry `fine` and only three are typed**, so three flags do not appear in this array at all. `sections.typedPins.note` counts them. Contract **§9c**.

## Privacy

Derived entirely from the already-redacted walk export. Every pin label is null, zone labels are room types, the property label is synthetic. No addresses, names, phone numbers, or photographs.
