-- Binder 6b — what a resolution read, and what makes it `Documented`.
--
-- Honesty-Label-Mapping v1.3 §8, owner ruling 2026-08-26. Migration 024 said
-- `source_url` and `Documented` arrive together, in the change that adds search,
-- or not at all. This is that change, and the shape is not the one 024 expected.
--
-- ⚑ THERE IS STILL NO COLUMN ANYWHERE THAT HOLDS `Documented`.
--
-- 024 anticipated a `source_url` column on `product_resolutions` and `honesty`
-- becoming writable. **Both would have been wrong**, for the same reason 024 got
-- right the first time: a label a caller can write is a label a caller can write
-- incorrectly. `product_resolutions.honesty` stays `Inferred` forever, because it
-- records what the MODEL said and a model recalling training data is never
-- documentation, however good the recall.
--
-- **`Documented` is a property of the evidence, so it lives on the evidence.** A
-- resolution is `Documented` when it has at least one qualifying source and
-- `Inferred` otherwise — derived, in one function, from these two tables. There
-- is nothing to set.
--
-- APPEND-ONLY, AND A RESOLUTION MAY GATHER SOURCES OVER TIME.
--
-- The runner's search finds a spec sheet in March; the concierge pastes the
-- installation manual in June. Both are recorded, neither replaces the other,
-- and the resolution's label follows the best of them. Same discipline as the
-- overlay layer: a correction adds a row, it never overwrites one.
--
-- A SOURCE ROW HOLDS FACTS READ OFF A PAGE AND NO VERDICT AT ALL.
--
-- ⚑ **There is no `qualifies` column and no `why` column**, and the first
-- version of this migration had both. They were wrong for the reason the
-- registry exists: **a stored verdict freezes at the moment it was written**, so
-- ruling `aosmith.com` on Tuesday would have left Monday's four resolutions
-- exactly as they were. *One judgement that settles every resolution citing it*
-- is the whole argument for ruling hosts instead of confirming resolutions, and
-- a cached verdict quietly cancels it.
--
-- So a row records only what was read — the URL, the host, the date, the claim
-- extracted from the page, and the model the page names beside the model the
-- plate names. **Whether that qualifies is computed on every read**, from these
-- facts and the registry as it stands now. Which means §8c needs no CHECK: a
-- source with a link and nothing else is a perfectly good record of *somebody
-- looked at this and it carried no claim*, and it simply never qualifies.
--
-- **The guarantee migration 024 bought by having no feature survives intact:
-- there is nowhere in this schema to put the word `Documented`.**
--
-- §8a RULE 2 IS ENFORCED, EXACTLY AS RULED, AND ITS COST IS REPORTED.
--
-- *A source for the wrong model is not a source. The model must match what the
-- plate says, not resemble it.* So the comparison is exact after case-folding
-- and whitespace collapsing, and nothing else is normalised. **This will reject
-- real matches that differ by a hyphen or a trailing option code**, and that is
-- the ruled direction: an under-claimed row is an `Inferred` a person can look
-- at, an over-claimed one is a lie. `npm run sources` counts the rejections so
-- the rule's cost is visible rather than assumed.

-- ---------------------------------------------------------------- the registry
--
-- WHO DECIDES WHICH TIER A HOST IS IN — and it is never the model.
--
-- §8 rules what counts as a source in terms of what the source IS: the
-- manufacturer's own material, a regulator, a certifier. Code cannot read that
-- off a URL. If the model were asked to say whether a page is the manufacturer's
-- own site, `Documented` would mean *the model claimed documented*, which is the
-- exact failure the ruling exists to prevent.
--
-- **So a person rules a host, once, and every resolution that reads that host
-- inherits the ruling.** The human decides identity — whose site is this. The
-- code decides applicability — is this page about the model on our plate.
--
-- An unruled host is not `excluded`; it is unruled, and the two are different
-- facts that lead to different work. A resolution from an unruled host is
-- `Inferred` and carries a question for a person; one from an `excluded` host is
-- `Inferred` and carries a decision already made.
CREATE TABLE source_hosts (
  -- Lowercase, no scheme, no port, no leading `www.`. Matching covers
  -- subdomains on a dot boundary — see engine/sources.ts.
  host        TEXT PRIMARY KEY,

  -- regulator   §8b tier 1. Regulators, certifiers and government.
  -- manufacturer §8b tier 1, but only for its own material — the model check
  --              is what makes that true rather than assumed.
  -- excluded    §8b's never-`Documented` list: trade and distributor
  --             catalogues, retail, forums, contractor blogs, video. **Some of
  --             it is genuinely valuable** — §8d sends it to the hypothesis
  --             channel, which is not built. Recorded here so the value is not
  --             lost when that channel arrives.
  tier        TEXT NOT NULL CHECK (tier IN ('regulator', 'manufacturer', 'excluded')),

  -- Whose site it is, when it is a manufacturer's.
  --
  -- ⛑ RECORDED, NOT GATED, and the difference is deliberate. §8 rules the model
  -- comparison and does not rule a maker comparison. A maker-name equality would
  -- run over an unnormalised string a model transcribed off a plate — `A.O.
  -- Smith`, `A. O. Smith`, `AO SMITH CORP` — and would make `Documented`
  -- unreachable in practice. That is the same failure as claiming it wrongly,
  -- pointing the other way. So it is shown to the person and gates nothing.
  belongs_to  TEXT NOT NULL DEFAULT '',

  -- Why this host is in this tier, in the words of whoever put it there.
  ruling      TEXT NOT NULL,

  -- Null for the rows this migration seeds — those were ruled by a document
  -- rather than by a person, and saying so is the point.
  ruled_by    TEXT REFERENCES operators(id),
  ruled_at    TEXT NOT NULL,

  CHECK (tier <> 'manufacturer' OR belongs_to <> '')
);

-- ------------------------------------------------------ what a resolution read
CREATE TABLE resolution_sources (
  id            TEXT PRIMARY KEY,
  resolution_id TEXT NOT NULL REFERENCES product_resolutions(id),

  -- WHICH CLAIM THIS SOURCE IS AUTHORITATIVE FOR — §8a rule 1.
  --
  -- *Authority is per claim, not per source. A manufacturer is the best possible
  -- source for capacity and service intervals and a poor one for how long the
  -- thing actually lasts.* **This build makes exactly one claim**, so the column
  -- holds one value and looks like decoration. It is not: without it these rows
  -- read as *this resolution's source*, which is the flat ranking §8a says is
  -- wrong. When service intervals and replacement costs arrive they are new
  -- rows with their own authority, not a re-reading of these.
  claim         TEXT NOT NULL DEFAULT 'product-identity',

  -- Verbatim, as read. Never normalised — the host is derived from it and stored
  -- beside it so a reader can see both and disagree.
  source_url    TEXT NOT NULL,
  source_host   TEXT NOT NULL,

  -- §8c — *record the retrieval date and the extracted claim, not only the link.*
  -- Either being empty is a fact about what was read, not a broken row: it means
  -- somebody looked and the page carried no claim, and such a source simply never
  -- qualifies. Enforced in `qualify`, on every read, rather than at write time.
  retrieved_at    TEXT NOT NULL DEFAULT '',
  extracted_claim TEXT NOT NULL DEFAULT '',

  -- The model string found ON THE PAGE, and the one read off the PLATE, stored
  -- side by side. §8a rule 2 compares these, and storing both means a person can
  -- see exactly what was compared without running anything.
  --
  -- `plate_model` is tier 0 — the photograph, which we hold, and which §8b says
  -- beats everything on the web. It is copied here rather than joined so that a
  -- source row still says what it was checked against after pass 1 is re-run.
  source_model  TEXT NOT NULL DEFAULT '',
  plate_model   TEXT NOT NULL DEFAULT '',

  -- Null when a person recorded this by hand rather than a model finding it.
  generation_id TEXT REFERENCES ai_generations(id),
  actor_id      TEXT NOT NULL REFERENCES operators(id),
  created_at    TEXT NOT NULL
);

CREATE INDEX idx_resolution_sources_resolution ON resolution_sources(resolution_id);
CREATE INDEX idx_resolution_sources_host ON resolution_sources(source_host);

CREATE TRIGGER trg_resolution_sources_actor BEFORE INSERT ON resolution_sources
WHEN NEW.actor_id IS NULL OR NEW.actor_id = ''
BEGIN SELECT RAISE(ABORT, 'resolution_sources: every row records which operator acted'); END;

-- ------------------------------------------------------------------- the seed
--
-- §8b names five organisations by name. Their hosts are seeded so the
-- regulator half of tier 1 works on day one without anybody typing anything.
--
-- ⛑ THE RULING NAMES THE ORGANISATION; THE HOST WAS WRITTEN HERE. That is a
-- step §8 did not take, and each row says so rather than presenting the mapping
-- as part of the ruling. A person confirming or correcting one of these is
-- doing real work, not rubber-stamping.
--
-- **Municipal permit records are named in §8b and are not seeded.** They are
-- per-municipality and there is no host to write. Quinte West and Belleville
-- get ruled by a person the first time a permit is cited, which is the registry
-- working as designed rather than a gap in it.
INSERT INTO source_hosts (host, tier, belongs_to, ruling, ruled_by, ruled_at) VALUES
  ('ahridirectory.org', 'regulator', '',
   'AHRI''s directory, named in Honesty-Label-Mapping v1.3 §8b. The organisation is ruled; this host was written by Builder Code and has not been confirmed by a person.',
   NULL, '2026-08-28T00:00:00.000Z'),
  ('csagroup.org', 'regulator', '',
   'CSA certification listings, named in Honesty-Label-Mapping v1.3 §8b. The organisation is ruled; this host was written by Builder Code and has not been confirmed by a person.',
   NULL, '2026-08-28T00:00:00.000Z'),
  ('ul.com', 'regulator', '',
   'UL certification listings, named in Honesty-Label-Mapping v1.3 §8b. The organisation is ruled; this host was written by Builder Code and has not been confirmed by a person.',
   NULL, '2026-08-28T00:00:00.000Z'),
  ('energystar.gov', 'regulator', '',
   'Energy Star ratings, named in Honesty-Label-Mapping v1.3 §8b. The organisation is ruled; this host was written by Builder Code and has not been confirmed by a person.',
   NULL, '2026-08-28T00:00:00.000Z'),
  ('nrcan.gc.ca', 'regulator', '',
   'NRCan ratings, named in Honesty-Label-Mapping v1.3 §8b. The organisation is ruled; this host was written by Builder Code and has not been confirmed by a person.',
   NULL, '2026-08-28T00:00:00.000Z');
