-- Increment 3 §3 — audit results.
--
-- Computed fresh on demand AND stored, so a rendered gap report is
-- reproducible: a client asking in September why their March report said
-- something different gets an answer from the record rather than a re-run
-- against whatever the schema says today.

CREATE TABLE audit_runs (
  id             TEXT PRIMARY KEY,
  property_id    TEXT NOT NULL REFERENCES properties(id),
  visit_id       TEXT NOT NULL REFERENCES visits(id),
  import_id      TEXT REFERENCES imports(id),

  -- §0.1 — every audit result records which schema version and which profile
  -- produced it. Version AND hash: a version is a claim and the hash is the
  -- evidence, and a schema edited without a version bump is exactly the case
  -- where the version says nothing changed and the results differ.
  schema_version  TEXT NOT NULL,
  schema_hash     TEXT NOT NULL,
  profile_id      TEXT NOT NULL,
  profile_version TEXT NOT NULL,
  profile_hash    TEXT NOT NULL,

  -- Not in the manifest, and it decides which checklist items were in scope.
  -- Stored because the same import audited as a baseline and as a monthly
  -- produces different answers, and "which was this" must not be a guess.
  visit_kind     TEXT NOT NULL,

  -- The resolved fact set, so a result stays explicable. §4 requires "why is
  -- this house being asked about a sump" to be answerable from the run itself,
  -- not reconstructed from a config that may since have changed.
  trigger_facts  TEXT NOT NULL,   -- JSON

  -- §1a's measurement. Stored with the run rather than recomputed, because it
  -- is the evidence for a decision about whether an AI binding assist is ever
  -- warranted, and that decision compares runs across visits.
  binding_report TEXT,            -- JSON

  -- Anything the run could not do cleanly: unrecognised vocabulary, broken
  -- bindings, a profile written against another schema version. Doctrine 6 —
  -- never drop anything silently.
  warnings       TEXT,            -- JSON

  run_at         TEXT NOT NULL,
  actor_id       TEXT NOT NULL REFERENCES operators(id),
  created_at     TEXT NOT NULL
);

-- One row per slot per run. Per-section rollup is DERIVED from these, never
-- stored separately — one state, many views. A missing slot is a dashed card in
-- the workbench, a pip in the table of contents, and a row in the gap report,
-- all reading this.
CREATE TABLE audit_slots (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  audit_run_id   TEXT NOT NULL REFERENCES audit_runs(id),
  section_id     TEXT NOT NULL,
  slot_id        TEXT NOT NULL,
  kind           TEXT NOT NULL,
  applicable     INTEGER NOT NULL,
  required       INTEGER NOT NULL,

  -- complete | partial | empty | not-applicable | n-a-narrative
  --
  -- `n-a-narrative` is its own state rather than reusing `not-applicable`
  -- because the two mean different things to a reader: not-applicable is *this
  -- house does not have one*, and n-a-narrative is *this can never be finished
  -- and that is by design*. §0.4 — a narrative slot never produces a gap, ever,
  -- regardless of profile, because §8 can never be complete and software that
  -- reports it 80% done is lying.
  state          TEXT NOT NULL,

  missing        TEXT,            -- JSON — what specifically is short
  detail         TEXT             -- JSON
);

CREATE INDEX idx_audit_runs_visit ON audit_runs(visit_id, run_at DESC);
CREATE INDEX idx_audit_slots_run ON audit_slots(audit_run_id);
CREATE UNIQUE INDEX idx_audit_slots_unique ON audit_slots(audit_run_id, slot_id);

-- Increment 2c: every attributed row records which operator acted. `audit_slots`
-- is a child of its run and inherits the run's actor, exactly as resolutions
-- inherit their import's.
CREATE TRIGGER trg_audit_runs_actor BEFORE INSERT ON audit_runs
WHEN NEW.actor_id IS NULL BEGIN
  SELECT RAISE(ABORT, 'audit_runs: every row records which operator ran the audit');
END;
