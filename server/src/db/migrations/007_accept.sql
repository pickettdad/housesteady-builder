-- Acceptance: how a proposal becomes a value.
--
-- Increment 2b §2. An AI value is never the current value until a human accepts
-- it, and the acceptance is an overlay so the pass's existing state resolution
-- needs no new machinery — a proposal that nobody accepted simply contributes
-- nothing, which is exactly the behaviour wanted and costs no extra code.
--
-- `generation_id` is a real column rather than something buried in the JSON so
-- the doctrine scan can be a join instead of a hopeful string search, and so
-- "how often is the model right" is a query rather than a metric somebody has
-- to remember to maintain.
--
-- The accuracy record lives in the two value columns the overlays table already
-- has, used with a specific meaning for this kind:
--
--   prior_value  what the AI proposed
--   new_value    what the human accepted
--
-- Identical means accepted as-is. Different means edited, and the difference IS
-- the measurement. Storing only the accepted value would throw away the thing
-- that tells you whether the prompt is working.

ALTER TABLE overlays ADD COLUMN generation_id TEXT REFERENCES ai_generations(id);

-- Every accept overlay for a generation, and the reverse. Small table, but this
-- is the join the doctrine scan walks on every test run.
CREATE INDEX idx_overlays_generation ON overlays(generation_id);
