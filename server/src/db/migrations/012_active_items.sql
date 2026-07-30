-- Increment 4 §3c — the field's own resolved active item set.
--
-- WHICH ITEMS WERE EVER DUE IS THE FIELD'S ANSWER. Deriving it here is a second
-- implementation of the field app's trigger engine, and the failure mode of two
-- implementations is silent divergence: both apps confident, neither erroring,
-- and the gap report quietly short by however many items the two disagree about.
--
-- v4 ships this. v3 does not, so for a v3 import the builder computes the set
-- and marks every item `computed`. Both paths land in this table with the same
-- columns and the only difference is `origin` — which is the point. Nothing
-- downstream reads the manifest version.
--
-- KEYED IDENTICALLY TO `resolutions`, on scope_kind + scope_zone_id +
-- scope_pin_id + item_id. The join between "was it due" and "was it answered"
-- is the whole gap stream, and a key that does not line up makes it a fuzzy
-- match instead of a join.

CREATE TABLE active_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id      TEXT NOT NULL REFERENCES imports(id),
  property_id    TEXT NOT NULL REFERENCES properties(id),
  visit_id       TEXT REFERENCES visits(id),

  scope_kind     TEXT NOT NULL,
  scope_zone_id  TEXT,
  scope_pin_id   TEXT,
  item_id        TEXT NOT NULL,

  -- The field app's own grouping. Display only, never joined on: it is advisory
  -- by the field's own description, and a value that is advisory in one system
  -- and load-bearing in another is how the two drift apart.
  item_group     TEXT,

  -- Open vocabulary — §1c. Only `proposed` is read; everything else here is
  -- cross-checked against `resolutions` and any disagreement is REPORTED, never
  -- resolved by picking a side.
  status         TEXT,

  -- `received` = the export declared it. `computed` = this builder worked it out
  -- from the config snapshot because the export carried none.
  --
  -- PER ROW, NOT PER IMPORT OR PER PROPERTY. The audit is property-scoped (§1i),
  -- so a property with a v3 baseline and a v4 monthly holds both kinds at once —
  -- which is the normal case from v4 onward, not an edge. A single origin field
  -- on the set would have to lie about one of them.
  origin         TEXT NOT NULL CHECK (origin IN ('received', 'computed')),

  created_at     TEXT NOT NULL
);

CREATE UNIQUE INDEX active_items_key ON active_items (
  import_id, scope_kind, COALESCE(scope_zone_id, ''), COALESCE(scope_pin_id, ''), item_id
);
CREATE INDEX active_items_property ON active_items (property_id);


-- The carried items of one audit run — §1b, the field-checklist gap stream.
--
-- STORED FOR THE SAME REASON `audit_slots` IS: a rendered gap report has to be
-- reproducible. A client asking in September why their March report listed
-- nineteen items in the ensuite gets an answer out of the record.
--
-- THIS IS NOT `audit_slots` AND MUST NOT BE MERGED WITH IT. Increment 3's three
-- causes — nothing captured / captured but short / never reached — describe why
-- a BINDER SLOT is short. This stream answers a different question about a
-- different object: which checklist item, in which room, was never answered.
-- Collapsing them is the modelling mistake CLAUDE.md §5 names.
CREATE TABLE audit_carried_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  audit_run_id   TEXT NOT NULL REFERENCES audit_runs(id),

  scope_kind     TEXT NOT NULL,
  scope_zone_id  TEXT,
  scope_pin_id   TEXT,
  item_id        TEXT NOT NULL,

  -- `not-reached` | `not-accessible` | `deferred` | an na reason id the config
  -- declares as feeding the gap list but that this builder has no name for.
  --
  -- OPEN VOCABULARY, DELIBERATELY. §1b: classify from the boolean, never from
  -- the reason id. A config that adds a fifth gap-feeding reason must produce a
  -- row here, not a silence, and the reason id it carries is preserved verbatim
  -- alongside so nothing is lost to a classification the builder invented.
  reason         TEXT NOT NULL,
  na_reason_id   TEXT,

  -- Which of the report's three columns this row belongs to, so §5's editor can
  -- show a misclassification rather than only a wrong sentence.
  column_id      TEXT NOT NULL,

  -- The structured parts, never a composed sentence. §2a: the internal composer
  -- and the client-facing one both read these, and neither reads the other's
  -- output. Stored as JSON `{ what, why? }`.
  parts          TEXT NOT NULL,

  -- Which import first made this item due, and the origin of that claim.
  due_since_import_id TEXT REFERENCES imports(id),
  due_since_at   TEXT,
  origin         TEXT NOT NULL,

  -- `proposed` — §1c. Evidence is sitting on a pin unconfirmed. Distinguishable
  -- from an item nobody touched at every layer, and out of the client render by
  -- default: an unconfirmed photograph is our work, not the client's.
  status         TEXT,

  created_at     TEXT NOT NULL
);

CREATE INDEX audit_carried_items_run ON audit_carried_items (audit_run_id);
