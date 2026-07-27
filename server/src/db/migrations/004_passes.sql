-- HouseSteady binder builder — migration 004
--
-- The fresh pass itself: the sitting a concierge does within a day or two of a
-- visit, walking the record zone by zone while the house is still in mind.
--
-- WHY THIS IS NOT AN OVERLAY. Overlays record what the desk says about the
-- evidence. These two tables record the desk session — which rooms were walked
-- and when the sitting started. That is not a claim about the house, so it does
-- not belong in the same table as claims about the house, and it must never be
-- mistaken for one.
--
-- Spec §4 does not enumerate these, and §5-6 require them: "every zone has been
-- opened" is a completion condition and "zones walked … time in pass" is a
-- progress figure, neither of which is derivable from anything else in the
-- database. An hour is budgeted for this sitting and §1 calls it the
-- highest-value hour in the process; a screen that cannot say how far through it
-- you are is not honest about the one thing it is asking for.

CREATE TABLE passes (
  id            TEXT PRIMARY KEY,
  property_id   TEXT NOT NULL REFERENCES properties(id),
  visit_id      TEXT NOT NULL REFERENCES visits(id),

  -- full | changes-only.
  --
  -- Spec §1: baseline is the full walk; a monthly visit is smaller and mostly
  -- "what changed", and the short queue belongs there. Change detection needs
  -- cross-visit identity and therefore manifest v4, so 2a ships the full walk
  -- for both and this column records which was intended. It is set from
  -- visits.kind and is currently always 'full' in practice — the value exists so
  -- that when v4 lands, an old pass still says what it actually was rather than
  -- being retroactively reinterpreted.
  mode          TEXT NOT NULL,

  started_at    TEXT NOT NULL,
  -- Set once, when the pass is marked complete. The only updatable column in
  -- this file, and it is the desk session's own lifecycle rather than anything
  -- the field captured.
  completed_at  TEXT,

  -- What was still open at the moment it was marked complete. JSON array, and
  -- NULL when the pass finished with nothing outstanding.
  --
  -- A pass CAN be closed with work still open, because the alternative is worse.
  -- Refusing outright leaves two options: invent decisions to satisfy the gate,
  -- or leave every pass permanently open — and once most passes are permanently
  -- open, "complete" has stopped meaning anything at all. So the concierge may
  -- close it, and the record keeps exactly what they closed it over. That is the
  -- honest version: not a lock people route around, but a decision with its
  -- reason attached (CLAUDE.md §4.6 — never drop anything silently).
  completed_with_outstanding TEXT,

  created_at    TEXT NOT NULL
);

-- One pass per visit. A second sitting on the same visit continues the first
-- rather than starting a parallel record of the same hour.
CREATE UNIQUE INDEX idx_passes_visit ON passes(visit_id);

-- Append-only, one row per opening, rather than a row per zone with a counter.
--
-- Same instinct as resolutions vs events: a zone opened, left, and returned to
-- is a different afternoon from one walked once and finished, and a counter
-- would flatten the two. "Zones walked" is COUNT(DISTINCT zone_id) over this.
CREATE TABLE pass_zone_opens (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  pass_id  TEXT NOT NULL REFERENCES passes(id),
  zone_id  TEXT NOT NULL,
  at       TEXT NOT NULL
);
CREATE INDEX idx_pass_zone_opens_pass ON pass_zone_opens(pass_id);
CREATE INDEX idx_pass_zone_opens_zone ON pass_zone_opens(pass_id, zone_id);

-- Every completion and reopening, append-only.
--
-- Same relationship as resolutions[] to events[] elsewhere in this schema:
-- `passes.completed_at` and `passes.completed_with_outstanding` are CURRENT
-- STATE, and this is the HISTORY they are a projection of.
--
-- The two exist separately because the columns have to be cleared on reopen —
-- a reopened pass is not complete and must not display an outstanding figure
-- describing a moment that has passed. But "closed over 5 open decisions at
-- 10:35, reopened at 10:37 because a decision was recorded" is exactly the kind
-- of thing this software must not lose, so the completion keeps its own frozen
-- copy of what was outstanding at the instant it was written. Nothing here is
-- ever updated or deleted.
CREATE TABLE pass_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  pass_id      TEXT NOT NULL REFERENCES passes(id),
  type         TEXT NOT NULL,   -- completed | reopened. Open vocabulary.
  at           TEXT NOT NULL,
  -- On `completed`: what was still open, JSON array, frozen at that instant.
  -- NULL when it completed with nothing outstanding.
  outstanding  TEXT,
  -- On `reopened`: why. A pass reopens either because somebody asked, or
  -- because a decision was recorded after it was closed — and those are
  -- different facts about the afternoon.
  reason       TEXT
);
CREATE INDEX idx_pass_events_pass ON pass_events(pass_id, id);
