# Increment 5 Build Spec — Amendment 3

**Date:** 2026-08-04
**Amends:** the Increment 5 Build Spec §1, and Amendments 1 and 2. Everything not listed here stands.
**Cause:** the class list's first pass-two system found three shape defects in §1, and Builder Code's schedule/engine parse settled a reconciliation the design session had raised as open. **Builder Code proposed shipping the class frame as data now, empty. §C says yes**, with the shape corrections below folded in, because the frame is what pass two gets written against.

---

## A. The reconciliation — decided, and it needed no new mechanism

**Reading C is withdrawn.** The design session proposed that the schedule owns what recurs and the class list owns what is inspected once. **The file contradicts it: 39 items key on a component existing *and* carry recurring cadences**, `sump-pump` alone spanning eight. C was an inference from the class list's missing rhythm field, and the design session flagged that as its likely failure mode before the parse ran. It was.

**Adopted: reading B, with granularity as the line.**

| | asks | grain | a house with two softeners |
|---|---|---|---|
| **schedule** | does this **house** have water treatment? | house | **one** row |
| **engine** | what is **this object**? | object | **two** rows, each with its own model, part and interval |

**One system fires without identification; the other cannot fire without it.** That also fixes the deployment order: **the schedule works on day one of a Discovery Visit; the engine needs the desk pass first.**

### A1 · The join is component type, and both sides already declare it

The schedule keys on `house.<component-type>`. §1 has every class declare **the component type it maps to, or an explicit `none`**. **No new field, no mapping layer.**

**And the collision is narrow and enumerable today — at most 15 types.** The schedule's keyed types are property-scale: sump, trees, irrigation, decks, retaining walls, garage door, HRV, fireplace. **It keys on no water heater, no furnace, no panel and no appliance** — precisely where the engine's care stream will be densest.

### A2 · When both fire — and the override mechanism was already built

**The schedule owns the calendar slot and the default cadence. The engine owns identity, multiplicity, and model-specific detail rendered inside that slot.** One calendar entry, expanded to two lines where the engine knows there are two pumps.

**So there is no duplicate to reconcile.** And the interval conflict the request feared already has a declared answer — `Maintenance-Schedule-as-Data` §3, line 45:

> *Interval overrides work the same way. Manufacturer instructions, specialist advice, insurer requirements, and actual condition override generic intervals — per property, carrying a reason and a source, never editing this file.*

**A research-pass finding of *every six months for this model* is a manufacturer-instruction override.** The mechanism, its per-property scope, and its obligation to carry a reason and a source are all already declared. **Third instance today of the answer already existing in a document** — after audience and `caution`.

**Consequence for the engine:** a research-pass interval that differs from a schedule default **must be written as an override carrying its reason and source**, never as a second calendar item. A doctrine scan belongs on that.

---

## B. Three shape changes to §1, before the file ships

### B1 · System membership is a set

**Frame §5.1 declares it singular.** `water-heater-indirect` breaks it on the first system written — it is domestic hot water **and** hydronic, and dropping either loses a real property-pass question. **A set, and holding two is ordinary rather than exceptional.**

### B2 · A measure inspection point declares its unit

`delivery-temperature` is °C; `expansion-tank-charge` is kPa. **The shape has nowhere to declare either.** The field app already carries three deliberately *unitless* measure items for the opposite reason — %WME, %MC and relative 0–100 being different scales — so the distinction is live: **a unit is declared, or its absence is explicit.** Same discipline as `none` versus an absent key, ninth instance.

### B3 · Care categories, inspection points and opportunity conditions are declared vocabularies, not free text

**This is the load-bearing one and it is why the frame should ship before the content, not after.**

§1 as written has each class carry its own categories. **Written as free text across 172 classes, three classes say *filter change*, *filter replacement* and *replace filter*, and nothing catches it** — §1a's two-taxonomies failure inside one file.

**It also breaks the review queue.** §7's job is *"three water heaters this quarter returned expansion tank inspection and the class does not declare it."* **Counting proposals against the frame requires the frame's entries to be tokens.**

**So: three declared lists in the frame file, and a class references them.** A class naming an undeclared term is a **visible error**, same discipline as §1a's component-type cross-check.

**Measured from the pilot:** eight classes produced 7 care categories, 15 inspection points and 7 opportunity conditions — and **five of the seven care categories are already shared with systems not yet written.** As prose, `air-filter-replacement` would have been written five times, differently.

**Two honest weaknesses, both stated so the check is not over-trusted:**

1. **This cross-check is weaker than §1a's.** §1a reads an *external* config the class file does not own. This one has both sides in one file, authored by one session — so it catches typos and drift, never judgement errors.
2. **It can be idle from birth.** If the vocabulary is written *from* the classes afterwards, no class can ever name an undeclared term and the check never fails. **Rule 11.** It must be negative-tested against a class naming a term the vocabulary does not declare, and the vocabulary must be authored from the systems first.

### B4 · The care/inspection line, decided because the pilot forced it

A TPR valve is the case: **operating it is an action on a rhythm; looking at its discharge piping is a look.**

> **Care changes the state of the thing. Inspection looks at the thing and reports.**

**Care feeds the schedule's calendar. Inspection feeds the Inspection Visit.** §0.4's four streams stay uncollapsed because of it.

---

## C. Ship the frame empty now — yes

**Builder Code's proposal is right and the reasoning generalises.** Pass two written as markdown and translated later is a transformation applied by hand to 172 rows, which is the shape of every drift failure in this project. **Written against the shipped file, it is authored in its final form.**

**It also makes §1a's cross-check real rather than idle** against the walk's config v1.11.0, which Builder Code has now parsed twice — though §F of Amendment 1 still stands: **with zero classes, §1a reports green forever**, and its behavioural test must construct a class naming a type the config does not declare.

**Nothing here commits the design session to content.** The frame ships **empty**, the way `retirement-lineage-v1.json` shipped with zero entries, and for the same reason: emptiness is the honest state.

**One sequencing note, recorded rather than specced.** Builder Code named the real cost of holding Increment 5 — half-built and idle, with decisions in the built half going stale against a moving spec. **Shipping the frame is the cheapest thing that reduces it**, because it converts a spec section into a file that the content pass then constrains rather than the other way round.

---

**Status:** amendment 3. §1 stands as corrected by §B. **§A is decided; §C is a go.**
