# Note for Increment 3 — the zone audit summary is reconstructible from the config

**Date:** 2026-07-26
**Status:** verified observation, recorded for the audit engine. **Not implemented in Increment 1** — Increment 1 stores and displays `zones[].audit` as given.
**Source:** `/fixtures/reference/housesteady-019f9a33-manifest.json`, verified by hand during the Increment 1 read-through.


> ## ⚠ CORRECTED 2026-07-31 — one claim in this note is wrong
>
> **§"Pin-scoped resolutions … are not counted in the zone summary. The two scopes
> are independent" is false.** The field app **does** fold a live typed pin's
> component-list items into the **zone's** audit summary.
>
> This note could not have known. The reference export it was written against has
> two zones carrying a summary and **one typed live pin between them**, with all
> five of its items resolved — so the fold contributed zero and the reconstruction
> agreed anyway. **The oracle built on this note agreed on every run for four
> increments while being wrong.**
>
> The first real walk had 17 pins across 8 zones and disagreed on four of them,
> every missing item component-scoped. Folded and re-run: 8 of 8 agree item for
> item. See the module note at the top of `server/src/audit/zoneAudit.ts`, which
> is the current description.
>
> **Only the summary folds.** A pin item stays scoped to its pin everywhere else;
> `applicable` still carries zone items only.
>
> Everything else in this note held. Rule 11 was written from this.

---

## What was verified

Each zone's `audit` summary (`coreUnresolved[]`, `standardUnresolved`, `naCount`) can be derived exactly from the import's own config snapshot plus `resolutions[]`. Both zones in the reference export reconcile perfectly.

**The derivation:**

1. Look up the zone's `type` in `config.snapshot.zoneTypes[]` → read its `inherits[]`.
2. Collect `config.snapshot.baseLists[]` whose `id` is in `inherits[]`, plus the `config.snapshot.zoneLists[]` entry whose `zoneType` matches the zone type.
3. Filter to items whose `scope[]` contains the visit kind (`baseline` here).
4. Apply `trigger.anyOf[]`: `zone.<attribute>` tests `zones[].attributes`, `property.<flag>` tests `session.flags[]`. Untriggered items are always applicable.
5. Unresolved = applicable minus the `itemId`s in `resolutions[]` scoped to that zone.

**Zone 1 — "bedroom" (`living-space`, `sleeping: false`):** inherits `interior-base` (11 items) + the `living-space` zone list (1 item) = 12 definitions. `liv.egress` is excluded by its `zone.sleeping` trigger → 11 applicable, 11 resolved, 0 unresolved. Audit says `coreUnresolved: []`, `standardUnresolved: 0`, `naCount: 2`. **Matches exactly**, including the trigger exclusion.

**Zone 2 — "ensuite" (`bathroom`):** inherits `interior-base` + `wet-base`, plus the `bathroom` zone list = 20 definitions, 19 applicable after the same `liv.egress` exclusion. Zero resolutions scoped to this zone. Audit says 8 core unresolved, 11 standard unresolved. Computed: 8 core, 11 standard — and the computed core list is **item-for-item identical** to the audit's `coreUnresolved[]` array.

## Why this matters for Increment 3

- The trigger and inheritance rules in the config snapshot are **complete and correct** — the audit engine does not need information the manifest fails to carry.
- The zone audit summary is therefore a **free correctness oracle**. When Increment 3's engine computes applicability, every imported zone summary is a test case with a known answer. Any divergence is a real bug in the engine, in the config, or in the field app — worth surfacing, never worth papering over.
- Pin-scoped resolutions (the `alm.*` items on the smoke-alarm pin) come from `componentLists[]` matched on the pin's `componentType`, and are **not** counted in the zone summary. The two scopes are independent.

## Cautions

- `scope[]` values observed: `baseline`, `monthly`, `seasonal:spring`. The manifest does **not** declare which kind of visit it was — the only hint is `config.configId` (`checklists-baseline` here). Visit kind is operator-entered at import, so the engine must take it from the visit record, not the manifest.
- Only two zone types are exercised (`living-space`, `bathroom`) and only one trigger form actually fires (`zone.sleeping`, negatively). `property.*` triggers exist in the config but no conditional content fired in this export. Re-verify against a richer export before trusting the property-flag path.
- This reconstruction is **not** a licence to overwrite what the field app exported. Store `zones[].audit` verbatim; compute alongside it and report disagreement.
