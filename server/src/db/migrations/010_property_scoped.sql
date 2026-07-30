-- no-transaction
--
-- Increment 3 §1i and §1j — the audit is property-scoped, and a manifest is a
-- property artifact rather than a visit attachment.
--
-- WHY THIS FILE MANAGES ITS OWN TRANSACTION. Relaxing `imports.visit_id` from
-- NOT NULL is not an ALTER in SQLite; it is the documented rebuild — new table,
-- copy, drop, rename — and that requires `PRAGMA foreign_keys=off`, which is a
-- SILENT NO-OP inside a transaction. Wrapped, this migration would appear to
-- succeed and leave thirteen child tables' foreign keys pointing at a table that
-- no longer exists. `foreign_key_check` at the end is what proves it did not.
--
-- ONE CORRECTION TO THE SPEC. §1j says `imports` carries `visit_id` and not
-- `property_id`. It has carried `property_id NOT NULL` since migration 001, so
-- only three of the four changes are needed: the nullable visit, the producer,
-- and the media path (which is code, not schema).

PRAGMA foreign_keys=off;

BEGIN;

CREATE TABLE imports_new (
  id                       TEXT PRIMARY KEY,

  -- An import belongs to a PROPERTY, and only optionally to a visit.
  --
  -- A drone run may cover six properties in one afternoon three weeks after an
  -- inspection, and a scaled site canvas captured in April is still current in
  -- July. Hanging either on a visit would mean inventing one, and a visit is
  -- when somebody was in the house — inventing one would be a lie in the record
  -- that everything else is built to prevent.
  property_id              TEXT NOT NULL REFERENCES properties(id),
  visit_id                 TEXT REFERENCES visits(id),

  -- Which app made this manifest. The other half of the adapter key: the import
  -- path already dispatches on `manifest_schema_version`, and a second producer
  -- versions independently of the first.
  producer                 TEXT,

  imported_at              TEXT NOT NULL,
  manifest_schema_version  INTEGER,
  app_version              TEXT,
  session_id               TEXT,
  config_id                TEXT,
  config_version           TEXT,
  config_hash              TEXT,
  media_mode               TEXT NOT NULL,
  raw_manifest             TEXT NOT NULL,
  validation_report        TEXT NOT NULL,
  status                   TEXT NOT NULL,
  actor_id                 TEXT REFERENCES operators(id),
  created_at               TEXT NOT NULL
);

-- Existing rows are field-app manifests by definition: it is the only producer
-- that has ever written here. Naming it is not an assumption, it is the fact.
INSERT INTO imports_new (id, property_id, visit_id, producer, imported_at,
    manifest_schema_version, app_version, session_id, config_id, config_version,
    config_hash, media_mode, raw_manifest, validation_report, status, actor_id, created_at)
  SELECT id, property_id, visit_id, 'housesteady-field', imported_at,
    manifest_schema_version, app_version, session_id, config_id, config_version,
    config_hash, media_mode, raw_manifest, validation_report, status, actor_id, created_at
  FROM imports;

DROP TABLE imports;
ALTER TABLE imports_new RENAME TO imports;

CREATE INDEX idx_imports_visit ON imports(visit_id);
CREATE INDEX idx_imports_property ON imports(property_id);
CREATE INDEX idx_imports_producer ON imports(producer);

-- The session uniqueness guard, in two halves.
--
-- It was `(visit_id, session_id)`, which cannot guard an import with no visit:
-- SQLite treats every NULL as distinct, so the constraint silently stops
-- guarding anything the moment `visit_id` is nullable.
--
-- The first attempt here was to widen it to `(property_id, session_id)`, and a
-- test caught that immediately — **the same export imported into a DIFFERENT
-- visit is a re-walk, not a duplicate**, and widening the key forbade it. The
-- guard's real subject is "the same manifest twice in the same place", and the
-- place is the visit where there is one and the property where there is not.
--
-- So: two partial indexes, each guarding its own shape, neither weakening the
-- other.
CREATE UNIQUE INDEX idx_imports_visit_session
  ON imports(visit_id, session_id) WHERE visit_id IS NOT NULL;
CREATE UNIQUE INDEX idx_imports_property_session
  ON imports(property_id, session_id) WHERE visit_id IS NULL;

-- Increment 2c's trigger was dropped with the table it was attached to.
CREATE TRIGGER trg_imports_actor BEFORE INSERT ON imports
WHEN NEW.actor_id IS NULL BEGIN
  SELECT RAISE(ABORT, 'imports: every row records which operator acted');
END;

-- ------------------------------------------------------- §1i, the audit's scope

-- `audit_runs.visit_id` becomes nullable and CHANGES MEANING: it is which visit
-- triggered this run, never the filter on what was evaluated. A run triggered by
-- an import with no visit has none.
--
-- Rebuilt for the same reason as `imports`, and in the same file so the pragma
-- is only lowered once.
CREATE TABLE audit_runs_new (
  id             TEXT PRIMARY KEY,
  property_id    TEXT NOT NULL REFERENCES properties(id),

  -- WHICH VISIT TRIGGERED THIS RUN. Not a filter. §1i: if the evaluation only
  -- sees the current visit, the first monthly run reads §7's systems inventory
  -- as empty — every component was captured at the Baseline — and the gap report
  -- announces "no components recorded" for a house whose furnace has been in the
  -- binder for a year.
  visit_id       TEXT REFERENCES visits(id),

  -- Which import triggered it, likewise. The evaluation reads every import the
  -- property has.
  import_id      TEXT REFERENCES imports(id),

  schema_version  TEXT NOT NULL,
  schema_hash     TEXT NOT NULL,
  profile_id      TEXT NOT NULL,
  profile_version TEXT NOT NULL,
  profile_hash    TEXT NOT NULL,
  visit_kind      TEXT NOT NULL,
  trigger_facts   TEXT NOT NULL,
  binding_report  TEXT,
  warnings        TEXT,

  -- How many imports the evaluation actually read. A run that saw one import of
  -- four is a different answer from one that saw all four, and without this the
  -- two are indistinguishable after the fact.
  imports_read    INTEGER NOT NULL DEFAULT 1,

  run_at         TEXT NOT NULL,
  actor_id       TEXT NOT NULL REFERENCES operators(id),
  created_at     TEXT NOT NULL
);

INSERT INTO audit_runs_new (id, property_id, visit_id, import_id, schema_version, schema_hash,
    profile_id, profile_version, profile_hash, visit_kind, trigger_facts, binding_report,
    warnings, imports_read, run_at, actor_id, created_at)
  SELECT id, property_id, visit_id, import_id, schema_version, schema_hash,
    profile_id, profile_version, profile_hash, visit_kind, trigger_facts, binding_report,
    warnings, 1, run_at, actor_id, created_at
  FROM audit_runs;

DROP TABLE audit_runs;
ALTER TABLE audit_runs_new RENAME TO audit_runs;

CREATE INDEX idx_audit_runs_visit ON audit_runs(visit_id, run_at DESC);
CREATE INDEX idx_audit_runs_property ON audit_runs(property_id, run_at DESC);

CREATE TRIGGER trg_audit_runs_actor BEFORE INSERT ON audit_runs
WHEN NEW.actor_id IS NULL BEGIN
  SELECT RAISE(ABORT, 'audit_runs: every row records which operator ran the audit');
END;

-- §1i's per-slot contribution dimension.
--
-- Which visit most recently satisfied each slot. This answers "what did this
-- visit change" WITHOUT narrowing what the audit sees, which is the whole point
-- — the monthly report needs the first question answered and the gap report
-- needs the second not to be.
--
-- Nullable: a slot nothing has satisfied yet has no answer, and a zero or a
-- fallback to the triggering visit would both invent one.
ALTER TABLE audit_slots ADD COLUMN satisfied_by_visit_id TEXT REFERENCES visits(id);
ALTER TABLE audit_slots ADD COLUMN satisfied_by_import_id TEXT REFERENCES imports(id);
ALTER TABLE audit_slots ADD COLUMN satisfied_at TEXT;

CREATE INDEX idx_audit_slots_satisfied ON audit_slots(satisfied_by_visit_id);

-- ------------------------------------ §1j, the captured children of an artifact
--
-- A visit-less import could not persist its own contents: `zones`, `pins`,
-- `media` and `resolutions` each carried `visit_id NOT NULL`. §1j says a second
-- producer is a second adapter feeding the same tables, so the tables have to
-- accept one — and a manifest that imports but cannot store a zone is not a
-- working feature.
--
-- `visit_id` on a child is DENORMALISED from its import. Making it nullable
-- changes nothing about what it means; it lets it say "this capture had no
-- visit" instead of forcing a value that does not exist.
--
-- These are CAPTURED tables — doctrine 1, immutable evidence. The copy is
-- column-for-column with no transformation of any kind, and a test asserts the
-- reference export's rows come through byte-identical.

CREATE TABLE zones_rebuild (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_id         TEXT NOT NULL,
  import_id       TEXT NOT NULL REFERENCES imports(id),
  property_id     TEXT NOT NULL,
  visit_id        TEXT,
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

INSERT INTO zones_rebuild (id, zone_id, import_id, property_id, visit_id, type, label, level, attributes, closed_at, close_note, audit_summary, created_at)
  SELECT id, zone_id, import_id, property_id, visit_id, type, label, level, attributes, closed_at, close_note, audit_summary, created_at FROM zones;

DROP TABLE zones;
ALTER TABLE zones_rebuild RENAME TO zones;

CREATE INDEX idx_zones_import ON zones(import_id);

CREATE TABLE pins_rebuild (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  pin_id           TEXT NOT NULL,
  import_id        TEXT NOT NULL REFERENCES imports(id),
  property_id      TEXT NOT NULL,
  visit_id         TEXT,
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

INSERT INTO pins_rebuild (id, pin_id, import_id, property_id, visit_id, number, zone_id, type_kind, component_type, freeform_label, nickname, flag, retired_at, media_ids, note_ids, chat_thread_ids, created_at)
  SELECT id, pin_id, import_id, property_id, visit_id, number, zone_id, type_kind, component_type, freeform_label, nickname, flag, retired_at, media_ids, note_ids, chat_thread_ids, created_at FROM pins;

DROP TABLE pins;
ALTER TABLE pins_rebuild RENAME TO pins;

CREATE INDEX idx_pins_import ON pins(import_id);
CREATE INDEX idx_pins_zone ON pins(import_id, zone_id);
CREATE INDEX idx_pins_property_number ON pins(property_id, number);

CREATE TABLE media_rebuild (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  media_id          TEXT NOT NULL,
  import_id         TEXT NOT NULL REFERENCES imports(id),
  property_id       TEXT NOT NULL,
  visit_id          TEXT,
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

INSERT INTO media_rebuild (id, media_id, import_id, property_id, visit_id, kind, owner_kind, owner_zone_id, owner_pin_id, owner_pin_number, owner_canvas_id, group_key, file, mime, bytes, sha256, sha_verified, file_status, bytes_on_disk, captured_at, duration_ms, source, created_at)
  SELECT id, media_id, import_id, property_id, visit_id, kind, owner_kind, owner_zone_id, owner_pin_id, owner_pin_number, owner_canvas_id, group_key, file, mime, bytes, sha256, sha_verified, file_status, bytes_on_disk, captured_at, duration_ms, source, created_at FROM media;

DROP TABLE media;
ALTER TABLE media_rebuild RENAME TO media;

CREATE INDEX idx_media_import ON media(import_id);
CREATE INDEX idx_media_owner_pin ON media(import_id, owner_pin_id);
CREATE INDEX idx_media_owner_zone ON media(import_id, owner_zone_id);

CREATE TABLE resolutions_rebuild (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id       TEXT NOT NULL REFERENCES imports(id),
  property_id     TEXT NOT NULL,
  visit_id        TEXT,
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

INSERT INTO resolutions_rebuild (id, import_id, property_id, visit_id, scope_kind, scope_zone_id, scope_pin_id, item_id, kind, via, result, note, reason_id, evidence, at, source, is_recognized, feeds_gap_list, records_finding, created_at)
  SELECT id, import_id, property_id, visit_id, scope_kind, scope_zone_id, scope_pin_id, item_id, kind, via, result, note, reason_id, evidence, at, source, is_recognized, feeds_gap_list, records_finding, created_at FROM resolutions;

DROP TABLE resolutions;
ALTER TABLE resolutions_rebuild RENAME TO resolutions;

CREATE INDEX idx_resolutions_import ON resolutions(import_id);
CREATE INDEX idx_resolutions_scope ON resolutions(import_id, scope_kind, scope_zone_id);
CREATE INDEX idx_resolutions_gap ON resolutions(import_id, feeds_gap_list);
CREATE INDEX idx_resolutions_finding ON resolutions(import_id, records_finding);

COMMIT;

-- Proves the rebuild did not orphan a single child row. If this reports
-- anything, the migration is wrong and it is better to know now than to find a
-- pin pointing at nothing in six months.
PRAGMA foreign_key_check;

PRAGMA foreign_keys=on;
