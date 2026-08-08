# Prior-session harvest — Builder Code verification

**Date:** 2026-08-07 · **Record of an event. This date never moves.**
**Answers:** the new design session's six harvested items plus one factual check.
**Method:** read from the repo at source, not from the register. Every claim below names a file and line.

**Result: two verified · two killed · two qualified · one verified with a number that surprises.**

| # | Item | Verdict |
|---|---|---|
| 1 | Four streams / gap derivation | **Verified — and the worry is inverted** |
| 2 | `preferredLabel` | **Verified as a proposal · killed as machinery** |
| 3 | Table I travels to render | **Killed — it reaches neither, and it is idle** |
| 4 | §11 lifespan table, asphalt only | **Killed and replaced by something worse** |
| 5 | Technology record v1.1 | **Not mine** |
| 6 | Two owner questions | **Framed below** |
| — | Is text cheap against images? | **Qualified — cheaper, not free** |

---

## 1 · The four streams do not collapse. The urgent one is fine, and it is fine three ways

**The concern was that gaps derive from the `na` path alone, under-reporting by everything simply left unresolved.** The opposite is true: **the unresolved path is first and unconditional**, and there is a third path nobody mentioned.

`server/src/audit/carriedItems.ts:177–201`:

```
let reason: string | null = null

if (!resolution) {
  reason = 'not-reached'                                   // ← (a) UNRESOLVED. First. No condition.
} else if (resolution.kind === 'na' && resolution.reasonId) {
  if (naReasons.feedsGapList(resolution.reasonId)) {
    reason = resolution.reasonId                           // ← (b) na + feedsGapList
  } else if (naReasons.unrecognised(resolution.reasonId)) {
    warnings.push(…'which this property\'s current config does not declare — so whether it
                    feeds the gap list is unknown and it is listed here rather than
                    decided either way')
    reason = resolution.reasonId                           // ← (c) na + UNRECOGNISED reason
  }
}

if (reason === null) continue                              // ← only genuinely-resolved items leave
```

**Path (c) is doctrine 7 working and it is worth naming**: an `na` reason this config never declared lands in the gap list *with a warning*, rather than being silently dropped or silently included. Fail open on vocabulary, and say so.

**The two paths stay distinguishable all the way to the client.** `server/src/report/draft.ts:346–348` composes a different sentence for each:

> `a checklist item in the ensuite **has no answer, so it is ours to carry**`
> `a checklist item at close-out **was answered in a way the config marks as a gap**, so it is ours to carry`

Asserted in `server/test/gap-report.test.ts:152–164`, which tests *"says why each row is in the column it is in, **for both reasons**"*.

**And one detail that shows this was thought about rather than arrived at** — `carriedItems.ts:160–165`:

> *"Stored on every item, not only on a gap. Counting `due` in a bucket that is only written back when something is missing gives **"1 of 1" for a room where nineteen were asked** — a denominator that quietly agrees with the numerator, which is the one number nobody would think to check."*

**Separately, the streams are kept apart at the state level too.** `audit/completeness.ts:164–167` splits `confirmed-absent` from `not-found` on the config's two booleans, with the reason written in the code: collapsing them *"would either turn every confirmed absence into a chore for the client or bury a room nobody could get into."*

**Verified. No action.**

---

## 2 · `preferredLabel` — the proposal is real and precisely as described. Nothing implements it

**Killed as machinery, and the kill is already documented:**

- **0 of 41 slots** declare `preferredLabel` (computed from `binder-schema-v1.json`)
- **0 references in `server/`** — no code reads it

**It exists in exactly two places, and both are prose.** `schema/binder-schema-v1.json:1263`, key `dualSourcedFacts`, carries the whole proposal **including its own correction**:

> *"**CORRECTION (2026-07-29): the overlay model does not already do this.** Overlays hold a *history* of values resolving to one current value by recency. Two simultaneously-valid values from different sources is a different shape — **value-per-source, resolved by declared preference rather than by time.** That is a schema addition, not existing machinery, **and the earlier claim otherwise was asserted without checking.**"*

And `Honesty-Label-Mapping_v1-2:56` classes it: *"Mechanism 4 · Per source, by declared preference · `preferredLabel`, proposed · **Not built. Recorded, not specced.**"*

**So the harvested item is accurate to the character** — including the part a prior session would not have seen, which is that the "it already works" claim was made once and retracted.

> **It is now on the critical path, which the harvest could not have known.** Honesty-Label Mapping §3's **Reading B** says `property.triggers` may be *"the first real instance of mechanism 4."* That is **owner question 2 below**, and answering it Reading B pulls unbuilt schema machinery into the path of the `s15` schedule slots. The mapping's author flagged exactly that and declined to rule.

**Also worth carrying:** the proposal's core argument is not about labels, it is that **the discrepancy is a first-class output** — *"an owner reporting 200A on a 100A panel is carrying a renovation assumption worth more than either number alone."* And precedence cannot be fixed: for a current-state question an observation beats a document; for a historical one the document wins, *because nobody watched it happen.*

---

## 3 · Table I — killed, and the real answer is worse than either option offered

**The question was "enforced at render, or only at ingest?" The answer is neither, and the machinery is idle.**

`server/src/audit/provenance.ts` exports five things — `provenanceMap`, `verify`, `aggregate`, `mergeBreakdowns`, `describeProvenance`. **Grepping `server/` for all five finds callers in exactly one file: `server/test/provenance.test.ts`.**

**Not ingest. Not render. Not the audit run.** `audit/run.ts:185` calls `provenanceOf` — a *different* function, in `schema.ts`, which resolves schema and profile version provenance. Nothing to do with Table I.

**This is rule 11, and it is the textbook shape:** built, tested, correct as far as its tests go, and exercised by nothing that runs in production. The module knows what it is for — `provenance.ts:246`:

> *"Never **"12 serials recorded"**. Table I exists because that sentence is a lie…"*

**So the declaration does not travel, because nothing carries it anywhere yet.** Whether it should be enforced at render or at ingest is still a live design question — the harvest's framing is right, it just has no current answer to correct.

**Recommendation, not a ruling:** render is the enforcement point that matches doctrine 5 — nothing renders unsigned, and an unverified transcription rendering as fact is the same failure class. Ingest cannot enforce it because at ingest there is nothing to render yet.

---

## 4 · §11's lifespan table — the harvest under-states it

**The claim was: asphalt only, no metal, cedar, tile or membrane, so the capital plan cannot produce a replacement window for a metal roof.**

**There is no lifespan table at all.** Slot `s11.lifespans` declares `sources: ["reference:lifespans-v1"]` — and `schema/reference/` holds exactly one file, `maintenance-schedule-v1.json`. **`lifespans-v1` does not exist in this repo.**

**And there are no roof classes to hang one on.** The class frame's `envelope` system holds **17 classes** and not one is a roof covering, cladding or foundation:

> window · door-exterior · door-patio · door-storm · garage-door · garage-door-opener · deck-wood · deck-composite · eavestrough · downspout · downspout-extension · soffit-vent · plumbing-vent-stack · vent-termination · heat-trace · foundation-vent · outbuilding

**One false positive worth heading off:** the frame does contain `ro-membrane-replacement`. That is a **reverse-osmosis** membrane on the `reverse-osmosis` class in `water-supply` — **not a roof membrane.** A grep for "membrane" will find it and it is not what anyone means.

**So the capital plan cannot produce a replacement window for *any* roof covering, asphalt included.** That is the same gap the new session's §8 already names as *building fabric — roughly thirty classes absent* and rates as ratified. The harvest item is a symptom of it, not a separate finding.

---

## 5 · Technology Inventory Design Record v1.1 — not mine

**Not in this repo.** The register files it under §4a, *field documents with no repo home*, living in the field project folder. **Three known errors and no v1.2 is entirely outside what I can verify or kill.** Field Code or the owner.

---

## 6 · The two owner questions, framed for David

Both from `Honesty-Label-Mapping_v1-2` §7, which orders them steps 1 and 2 and states plainly that **they block the rest**. Neither is technical; both are about what HouseSteady is willing to claim.

### Question 1 — what label goes on a number HouseSteady decides rather than knows

**Two slots: `s19.reserve-figure` (the capital reserve, a dollar figure) and `s2.next-review` (when we come back).**

Both are `fixed`, both **required in the baseline profile**, and both currently render with **no honesty label at all**. `CLAUDE.md` §9 names the reserve figure on the *never AI* list; the profile classes it `classD_irreduciblyHuman`.

> **The absence of a label is itself a claim.** A homeowner reading an unlabelled dollar figure reads it as evidence-derived — when it is a judgement HouseSteady makes. Every other number on the page carries *Observed*, *Measured*, *Documented* or *Inferred*, so an unlabelled one reads as the most certain thing there.

**Three ways out, and it is a service question rather than a schema one:**

1. **A ninth honesty label** — something like *Our judgement*, naming the act honestly. Costs: a new vocabulary term, and every renderer learns it.
2. **An explicit null** that renders as visible words — *"this is our recommendation, not a measurement."* Costs: nothing structural; it is a rendering rule.
3. **Outside the label system entirely** — the reserve figure is not a fact about the house and does not belong in a vocabulary about kinds of knowing.

**The mapping's own note: this does not wait for anything.** It is decidable today.

### Question 2 — is `property.triggers` one fact or two

**`property.triggers` decides which specialist referrals a visit raises. It arrives from two places** — the session's own flags from the visit, and the intake form's services block from the household. Binder Schema v1.1 §4 already treats disagreement between them as a first-class output.

> **Reading A** — it resolves to **one** label, and the question is only which. Simple, buildable today.
>
> **Reading B** — it is **two simultaneously-valid values from different sources**, and therefore the first real instance of the `preferredLabel` mechanism in item 2. Richer, and it pulls **unbuilt schema machinery into the critical path** of the `s15` schedule slots and their three dependents.

**The mapping's author wrote that instinct points to Reading B** — because the electrical-service example (*owner reports 200A, panel is 100A*) is the same shape and the discrepancy is worth more than either number. **And declined to rule, because it is a cost decision as much as a modelling one.**

**Framing for David:** *when the household says there is a septic system and the visit did not find one — or the reverse — is that one fact we have to pick a version of, or two facts that disagree and the disagreement is the finding?*

---

## 7 · Is text genuinely cheap against images? Qualified yes — and the number is not what an unqualified claim implies

**Image costs are exact, from the current documentation.** An image costs `⌈w/28⌉ × ⌈h/28⌉` visual tokens, capped at **4,784** on the high-resolution tier (Claude 4.7+) and **1,568** on standard.

**Text costs are estimated** at ~3.5 characters per token for punctuation-heavy JSON. Marked as an estimate; the ratio is robust to being off by a third, the absolute numbers are not.

| | size | ≈ tokens | **in high-res images** |
|---|---:|---:|---:|
| **`class-frame-v1.json`, whole** | 217,756 B | ~62,200 | **13 images** |
| **ids and labels only** | 33,494 B | ~9,600 | **2 images** |
| One high-res image | — | 4,784 | 1 |
| **A full 24-image call** | — | **114,816** | 24 |

**So: cheaper, not free.** The prior session's assertion holds directionally and would mislead anyone who read it as *text is negligible*:

- **Sending the whole class frame with a 24-image call adds ~54% to it.** That is a real cost, not a rounding error.
- **Sending ids and labels adds ~8%.** That is genuinely cheap, and it is what a call would actually need — §3's job is *what is this*, not *what does it need*, and the vocabulary ids are enough to answer it.
- **One high-res photograph costs about as much as 3,000 words.** That is the ratio worth carrying: **a page of prose is free next to a picture; a whole schema file is not.**

**One consequence for §3 that follows from the arithmetic rather than from taste:** the frame's full prose — every `note`, every reasoning block — is roughly **five-sixths of its bulk** and answers a question the identification call is not asking. **The projection is the artifact to send, not the file.**

---

**Status:** six items resolved, one factual check answered. **Two of the kills (3 and 4) are larger than the harvest recorded, and both are live design questions rather than settled facts** — Table I has no enforcement point at all, and the lifespan reference does not exist. Rule 6 applies: re-read these numbers rather than carrying them forward.
