# Note — what the API actually accepts as visual input

**Date:** 2026-08-07
**Answers:** Amendment 10 §C2 — *"Whether the API accepts video natively is a
current-documentation question, not a design one. Builder Code checks the docs."*
**Source:** the Claude vision documentation, read 2026-08-07, not recalled.
**Why it is a note and not a line in a reply:** the same page settles §C2, sharpens
§C1's cost estimate from *more than the room* to a measured multiple, and turns up a
threshold that **Increment 5 §3's existing batch size sits on the wrong side of.**

---

## §C2 · No. Video is not a native input, and the reason forecloses the workaround

**The Messages API has no video content block.** Visual input arrives as an `image`
block carrying one of three sources — base64, a URL, or a Files API `file_id` — and
the accepted media types are exactly four:

`image/jpeg` · `image/png` · `image/gif` · `image/webp`

**And the sentence that closes the question:**

> **Animations are unsupported, and only the first frame is used.**

**That is stronger than a missing feature.** GIF is the one animated format the API
accepts, and it is accepted by discarding everything after frame one. So there is no
container — not video, not animation — by which a sequence reaches the model *as a
sequence*.

**Amendment 10 §C stands unchanged.** Steps 2 and 3 do not collapse; the frame
pipework is required if topology is to be read from motion. And §C's ordering is
vindicated rather than merely convenient: **transcription is not a cheaper first step
than frames, it is the only step available today that reads a video at all.**

---

## §C1 · The cost estimate, now measured rather than reasoned

Amendment 10 §C1 put a two-minute pan at 1 fps at *"120 frames — more than the room,
for one video."* The documentation gives the arithmetic exactly.

**An image costs `⌈width / 28⌉ × ⌈height / 28⌉` visual tokens** — 28×28-pixel patches,
not pixels — capped per model tier:

| Tier | Models | Max long edge | Max visual tokens |
|---|---|---|---|
| **High-resolution** | Claude 4.7 and later | 2576 px | **4784** |
| Standard | all others | 1568 px | 1568 |

**So 120 frames at the high-resolution cap is up to 574,080 visual tokens** — against
the mechanical room's measured ~280,000 for 58 photographs. **Roughly twice the room,
for one two-minute video.** §C1's instinct was right and understated.

**But the same table is the mitigation, and it is large.** A frame downsampled to a
1568 px long edge costs at most 1568 tokens instead of 4784 — **a little over 3×
cheaper, on a decision made before upload.** Frames extracted for topology are being
read for *what connects to what*, not for nameplate characters, so the high-resolution
tier is spent on exactly the thing frames are worst at.

> **If §C step 2 is built, extract at reduced resolution deliberately, and record the
> choice.** The same 120 frames land at ~188,000 tokens rather than ~574,000 — below
> the room rather than double it — and the honest reason is that a frame is being
> asked a question a small image can answer.

---

## An unrelated finding that lands on code already written

**The documentation states a threshold at twenty:**

> If a single API request contains more than 20 images, a stricter per-image dimension
> limit applies. … Images exceeding the stricter limit are rejected with an
> `invalid_request_error` whose message references "many-image requests" … To stay
> under the limit on all platforms, either resize each image so that neither dimension
> exceeds 2000 px, or keep the request to 20 or fewer image and document blocks.

**`server/src/engine/identify.ts` sets `MAX_MEDIA_PER_CALL = 24`.** That is four over
the line — chosen as a round batch size against nothing, because at the time there was
nothing to choose it against.

**Amendment 10 §B2 widens the gap rather than closing it.** Canvas media rides every
batch and *does not count against the detail budget*, so a full call is 24 detail plus
the zone's canvas frames — comfortably over 20, and the excess grows with the number
of canvas shots a zone has.

**Three ways out, and the choice is a design one:**

1. **Drop the detail budget so detail + canvas ≤ 20.** Simplest, costs more calls.
2. **Downsample every image to ≤ 2000 px before sending.** Keeps the batch size and is
   worth doing regardless — 2000 px is above the standard tier's 1568 px cap anyway, so
   for most frames it costs nothing in fidelity.
3. **Both**, which is what a cost-aware pass would do.

**Two further ceilings, for the record.** Maximum **100 images per request** on models
with a 200k-token context window, **600** otherwise; and a **32 MB request size limit**
on standard endpoints. Neither binds at 24 media, but both bind on any future
temptation to send a zone whole. The walk's mechanical room alone is 59 files.

**Reported rather than fixed.** Changing the batch size is a §3 change and §3 is the
design session's to specify — this note is the evidence, not the edit.

---

## What this note does not establish

**One page, read once, on one date.** It settles what the documentation says today
about the first-party Claude API. It does not cover Amazon Bedrock or Google Cloud,
where the vision surface differs (base64 sources only, and document blocks count toward
the twenty-image threshold), and it does not predict what a later model accepts.

**Re-check before building §C step 2**, not because the answer is likely to have
changed, but because the whole reason §C2 was assigned to this side is that a
recalled answer is worth nothing here.
