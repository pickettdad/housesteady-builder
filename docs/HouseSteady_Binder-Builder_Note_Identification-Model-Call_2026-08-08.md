# The identification pass, model-call half — what was built and what it costs

**Date:** 2026-08-08 · **Record of an event. This date never moves.**
**Builds:** Increment 5 §3's remaining half, plus Amendment 10 §B2 and §D.
**Status:** built, tested, and **not yet run against a photograph** — the repo fixture is manifest-only. The first real run is the owner's, on his own machine.

---

## 1 · What is now there

| | |
|---|---|
| `prompts/identify_objects/v001.md` | The wording. Versioned and content-hashed like every other prompt |
| `server/src/engine/projection.ts` | The class projection — ids and labels, nothing else |
| `server/src/ai/tasks/identify.ts` | Queue, call, normalise, write proposals |
| `server/scripts/identify.ts` | **`npm run identify -- --visit <id>`** — plan for free, then run |
| Tests | **39 new**, in `server/test/identification.test.ts`; the suite is 951 and green |

**The engine half was already built and is unchanged in its decisions** — which media, in what order, how many batches. What it gained is Amendment 10's two corrections, below.

---

## 2 · Amendment 10 §B2 — and the defect was real

**The batching put canvas media in the same 24 places as the detail photographs.** A room with 24 nameplates and two room shots sent 24 media of which two were the room, or — worse — the room shots sorted to the end and fell off into batch two.

Now: **detail photographs count against the ceiling; the zone's canvas frames ride every batch outside it.** Measured on the walk export:

```
mechanical room  1/3   detail 24  context 4
mechanical room  2/3   detail 24  context 4
mechanical room  3/3   detail  6  context 4
```

**Eleven calls over seven zones, 145 detail photographs, 23 canvas sends.**

**One thing this measurement corrected.** Writing the test I assumed some rooms would have no canvas at all. **Every room the walk reached carries one.** So the defect was never a missing canvas — it was the canvas *competing with the details for the same slots*, which is a quieter failure and exactly what produced *a good parts list with no system in it*.

**A canvas-only room now gets a call rather than silence.** The bedroom is one: zero detail photographs, one canvas frame. §B's honest output there is *present, not identified*, which is a gap, and gaps are cheap to raise.

**And the plan says out loud when a call carries no room shot at all** — because a parts list with no room in it looks exactly like a good answer.

---

## 3 · Amendment 10 §D — the capture note now reaches the call

*The mechanism exists in the manifest and does not reach the call today.* It does now, and it is one `LEFT JOIN` on `notes` where `target_kind = 'media'`.

A photograph with a note arrives at the model as:

```
019fb92f-… — note written at capture: "the chlorine injects into the line right here"
```

**The walk export's eight notes all target pins, so this export exercises none of it** — the field app's *Use and add note* shipped after the walk. The join is tested against constructed input and against a note deliberately targeting a pin with a colliding id, because attaching somebody else's sentence to a photograph is worse than attaching none.

---

## 4 · The projection — and the earlier figure was wrong by about five times

**Send the projection, not the file** was already the ruling. What changed is the arithmetic, measured from the file rather than estimated:

| | characters | ≈ tokens |
|---|---:|---:|
| whole `class-frame-v1.json` | 217,230 | ~54,000–62,000 |
| **ids and labels only** | **6,107** | **~1,500** |

**The roadmap and my own 08-07 reply carry ~9,600 for the projection. It is nearer 1,500.** The frame is **35× the projection by size**, and the projection costs about a third of one photograph rather than the two it was estimated at. **The case for sending it is stronger than it was written up as.** Rule 6, applied to my own number.

The doctrine reason is unchanged and is still the stronger one: the frame's prose carries rulings aimed at a human, and sending them invites the model to reason about what a thing *needs* — §4's act, with a different honesty label.

---

## 5 · Identification does not run on import, deliberately

**The other three assists are queued automatically when an import completes. This one is not.**

The AI Processing Decision's identification addendum §A: *nameplate extraction sends a data plate; routing sends loose room photographs; **identification sends the room**.* §B authorizes that on the owner's own property; **§C gates a client's property behind a disclosure that does not exist yet**.

**Nothing in this database records whose house an import is of**, so no code can enforce §C. What the code does instead:

- `queueIdentification` is called by the run script and **by nothing in the import path**. Adding it to `queueAssists` would make the largest send this system performs a side effect of dropping in a zip file.
- The script **refuses without `--owner-property`** and prints the addendum's own sentences at the moment somebody decides.

**That is weaker than a constraint and much stronger than a comment**, and it is the most this repo can honestly do until somebody decides where a property's ownership is recorded.

---

## 6 · What an answer becomes

**Proposals in `objects`, with `confirmed_by` and `confirmed_at` null** — which is the whole shape of a proposal. `actor_id` is whoever ran it, a person, never the model. The confirmation surface built in §6 takes them from there, and a confirmation is `confirmed`/`Observed`, verified end to end in the tests.

**Nothing is tidied away:**

| What comes back | What happens |
|---|---|
| A class id the frame does not declare | Object kept with its label, class nulled, **the id reported** |
| Evidence naming a photograph the call never sent | Reference dropped, **the stray reported** |
| An object with no resolvable evidence at all | **Written anyway** — it has no photograph to sit beside, which makes it exactly what a person should see and reject |
| An object with no name | Cannot be stored, so it **becomes an `unsure` line somebody reads** |
| No objects at all | `abstained`, and a complete answer for a hallway of closed doors |

---

## 7 · What has not happened, said plainly

**No photograph has been through this.** The walk export in `/fixtures` is manifest-only — 163 media rows, every one `file_status: absent`. Running the plan against it reports, correctly:

> *157 are recorded and not on this machine. This is a manifest-only import — the rows are here and the bytes are not, so every call would skip with a reason.*

**So the golden set cannot be started here, and should not be.** The roadmap's order is right: run it, then ratify what it got right — authoring ninety values cold is the thing that has no evidence behind it.

**`MAX_MEDIA_PER_CALL` is still 24 and is still a guess.** Amendment 1 §D measured the mechanical room's 58 photographs at roughly 280,000 image tokens in one call. The first real run is what turns that into a decision.

**Video and audio remain excluded and named per zone.** Amendment 10 §C step 1 — transcription — is authorized and not built; steps 2 and 3 stay sequenced behind it.
