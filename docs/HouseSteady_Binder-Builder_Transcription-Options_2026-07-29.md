# Transcription — the options, and what each one costs you

**Date:** 2026-07-29
**Status:** **a report, not a recommendation.** Increment 2b §6 says *"Code investigates what is actually available and reports options with trade-offs. It does not pick."* This document does not pick.
**Decides nothing.** When you choose, the choice is added to `HouseSteady_Binder-Builder_AI-Processing-Decision_2026-07-27.md` §5, which is currently holding the space open.
**Read alongside:** AI Processing Decision §5 · Backup Decision §2.3 · `CLAUDE.md` §14.

---

## The short version

Four things you should know before reading the rest, because two of them change the shape of the decision rather than just informing it.

1. **Anthropic cannot do this job.** The Claude API takes text, images and documents — **not audio**. So "cloud transcription" is not an extension of the vendor you have already decided about. It is **a second processor**, with its own terms, its own contract, and its own line in §14's record.
2. **Whisper fabricates sentences from silence.** This is documented, reproducible, and it collides directly with something already in this codebase: 2a records memory audio and already detects and flags silent recordings. A silent recording fed to Whisper does not come back empty — it comes back with a plausible sentence the concierge never said, attached to their recollection of a client's house.
3. **Cost is not a deciding factor.** A whole visit's audio is roughly an hour. Every cloud option prices that between **twenty and forty cents**. Against a monthly retainer this is noise. Do not let price decide this.
4. **One thing I could not establish: which machine the builder runs on.** Option A below is excellent and exists only on a current Mac. Option B is available everywhere and is worse. **This is the single fact that most changes the answer, and I do not have it.**

---

## 1. What is actually being decided

Not a library. Not a model. The question is:

> **Does audio of the concierge, recorded inside a client's home, leave that machine?**

`CLAUDE.md` §14 says nothing goes to a third party without an explicit decision in `/docs`. The Backup Decision is deliberately narrow — encrypted archives only, ciphertext the service cannot read. The AI Processing Decision authorises photographs on a graded basis and explicitly holds this one open.

And the material is genuinely different from a furnace plate. From §5 of that record:

> Audio of a concierge speaking from recall is different in kind: it may name the household, mention occupants, or carry a stray remark never meant for a record.

There is a second, quieter difference. A nameplate photograph is *evidence about the house*. A memory recording is **the concierge thinking out loud** — the whole point of 2a's memory capture is to get recall down before it decays, which means it is unedited by design. That is the most candid material this system will ever hold, and it is about people.

## 2. What gets transcribed, and how much of it

| Source | Where it comes from | Rough volume per baseline visit |
|---|---|---|
| Desk memory recordings | 2a — one per room, at the desk, a day or two after | 15–25 rooms × 1–3 min ≈ **30–60 min** |
| Field voice notes | The field app, spoken in the house | unknown; the reference export contains none |

**Call it an hour of audio per baseline visit.** Monthly visits will be far shorter.

**Two outputs, and they are not the same decision.** §1 asks for a transcript *and* a one-line gist. The transcript is audio→text. The gist is text→text and would go to Claude — but **the AI Processing Decision does not authorise sending memory transcripts to Anthropic either.** It covers plate photographs, pin photographs, and conditionally room photographs. If you want the gist, that is a second sentence in the same decision, not something already covered. I am flagging it rather than assuming it.

## 3. The finding that matters most: Whisper and silence

This is not a general caveat about AI. It is a specific, documented behaviour that lands on a safeguard this repo already built.

Whisper — every version of it, including whisper.cpp and faster-whisper, because they all run the same weights — has a well-known failure on audio with no speech in it. Trained on clips where silence was paired with arbitrary text, it produces **coherent, fluent, entirely invented sentences** when given silence or background noise. Research puts fabricated phrases in roughly **1% of transcriptions**, and finds the same behaviour did not occur in commercial engines from Google, Amazon, AssemblyAI and RevAI.

Now put that beside what 2a already does. The memory recorder measures peak level, marks a recording `silent`, and refuses to let the pass be completed over one without the concierge either re-recording or explicitly acknowledging it. That safeguard exists because *an hour of recordings of nothing* is a real failure mode on a real afternoon.

**Feed those same recordings to Whisper and the failure mode inverts.** Instead of an obvious blank the concierge chases, you get a fluent sentence about a room, attached to their recollection, in the binder pipeline. Doctrine 4: *an explicit unknown is information; a plausible fabrication is a liability.* This is the exact shape of that sentence, arriving through the back door.

**It is mitigable** — trim leading and trailing silence, gate on the level 2a already measures, refuse to transcribe anything already marked silent, and treat a transcript of a low-level clip as suspect. But it is a thing that has to be built deliberately, and it is a real point against the Whisper family that does not apply to the commercial engines.

## 4. The four options

### A · Apple's on-device speech engine — *Mac only*

macOS 26 ships `SpeechAnalyzer` / `SpeechTranscriber`: Apple's own transcription running entirely on the machine, free, no account, no network.

- **Accuracy:** benchmarked at **2.12% WER** on clean LibriSpeech and 4.56% on the noisy portion — better than Whisper Small (3.74% clean) and within a whisker of Whisper Large v3, which needs a GPU.
- **Speed:** ~3× Whisper Small on an M2 Pro; one test transcribed 34 minutes of audio in 45 seconds.
- **Privacy:** nothing leaves the machine. **No §14 decision required at all** — this is not a third party.
- **Against it:** macOS only, and current-generation macOS at that. Early reports say it handles **proper nouns and strong accents worse** than cloud engines — and proper nouns are exactly what this material is full of (Rheem, Kinetico, the homeowner's surname, Bay of Quinte street names).
- **Integration:** a Swift/Objective-C API. A Node app reaches it through a small helper binary. Real work, but bounded, and no model files to ship.

### B · Whisper locally, through whisper.cpp

The cross-platform local option. Several Node bindings exist (`nodejs-whisper`, `smart-whisper`, `whisper-node-addon`); all wrap the same C++ engine.

- **Accuracy:** large-v3 is ~2.7% WER on clean audio, 8–12% in real-world conditions. **large-v3-turbo** is the practical choice — ~6× faster, within 1–2% of the full model. The runtime you pick changes speed, not accuracy; they all run the same weights.
- **Privacy:** nothing leaves the machine. **No §14 decision required.**
- **Against it:** the silence-hallucination behaviour in §3. A model file to download and ship (turbo is ~800 MB). A native build step — `smart-whisper` in particular expects you to compile the library yourself, and `nodejs-whisper` needs `make` on the PATH. **You are not a developer, and "it needs a compiler" is a real cost on your machine, not a footnote.**
- **Also against it:** on a machine without a GPU this is slow. An hour of audio on CPU is minutes to tens of minutes. That is fine for a background job and bad for anything interactive.

### C · A cloud transcription vendor

The realistic candidates are **Deepgram** and **AssemblyAI**. Both are purpose-built for this, both handle noisy real-world speech better than either local option, both are cheap.

- **Cost, order of magnitude:** Deepgram Nova-3 pre-recorded around **$0.004/min**, AssemblyAI batch in a similar range, OpenAI's Whisper API around **$0.006/min**. An hour a visit is **roughly $0.25–$0.40**. *These figures come from comparison sites, not vendor pages — verify against the vendor's own pricing before committing to any of them.*
- **Retention, as far as I can establish:** Deepgram's documentation describes zero retention after processing as the default, with training use limited to customers who opt into a named partnership programme. AssemblyAI offers opt-out of model training, and describes zero data retention on its streaming product for customers who have opted out. OpenAI retains API inputs for **up to 30 days** by default for abuse monitoring; Zero Data Retention exists but is **enterprise, by approval, and not available on standard pay-as-you-go** — and audio endpoints specifically require one of the restricted-retention arrangements.
  **Treat every sentence in this paragraph as a lead, not a fact.** Retention terms are contractual and change. §2.5 of the AI Processing Decision already requires the terms of your *existing* API account to be established **in writing**; the same obligation applies with more force here, because this is audio of people in their homes.
- **Against it:** this is **a second processor**. A second contract, a second DPA, a second set of terms to establish and re-check, and a second entry in the §14 record. It also means the sentence you tell clients gets longer — §3 of the AI Processing Decision promises them a plain description of what is processed, and "recordings of our concierge describing your home" is a different sentence from "photographs of equipment labels."

### D · Don't transcribe

Keep 2a's behaviour: audio records, plays back at the desk, nothing is lost. The concierge listens and types what matters into the room's memory notes.

- **Privacy exposure:** none. No new vendor, no new decision, no new failure mode.
- **Against it:** it is the slowest path, and it is work the software was supposed to absorb. It also means the memory recordings stay unsearchable — you cannot ask *"which house was the one with the corroded shutoff"* across a year of visits.
- **In its favour, more than it first looks:** the gist matters more than the verbatim transcript for most of what memory capture is for, and a concierge who has just listened to their own recording writes a better gist than a model working from a transcript. This is a legitimate answer, not the null option.

## 5. Side by side

| | **A · Apple on-device** | **B · whisper.cpp** | **C · Cloud vendor** | **D · No transcription** |
|---|---|---|---|---|
| Audio leaves the machine | **No** | **No** | **Yes** | **No** |
| §14 decision needed | None | None | **Yes — a new processor** | None |
| Accuracy, clean speech | ~2.1% WER | ~2.7% (large-v3) | best in class | — |
| Accuracy, noisy basement | untested here | untested here | **strongest** | — |
| Proper nouns / equipment names | **reported weakest** | moderate | **strongest** | — |
| Fabricates on silence | not reported | **yes, documented** | not reported | n/a |
| Runs where | **current macOS only** | anywhere | anywhere | anywhere |
| Setup burden on you | helper binary | **compiler + 800 MB model** | an API key | none |
| Cost per visit | $0 | $0 | ~$0.25–0.40 | $0 |
| Works offline | yes | yes | **no** | yes |
| Client disclosure gets longer | no | no | **yes** | no |

## 6. What I could not establish, and what would settle it

**Which machine the builder runs on.** `CLAUDE.md` §10 says "the owner's machine" and nothing more. If it is a current Mac, option A is available and is the strongest local answer. If it is Windows, option A does not exist and the local choice is B with all of B's costs. **This one fact eliminates an option, and I do not have it.**

**How any of these perform on the actual material.** Every accuracy number above is from LibriSpeech — read audiobooks, in a studio. Your material is a person in a basement with a furnace running, saying *"Kinetico"* and *"the Hendersons"* and *"that thing behind the stairs"*. Published WER does not predict that.

**What would settle it:** one real memory recording, made the way they will actually be made, run through each candidate, with the transcripts read side by side. That is an afternoon of work and it is worth more than every benchmark in this document. **I have not done it, because I do not have such a recording.** If you make three — one quiet room, one with mechanical noise, one where you name equipment and a household — that is enough to decide on evidence rather than on published numbers.

**Whether the gist is wanted at all**, and if so whether transcripts may go to Anthropic. See §2.

## 7. If you pick one, here is what it obligates

- **A or B** — no §14 decision, but §5 of the AI Processing Decision should still be closed out with a line saying transcription is local and naming which. A decision recorded as "we chose the option that needs no decision" is still worth writing down, because the next person will otherwise re-open it.
- **B specifically** — the silence guard is not optional. Refuse to transcribe anything 2a already marked silent, trim leading and trailing silence, and treat a transcript from a low-level clip as suspect. Build it with the feature, not after.
- **C** — a full entry in the AI Processing Decision on the model of §2.1–2.3: what is sent, how sensitive it is, on what terms, and **the retention and training terms established in writing before the first real client recording**, exactly as §2.5 already requires of Anthropic. The client disclosure sentence in §3 also needs extending, and that goes through the lawyer pass.
- **Any of them** — doctrine still applies. A transcript is a **proposal**, quarantined and unsigned until a human accepts it, exactly like a nameplate reading. It is not the concierge's words until the concierge says it is. And the manual path stays: the pass has to work with transcription unavailable, because §0.4 does not have exceptions.
- **D** — nothing. Which is the point of listing it.

---

**This report picks nothing.** The two things I would want in hand before deciding are the machine, and three real recordings run through the candidates.

## Sources

- [Best open source speech-to-text (STT) model in 2026 (with benchmarks) — Northflank](https://northflank.com/blog/best-open-source-speech-to-text-stt-model-in-2026-benchmarks)
- [faster-whisper vs whisper.cpp vs OpenAI Whisper (2026) — Codersera](https://codersera.com/blog/faster-whisper-vs-whisper-cpp-speech-to-text-2026/)
- [Careless Whisper: Speech-to-Text Hallucination Harms (arXiv)](https://arxiv.org/html/2402.08021v2)
- [Investigation of Whisper ASR Hallucinations Induced by Non-Speech Audio (arXiv)](https://arxiv.org/pdf/2501.11378)
- [Hallucination on silence — whisper.cpp issue #1724](https://github.com/ggml-org/whisper.cpp/issues/1724)
- [Apple Launches On-Device SpeechAnalyzer API — Silicon Report](https://www.siliconreport.com/apple-launches-on-device-speechanalyzer-api-beating-whisper-small-on-speed-and-accuracy-4cf2a0b7)
- [Apple's New Transcription APIs Blow Past Whisper in Speed Tests — MacRumors](https://www.macrumors.com/2025/06/18/apple-transcription-api-faster-than-whisper/)
- [Speech-to-Text API Pricing (July 2026) — buildmvpfast](https://www.buildmvpfast.com/api-costs/transcription)
- [Standard Compliance speech-to-text: HIPAA, SOC 2, GDPR — Deepgram](https://deepgram.com/learn/standard-compliance-speech-to-text)
- [Deepgram Model Improvement Partnership Program](https://developers.deepgram.com/docs/the-deepgram-model-improvement-partnership-program)
- [Does AssemblyAI offer zero data retention? — AssemblyAI support](https://support.assemblyai.com/articles/2240096256-does-assemblyai-offer-zero-data-retention)
- [How to opt out of data sharing for the Model Improvement Program — AssemblyAI](https://www.assemblyai.com/docs/faq/how-to-opt-out-of-data-sharing-for-our-model-improvement-program)
- [OpenAI Data Retention Policy 2026 — Meetily](https://meetily.ai/llm-privacy/openai)
- [Can Claude Transcribe Audio? — Sonix](https://sonix.ai/ai/can-claude-transcribe-audio/)
- [Feature request: Audio input support in Messages API — anthropic-sdk-python #1198](https://github.com/anthropics/anthropic-sdk-python/issues/1198)
- [nodejs-whisper — npm](https://www.npmjs.com/package/nodejs-whisper) · [smart-whisper — npm](https://www.npmjs.com/package/smart-whisper)
