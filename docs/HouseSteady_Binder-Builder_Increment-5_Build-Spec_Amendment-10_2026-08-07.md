# Increment 5 Build Spec — Amendment 10

**Date:** 2026-08-07
**Amends:** §3, the identification pass. Everything else stands.
**Cause:** Builder Code read 54 detail photographs and 4 canvas shots of a real mechanical room and made three errors. **None of the three was missing evidence.** Every one was present and misread, which means *take more photographs* is the wrong fix — and that is worth stating first, because it is the obvious fix.
**There is still no Amendment 7.**

---

## A. The three errors, and they are two failure modes

| | what was available | what was read |
|---|---|---|
| **Sewage ejector lid** | a close-up **and** its nameplate, already read | *an open pit* — and a question built on it |
| **Fire extinguisher** | in a canvas frame from the first batch | nothing |
| **Chlorine injection point** | a shot framed deliberately, in the first batch | *a corner of a room* |

**The first two are placement failures.** The reading did not know where it was, so a wide frame was read for detail it could not carry. **§B fixes those.**

**The third is different in kind.** The shot was framed *on purpose, to show a thing*, and **the purpose lived in the operator's head and nowhere in the file.** §D fixes that, and the fix already shipped.

### A1 · The ejector is the one worth dwelling on, because it cost more than a wrong fact

A forty-pixel dark circle in a wide shot overwrote a nameplate that had already been read properly. **Then a question was built on the error** — *are there two pits, or one photographed twice?*

**A fabricated fact is a liability. A fabricated gap is a liability that costs a site visit**, because it lands in the gap report's third column and sends somebody to check something that does not exist.

**And what caught it was the owner knowing his own basement.** At a client's house nobody in the room contradicts it.

---

## B. What a canvas frame may conclude

**Amendment 2 §A2 already rules that canvas media enters the call as room context, distinguished from the photographs taken within it.** It never said what may be concluded from it.

> **A canvas frame can establish that a thing is there and that two things share a wall. It cannot name a model, read a plate, or assert a state.**
>
> **Where a canvas frame is the only evidence for something, the honest output is *present, not identified*** — which is a gap, and gaps are cheap to raise.

### B1 · Resolution and authority point the same way

> **The finest read of an object is the authoritative one. A canvas read never supersedes a detail read of the same object.**

**This is the rule the ejector broke**, and it broke it because the reading went fine-to-coarse: 54 close-ups first, then the canvas shots, which arrived to a reading already hungry for the structure they could not carry.

**So the order is floorplan → canvas → object and nameplate**, because it is the only order in which the finest read is the last one to touch each object. **That is not tidiness; it is which read gets the final word.**

### B2 · A live defect in the batching, and it produced exactly the symptom

**§3 batches 24 media per call with no guarantee that the zone's canvas media is among them.** A call that pulls 24 nameplates and no room shot **produces a good parts list with no system in it**, which is precisely what the first reading produced.

> **Every identification call for a zone carries that zone's canvas media, and canvas media does not count against the detail budget. Where a zone splits across batches, the canvas rides every batch.**

**Amendment 1 §D1 already requires a split to be recorded and reported.** This adds that a split must not silently drop the context the batching argument rests on.

---

## C. Video — three steps, and the reason is not quality

**Currently excluded: §3 consumes still images and everything else is reported per zone.** That exclusion is correct as a default and wrong as a permanent rule, and the reason is structural rather than about resolution.

> **A still is a member of a set. A frame is a member of a sequence. Following a pipe needs the sequence.**

**The water path in that mechanical room is unanswerable from stills** — three treatment tanks in a row, three valve heads, black poly entering a foundation wall and leaving frame both directions. **Not because the photographs are poor, but because a set cannot express order.**

**In order, and each step earns the next:**

1. **Transcribe.** Cheapest, already authorized under the AI Processing Decision §5, and **it gets the thing all three errors lacked: intent.** A narrated video says *this is where the chlorine injects and it runs from here to there* in one sentence.
2. **Extract frames at a low rate, kept ordered and presented as a sequence.** Not *stills from the video* — **consecutive frames labelled consecutive** is what makes topology readable at all.
3. **Dense extraction only where the transcript names something the stills cannot answer.** **Triggered, never routine.**

### C1 · Step 3 is triggered because the cost is already measured

**Amendment 1 §D measured the mechanical room's 58 photographs at roughly 280,000 image tokens in one call.** A two-minute pan at one frame per second is **120 frames — more than the room, for one video.**

**§8's ceilings are denominated in tokens rather than calls for exactly this reason**, and video is the first input that can breach them without anything looking unusual.

### C2 · One product fact to check rather than assume

**Whether the API accepts video natively is a current-documentation question, not a design one.** If it does, steps 2 and 3 collapse and the frame-extraction pipework never gets built. **Builder Code checks the docs; the design session should not be the source for this.**

---

## D. Intent, and the fix shipped before the failure was demonstrated

**The injection shot failed because a deliberately framed photograph carries no record of why it was framed.** A floorplan tells a reader *where* a frame was taken. **Nothing told it *why*.**

**The capture moment is the only time intent is free.** After that it is reconstructed, and the reading document is what reconstruction looks like when it fails.

**Field Code built this into capture mode: *Use and add note*, present and unobtrusive, on roughly one capture in ten.** The walk export predates it, which is why this export has the failure and the next will not.

> **A capture note travels with its media into the identification call, attached to the frame it describes.**

**The mechanism exists in the manifest and does not reach the call today.** That is the whole of the change — no new capture, no new field, no new event.

---

## E. What this does not fix, said plainly

**More photographs.** All three errors had the evidence in hand. **A pass that misreads what it has does not improve by being given more of it**, and the obvious fix is the wrong one.

**And the human in the loop is not the answer either.** The owner caught the ejector because it is his basement. **At a client's house nobody in the room contradicts the reading**, which is why every rule above is structural rather than a matter of care.

---

**Status:** amendment 10. **§B1 and §B2 are buildable now. §C is sequenced and step 1 is already authorized. §D is a wiring change to an existing field.**
