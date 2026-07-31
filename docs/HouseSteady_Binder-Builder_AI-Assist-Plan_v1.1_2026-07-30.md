# Binder Builder — AI Assist Plan (v1.1)

**Date:** 2026-07-25
**Version:** v1.1 · 2026-07-30 — v1 (2026-07-25) with the supersession banner below. The Increment 3 row is superseded; the rest stands unchanged.
**Why this exists:** the binder builder is where a visit becomes a document. Doing that well by hand is slow; doing it *consistently* by hand across several concierges is impossible. AI assist is the standardization layer. This document specifies where it is used, how it is kept honest, and how it is built.
**Governing doctrine:** `CLAUDE.md` §4 — AI drafts, a human writes. Nothing client-facing is AI-signed. Nothing renders until a human signs it.

> ## ⚠ PARTLY SUPERSEDED — 2026-07-30
>
> **Its Increment 3 row places AI in the audit engine. That is no longer the design.**
>
> Increment 3 §1a made slot binding **deterministic** — the audit reads the config's own declarations (`feedsGapList`, `wm.wide`, `.unit` items, `satisfy: pin`, `attest`) rather than inferring them. Where this document describes AI participating in completeness or binding, **Increment 3's build spec governs.**
>
> **Everything else stands** — the standardization argument, the honesty rules, the quarantine-until-signed mechanic, versioned prompt files, the provenance table, abstention as a valid output, and tiered model usage. Those are the load-bearing half and none of it changed.
>
> **Also decided since:** transcription goes to a cloud vendor with AI key-point extraction (AI Processing Decision §5), and loose-photo routing is authorised only once §3's client disclosure exists.

---

## 1. The strategic point

At one concierge, the binder's voice is whatever David's voice is that day. At five concierges, without intervention, a client in Napanee and a client in Trenton receive documents that read like different companies — different tone, different thoroughness, different judgement about what's worth saying. That is a brand failure and a liability, and it arrives quietly.

**AI assist is not a labour-saving nicety here. It is the mechanism by which many operators produce one service.** The concierge supplies the observation and the accountability; the software supplies the consistency. That division is also exactly what the existing doctrine requires — so the consistency argument and the honesty argument point the same way.

Three properties follow, and they constrain everything below:

1. **The house style lives in versioned prompts, not in people's heads.** Same input, same wording, whoever ran the visit.
2. **Every AI output is provenanced and quarantined.** Model, prompt version, inputs, timestamp — recorded. Nothing reaches a client without a human signature.
3. **The AI must be allowed to decline.** "Unknown stays unknown" means abstention is a valid, expected, prompted-for output — never a failure.

## 2. Where AI assists, by increment

| Increment | Task | Model tier | Output |
|---|---|---|---|
| **2 · Triage** | **Nameplate extraction** — make, model, serial, capacity from a nameplate photo. Explicitly assigned to the builder, deliberately excluded from the field app. | cheap, batch | Structured JSON, per field, with abstention allowed per field |
| 2 | **Loose-photo routing** — 28 of 37 photos in the reference export are owned by a zone with nothing pointing at them. Suggest which pin or slot each belongs to. | cheap, batch | Ranked suggestions, human confirms |
| 2 | **Voice-note transcription and summary** | cheap | Transcript + one-line gist, both stored |
| 2 | **Pin-type suggestion** — typeless pins (two in the reference export) get a proposed component type from their photos and notes | cheap | Suggestion with confidence |
| **3 · Audit** | **Evidence-to-slot binding proposals** — which captured evidence satisfies which binder-schema slot | mid | Proposed bindings, human confirms |
| 3 | **Freeform-vocabulary clustering** — the contract's telemetry requirement, made useful: group recurring freeform labels and nicknames to show where the component library needs a new type | cheap, offline batch | Report to David, not client-facing |
| **4 · Gap report** | **Row wording** — turn a raw gap into the client-facing sentence, in house voice | **strong** | Draft prose, quarantined until signed |
| 4 | **House-style and honesty lint** — banned-word check, overclaim detection, reading level, and the key one: *does this sentence claim more than its evidence supports?* | mid | Flags on the human's own writing too |
| **5+ · Binder** | **Serial decoding → install year**, equipment lifespan bands, replacement cost ranges, recall lookup | mid, some with web search | Structured, with source and abstention |
| 5+ | **Finding synthesis** — group related observations into one management-format finding | **strong** | Draft |
| 5+ | **Condition assessment and capital plan drafting** | **strong** | Draft, heavily human-edited |
| 5+ | **Cross-visit change detection** — what moved between visit one and visit two | mid | Candidate list |

**Never AI:** priorities, the reserve figure, what to tell a client about a safety risk, anything that constitutes advice. Those are the concierge's judgement and the human's signature, per doctrine.

## 3. The consistency machinery

This is the part that makes multi-operator work, and it is mostly not about the model.

**Prompts are versioned config, exactly like the field app's checklist.** They live in `/prompts` as files with an id, a version, and a content hash. Nothing calls a model with an inline string. When a prompt changes, the version changes, and every artifact records which version produced it. **This is the same discipline that makes the field config auditable, applied one level up** — and it is why "why does this binder read differently" is always an answerable question.

**A house-style document is a real artifact,** not a vibe: sentence patterns for findings, the honesty vocabulary (Observed / Measured / Reported / Inferred / Not inspected / Not accessible), banned words from the Scope, reading level, how to write about a risk without alarming and without minimizing. It is a prompt input and it is also the training document for new concierges. One source, two audiences.

**A golden set guards against drift.** A fixed collection of real inputs with approved outputs. Any prompt change runs against it and the differences are reviewed before the change ships. Without this, prompt edits silently change the voice of every binder produced afterward and nobody notices for months. **This is the single highest-value piece of AI infrastructure in the build** and it costs almost nothing to maintain.

**Every generation is a row.** Model, prompt id and version, input references, output, tokens, cost, timestamp, and the human decision that followed — accepted, edited, discarded. That table is simultaneously the provenance record, the cost ledger, and the training data for improving the prompts. It answers "which model wrote this, from what, when, and what did the human do about it."

## 4. API architecture

- **Batch and queue, not chat.** Triage extraction runs across hundreds of photos as a background job with progress, retries, and resumability — not one interactive call at a time. The UI stays responsive; the human triages while extraction fills in behind them.
- **Tiered models, deliberately.** Extraction, classification, and transcription go to the cheap fast tier. Client-facing prose and synthesis go to the strong tier. Never send a nameplate photo to the expensive model out of laziness — at 400–600 photos per baseline that difference is the entire operating cost of the feature.
- **Prompt caching.** The house style, the binder schema, and the config snapshot are large and stable across every call in a session. Structure prompts so the stable part is the prefix and gets cached. At this volume it is the difference between a rounding error and a real bill.
- **Structured output for extraction, prose for drafting.** Extraction asks for JSON with an explicit `unknown` for every field. Drafting asks for prose in house style. Don't mix the two in one call.
- **Abstention is prompted for and rewarded.** Every extraction prompt says plainly: return unknown rather than a plausible guess. A wrong serial number is worse than a blank one, because a blank one gets chased and a wrong one gets believed.
- **Cost visible in the UI.** Per-visit token spend on the import report. Not because it's large, but because a concierge should be able to see it and David should be able to price it.
- **Offline-tolerant.** Every AI feature has a manual path. The builder is fully usable with the API unreachable; assists queue and fill in later. Nothing blocks on a model call.

## 5. Where this lands in the ladder

Increments 1–4 remain as planned; AI enters at Increment 2 and is load-bearing by Increment 4.

- **Increment 1 (now):** no AI logic. One table — `ai_generations` — created empty, so the provenance shape exists before anything writes to it and no migration is needed later.
- **Increment 2:** first real assists — nameplate extraction and photo routing. Deliberately chosen because they are high-volume, low-risk, structured, and cheap. They prove the queue, the provenance table, and the abstention discipline on work where a wrong answer is obvious and harmless.
- **Increment 3:** the binder schema arrives; binding proposals become possible.
- **Increment 4:** the first client-facing AI-drafted words, behind a human signature. The house-style document and the golden set must exist before this ships — that is a gate, not a preference.

## 6. Open questions for later sessions

- Consent and disclosure: clients should know AI assists in preparing their binder. Wording is a Scope matter; the lawyer-pass list already carries data-handling and AI-processing items, and they bind before real client data enters the builder.
- Whether transcripts and photos leave the machine at all, and what that means for the local-first posture. A local model for transcription is plausible; extraction and drafting are not.
- Whether the field app's on-demand chat and the builder's assists should share a prompt library. Probably yes for house style, no for task prompts.

---

**Status:** v1 plan. Pairs with the Design doc's build ladder. Increment 2's spec carries the first implementation.
