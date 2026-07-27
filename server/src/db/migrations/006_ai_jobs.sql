-- The AI work queue.
--
-- Increment 2b §4: "AI never enters the import path." Import is the operation
-- that must not fail — it already moves 1.5–2 GB and checksums every file, and
-- a model call is the least reliable thing in the building. So extraction is
-- queued after import completes and drained by a worker while the server runs.
--
-- State lives in the database rather than in the worker's memory, which is what
-- makes a restart mid-run survivable: the worker comes back, finds rows marked
-- running with a stale lease, and reclaims them.
--
-- There is deliberately no spend table. Per-visit cost is a SUM over
-- ai_generations, which is already the row every call writes — a second place
-- to record money is a second place for it to be wrong.

CREATE TABLE ai_jobs (
  id            TEXT PRIMARY KEY,
  property_id   TEXT NOT NULL,
  visit_id      TEXT NOT NULL,

  -- Open vocabulary, same as everywhere else. A task name this build has not
  -- met is preserved and shown, never a reason to refuse a row.
  task          TEXT NOT NULL,
  target_kind   TEXT NOT NULL,      -- media | pin | zone | desk_media
  target_id     TEXT NOT NULL,

  -- queued | running | done | failed | skipped
  --
  -- `skipped` is not a failure: it is how a gated task records that it was
  -- correctly not run — extraction skipped because classification said the
  -- photo is not a nameplate. §11 requires the non-nameplate to be "not
  -- extracted at all", and a row saying so is how that becomes provable rather
  -- than merely absent.
  status        TEXT NOT NULL DEFAULT 'queued',
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,

  -- Backoff. A job is invisible to the worker until now() >= run_after, so a
  -- retry schedule needs no timer and survives a restart.
  run_after     TEXT,

  -- Set when the worker picks the row up. A running row whose lease has expired
  -- was orphaned by a crash and may be reclaimed.
  leased_at     TEXT,

  -- The generation this job produced, if it got that far. Nullable because a
  -- job can fail before any model call, and because a skipped job never makes
  -- one at all.
  generation_id TEXT,

  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,

  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (visit_id)    REFERENCES visits(id),
  FOREIGN KEY (generation_id) REFERENCES ai_generations(id)
);

-- The worker's claim query: oldest runnable job for a visit.
CREATE INDEX idx_ai_jobs_runnable ON ai_jobs(status, run_after, created_at);
CREATE INDEX idx_ai_jobs_visit    ON ai_jobs(visit_id, status);

-- One job per (task, target). Re-queueing the same work is idempotent rather
-- than duplicative — "re-triggerable by hand from the UI" (§4) must not mean
-- "pays for the same photo twice every time someone clicks it".
CREATE UNIQUE INDEX idx_ai_jobs_once ON ai_jobs(visit_id, task, target_kind, target_id);

-- Cost is summed per visit on read; this makes that cheap.
CREATE INDEX idx_ai_generations_visit ON ai_generations(visit_id);
