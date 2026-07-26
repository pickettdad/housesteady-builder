-- HouseSteady binder builder — migration 002
--
-- Fixes a doctrine bug in 001: `pins.number` was NOT NULL.
--
-- A pin created and abandoned before it was numbered is messy content, not a
-- broken file, and "fail open on vocabulary, fail closed on structure" puts it
-- firmly on the open side. The NOT NULL constraint meant one numberless pin
-- refused an otherwise good visit — losing the 99% that was fine to protect
-- against the 1% that was odd. That is exactly backwards.
--
-- The import now stores the pin with a null number and warns that it cannot be
-- followed across visits, which is the true statement. Nothing is dropped.
--
-- Migrations are append-only for the same reason imports are: 001 has already
-- run on machines that are not this one, and rewriting history would leave their
-- database silently disagreeing with the file that supposedly describes it.

CREATE TABLE pins_new (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  pin_id           TEXT NOT NULL,
  import_id        TEXT NOT NULL REFERENCES imports(id),
  property_id      TEXT NOT NULL,
  visit_id         TEXT NOT NULL,
  -- The cross-visit join key. Permanent per property, stable across years.
  -- Nullable: a pin without one is valid, it simply cannot be joined to itself
  -- next visit. The import report names every such pin.
  number           INTEGER,
  zone_id          TEXT,
  type_kind        TEXT,
  component_type   TEXT,
  freeform_label   TEXT,
  nickname         TEXT,
  flag             TEXT,
  retired_at       TEXT,
  media_ids        TEXT,
  note_ids         TEXT,
  chat_thread_ids  TEXT,
  created_at       TEXT NOT NULL,
  UNIQUE (import_id, pin_id)
);

INSERT INTO pins_new
  SELECT id, pin_id, import_id, property_id, visit_id, number, zone_id, type_kind,
         component_type, freeform_label, nickname, flag, retired_at, media_ids,
         note_ids, chat_thread_ids, created_at
  FROM pins;

DROP TABLE pins;
ALTER TABLE pins_new RENAME TO pins;

CREATE INDEX idx_pins_import ON pins(import_id);
CREATE INDEX idx_pins_zone ON pins(import_id, zone_id);
CREATE INDEX idx_pins_property_number ON pins(property_id, number);
