# §6 #79 and the seventeen sweep — Builder Code reply

**Date:** 2026-08-08 · **Record of an event. This date never moves.**
**Answers:** the 08-08b register's two rows that name Builder Code as an owner — **#79**, the many-image ceiling, and the *seventeen, not eighteen* correction that the roadmap swept and the register's own #64 did not.
**Method:** the vision documentation re-read at source today, not carried from the 08-07 note. Both fixes are in code with tests.

---

## 1 · #79 is real, and it is worse than the row states

**The row is right that §B2 worsened the ceiling.** What it understates is the failure mode: this is not degraded reading, it is **outright rejection**. Re-read today, unchanged:

> *If a single API request contains more than 20 images, a stricter per-image dimension limit applies. … Images exceeding the stricter limit are **rejected with an `invalid_request_error`** whose message references "many-image requests" and states the current limit in pixels. To stay under the limit on all platforms, either resize each image so that neither dimension exceeds 2000 px, or **keep the request to 20 or fewer image and document blocks**.*

**The documentation gives two mitigations and they are alternatives.** The row reads as though the ceiling must come down. It need not — and it should not.

### Why capping the edge beats dropping the batch

**Dropping the detail budget to keep every call at twenty splits more rooms**, and §3's entire argument for batching by room is that *splitting a room costs accuracy — the model sees part of a room*. The mechanical room already splits three ways at 24; at 20 it splits four. **Capping the long edge costs some fidelity on one axis of one decision. Splitting costs the room.**

**So: when a call carries more than twenty images, the long edge is capped at 2000 px.** The batch size is unchanged, §B2's composition is unchanged, and the documented mitigation is satisfied.

### And the dangerous half of #79 is a configuration trap the row does not name

**`maxImageEdge` defaults to 1568 — already inside the stricter limit — but it is an environment variable.** `HOUSESTEADY_FAST_MAX_IMAGE_EDGE`, and **the reason anybody would raise it is to read nameplates better.**

Raised to the high-resolution tier's 2576, every full room's call **fails outright**, with an error naming a limit nobody had read. **The knob that improves fidelity is the one that breaks the call**, and nothing before today stood between the two. That is now a test.

**What was built** — `edgeForCall(imageCount, modelEdge)` in `ai/image.ts`, applied in the identification task, with the sent edge, the model's limit and the image count recorded on every generation so a poor read is explicable without re-deriving the arithmetic:

| | |
|---|---|
| 20 images, model edge 2576 | **2576** — inside the limit, untouched |
| 21 images, model edge 2576 | **2000** — capped |
| 28 images, model edge 1568 | **1568** — never raised to meet a cap |
| A full mechanical-room batch at 2576 | **2000**, recorded as `{sent: 2000, modelLimit: 2576, imageCount: 28}` |

**Six tests, including the configuration trap end to end.** One of them asserts `MAX_MEDIA_PER_CALL > 20` rather than commenting it — the ceiling is a number somebody will change, and the relationship is what matters.

### What this does not settle

**`MAX_MEDIA_PER_CALL` is still 24 and still a guess.** This removes the rejection risk from that guess; it does not make 24 the right number. The first real run against the walk photographs is what turns it into a decision, and that has still not happened.

**Downsampling now costs something it did not before.** At 2576 the walk's nameplates were going to be read at the high-resolution tier; on a full room they will now be read at 2000. **That is a real trade and it is the one the documentation offers** — but if a plate comes back unread on the first run, this is the first thing to check, not the model.

---

## 2 · The seventeen sweep — one instance was in this repo

**`server/src/audit/triggers.ts` said "eighteen property triggers" in its header comment.** Corrected today. It was the only instance in `/server` or `/web`.

**The comment does not now say seventeen.** It says the count lives in Table A and in `maintenance-schedule-v1.json`, and to read it there. A hand-kept number beside the data it describes is the drift this repo has caught five times — the status block, the `_replaceWholesale` count, the worked-class merge, the actor-trigger list, and now this. **Restating the corrected number would have been the same mistake with a better value in it.**

> ⚑ **The sweep is not complete, and the incomplete part is not mine.** The roadmap corrected §0 and §3.1 to seventeen. **The register's own §6 #64 still reads *"re-answers all eighteen property toggles from memory."*** Rule 13 — a correction is swept across the class, not scoped to the document in front of you — and #64 is in the same file as the row that records the correction.

---

## 3 · What is still open on my side, unchanged

**#27** — the honesty-label steps are unblocked and unbuilt. The reserve figure and `s2.next-review` need a **render gate, not an optional field**; the words are the design session's.

**#25** — the carried Manifest Contract copy is now the only copy of its kind left in `/docs`, since §7 of yesterday's reply removed the rest. Still open.

**#76** — the Checklist Master stayed on a recorded decision and the Brand Guide was swept although it is owner-authored. Both flagged for the owner; neither is mine to take.

**957 tests green.** No photograph has been through identification yet.
