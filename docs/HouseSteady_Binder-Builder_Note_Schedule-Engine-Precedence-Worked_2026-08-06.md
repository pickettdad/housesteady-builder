# Schedule / engine precedence — the worked case

**Date:** 2026-08-06
**Answers:** the ask attached to the envelope-and-site delta — *the worked case against real content, with anything §A2 does not cover flagged.*
**Status:** **§A2 stands and is not restated here.** This note works it against the content that now exists and reports five things it does not reach. Nothing below is a new rule; the flagged items are questions for the owner.
**Source:** `schema/class-frame-v1.json` at 155 classes and `schema/reference/maintenance-schedule-v1.json` v1.4.1, both read from the file.

---

## What is already settled, quoted rather than re-derived

> **The schedule owns the calendar slot and the default cadence. The engine owns identity, multiplicity, and model-specific detail rendered inside that slot.** One calendar entry, expanded to two lines where the engine knows there are two pumps.
> — Amendment 3 §A2

And the interval path, from `Maintenance-Schedule-as-Data` §3 by way of §A2: a differing interval is **an override carrying a reason and a source, per property, never a second calendar item and never an edit to the schedule file.**

**The join is `component type`, declared on both sides, and no new field is needed.** That is §A1 and it holds unchanged.

---

## The overlap is now fully realised

The parse predicted at most fifteen colliding component types and said they were property-scale. **Thirteen `house.*` types exist in the schedule and all thirteen now carry at least one class.** The prediction held.

| component type | schedule items | classes | schedule cadences |
|---|---:|---:|---|
| `sump-pump` | **6** *(+2 composite)* | **5** | weekly · monthly · quarterly · winter · annual |
| `irrigation-backflow` | 4 | 1 | spring · summer · fall · annual |
| `tree` | 4 | 1 | monthly · spring · annual · multi-year |
| `deck` | 3 | 2 | monthly · spring · multi-year |
| `heat-pump` | 3 | 4 | spring · summer · annual |
| `water-treatment` | 3 | 1 | weekly · monthly · annual |
| `garage-door` | 2 | 2 | monthly · quarterly |
| `hrv-erv` | 2 | 1 | monthly · annual |
| `leak-sensor` | 1 | 2 | monthly |
| `retaining-wall` | 1 | 2 | monthly |
| `dehumidifier` · `humidifier` · `outbuilding` | 1 each | 1 each | weekly / fall / monthly |
| **total** | **32** | **24** | |

**Note the shape: the counts do not line up in either direction.** `tree` is four schedule items against one class; `heat-pump` is three against four. Neither side is a subset of the other, which is why §A2's split is by *job* rather than by count.

---

## The worked case — `sump-pump`

The hardest one available: **eight schedule items across five cadences, against five classes.**

**The schedule's eight** — six keyed directly, two inside `any(...)` composites:

| cadence | audience | item |
|---|---|---|
| weekly | owner | Sump and alarms status normal — glance and listen |
| monthly | owner · pro | Sump test — pour a bucket, watch it run and shut off |
| monthly | pro | Sump pit, pump, and backup exercised |
| quarterly | pro | Sump full test including backup on battery |
| winter | owner · pro | Sump discharge confirmed not frozen ahead of thaw |
| annual | pro | Sump and backup service |
| spring | — | Flood plan and pump backups reviewed · `any(house.sump-pump, property.waterfront)` |
| fall | — | Sump backup and generator load-tested · `any(house.sump-pump, property.generator)` |

**The engine's five classes**, all mapping to `sump-pump`:

| class | care |
|---|---|
| `sump-pump` | `pump-basin-clearing` |
| `sump-pump-backup` | `battery-replacement` · `pump-basin-clearing` |
| `sewage-ejector` | `pump-basin-clearing` |
| `sump-check-valve` | — *(zero care, ruled)* |
| `sump-discharge` | — *(zero care, ruled)* |

**Applying §A2 cleanly.** The schedule contributes six calendar slots at its own cadences. The engine contributes nothing to *when*, and everything to *what and how many*: a house with a primary, a battery backup and an ejector renders the monthly slot as three lines, each naming its object, rather than one line saying *sump*. The annual slot renders the basin clearing and the battery against the specific units. **No duplicate arises, because the two sides answer different questions** — which is the parse's conclusion holding up against the densest content in the file.

---

## Five things §A2 does not reach

Each is evidenced from the content above. **None is decided here.**

### 1 · Multiplicity across *different classes*, not instances of one

§A2's worked phrase is *"two lines where the engine knows there are two pumps"* — **one class, N objects.** `sump-pump` is the other shape: **five different classes on one component type**, and a house may hold several of each.

**The sharp case: `sewage-ejector` is not a sump pump.** It maps to `sump-pump` because that is the type the field config offers, and the delta says so plainly — *different job, different failure, same config type.* So the schedule item *"Sump test — pour a bucket"* fires on a house whose only match is an ejector, and it is the wrong instruction for that object. **The trigger is coarser than the class list**, and §A2 gives no rule for which of five classes a slot expands against.

### 2 · Audience has no counterpart on the engine side

Every schedule item declares one: **117 `pro`, 44 `owner · pro`, 29 `owner`.** No class or care category declares anything equivalent — household-versus-trade lives in category *notes*, as prose, not as data.

So when a slot expands into engine lines, **nothing says whose line it is.** That was cosmetic while the schedule rendered alone. It stops being cosmetic the moment credits exist, because owner work and credit work are the two halves of the monthly design's §5 and they are priced differently.

### 3 · A zero-care class under a recurring slot

`sump-check-valve` and `sump-discharge` declare zero care, and both rulings are sound. But the schedule carries recurring items that land on them — *"Sump discharge confirmed not frozen ahead of thaw"* is a winter item every year.

§A2 says the engine renders detail *inside* the slot, which reads as though the engine always has something to render. **Here it has no care and only inspection points.** The honest resolution looks like *a zero-care class contributes inspection points, not care lines, and the slot renders from the schedule alone* — but that sentence is not in §A2 and it should be somebody's decision rather than an inference.

### 4 · Composite triggers belong to no single component type

Ten items across the schedule fire on `any(...)`, two of them naming `sump-pump` alongside `property.waterfront` and `property.generator`. **§A1's join is component type; a composite has several, or mixes a type with a property flag that has no type at all.**

*"Flood plan and pump backups reviewed"* is a house-grain item that happens to mention sumps. Expanding it per-object would be wrong. Nothing currently says so.

### 5 · The override path is declared but unreachable today

This is the one worth knowing before it is planned around. **No care category declares an interval** — the keys are `id`, `label`, `note`, and nothing else, across all 64.

So the schedule's cadence is not currently a *default* that something else may override; **it is the only cadence in the system.** §A2's override mechanism is correctly specified and has no input yet: there is no engine-side interval that could differ, and therefore no conflict to carry a reason and a source. It becomes live the moment intervals or effort estimates land — which is the monthly design's own open item.

**Recording it because a mechanism with no input reads exactly like a mechanism that works.** Rule 11: the check that has never had a distinguishing input has not been passing.

---

## What this note does not do

It writes no code and adds no scan. **§A2 says a doctrine scan belongs on the override rule**, and that scan cannot be written honestly yet — per item 5, nothing can currently produce the override it would police, so the scan would report green from birth. **That is rule 11b and the scan waits for its input.**

---

**Status:** worked case complete against 155 classes. §A2 held everywhere it spoke. Five gaps flagged, all of them the owner's.
