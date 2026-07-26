# Note for Increment 3 — the honesty-label mapping is the risk, not the labels

**Date:** 2026-07-26
**Status:** carried requirement for the Binder Schema increment. **Not implemented in Increment 1** — the labels do not exist in the schema yet.
**Governs:** `CLAUDE.md` §4.2 — *Observed, Measured, Reported, Inferred, Not inspected, Not accessible travel from field to binder unchanged. Never launder an inference into an observation.*

---

## Why this moves to Increment 3

Doctrine 2 was previously assumed to land with the binder sections at Increment 5, on the reasoning that the labels are a rendering concern. That is wrong, and the correction matters.

**The risk is not the labels. It is the mapping into them** — and the mapping gets defined the moment the Binder Schema declares where each slot's content comes from. A Reported fact from the intake form, rendering unlabelled, reads as Observed. Nobody has to make a mistake for that to happen; it happens by default, because an unlabelled sentence in a binder reads as something the concierge saw.

Increment 3 is where source mappings are written. That is therefore where the labels must be written, or they are being retrofitted onto a mapping that already exists — which is exactly how the retrofit gets skipped.

## What Increment 3 must carry

**Every schema slot declares the honesty label its source implies.** Not the content — the source. The mapping is a property of where a value came from, not of what it says:

| Source | Implied label |
|---|---|
| A checklist item satisfied `via: check` | **Observed** |
| A resolution `via: measure` with a numeric value | **Measured** |
| The client's intake form | **Reported** |
| A client-supplied document (permit, invoice, prior inspection) | **Reported**, with the document cited |
| A lab result | **Measured**, with the lab cited |
| Research — lifespan bands, serial decoding, replacement cost | **Inferred** |
| An `na` with `no-access` | **Not accessible** |
| An item never resolved | **Not inspected** |

**A slot with no label does not render.** The same gate as the signature: if the schema cannot say where a value came from, the binder cannot claim it. An unlabelled slot is a schema bug, and it should fail loudly at render rather than quietly print.

**A label can never be upgraded by a later step.** Inferred does not become Observed because a human confirmed the wording, and Reported does not become Measured because the number looks plausible. Confirmation records that a human agreed with the *sentence*; it does not change where the fact came from. This is the specific failure doctrine 2 names, and the only structural defence is that the label travels with the value rather than being assigned at render.

**The label is not the same thing as provenance, and both are needed.** Provenance answers *which pin, which document, which lab report*. The honesty label answers *what kind of knowing this is*. A binder can have perfect provenance and still overclaim, if a Reported fact renders in the voice of an observation.

## Test to write at Increment 3

The doctrine test suite currently pins nine rules and **does not pin doctrine 2**, because there is nothing yet to pin. When the schema lands, the missing test is:

> Every slot in the Binder Schema declares an honesty label, and no code path assigns or changes a label anywhere other than at the point the value enters the system.

Written as a source scan, like the others — a behavioural test cannot catch a label being upgraded three steps downstream, and by the time it could, the binder has already said it.

## Related

- The change-detection honesty line already carried in Design v1.1 §B3: comparing two unit photos and reporting *"these differ in this region"* is observation; *"the unit has deteriorated"* is assessment. Same rule, applied to the feature most likely to blur it.
- `CLAUDE.md` §6 — identification, never assessment. The labels are how that distinction survives into a rendered page.
