-- Amendment 11 pass 1 — what text is on these things, and on which surface.
--
-- TWO TABLES, AND THE SPLIT IS THE WHOLE DESIGN.
--
-- The amendment's unit is `{ field, value, surface }`, and a row of
-- `reading_fields` joined to its `readings` row is exactly that triple. What the
-- flat triple alone cannot hold is WHICH LABEL a field came from — and one
-- photograph holding two labels is not a hypothetical, it is two measured
-- failures on one room:
--
--   * A ClimateMaster data plate and a NextEnergy warranty decal on one cabinet.
--     Distinguishable by surface alone, so a flat shape survives this one.
--   * `UP26-99F` and `UPS26-99U` — ONE photograph holding TWO pump nameplates at
--     an angle. Both are `nameplate`, so surface cannot separate them. Flat,
--     these are indistinguishable from one plate read twice and disagreed with
--     itself, which is the difference between two pumps and a legibility problem
--     — the exact question the scoring harness's rule 6 exists to answer.
--
-- So: a photograph holds zero or more LABELS; a label has one surface; a label
-- holds zero or more FIELDS. **The middle level is what a flat triple loses.**
--
-- A LABEL WITH NO FIELDS IS THE POINT, NOT AN EMPTY ROW. *There is a plate here
-- and I cannot read it* is a real, useful state — it says reshoot this — and it
-- is only expressible if the label exists independently of its fields.
--
-- `N/A` IS STORED VERBATIM AND IS NOT AN ABSENCE. The WellMate's plate reads
-- `Factory Precharge pressure: N/A` and `N/A` across all three drawdown columns,
-- which is the strongest negative evidence that plate carries. Three states, and
-- they must never collapse into each other:
--
--   value 'N/A',  unreadable 0  -> the cell says N/A. A fact about the product.
--   value '',     unreadable 1  -> the field is named and its value is illegible.
--   no row at all                -> the label does not carry that field.
--
-- ATTRIBUTION LIVES ON THE LABEL, NOT ON EACH CELL. `readings` carries
-- `actor_id` and its trigger; `reading_fields` does not, because a cell is part
-- of a reading rather than an act of its own. Ten cells off one plate are one
-- person reading one plate once.

CREATE TABLE readings (
  id            TEXT PRIMARY KEY,
  property_id   TEXT NOT NULL REFERENCES properties(id),
  import_id     TEXT REFERENCES imports(id),

  -- The photograph the label was read from. Not a foreign key, matching
  -- `object_media`: media is keyed per import and a reading is a claim about a
  -- media id rather than a row in it.
  media_id      TEXT NOT NULL,
  zone_id       TEXT,

  -- Open vocabulary, and deliberately so. `nameplate`, `fascia-brand`,
  -- `adjacent-sticker`, `handwritten-tag`, `document` and `surface-unclear` are
  -- what Amendment 11 declares — but a surface is a fact about the photograph
  -- rather than a choice from this repo's taxonomy, so a word the builder has
  -- not met is preserved and marked, never nulled. Doctrine 7.
  --
  -- The safety property that makes fail-open safe here: an unrecognised surface
  -- is NOT `nameplate`, and only a nameplate may assert a manufacturer. A new
  -- word can therefore never gain authority by being unknown.
  surface       TEXT NOT NULL,

  -- Where on the object, in the model's own words. Evidence for the human, never
  -- parsed. CLAUDE.md §9: the record abstains, the prompt does not.
  surface_note  TEXT,

  -- Where this label sat in its call's answer.
  --
  -- **Explicit, because the alternative was random.** Two labels written in one
  -- transaction share `created_at` to the second, so ordering by time alone
  -- falls through to the primary key — which is a uuid, so the read order of two
  -- plates in one photograph was decided by chance. A flaky test found it.
  --
  -- It is not cosmetic: Amendment 11's join argument is that **capture sequence
  -- proposes which plates belong to which object**, and a sequence that reorders
  -- itself between reads carries no proposal at all. `rowid` would work today and
  -- would be renumbered by the next table rebuild — migration 019 did exactly
  -- that to `objects`.
  position      INTEGER NOT NULL,

  generation_id TEXT REFERENCES ai_generations(id),
  actor_id      TEXT NOT NULL REFERENCES operators(id),
  created_at    TEXT NOT NULL
);

CREATE INDEX idx_readings_import ON readings(import_id);
CREATE INDEX idx_readings_media ON readings(media_id);
CREATE INDEX idx_readings_generation ON readings(generation_id);

CREATE TRIGGER trg_readings_actor BEFORE INSERT ON readings
WHEN NEW.actor_id IS NULL OR NEW.actor_id = ''
BEGIN SELECT RAISE(ABORT, 'readings: every row records which operator acted'); END;

CREATE TABLE reading_fields (
  id          TEXT PRIMARY KEY,
  reading_id  TEXT NOT NULL REFERENCES readings(id),

  -- The field name exactly as printed — `Factory Precharge pressure`, `Cat. No.`,
  -- `MODEL`. Verbatim, because the plate's own wording is evidence.
  field       TEXT NOT NULL,

  -- The same name reduced for querying: lowercased, punctuation stripped. Stored
  -- rather than computed at query time so an index can exist, and derived in one
  -- place so `Model No.` and `MODEL` cannot answer differently in two callers.
  field_key   TEXT NOT NULL,

  -- Verbatim. May be `N/A`, may be `—`, may be a partial read.
  value       TEXT NOT NULL,

  -- 1 when the field is named on the label and its value could not be read.
  -- `value` then carries whatever characters resolved, which is evidence for the
  -- person and is never treated as the value.
  unreadable  INTEGER NOT NULL DEFAULT 0 CHECK (unreadable IN (0, 1)),

  -- The order the fields appear on the label, so a stored reading can be shown
  -- the way the plate reads.
  position    INTEGER NOT NULL,

  created_at  TEXT NOT NULL
);

CREATE INDEX idx_reading_fields_reading ON reading_fields(reading_id);
CREATE INDEX idx_reading_fields_key ON reading_fields(field_key);
