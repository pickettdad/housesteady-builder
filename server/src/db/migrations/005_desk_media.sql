-- HouseSteady binder builder — migration 005
--
-- Captures the DESK makes: the memory note recorded while walking the record,
-- and (later) anything else the concierge produces at a keyboard rather than in
-- a house.
--
-- WHY THIS IS NOT THE `media` TABLE. `media` holds what the field app sent, and
-- every captured table in 001 is insert-only evidence the builder may read and
-- never write. A desk recording is a different kind of thing with a different
-- origin, and putting it in the same table would make "did the field capture
-- this?" a question you answer by reading a column carefully instead of by
-- looking at which table it came from. The doctrine scan that forbids the
-- overlay layer writing to a captured table would also have to be weakened, and
-- that scan is worth more than the convenience.
--
-- Spec §4: zone memory is "an audio file stored like any other media with
-- `origin = desk`". This is that table.

CREATE TABLE desk_media (
  id           TEXT PRIMARY KEY,
  property_id  TEXT NOT NULL REFERENCES properties(id),
  visit_id     TEXT NOT NULL REFERENCES visits(id),

  -- Open vocabulary, like media.kind. `audio` today; video at the desk is not
  -- inconceivable and must not need a migration.
  kind         TEXT NOT NULL,
  -- Always 'desk' today. The column exists so the answer is on the row rather
  -- than implied by which table it is in.
  origin       TEXT NOT NULL,

  file         TEXT NOT NULL,   -- relative to the visit directory, never absolute
  mime         TEXT,
  bytes        INTEGER,
  sha256       TEXT,
  duration_ms  INTEGER,

  -- ------------------------------------------------------- capture assurance
  --
  -- Spec §5: "do not assume capture worked, prove it." These columns are the
  -- proof, measured at record time and kept, so that a recording which turns
  -- out to be silent says so months later and not only in the moment.
  --
  -- peak_level is 0–1, the loudest sample the browser saw while recording. A
  -- muted microphone produces a file of the right length full of near-silence,
  -- which is indistinguishable from a good file by size alone — that is the
  -- exact failure this guards against.
  peak_level      REAL,
  silent          INTEGER NOT NULL DEFAULT 0,
  -- Set when the concierge was told a recording is silent or empty and chose to
  -- keep it anyway. The pass cannot be completed while one sits unacknowledged,
  -- and "acknowledged" has to be a recorded act rather than an assumption.
  acknowledged_at TEXT,

  created_at   TEXT NOT NULL
);
CREATE INDEX idx_desk_media_visit ON desk_media(visit_id);
