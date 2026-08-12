# The frame bracket, measured on the footage · the capture-intent seam, built · operating state, schemad

**Date:** 2026-08-11 · **Record of an event. This date never moves.**
**Answers:** the §4.1b frame-bracket measurement on the attached run trace · #132 and #133 built · §4.1c-i operating state as a fourth attested field.
**Method:** ffmpeg locally, no model call, no tokens. 72 frames at 1 fps, 359 at 5 fps, and 44 bracket frames looked at by eye. Every figure derived from the file.

**Headline: the bracket is not symmetric and centring it on the spoken second is the wrong instrument · the useful frames sit entirely on one side of a waypoint and which side changes per waypoint · the pointing hand occludes the subject at the exact moment it marks it · a frame is ~230 image tokens, not 1,591, so the directed-frame case is stronger and the legibility case is weaker than either of us assumed · and a classifier I wrote failed its own validation, so one number I meant to report is not reportable.**

---

## 1 · What the footage is

| | |
|---|---|
| duration | **71.79 s** |
| resolution | **480 × 360**, with a −90° display matrix — **360 × 480 upright** |
| frame rate | 25.34 fps |
| audio | mono AAC, 48 kHz |
| size | 7.69 MB |
| shot | 2026-07-31, the eight-zone walk |

**The run:** the blue Burcam pressure tank and its connections (0–9 s) · following the white line along the wall (9–18 s) · the **WellMate** and the valve above it (18–24 s) · overhead through joists, conduit, the panel and the wire bundle (24–33 s) · the treatment control heads, bypasses and blue PEX manifold (33–48 s) · the electrical panel and the salt bags (48–55 s) · overhead again to the water heaters, ending on the **GSW** (55–72 s).

⚑ **The concierge points with his finger at almost everything he names.** That turns out to be the most important fact in this measurement, and not in the way it first appears.

---

## 2 · What I could not do, said first

**There is no transcript, so I did not extract at *narrated* waypoints.** No transcription runs locally here, and getting one is a model call — which is the step §4.1b just made a requirement of. **So I substituted an instrument from the image side: the moments the camera arrives at a new subject, read off a 1 fps contact sheet.**

**That substitution is not a like-for-like and it changes the result in one direction I can name.** My waypoints are *when the camera got there*. The narration's waypoints are *when he said it*, which lags. **So every offset below is measured from the earlier of the two events, and the real bracket has to be at least as wide as what I report.**

---

## 3 · The camera almost never settles, and that is the ceiling on the bracket

Measured over 359 frames at 5 fps, using frame-to-frame difference as a pan-speed proxy:

| longest stretches where the camera is settled | |
|---|---:|
| 10.4 s | **7.4 s** |
| 68.8 s | 2.8 s |
| 22.0 s | 2.6 s |
| 6.0 s | 2.4 s |
| 1.8 s | 2.0 s |
| 42.4 s | 2.0 s |

**The 7.4-second outlier is the wall-following segment, where the subject is a length of pipe and the camera is tracking it.** Every stretch where the subject is a *thing* runs **1.6 to 2.8 seconds.**

> **So a ±1 s bracket spans two seconds against a typical dwell of two seconds. It is exactly matched and has no margin at all** — half a second of narration lag consumes a quarter of the window.

*Also measured: only 6% of frames fall below 70% of median sharpness, so motion blur is not the limiting factor. The limit is where the camera is pointing, not how steady it is.*

---

## 4 · ⚑ The bracket is one-sided, and which side changes per waypoint

**This is the finding. I extracted ±1.0 s at 5 fps around four arrivals and looked at all 44 frames.**

| waypoint | −1.0 to −0.2 | **0.0** | +0.2 to +1.0 |
|---|---|---|---|
| **19 s · the WellMate** | featureless grey vessel wall, too close to read | **grey wall — nothing** | camera pulls back, **WELLMATE fills the frame** |
| **38 s · the treatment control head** | the head **in context** — three vessels, the manifold, the bank | head in context | blurred extreme close-up of the display, uninformative |
| **50 s · the electrical panel** | the tops of two vessels | panel edge entering | **panel with breakers and the blue riser** |
| **66 s · the GSW heater** | copper and flex overhead | **the hand fills the frame** | hand clearing, tank and label emerging |

**Three things follow and none of them is a recommendation:**

**⚑ First — at the 19 s waypoint the frame at t=0 is a blank grey wall.** A directed extractor taking one frame at the spoken second would have returned nothing at all, at the first waypoint I picked, on the object the whole clip is about. **The useful content is entirely on the + side.**

**⚑ Second — at 38 s the useful content is entirely on the − side**, and it is useful for a different reason: it shows the head *among the things it sits between*, which is exactly what a run trace is for. **Half a second later the same subject is a black plastic rectangle filling the frame.**

**So the bracket is not symmetric and the asymmetry reverses between waypoints.** At an approach the good frames are late; at an arrival-and-close-in the good frames are early.

**⚑ Third, and it is the one I did not expect — the pointing hand occludes the subject at the moment it marks it.** At 66 s the hand covers most of the frame from −0.4 through +0.4. **The gesture that identifies the waypoint is what blocks the view of it**, so the frame at the spoken second is systematically among the *worst* frames in its own bracket rather than the best.

*Observed across the 44 bracket frames and the 72 at 1 fps: a hand is in frame from roughly 21 s onward almost continuously, and it substantially covers the subject at four of the four waypoints for at least 0.4 s.*

---

## 5 · A number I am not reporting, and why

**I wrote a skin-tone classifier to put a percentage on the occlusion, and it does not work.** Validated against twenty frames I had already looked at — ten I confirmed have no hand, ten I confirmed do:

```
no hand:  16% 26% 17% 17% 11%  8% 13% 18% 39% 20%
hand:     13% 24% 18% 21% 25% 23% 29% 31% 16% 39%
```

**Max on no-hand 39%, min on hand 13%. The classes do not separate**, because bare joists, kraft insulation and a beige floor read as skin to it.

**So the 72% figure it produced is withdrawn before it was ever used.** *Rule 16 from the useful direction — the check that saved it was running the classifier against cases whose answer I already knew, and a classifier that cannot fail on a known negative is not a measurement.* The occlusion in §4 is direct observation over a stated sample, which is weaker and true.

---

## 6 · ⚑ The token arithmetic changes, and both ways

**A frame from this clip is 360 × 480 — about 230 image tokens, not 1,591.**

`prepareImage` caps the long edge at 1,568 and a 360 × 480 frame is far under it, so **it goes at native size and there is nothing to downscale.** The 1,591 figure is a *photograph*, which is roughly seven times the pixels.

| | image tokens |
|---|---:|
| one extracted frame, 360 × 480 | **~230** |
| one walk photograph, measured | **1,591** |
| **ratio** | **a frame is ~6.9× cheaper** |

**So §4.1b's table is conservative by a factor of about seven on the video side.** Ten directed frames are ~2,300 image tokens, not 15,910 — **about 2.5% of the mechanical room, not 17%.** On a baseline of eight narrated runs, directed extraction adds roughly **2–3%**, not 16%. Even a wide bracket stays under 10%.

**And the same fact cuts the other way, harder.** **A 360 × 480 frame cannot carry a plate.** Cropped at native resolution and enlarged four times:

- **the white label on the Burcam** — a white rectangle. Not one character resolves.
- **the WELLMATE wordmark** — **legible**, because it is a fascia brand roughly 200 px across a 360 px frame.
- **the treatment control head** — the display is a grey smear.
- **the GSW fascia** — the brand resolves at 70 s; nothing smaller does.

> **A directed frame is a `fascia-brand` surface at best and never a `nameplate` one.** Amendment 11 pass 1 would read *WELLMATE* off this footage and nothing else — **which is the correct amount for what a run trace is for.** A trace answers *what connects to what*, and the plates are already photographed properly beside it.

*This is a property of this clip, not of video. The field app records at 480 × 360; a modern capture would be far larger, and the token figures would move back toward the photograph's.*

---

## 7 · What the measurement says about the pipework, stated as observations

**Not recommendations. Four things I saw:**

1. **A single frame at the spoken second fails at one of the four waypoints outright** and is occluded at a second.
2. **A symmetric bracket wastes about half its frames at every waypoint measured**, and which half is wasted reverses between waypoints.
3. **A ±1 s bracket is the same width as the camera's typical dwell**, so it has no margin for the narration lag it exists to absorb.
4. **The frames are cheap enough that width is not what constrains this** — a nine-frame bracket at 230 tokens each is ~2,070 tokens, about 2% of one room.

⚑ **And Amendment 10 §C step 2 is not retired by this.** The design session's caution is right and this measurement supports it rather than the reverse: **when the useful frames are a contiguous run on one side of a waypoint, a short consecutive sequence is a better description of what to extract than a symmetric window is.** *Retiring the fallback before testing the thing it backs up would have been exactly wrong, and the measurement pointed at the fallback rather than away from it.*

---

## 8 · #132 and #133 — built, and #132 was breaking two things silently

**The seam is real and this repo could not have found it.** `zones[].canvases[]` empty on every Discovery export reads identically to *this zone has no room shot*.

**Two things were silently broken and both are closed:**

| | |
|---|---|
| **Amendment 10 §B2** | canvas frames ride every identification batch as context. **With no canvases, every Discovery batch is contextless** — the exact defect §B2 was written to close, restored through a seam |
| **Amendment 11 pass 1** | drops the canvas because it carries no legible text. **With no canvases, the room shot arrives as a detail photograph** and pass 1 pays to read text off a wide frame of a room |

**Context is now the union — canvas-routed OR `intent: room-shot`.** Not a replacement: a canvas route still exists on visits that have one, and that is a test.

**#133 excludes `run-trace` from zone batching with its reason named**, so it is a row somebody can find rather than a difference between two counts nobody compares.

**And the intent vocabulary fails open, with the same safety property `surface` has:** an unrecognised intent is neither `room-shot` nor `run-trace`, so a new word can **neither claim context authority nor silently remove a photograph from a call.** Also a test.

---

## 9 · §4.1c-i · Operating state — schemad

**Values, source and label exactly as ruled.** `in service · deliberately off · seasonal or standby · abandoned in place · decommissioned but present · unknown`, from the household, `Reported by homeowner`.

### ⚑ It is a table and not a column, and there are three reasons

**The ruling said *field*. I built a log, and the third reason is the one that decides it.**

1. **It attaches to edges too.** Legacy coax and legacy telephone are `abandoned in place` **and they are runs** — and most of what an older house has abandoned is connective. A column on `objects` can never hold those. Edges do not exist yet (#99), so `subject_kind` is present to keep the shape from needing a rebuild.
2. **It has an authority and a date.** An attestation is a record with a who and a when.
3. **It changes, and the moment it changes is the fact.** A breaker deliberately off this year is in service next year. **A column holds the latest and silently discards the transition** — which is the objection this repo already made to a servicer column in #121. *A furnace present until 2027 requires somebody to have recorded the moment, and no field carries a moment.*

**Append-only, enforced by triggers rather than documented** — a state history that can be edited is not a history.

### ⚑ There is no `generation_id`, and the absence is the enforcement

**State is what the household says and no model may propose one.** The way to enforce that is to give a model nowhere to write — **the same move pass 1 makes by having no `label` field.** An instruction is a request; a missing column is a wall. It is a test.

### Two functions, because the ruling's consequences are code and not prose

| | |
|---|---|
| **`suppressesCare`** | the engine must not propose a care package for a tank that heats nothing. **Suppressed, never deleted** — the state can change back, and a house that lost its water heater's plan because somebody flipped a breaker is worse than one carrying it dormant |
| **`blocksOperation`** | the do-not-operate line on the trades brief. **Broader by exactly one value** |

⚑ **`seasonal or standby` suppresses no care and still blocks operation.** *A pool heater in November is off and still needs winterising.* **Off for the season and off for good are different facts, which is why they are different values** — and collapsing them would drop real work silently.

### What is NOT built, by intent

**`explained` for conditions (#110) rides the same pass and conditions do not exist yet** — pass 4 is unbuilt, and a resolution state for a record with no records is a column that drifts. **Recorded here so it is carried rather than rediscovered.**

**Nothing writes an `object_states` row yet.** The desk surface that would is unbuilt. **Said plainly, because a table with a reader and no writer is the declared-and-unconsumed class from the other end** — the difference is that this one's writer is a screen a person uses, not a pass.

---

**1082 tests green, typecheck green.** Pass 2, 3 and 4 remain unbuilt, as do #121's destination columns and #122's image check.
