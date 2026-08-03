# Increment 5 Build Spec — Amendment 2

**Date:** 2026-08-03
**Amends:** the Increment 5 Build Spec and Amendment 1. Everything not listed here stands.
**Cause:** Builder Code found §3's *"a zone's media"* ambiguous between **ownership** and **location**, and correctly refused to decide it — the two readings differ by a third of the walk's media.

---

## A. The ruling — a zone's media is everything that resolves to that zone, by any owner

**Zone-owned, pin-owned via the pin's zone, and canvas-owned all go to the identification pass.**

### A1 · Why, and it is the reverse of what the ownership reading assumes

**The named failure:** *the pass reads only zone-owned media. On this walk the entry contributes nothing at all, and thirty-eight photographs of things the concierge deliberately singled out are invisible to the pass that exists to identify things.*

**A pin is more identification signal, not less.** A concierge who pinned something said *this specific thing matters* — that is a stronger statement about a photograph than the absence of a pin, and filtering it out discards the best evidence in the set first.

**Ownership is a fact about how a photograph was captured, not about whether it depicts something identifiable.** It travels **as evidence, never as a filter.** A pin-owned photograph produces an object that references its pin — strictly more information than a zone-owned one, and §2 already makes objects and pins distinct entities so there is nothing to collide.

**And it does not become a Discovery Visit problem.** Under Baseline Process v2.1 §4.2 there is no pinning in the room, so a true capture-first export is almost entirely zone-owned. **The ambiguity is sharpest on this walk precisely because it ran the old workflow** — but Inspection Visit imports will always carry pins, and the pass has to work on both.

### A2 · Canvas media is context, not a subject

**Included, and marked as such.** A canvas photograph is a wide shot of the room. §3's whole argument for batching by room is that **the model sees the room rather than a series of disconnected frames** — a wide shot is that room, and it is the single most useful frame for placing everything else.

**It is not itself a thing to identify.** So it goes into the call **as room context**, distinguished from the photographs taken within it. A floorplan sketch that produces a proposed object called *"a drawing of a room"* is the failure this distinction avoids.

---

## B. The method matters more than the numbers, and Code's own finding says why

**Code's original per-zone counts were right. The method that produced them was wrong.** It grouped on the export's `group` key, which follows the zone directory — and the manifest's own comment warns that **the path is storage location only, never the source of ownership.**

**The two agree on this export by coincidence**, because the contract stores a pin's media under its zone's directory. **The coincidence breaks exactly where it matters:**

- **A pin with no zone.** The reference export carried four unanchored pins; a pin with no zone has media that resolves to no zone directory
- **Inbox media** — `media/_misc/`, unassigned at export and explicitly never dropped
- **Any future path change**, which would be a storage decision silently changing what a model is shown

**So: resolve the zone from `owner`, never from the path.** Rule 4 — the producer declared ownership explicitly, and re-deriving it from a filename is un-composing something already composed. **Fourth instance in this repo, and the first where the wrong method produced the right answer**, which is the version hardest to catch.

### B1 · Media resolving to no zone is its own bucket

**Not silently dropped, and not folded into `unavailable`.** An orphan-pin photograph and an inbox item are real captures with no room — they are unassigned rather than missing, and they are exactly what a concierge would want surfaced.

**Reported and surfaced to the review queue.** Same treatment as unconsumed kinds: preserve, display, count, mark.

---

## C. Consequences Code named, now resolved

**The entry slice is viable again** — 4 files including a voice note, since pin ownership no longer excludes it. Academic, since media is not going into the container.

**The unconsumed-media report will see the voice notes.** Both are pin-owned; under the ownership reading the report would have said zero, and §C1 expects it to make the transcription case with real numbers. **It now reports two**, which is a small number honestly arrived at rather than a zero that misleads.

**And the per-owner breakdown stays reported regardless.** Code built it so the decision stays visible instead of becoming an assumption. **That survives this ruling** — knowing that 38 of 163 came in via pins is worth seeing on every run, because on a true capture-first export it should be near zero, and a large number means the field workflow is not what the process says it is.

---

## D. Two findings that need no ruling

**The fixture correctly sends nothing**, because it imports manifest-only: 163 rows all `file_status: absent`, so the honest assembly is no calls and 110 photographs unavailable. **That is exactly the state §E's completeness check must refuse a property pass against**, and it is indistinguishable from a house nobody photographed unless something says which. **§E's hardest test case was already sitting in the fixture.**

**The skip-list scan failed its own negative test** — it caught `kind !== 'video'` but not `if (kind === 'video') return`, which is the likelier way a skip actually gets written. **Second instance of §9b catching a scan that would have sat there looking green.**

---

**Status:** amendment 2. The spec and Amendment 1 stand except where corrected above.
