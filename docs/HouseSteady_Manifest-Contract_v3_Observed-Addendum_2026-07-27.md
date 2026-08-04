# Manifest Contract v3 — Observed Addendum

**Date:** 2026-07-25
**Source:** real field export — `housesteady-019f9a33-manifest.json`, `manifestSchemaVersion: 3`, app 0.5.0, exported 2026-07-25. Two-zone dummy inspection: 2 zones, 11 pins, 37 photos, 123 MB, 111 events, 20 resolutions, 1 chat thread, 1 inbox item.
**Why this file exists:** the contract document (PLAN-STAGE-1 §7) describes v3 in shorthand written before implementation. The shipped export differs in several structural ways. **Where they disagree, the real export wins** — it is what actually has to be parsed. This addendum records the differences so the builder is written against reality, and so the field session can confirm or correct.
**Status:** observations, not decisions. Divergences are flagged for confirmation, not treated as bugs.

> **§1–§7 remain current and correct. §8's question list has partly gone stale — read it with this note.**
> **Answered since writing:** Q4 pin identity — settled by the ratified Object/Concern Model (`pinId` is a permanent uuid minted offline; the human-facing number is session-scoped and restarts each visit). Q5 language lint — decided by the owner: *monitor* may take a component, measurement, or reading as its object, never a home, household, person, or the service.
> **Still open:** Q1 nicknames · Q2 `visitTwoGaps`. Both carried in the Open Items register, which is the current list. **Where this file's §8 and the register disagree, the register wins.**

---

## 1. Divergences from the contract text

| Contract says | Export actually does | Consequence for the builder |
|---|---|---|
| `zones[].audit: {items: [{itemId, tier, attest, status, via, evidence, naReason}]}` | `zones[].audit` is a **summary**: `{coreUnresolved: [itemId…], standardUnresolved: n, naCount: n}` | Per-item detail lives elsewhere — see next row. Zone audit is a fast rollup, useful as a cross-check, not the source. |
| (no equivalent) | Top-level **`resolutions[]`** — every resolved item, any scope | **This is the real checklist state.** Structure: `{scope: {kind: zone\|pin\|session, zoneId?, pinId?}, itemId, resolution: {kind, via?, result?, note?, reasonId?}, at, source}` |
| `sessionAudit` as its own top-level section | Session items appear in `resolutions[]` with `scope.kind = "session"` | One uniform table, three scopes. Simpler than the contract implied. |
| `inbox[]` (array) | `inbox` is an **object**: `{mediaIds: [], noteIds: []}` | Inbox is a bucket of references, not a list of items. |
| `pins[].type` plus separate `pins[].label` for nicknames | `type` is `{kind: "freeform", label: "Receptacle"}` **or** `{kind: "component", componentType: "smoke-alarm"}`. **No separate `label` field appears.** | The telemetry requirement (nickname as its own field, never merged into type) is **not visible in this export.** Either nicknames aren't implemented yet, or the freeform label is doing both jobs. **Confirm with the field session.** Store both shapes; don't assume. |
| `media[]` described by path convention only | Each media record carries `owner: {kind: zone\|pin\|canvas\|inbox, zoneId?, pinId?, pinNumber?, canvasId?}`, `group`, `file`, `mime`, `bytes`, `sha256`, `capturedAt`, `source` | **Ownership is explicit, not inferred from the path.** Parse `owner`; treat the path as storage location only. |
| (not mentioned) | `pins[].retired: {at}` | Retired pins remain in the export with their permanent numbers. Never renumber, never drop. |
| `anchors[]` shape unspecified — **flagged as an open question** | `{anchorId, canvasId, x, y}` where **x and y are normalized floats 0–1** relative to the canvas image | **Question answered.** Spatial overlay is buildable. Increment 2 can place pins on canvas photos. |

**Also observed, consistent with the contract:** `session.lifecycle[]` with completed/reopened and reasons (this export has completed → reopened "Test ai" → completed) · `config` carrying `configId`, `version`, `hash`, and a full `snapshot` including `layers` · `orphanEvents[]` · complete `events[]` log · per-message `source` on chat messages with `model` on AI replies.

**Two independent version numbers:** `manifestSchemaVersion: 3` at the top, `schemaVersion: 2` on each event. Read them separately; do not conflate.

## 2. The vocabulary, as actually used

- **`resolution.kind`**: `satisfied` · `na` *(a `choice` kind is coming in field config v1.3 — see §5)*
- **`resolution.via`** (on satisfied): `check` · `pin` · `photo` · `note`
- **`resolution.result`** (optional): `pass` · `fail`
- **`resolution.reasonId`** (on na): keys into `config.snapshot.naReasons`
- **`scope.kind`**: `zone` · `pin` · `session`
- **`pin.flag`**: `issue` · (config also defines `monitor`) · null
- **`media.kind`**: `photo` · `voice` *(video defined, not exercised)*
- **`satisfy` types in the config's 266 item definitions**: `check` 139 · `note` 47 · `photo` 37 · `pin` 32 · **`measure` 11**
- **`tier`**: `core` · `standard` — **`attest`**: `evidence` · `action`

## 3. Three findings that change how the builder works

### 3a. The config already declares what becomes a gap
`config.snapshot.naReasons` is not a plain list. Each reason carries two booleans:

| Reason | `feedsGapList` | `recordsFinding` |
|---|---|---|
| `none-present` — confirmed absent | false | **true** |
| `no-access` — not accessible today | **true** | false |
| `not-applicable` | false | false |
| `deferred` — deferred to visit two | **true** | false |

**The gap report's "missing from us" column is defined in the field config, not in the builder.** The builder reads these flags from each import's config snapshot rather than hardcoding a list — which means the rule stays correct when the field app adds reasons.

### 3b. Resolved does not mean good
`{kind: "satisfied", via: "check", result: "fail"}` is a fully resolved item that records a problem. This export has two of them (receptacles, lighting). They are **not gaps** — they are **findings**, and they belong in the condition assessment, not the gap report. Three distinct streams the builder must keep separate:

- **Gaps** — unresolved items, plus `na` where `feedsGapList` is true → gap report, "missing from us"
- **Findings** — `result: fail`, plus `na` where `recordsFinding` is true, plus pins flagged `issue` → condition assessment
- **Triggered flags** — property flags and specialist referrals → gap report, third column

Collapsing findings into gaps would be the single most damaging modelling mistake available here.

### 3c. `resolutions[]` is current state; `events[]` is history
This export has 21 `ItemResolved` events, 1 `ItemReopened`, and 20 entries in `resolutions[]`. The array is a projection of the log. Both are stored; **`resolutions[]` is what the audit reads, `events[]` is what the audit trail reads.** The same relationship the v1 export showed between photo captures and discards.

## 4. Data quality in a real export (this file is the reference case)

Every count in `totals` reconciles exactly against the actual arrays, and every cross-reference resolves — pin→media, pin→note, pin→zone, anchor→canvas. Integrity is clean. What is *messy* is the content, and that mess is normal:

- **Pins 10 and 11 have no `type` at all** — created and abandoned. Pin 10 is retired, pin 11 is live and typeless.
- **Pins 2, 8, 10, 11 have no anchor** — created off-canvas or never placed. A pin without a location is valid.
- **28 of 37 photos are owned by a zone**, not a pin or canvas — loose room photos with nothing pointing at them.
- **The second zone was left substantially unresolved** — 8 core items outstanding, 11 standard.

The builder will receive imperfect manifests forever, from a tired operator at hour three. **Graceful handling of typeless pins, unanchored pins, retired pins, and unattached media is part of the job, not an edge case.** Designing against a pristine sample would be designing against a fiction.

## 5. Forward compatibility — fail open on vocabulary, fail closed on structure

The field session confirms the schema is stable in *shape* but still moving in *detail*: config v1.3 adds a `choice` satisfy type and a new resolution kind; more will follow.

- **Fail closed on structure** — wrong `manifestSchemaVersion`, unparseable JSON, missing top-level sections: refuse the import loudly.
- **Fail open on vocabulary** — unknown resolution kinds, unknown pin types, unknown item IDs, unknown na reasons, unknown event types: **preserve, display, count, and mark as unrecognized. Never fail the import over a word the builder hasn't met.**

## 6. Storage, measured rather than estimated

**123 MB for two rooms** — 37 photos averaging 3.3 MB. Extrapolating to a full nine-zone baseline (the v1 export ran nine zones and 176 files): **roughly 1.5–2 GB per baseline visit.** Twenty clients' baselines alone lands near 30–40 GB before a single monthly visit. Local-first with disciplined backup remains right; a cloud bill of that shape should be a decision, not a surprise.

## 7. What this export does not exercise

Design must not assume this sample is the whole picture:

- **No `measure` resolutions.** Eleven measure items exist in the config; none fired. **The year-over-year comparison backbone — crack widths, water pressure, humidity, insulation depth — is entirely unexercised.**
- **No exterior or site zones.** Both zones are interior. The `elevation` and `site` zone lists exist in config and have a different canvas model (photo-only, no floor plan).
- **No conditional blocks fired.** Property flags well/septic/propane/generator/ev were set but no triggered content appears.
- **No voice notes, no video.** Zero of each, though both are defined.
- **No nickname field** (see §1).
- **No intake data, documents, or lab results** — by design. The manifest is one input of six.

**Plan to re-baseline against a richer export** after the next multi-zone walk with measurements and an exterior zone. Use this one to build; use that one to harden.

## 8. Questions routed to the field session (none blocking)

1. **Nicknames** — is a separate `pin.label` implemented? The contract's telemetry requirement depends on it being distinct from `type.label`.
2. **`visitTwoGaps[]`** — the v1 export carried this as an explicit array; v3 has no equivalent, implying the builder derives gaps from resolutions plus `naReasons.feedsGapList`. Confirm deliberate.
3. **Zone audit summary vs `resolutions[]`** — confirm `resolutions[]` is authoritative and the zone summary is a convenience rollup.
4. ~~**Pin identity across visits — the load-bearing one (added 2026-07-26).**~~ **ANSWERED — see the header note.** The ratified Object/Concern Model §3 settles it: `pinId` is a permanent uuid minted offline and **the builder adopts it as canonical**; the human-facing number is **session-scoped** and restarts at #1 each visit. The session-plan export is therefore the cross-visit identity mechanism rather than a convenience — which is (b) below, confirmed.

   *Marked answered in the body 2026-08-04, per F-29 §5. It was answered in the header note only, which is the failure F-29 is about: a correction living somewhere other than the sentence it corrects. The original question is kept below because the reasoning in it is what produced the answer.*

   ~~The contract says pin *number* is the cross-visit join key, which implies `pinId` does **not** persist between visits. If so, a second visit's export legitimately carries different `pinId`s for the same physical objects, and any "this pinId differs from last visit's" check will fire on nearly every pin of every recurring visit.

   The deeper question underneath it: **how does the field app know to reuse number 7 for the water heater on visit two?** Today it cannot — that is precisely what the session plan round trip (contract §7a, "pre-seeded pin expectations") exists to supply, and it is not built. Until it is, pin numbers are assigned fresh each visit and **do not carry identity across visits at all.** The longitudinal join the whole binder depends on is therefore blocked on the session plan, not merely unbuilt.

   Confirm with the field session: (a) does `pinId` persist across visits or not; (b) is number reuse on a recurring visit entirely dependent on the session plan import; (c) if a concierge renumbers or reuses a number manually, what governs it. **Until answered, cross-visit pin checks must report one summary observation per import, never one warning per pin.**~~

5. **Language lint** — the config defines a layer with id `monitor`, label "Monitoring". Internal vocabulary today; if it ever reaches a client-facing render it collides with the Scope's banned-word discipline. David adjudicates whether the ban covers equipment/technical senses.

---

**Status:** observed addendum to Manifest Contract v3. Reference export retained at `/fixtures/reference/`. Supersedes the contract text where the two disagree, pending field-session confirmation.
