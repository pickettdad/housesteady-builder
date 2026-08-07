# Note — what closing an inspection writes, measured on an A/B pair

**Date:** 2026-08-06
**What this is:** a controlled comparison nobody set out to run. The owner exported the 2026-07-31 walk **before** marking the inspection finished, then closed it and exported again. **Nothing happened between the two exports except the act of closing.**
**Why it is worth a note:** the manifest contract says what a manifest contains and not what *closing* does to one. This measures it, on real evidence, at a moment that cannot be reconstructed later — the two files exist because of an accident.
**Source:** both manifests read from the owner's Drive. `A` = open, `exportedAt 19:01:14.660Z`. `B` = closed, `exportedAt 19:02:42.223Z`, `completedAt 19:02:35.349Z`.

---

## The result: closing is purely additive

**Ten data arrays, byte-identical across the pair.**

`zones` · `pins` · `media` · `notes` · `chats` · `resolutions` · `totals` · `orphanEvents` · `inbox` · `config`

**Two things change, and both only add:**

| | open | closed |
|---|---|---|
| `session.completedAt` | `null` | `2026-07-31T19:02:35.349Z` |
| `session.lifecycle` | `[]` | `[{type: completed, at: …}]` |
| `events` | 271 | **273 — two appended, none removed, none modified** |

**This is doctrine 1 demonstrated rather than assumed.** *The manifest is immutable evidence* has been a rule the builder honours; here is the field app honouring it too, on the one operation most likely to rewrite something. Closing a session touches no captured data at all.

---

## The two events, and the useful one is not the obvious one

**`seq 273 · SessionCompleted`** — the expected one. Actor `human`, and nothing else.

**`seq 272 · ExportProduced`** — the interesting one. **A closed manifest contains a complete record of the export that preceded it**, carrying `manifestSha256` and every file by name and size:

```
housesteady-019fb92d-manifest.json          491,829
housesteady-019fb92d-mechanical-room.zip  177,830,333
housesteady-019fb92d-kitchen.zip          122,120,994
housesteady-019fb92d-full-bath.zip        111,297,024
housesteady-019fb92d-front.zip             55,046,427
housesteady-019fb92d-mudroom-w-washer.zip  49,751,358
housesteady-019fb92d-entry.zip             10,616,100
housesteady-019fb92d-bedroom.zip            1,962,929
```

**So the export log is self-describing.** A manifest that arrives without its media can still say what media was produced alongside it, under what names, at what sizes — which is exactly what an import needs to report *absent* honestly rather than merely counting rows it cannot find.

### The byte counts are media bytes, not archive bytes — and that will cost somebody an hour

**The sizes in `ExportProduced` do not match the files on disk**, and the difference is not corruption.

Measured on `bedroom.zip`, the one small enough to fetch and verify whole:

| | bytes |
|---|---:|
| the `.zip` file as stored | 1,963,225 |
| the single photograph inside it | 1,962,929 |
| **what `ExportProduced` records** | **1,962,929** |

The event records **what was exported**, not **the container it travelled in**. The 296-byte gap is the zip's own entry overhead, and it scales with file count — the mechanical room's 59 files differ by 15,968 bytes, about 271 per entry.

**Anyone reconciling a downloaded archive against this event will find a mismatch and it will look like a truncated transfer.** It is not. Compare the *sum of the media* against the event, or compare the archive against the archive.

---

## Which one to import

**`B`, the closed one.** It is a strict superset — every byte of `A` plus the two events and the two session fields — so nothing is lost by preferring it, and a closed session is the ordinary production case.

**The repo's fixture derives from `B`.** Its `exportedAt` is `19:02:42.223Z`, matching exactly, so the whole existing test suite is already aligned with what a real import of `B` would produce.

**But `A` is not defective and the builder must not treat it as such.** An export taken from an open session is a legitimate artifact — it is what a mid-visit export looks like, and `completedAt: null` with an empty `lifecycle` is its honest state rather than a missing field. The distinction is the same one this repo keeps meeting: **not yet closed and closed are different facts, and neither is an error.**

---

## What this pair cannot tell us

**One session, one close, one app version.** It shows what closing did *here*. It does not establish that closing can never modify captured data — only that this time it did not, on 163 media, 17 pins, 8 zones and 271 prior events.

**That is still worth more than the assumption it replaces**, and it is repeatable: any future export-then-close-then-export produces another pair. Worth doing deliberately on the next walk, since it costs one extra tap.
