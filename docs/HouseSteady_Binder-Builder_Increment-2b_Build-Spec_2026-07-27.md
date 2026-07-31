# Binder Builder — Increment 2b Build Spec: The First Assists

**Date:** 2026-07-27
**Read first:** `CLAUDE.md` (§7 the concierge is not an inspector, §9 AI assist) · `/docs/HouseSteady_Binder-Builder_AI-Assist-Plan_v1-1_2026-07-31.md` · `/docs/HouseSteady_Binder-Builder_Increment-2a_Build-Spec_v2_2026-07-27.md` (the screen this lands in).
**Scope:** the first four AI assists, into the fresh pass screen that already exists. Nothing client-facing. Nothing that assembles a binder.

**Why these four first:** they are high-volume, cheap, structured, and a wrong answer is obvious and harmless. They prove the queue, the prompt library, the provenance record, and the abstention discipline on work where nothing reaches a client. Every later AI feature inherits that machinery.

---

## 0. Non-negotiables

1. **AI proposes; a human accepts.** No AI value is ever the current value until a human accepts it. Nothing here is client-facing, and an `ai_generations` row is never itself content.
2. **Abstention is success.** Every field may come back `unknown`, and the whole image may come back "not a nameplate" or "can't read it". `abstained = 1` is a valid outcome, never an error. **A wrong serial is worse than a blank one: the blank gets chased, the wrong one gets believed.**
3. **Extraction reads; it does not interpret.** Reading `1809A44721` off a plate is transcription of an image. Deducing "manufactured week 9 of 2018" is inference, carries a different honesty label, and belongs to a later increment. **2b does no serial decoding, no age estimation, no condition anything.**
4. **Every feature has a manual path.** The pass is fully usable with no API key, no network, or a failed job. Assists queue and fill in behind. **Nothing blocks on a model call.**
5. **Prompts are versioned config files.** No model call ever uses an inline prompt string.

## 1. The four tasks

| Task | Input set | Output | Tier |
|---|---|---|---|
| **Nameplate extraction** | Pin-attached photos that classify as nameplates | Per-field: make · model · serial · capacity · install date if printed. Each independently `unknown`. | fast |
| **Nameplate classification** | All pin-attached photos | is-a-nameplate: yes / no / unsure. Gates the above. | fast |
| **Loose-photo routing** | Zone-owned photos | Ranked candidate pins, **high confidence only** | fast |
| **Pin-type suggestion** | Typeless pins, from their photos and notes | Candidate component type from the config's own list | fast |
| **Transcription** | Desk memory audio (2a) and field voice notes | Transcript + one-line gist | see §6 |

**Room photos never get nameplate extraction** — 200+ per visit, almost none are plates. Pin-attached photos are the small subset (5 of 37 in the reference export) and classification is what keeps the extraction bill small.

**Routing suggests sparingly.** Annotating 200 tiles with a guess is noise that trains the concierge to ignore the feature. Present as a small batch — *"6 photos look like they belong to pins"* — and stay silent below a high confidence bar. Silence is a valid output for the whole task.

**Type suggestion picks from the config's own component list**, never invents a type. An unrecognized component type is a vocabulary problem, not a suggestion.

## 2. How an AI value becomes real

`ai_generations` exists from Increment 1. Acceptance is an **overlay**, so the pass's existing state resolution needs no new machinery.

- **New overlay kind: `accept`**, carrying `generation_id`.
- **`prior_value` holds what the AI proposed; `new_value` holds what the human accepted.** Identical means accepted as-is; different means edited. The diff *is* the accuracy record — "how often is the model right" becomes a query rather than a separate metric to maintain.
- The generation row's `human_decision` moves `pending → accepted | edited | discarded`.
- **Discard is recorded, never deleted.** A model that keeps proposing the same wrong thing is a prompt problem, and the discards are the evidence.

**Doctrine scan:** no path may render a generation as current state without a corresponding `accept` overlay.

## 3. Prompts as config

`/prompts/<task>/<version>.md` — each with an id, a version, and a content hash. Loaded at startup and hashed; **every generation records `prompt_id`, `prompt_version`, `prompt_hash`.** A scan already forbids inline prompt strings; extend it to cover model IDs.

**House style is a separate file** included by prompts that produce prose — for 2b that is only the transcription gist. It is also the training document for new concierges: one source, two audiences.

**The golden set is part of this increment, not a follow-up.** Fixed inputs with approved outputs, re-run on every prompt change, differences reviewed before the change ships. Without it, a prompt edit silently changes behaviour and nobody notices for months. **This is the highest-value piece of AI infrastructure in the build and it costs almost nothing to maintain.**

## 4. The queue

**AI never enters the import path.** Import is the operation that must not fail; it already moves 1.5–2 GB and checksums every file. Same reasoning as the thumbnail decision.

- **A job table in SQLite**, drained by a worker while the server runs. Restart-safe because state is in the database. Rows carry task, target, status, attempts, last error.
- **Kicked off after import completes**, not during, and re-triggerable by hand from the UI. The fresh pass happens a day or two after the visit, so extraction is normally long finished before anyone sits down.
- Resumable, retryable with backoff, and **capped**: a per-visit spend ceiling that stops the worker and says so rather than quietly burning credits.
- Progress visible: queued / running / done / failed, with failures naming the file.

## 5. Models and cost

- **Pinned model IDs in environment variables, one per tier.** No auto-latest alias — upgrades are a deliberate config change with a golden-set run behind them.
- 2b is entirely the fast tier. Nothing here justifies the strong one.
- **Structure prompts so the stable part is the prefix** — task instructions and the config's component list don't change between calls in a session, and caching them is the difference between a rounding error and a real bill at 400–600 photos.
- **Per-visit token spend and cost shown in the UI.** Not because it is large, but because a concierge should see it and David should be able to price it.

## 6. Transcription — an open decision, to be surfaced not assumed

Transcription needs a provider, and **that is a decision with a privacy dimension, not an implementation detail.** A local model keeps audio on the machine and is consistent with local-first. A cloud service means client audio leaving the machine — which `CLAUDE.md` §14 says requires an explicit decision recorded in `/docs`, and the Backup Decision already narrowed the only third-party authorization to encrypted backup archives.

**Code investigates what is actually available and reports options with trade-offs. It does not pick.** Build the other three tasks first; transcription lands once the decision is recorded. Until then 2a's behaviour stands: audio records and plays back, nothing is lost.

## 7. The screen

Everything lands in the fresh pass. **No new screen.**

- **Proposed values are visually quarantined** — distinct treatment, and a label in plain words: *read from the photo · not yours yet*. Accept (`c`, same key, same claim — the value matches the photo), Edit first (`e`), Discard (`x`).
- **An accepted value reads as yours**, with a quiet provenance line: *read from the photo, edited by you, accepted 27 Jul*, plus undo.
- **Abstention has its own presentation and is never an error state.** *"The plate is there but the lettering can't be made out. Nothing has been entered."* Offer: type it yourself, or carry to the next visit. **An abstention that leads to a carried item is the feature working, not failing.**
- **AI proposals do not count as required decisions** and never block completion. The fresh pass exists for memory, which decays; a serial does not. Accept them in the flow if convenient, leave them for later without pressure.
- **Model and prompt version are visible on inspection** — not shouted, but never hidden.

## 8. Fixtures — the abstention cases are the important ones

Real nameplate photos are supplied (owner's own equipment). Load them as fixture assets with expected outputs.

**The set must include hard cases deliberately:** glare across the plate · an awkward angle from a unit jammed against a wall · worn or faded lettering · a half-peeled sticker · very small text · a plate partly hidden behind a pipe.

**And it must include cases where the correct answer is "I can't read that", plus one photo that is not a nameplate at all.** A fixture set of clean, square, well-lit plates produces something that appears perfect and then confidently invents a serial the first time it meets a real furnace in a dark corner. **The abstention path cannot be tested with legible inputs.**

Acceptance: the illegible ones abstain, the non-nameplate classifies as no, and no field is ever populated with a plausible guess.

## 9. Out of scope

Serial decoding · age or lifespan estimation · condition or grading of any kind · anything client-facing · binder assembly · gap report · concern register · the strong model tier · any new screen.

## 10. Tests

Behaviour: a generation never becomes current state without an `accept` overlay · edited acceptance stores both proposed and accepted values · discards are retained · the queue survives a restart mid-run · a failed job doesn't lose the rest · the spend cap stops the worker · the pass is fully usable with no API key configured.

Golden set: every fixture produces its approved output; a deliberate prompt change produces a reviewable diff.

Doctrine scans: **no inline prompt strings or model IDs** · **no path renders a generation as current state without an accept overlay** · **no AI task writes a condition, grade, or adequacy field** · no captured row is mutated by any AI path.

## 11. Done means

Import the fixture visit → extraction runs in the background and finishes → open the fresh pass → nameplate proposals appear quarantined on their pins, the illegible ones abstain in words, the non-nameplate is not extracted at all → accept one as-is, edit one, discard one → all three read correctly afterwards and the trail is honest → per-visit cost is visible → unplug the API key and the whole pass still works.

---

**Status:** ready for Claude Code. Runs in parallel with the Binder Schema design, which is Increment 3's prerequisite and is being written separately.
