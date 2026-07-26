-- HouseSteady binder builder — migration 001
--
-- Doctrine that shapes this schema (CLAUDE.md §4):
--
--   imports.raw_manifest is the record of truth. Every other column in this
--   file is a query convenience derived from it. If they ever disagree, the
--   raw JSON wins and the derived column is the bug.
--
--   Nothing imported is ever UPDATEd. Builder-side changes arrive in later
--   increments as overlay tables that reference these rows by id. There are
--   deliberately no "verified", "corrected" or "notes" columns on captured
--   entities — that is what makes "never launder an inference into an
--   observation" a property of storage rather than a rule someone must
--   remember.
--
--   Vocabulary columns (kind, via, type, flag, owner_kind, result, reason_id)
--   are plain TEXT with NO CHECK constraints, on purpose. The field app is
--   still adding words — a `choice` resolution kind, `video` media, `voice`
--   possibly renamed to `audio`. An unknown word must import cleanly and be
--   reported as unrecognized. Structure fails closed; vocabulary fails open.

-- ---------------------------------------------------------------- core

CREATE TABLE properties (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  address     TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE visits (
  id           TEXT PRIMARY KEY,
  property_id  TEXT NOT NULL REFERENCES properties(id),
  kind         TEXT NOT NULL,           -- baseline | monthly | other (operator-entered;
                                        -- the manifest does not declare it)
  visit_date   TEXT,
  notes        TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_visits_property ON visits(property_id);

CREATE TABLE imports (
  id                       TEXT PRIMARY KEY,
  visit_id                 TEXT NOT NULL REFERENCES visits(id),
  property_id              TEXT NOT NULL REFERENCES properties(id),
  imported_at              TEXT NOT NULL,
  manifest_schema_version  INTEGER,
  app_version              TEXT,
  session_id               TEXT,
  config_id                TEXT,
  config_version           TEXT,
  config_hash              TEXT,
  media_mode               TEXT NOT NULL,   -- manifest_only | with_media
  raw_manifest             TEXT NOT NULL,   -- verbatim, whole, never rewritten
  validation_report        TEXT NOT NULL,   -- JSON
  status                   TEXT NOT NULL,   -- ok | ok_with_warnings | failed
  created_at               TEXT NOT NULL
);
CREATE INDEX idx_imports_visit ON imports(visit_id);
CREATE INDEX idx_imports_property ON imports(property_id);
-- Re-importing the same export into the same visit is refused (spec §5).
CREATE UNIQUE INDEX idx_imports_visit_session ON imports(visit_id, session_id);

CREATE TABLE session_meta (
  import_id       TEXT PRIMARY KEY REFERENCES imports(id),
  session_id      TEXT,
  property_label  TEXT,        -- free text from the field app. NEVER used to match a
                               -- property automatically — see property_label_match.
  flags           TEXT,        -- JSON array
  started_at      TEXT,
  completed_at    TEXT,
  exported_at     TEXT,
  lifecycle       TEXT,        -- JSON array of {type, at, reason?}
  totals          TEXT,        -- JSON, as declared by the export
  orphan_events   TEXT,        -- JSON array
  events_count    INTEGER,
  created_at      TEXT NOT NULL
);

CREATE TABLE config_snapshots (
  import_id       TEXT PRIMARY KEY REFERENCES imports(id),
  config_id       TEXT,
  config_version  TEXT,
  config_hash     TEXT,
  snapshot        TEXT NOT NULL,   -- JSON, full: naReasons, layers, all item definitions
  created_at      TEXT NOT NULL
);

-- ---------------------------------------------------- captured entities

CREATE TABLE zones (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_id         TEXT NOT NULL,
  import_id       TEXT NOT NULL REFERENCES imports(id),
  property_id     TEXT NOT NULL,
  visit_id        TEXT NOT NULL,
  type            TEXT,
  label           TEXT,
  level           TEXT,
  attributes      TEXT,          -- JSON
  closed_at       TEXT,
  close_note      TEXT,
  -- Stored exactly as exported. Reconstructing it from the config's inheritance
  -- and trigger rules is the audit engine's job (Increment 3) — see
  -- /docs/..._Increment-3_Note_Zone-Audit-Reconstruction_2026-07-26.md
  audit_summary   TEXT,          -- JSON {coreUnresolved[], standardUnresolved, naCount}
  created_at      TEXT NOT NULL,
  UNIQUE (import_id, zone_id)
);
CREATE INDEX idx_zones_import ON zones(import_id);

CREATE TABLE canvases (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  canvas_id   TEXT NOT NULL,
  zone_id     TEXT NOT NULL,
  import_id   TEXT NOT NULL REFERENCES imports(id),
  kind        TEXT,
  retired     INTEGER NOT NULL DEFAULT 0,
  media_id    TEXT,
  file        TEXT,
  created_at  TEXT NOT NULL,
  UNIQUE (import_id, canvas_id)
);
CREATE INDEX idx_canvases_import ON canvases(import_id);
CREATE INDEX idx_canvases_zone ON canvases(import_id, zone_id);

CREATE TABLE pins (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  pin_id           TEXT NOT NULL,
  import_id        TEXT NOT NULL REFERENCES imports(id),
  property_id      TEXT NOT NULL,
  visit_id         TEXT NOT NULL,
  -- The cross-visit join key. Permanent per property, stable across years.
  -- This column is why the schema is longitudinal from commit one.
  number           INTEGER NOT NULL,
  zone_id          TEXT,
  -- type is ABSENT (not null) on typeless pins in the real export. All three
  -- columns null = a pin the operator created and never typed. That is valid.
  type_kind        TEXT,          -- component | freeform | NULL
  component_type   TEXT,
  freeform_label   TEXT,
  -- Reserved. The contract's telemetry requires nicknames as their own field,
  -- distinct from type.label; no pins[].label appears in the real export.
  -- Question routed to the field session (Addendum §8.1). Column exists so the
  -- answer needs no migration.
  nickname         TEXT,
  flag             TEXT,          -- issue | monitor | NULL
  retired_at       TEXT,          -- from pins[].retired.at; retired pins keep their number
  media_ids        TEXT,          -- JSON array
  note_ids         TEXT,          -- JSON array
  chat_thread_ids  TEXT,          -- JSON array
  created_at       TEXT NOT NULL,
  UNIQUE (import_id, pin_id)
);
CREATE INDEX idx_pins_import ON pins(import_id);
CREATE INDEX idx_pins_zone ON pins(import_id, zone_id);
CREATE INDEX idx_pins_property_number ON pins(property_id, number);

CREATE TABLE anchors (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  anchor_id   TEXT NOT NULL,
  pin_id      TEXT NOT NULL,
  canvas_id   TEXT,
  x           REAL,              -- normalized 0-1 relative to the canvas image
  y           REAL,
  import_id   TEXT NOT NULL REFERENCES imports(id),
  created_at  TEXT NOT NULL,
  UNIQUE (import_id, anchor_id)
);
CREATE INDEX idx_anchors_import ON anchors(import_id);
CREATE INDEX idx_anchors_pin ON anchors(import_id, pin_id);

CREATE TABLE media (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  media_id          TEXT NOT NULL,
  import_id         TEXT NOT NULL REFERENCES imports(id),
  property_id       TEXT NOT NULL,
  visit_id          TEXT NOT NULL,
  kind              TEXT,        -- photo | voice | video | ... OPEN vocabulary
  -- Ownership is explicit in the export. Parse owner; the path is storage
  -- location only, never the source of ownership.
  owner_kind        TEXT,        -- zone | pin | canvas | inbox
  owner_zone_id     TEXT,
  owner_pin_id      TEXT,
  owner_pin_number  INTEGER,
  owner_canvas_id   TEXT,
  group_key         TEXT,        -- the export's zip grouping key
  file              TEXT,        -- relative path, exactly as exported
  mime              TEXT,
  bytes             INTEGER,     -- as declared by the manifest
  sha256            TEXT,
  sha_verified      INTEGER NOT NULL DEFAULT 0,
  file_status       TEXT NOT NULL,   -- present | absent | failed_checksum
  bytes_on_disk     INTEGER,     -- null when absent; may differ from declared bytes
  captured_at       TEXT,
  duration_ms       INTEGER,
  source            TEXT,        -- JSON
  created_at        TEXT NOT NULL,
  UNIQUE (import_id, media_id)
);
CREATE INDEX idx_media_import ON media(import_id);
CREATE INDEX idx_media_owner_pin ON media(import_id, owner_pin_id);
CREATE INDEX idx_media_owner_zone ON media(import_id, owner_zone_id);

CREATE TABLE notes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id      TEXT NOT NULL,
  import_id    TEXT NOT NULL REFERENCES imports(id),
  target_kind  TEXT,
  target_id    TEXT,
  text         TEXT,
  at           TEXT,
  source       TEXT,             -- JSON
  created_at   TEXT NOT NULL,
  UNIQUE (import_id, note_id)
);
CREATE INDEX idx_notes_import ON notes(import_id);
CREATE INDEX idx_notes_target ON notes(import_id, target_id);

CREATE TABLE chat_threads (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id    TEXT NOT NULL,
  import_id    TEXT NOT NULL REFERENCES imports(id),
  target_kind  TEXT,
  target_id    TEXT,
  created_at   TEXT NOT NULL,
  UNIQUE (import_id, thread_id)
);
CREATE INDEX idx_chat_threads_import ON chat_threads(import_id);

CREATE TABLE chat_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id   TEXT NOT NULL,
  import_id   TEXT NOT NULL REFERENCES imports(id),
  -- Messages carry no seq in the export. This is position in the array,
  -- assigned at import, 1-based. Order is the file's order.
  seq         INTEGER NOT NULL,
  role        TEXT,              -- user | assistant
  text        TEXT,
  media_ids   TEXT,              -- JSON array (absent on some messages)
  model       TEXT,              -- set on AI replies
  at          TEXT,
  source      TEXT,              -- JSON; source.actor is 'ai' on model replies
  created_at  TEXT NOT NULL,
  UNIQUE (import_id, thread_id, seq)
);
CREATE INDEX idx_chat_messages_thread ON chat_messages(import_id, thread_id);

CREATE TABLE inbox_refs (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id            TEXT NOT NULL REFERENCES imports(id),
  ref_kind             TEXT NOT NULL,   -- media | note
  ref_id               TEXT NOT NULL,
  -- Assignment is Increment 2. Columns exist now so nothing retrofits.
  assigned_zone_id     TEXT,
  assigned_pin_number  INTEGER,
  created_at           TEXT NOT NULL,
  UNIQUE (import_id, ref_kind, ref_id)
);
CREATE INDEX idx_inbox_import ON inbox_refs(import_id);

-- ------------------------------------------------- the checklist state

-- resolutions[] is current state. events[] is history. Both are stored; the
-- audit reads this table, the audit trail reads events.
CREATE TABLE resolutions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id       TEXT NOT NULL REFERENCES imports(id),
  property_id     TEXT NOT NULL,
  visit_id        TEXT NOT NULL,
  scope_kind      TEXT,          -- zone | pin | session
  scope_zone_id   TEXT,
  scope_pin_id    TEXT,
  item_id         TEXT NOT NULL,
  kind            TEXT,          -- satisfied | na | ... unrecognized preserved verbatim
  via             TEXT,          -- check | pin | photo | note | NULL
  result          TEXT,          -- pass | fail | NULL
  note            TEXT,
  reason_id       TEXT,          -- keys into config.snapshot.naReasons
  evidence        TEXT,          -- JSON, e.g. {pinId}. Nested inside resolution{} in
                                 -- the export; easy to drop, must not be.
  at              TEXT,
  source          TEXT,          -- JSON
  is_recognized   INTEGER NOT NULL DEFAULT 1,

  -- Derived at import from THIS import's own config snapshot. Never hardcoded —
  -- the rule stays correct when the field app adds na reasons.
  --
  -- feeds_gap_list : kind = na AND that reason has feedsGapList = true
  --                  -> gap report, "missing from us"
  -- records_finding: (kind = na AND reason has recordsFinding = true)
  --                  OR result = 'fail'
  --                  -> condition assessment. NOT the same as "a problem":
  --                     failed checks are defects, confirmed absences are facts.
  --                     Both belong in the binder. (CLAUDE.md §5)
  --
  -- These two columns are what Increments 3-4 read. Getting them right is the
  -- point of this increment.
  feeds_gap_list  INTEGER NOT NULL DEFAULT 0,
  records_finding INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL
);
CREATE INDEX idx_resolutions_import ON resolutions(import_id);
CREATE INDEX idx_resolutions_scope ON resolutions(import_id, scope_kind, scope_zone_id);
CREATE INDEX idx_resolutions_gap ON resolutions(import_id, feeds_gap_list);
CREATE INDEX idx_resolutions_finding ON resolutions(import_id, records_finding);

CREATE TABLE events (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id             TEXT NOT NULL REFERENCES imports(id),
  event_id              TEXT,
  seq                   INTEGER,
  type                  TEXT,
  at                    TEXT,
  event_schema_version  INTEGER,   -- per-event, independent of manifestSchemaVersion
  source                TEXT,      -- JSON
  payload               TEXT NOT NULL,  -- the whole event verbatim
  is_recognized         INTEGER NOT NULL DEFAULT 1,
  created_at            TEXT NOT NULL
);
CREATE INDEX idx_events_import ON events(import_id);
CREATE INDEX idx_events_seq ON events(import_id, seq);
CREATE INDEX idx_events_type ON events(import_id, type);

-- --------------------------------------------------- AI provenance (empty)

-- Created empty in Increment 1 so the shape exists before Increment 2 writes to
-- it and no migration is needed later. No AI logic in this increment.
--
-- Two rules the shape enforces:
--   1. A row here is NEVER itself client-facing content. Client-facing content
--      is an overlay record a human signed, which may cite a generation id as
--      its origin. There is deliberately no "published" or "rendered" column.
--   2. abstained = 1 is a SUCCESSFUL outcome, not an error state. A wrong serial
--      number is worse than a blank one.
CREATE TABLE ai_generations (
  id               TEXT PRIMARY KEY,
  property_id      TEXT,
  visit_id         TEXT,
  import_id        TEXT,
  task             TEXT NOT NULL,   -- nameplate_extract | photo_route | transcribe |
                                    -- pin_type_suggest | slot_bind | draft_row | lint | ...
  target_kind      TEXT,
  target_id        TEXT,
  model            TEXT,
  prompt_id        TEXT,
  prompt_version   TEXT,
  prompt_hash      TEXT,
  input_refs       TEXT,            -- JSON: the media/pin/item ids fed in
  output           TEXT,            -- JSON or TEXT
  abstained        INTEGER NOT NULL DEFAULT 0,
  confidence       REAL,
  input_tokens     INTEGER,
  output_tokens    INTEGER,
  cost_estimate    REAL,
  human_decision   TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | edited | discarded
  human_decided_at TEXT,
  human_note       TEXT,
  created_at       TEXT NOT NULL
);
CREATE INDEX idx_ai_generations_import ON ai_generations(import_id);
CREATE INDEX idx_ai_generations_task ON ai_generations(task);
