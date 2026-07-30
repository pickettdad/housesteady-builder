-- One capture event, one import.
--
-- THE QUESTION, AND THE ANSWER. Increment 1's spec said "re-import of the same
-- export to the same visit is refused (one import per visit for now)", which
-- implied a different visit was fine. Migration 010 preserved that with two
-- partial indexes because a test asserted it — and the test was asserting a
-- phrasing rather than a decision.
--
-- **The same session id is the same capture event.** Recording it twice is
-- duplicate evidence: the same pins, the same resolutions, the same photographs,
-- counted twice. A re-walk is a new field session and carries a new id, so
-- nothing real is refused by this.
--
-- §1i made that consequential rather than untidy. `imports_read` is now a stored
-- number a person reads to know what an audit saw, and a duplicated capture
-- inflates it — the audit would report reading two imports when it read one
-- visit's worth of evidence twice. A number that can be wrong in that direction
-- is worse than no number.
--
-- NULL SESSIONS STILL IMPORT FREELY. SQLite treats every NULL as distinct, so a
-- producer that mints no session id is unaffected. That is correct rather than
-- incidental: dedupe needs an identity to dedupe on, and refusing imports that
-- cannot provide one would block a producer for lacking a field this repo does
-- not require.

DROP INDEX IF EXISTS idx_imports_visit_session;
DROP INDEX IF EXISTS idx_imports_property_session;

CREATE UNIQUE INDEX idx_imports_property_session ON imports(property_id, session_id);
