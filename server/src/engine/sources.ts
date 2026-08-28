/**
 * What counts as a source — Honesty-Label-Mapping v1.3 §8, owner ruling
 * 2026-08-26. **The pure half of Binder 6b.**
 *
 * `Documented` has been structurally unreachable since migration 024, on the
 * reasoning that a model recalling `600545B` from training is recall rather than
 * a lookup, and *a resolution that cannot state its source does not ship.* §8 is
 * what makes it reachable, and this file is §8 as code.
 *
 * ---
 *
 * ## The two rules that decide every case (§8a)
 *
 * **1 · Authority is per claim, not per source.** A source is authoritative for
 * the kinds of claim it is in a position to make and for no others. A flat
 * ranking of sources would be wrong.
 *
 * ⚑ **This build makes exactly one claim — *what product is this model number* —
 * so the per-claim rule has one case and looks like a per-source rule.** It is
 * not, and `resolution_sources` names the claim on the row so that when service
 * intervals and replacement costs arrive they are separate rows with separate
 * authorities rather than a re-reading of these.
 *
 * **2 · A source for the wrong model is not a source.** *Close-enough model
 * families are how a specification for a different unit becomes a fact about
 * this house.* Enforced by `sameModel`, exactly as ruled — see its own note on
 * what that costs.
 *
 * ## Who decides the tier, and it is never the model
 *
 * §8 rules what counts as a source in terms of what the source *is*. Code cannot
 * read that off a URL, and a model asked *is this the manufacturer's own site*
 * will say yes for a reseller with the brand in its domain. **If the model
 * assigns the tier, `Documented` means the model claimed documented** — the
 * failure the entire ruling exists to prevent, arriving through the mechanism
 * built to implement it.
 *
 * **So a person rules a host once and the ruling is reused.** The human decides
 * identity — *whose site is this*. This file decides applicability — *is this
 * page about the model on our plate, and does it carry what §8c requires*.
 *
 * ⛑ **The consequence, stated rather than discovered: on day one `Documented`
 * is reachable only through the five regulators §8b names.** Every manufacturer
 * host has to be ruled by a person before it counts. That is the registry
 * working, not a gap in it — but it means shipping this does not by itself make
 * `Documented` reachable for any particular house.
 *
 * ## Tier 0 and tier 4, neither of which is here
 *
 * **Tier 0 is the plate, and we hold it.** §8b: *any hierarchy starting at the
 * manufacturer's website has skipped the best thing this service has.* The plate
 * is `readings`, written by pass 1, and it is not a source in this file's sense
 * — it is the thing sources are checked against. `plate_model` on every row is
 * where tier 0 appears.
 *
 * ⛑ **Tier 4 — the outcome log — is declared by §8b and is not built.** Stage 13.
 * There is deliberately no representation of it here: an unreachable branch
 * would be a fifth thing this repo believes and cannot test. When the outcome
 * log exists it adds a tier and a producer together.
 */

import { randomUUID } from 'node:crypto'
import { now, type Db } from '../db/index.js'

/** Tiers a host can be ruled into. Never inferred, never model-assigned. */
export const HOST_TIERS = ['regulator', 'manufacturer', 'excluded'] as const
export type HostTier = (typeof HOST_TIERS)[number]

/**
 * Honesty labels a product resolution can carry.
 *
 * ⚑ **`Documented` is derived and never stored.** `product_resolutions.honesty`
 * remains `Inferred` on every row, because that column records what the model
 * said. The label a reader sees comes from `honestyOf`, which reads the
 * resolution's sources — so there is no field anywhere a caller could write
 * `Documented` into.
 */
export const HONESTY_LABELS = ['Documented', 'Inferred'] as const
export type Honesty = (typeof HONESTY_LABELS)[number]

/** A host ruling as the registry holds it. */
export interface HostRuling {
  host: string
  tier: HostTier
  belongsTo: string
  ruling: string
}

/**
 * The host a URL actually names, or null with the reason it does not.
 *
 * ⚑ **Parsed, never matched.** A regular expression over a URL is how
 * `https://aosmith.com@retailer.example/` becomes A. O. Smith's own site: the
 * part before the `@` is userinfo and the host is `retailer.example`. `URL`
 * knows that and a pattern does not.
 *
 * Lowercased, `www.` stripped, port dropped. Only `https:` — a claim read over
 * plain http cannot be said to have come from anywhere in particular, and this
 * is the one place in the pipeline where the provenance of a string is the
 * entire product.
 */
export function hostOf(url: string): { host: string } | { host: null; why: string } {
  const raw = url.trim()
  if (raw === '') return { host: null, why: 'no source URL was recorded' }
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return { host: null, why: `\`${raw}\` is not a URL this build can parse, so it names no source` }
  }
  if (parsed.protocol !== 'https:') {
    return { host: null, why: `\`${raw}\` is not https, so what it says cannot be attributed to anyone` }
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
  if (host === '') return { host: null, why: `\`${raw}\` names no host` }
  return { host }
}

/**
 * Does this host fall under a ruled one?
 *
 * ⚑ **On a dot boundary, and that is the whole security of it.** A plain
 * `endsWith` makes `aosmith.com.example.invalid` a match for `aosmith.com`,
 * which is a ruling being borrowed by whoever registers the domain.
 * `support.aosmith.com` is genuinely A. O. Smith and must match.
 */
export const underHost = (host: string, ruled: string): boolean =>
  host === ruled || host.endsWith(`.${ruled}`)

/** The most specific ruling covering this host, or undefined if none does. */
export function rulingFor(host: string, rulings: readonly HostRuling[]): HostRuling | undefined {
  const matches = rulings.filter((r) => underHost(host, r.host))
  // Longest host wins: a ruling on `parts.example.com` beats one on `example.com`.
  return matches.sort((a, b) => b.host.length - a.host.length)[0]
}

/**
 * Is the model on the page the model on the plate?
 *
 * §8a rule 2, implemented exactly as ruled: **the model must match what the
 * plate says, not resemble it.** Case is folded and runs of whitespace collapse,
 * because those are transcription artefacts rather than differences in the
 * string. **Nothing else is normalised** — not hyphens, not dots, not slashes.
 *
 * ⛑ **This rejects real matches and that is the ruled direction.** A plate
 * printing `G9-50SDE-30 250` against a spec sheet headed `G9-50SDE-30` does not
 * qualify here, and the resolution stays `Inferred` with both strings on the
 * row so a person can see exactly what was compared. An under-claimed row is a
 * label somebody can look at; an over-claimed one is a lie that reads as a fact.
 *
 * **The rule's cost is counted rather than assumed** — `npm run sources` reports
 * how many sources were refused for this reason, so if the ruling is too strict
 * the evidence for changing it is on the screen rather than in an argument.
 */
const fold = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ')
export const sameModel = (a: string, b: string): boolean =>
  fold(a) !== '' && fold(a) === fold(b)

/** One source, as offered for recording. No honesty field — that is the point. */
export interface SourceClaim {
  url: string
  /** ISO date the page was read. §8c: a link with no date rots into a 404 silently. */
  retrievedAt: string
  /** What the page actually said, extracted. §8c: not only the link. */
  extractedClaim: string
  /** The model string printed on the page. */
  sourceModel: string
  /** The model string read off the plate, from pass 1. Tier 0. */
  plateModel: string
}

export interface Verdict {
  qualifies: boolean
  /** The sentence a person reads. Present either way — a refusal has a reason. */
  why: string
  host: string
}

/**
 * Does this source make its resolution `Documented`?
 *
 * ⚑ **Every gate is a reason to say no; the yes is what is left.** Ordered so
 * the first failure a person meets is the most actionable one — an unruled host
 * is work somebody can do, a model mismatch is a judgement, and a missing
 * retrieval date is a bug in whatever recorded it.
 */
export function qualify(claim: SourceClaim, rulings: readonly HostRuling[]): Verdict {
  const parsed = hostOf(claim.url)
  if (parsed.host === null) return { qualifies: false, why: parsed.why, host: '' }
  const host = parsed.host

  const ruled = rulingFor(host, rulings)
  if (!ruled) {
    return {
      qualifies: false,
      host,
      why:
        `nobody has ruled what \`${host}\` is. §8 turns on whether a source is the manufacturer's own material ` +
        `or a regulator, and that is a judgement a person makes once per host — not something read off a URL.`,
    }
  }
  if (ruled.tier === 'excluded') {
    return {
      qualifies: false,
      host,
      why:
        `\`${ruled.host}\` is ruled outside tier 1 — ${ruled.ruling} §8: trade catalogues, retail, forums and ` +
        `video are never \`Documented\`, however many URLs they have. This may still be worth knowing, and §8d ` +
        `sends it to the hypothesis channel, which is not built.`,
    }
  }

  // §8c, before the model check, because a source with no claim extracted from
  // it cannot be checked against anything in the first place.
  if (claim.extractedClaim.trim() === '') {
    return {
      qualifies: false,
      host,
      why: 'no claim was extracted from this page. §8c: record the extracted claim, not only the link — a URL on its own decays into a 404 without changing its label.',
    }
  }
  if (claim.retrievedAt.trim() === '') {
    return { qualifies: false, host, why: 'no retrieval date was recorded, so there is no way to know how old this reading is (§8c).' }
  }

  if (!sameModel(claim.sourceModel, claim.plateModel)) {
    return {
      qualifies: false,
      host,
      why:
        `this page is about \`${claim.sourceModel.trim() || '(no model given)'}\` and the plate says ` +
        `\`${claim.plateModel.trim() || '(no model read)'}\`. §8a: a source for the wrong model is not a source — ` +
        `the model must match what the plate says, not resemble it.`,
    }
  }

  return {
    qualifies: true,
    host,
    why:
      ruled.tier === 'regulator'
        ? `\`${ruled.host}\` is ruled a regulator or certifier (§8b tier 1) and this page carries the plate's own model number.`
        : `\`${ruled.host}\` is ruled ${ruled.belongsTo}'s own material (§8b tier 1) and this page carries the plate's own model number.`,
  }
}

/**
 * The honesty label for a resolution, from its sources.
 *
 * **One qualifying source is enough and none is `Inferred`.** There is no
 * middle: §8's tier 1 is a threshold rather than a score, and a resolution with
 * four retailer listings is not more documented than one with none.
 */
export const honestyOf = (sources: readonly { qualifies: boolean }[]): Honesty =>
  sources.some((s) => s.qualifies) ? 'Documented' : 'Inferred'

// ============================================================ storage
//
// Everything above is pure and everything below is one table each. The split is
// deliberate: the rules are what a test plants against, and a rule that needed a
// database to exercise would be a rule nobody plants against often enough.

/** The claim this build makes. §8a rule 1 — see `resolution_sources.claim`. */
export const PRODUCT_IDENTITY = 'product-identity'

/** Every host ruling, for `qualify`. Read per call — a ruling can be added mid-run. */
export const rulings = (db: Db): HostRuling[] =>
  db
    .prepare('SELECT host, tier, belongs_to AS belongsTo, ruling FROM source_hosts ORDER BY host')
    .all() as HostRuling[]

/**
 * Rule a host into a tier, or change a ruling.
 *
 * **A person's act, and the row records who.** `ruled_by` is null only for the
 * five rows migration 027 seeds from §8b, which were ruled by a document.
 */
export function ruleHost(
  db: Db,
  args: { host: string; tier: HostTier; belongsTo?: string; ruling: string; actorId: string },
): void {
  const host = args.host.trim().toLowerCase().replace(/^www\./, '')
  if (host === '') throw new Error('a host ruling needs a host')
  if (args.ruling.trim() === '') throw new Error('a host ruling records why, in the words of whoever made it')
  // ⚑ Checked here rather than by a trigger, because `ruled_by` is deliberately
  // nullable for the five rows migration 027 seeds — a trigger that allowed those
  // would allow every anonymous ruling after them.
  if (args.actorId.trim() === '') throw new Error('a host ruling records which operator made it')
  db.prepare(
    `INSERT INTO source_hosts (host, tier, belongs_to, ruling, ruled_by, ruled_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(host) DO UPDATE SET
       tier = excluded.tier, belongs_to = excluded.belongs_to,
       ruling = excluded.ruling, ruled_by = excluded.ruled_by, ruled_at = excluded.ruled_at`,
  ).run(host, args.tier, args.belongsTo ?? '', args.ruling.trim(), args.actorId, now())
}

/** A source as stored: facts read off a page, and no verdict. */
export interface SourceRow extends SourceClaim {
  id: string
  resolutionId: string
}

/** A stored source with the verdict as it stands NOW. */
export interface JudgedSource extends SourceRow, Verdict {}

/**
 * Record what a resolution read.
 *
 * ⚑ **Takes no honesty, no verdict and no tier**, and the row it writes has
 * nowhere to hold one. The verdict comes back for the caller to print; it is
 * recomputed on every read from the registry as it stands then, so a host ruled
 * next week promotes every resolution that already cited it **with nothing
 * rewritten and no row touched.** That is the registry's whole argument — one
 * judgement, made once, settling everything citing the host — and a cached
 * verdict would quietly cancel it.
 */
export function recordSource(
  db: Db,
  args: SourceClaim & { resolutionId: string; actorId: string; generationId?: string | null },
): JudgedSource {
  const host = hostOf(args.url)
  const id = randomUUID()
  const row: SourceRow = {
    id,
    resolutionId: args.resolutionId,
    url: args.url.trim(),
    retrievedAt: args.retrievedAt.trim(),
    extractedClaim: args.extractedClaim.trim(),
    sourceModel: args.sourceModel.trim(),
    plateModel: args.plateModel.trim(),
  }
  db.prepare(
    `INSERT INTO resolution_sources
       (id, resolution_id, claim, source_url, source_host, retrieved_at, extracted_claim,
        source_model, plate_model, generation_id, actor_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, args.resolutionId, PRODUCT_IDENTITY, row.url, host.host ?? '',
    row.retrievedAt, row.extractedClaim, row.sourceModel, row.plateModel,
    args.generationId ?? null, args.actorId, now(),
  )
  return { ...row, ...qualify(row, rulings(db)) }
}

const rowsFor = (db: Db, resolutionId: string): SourceRow[] =>
  db
    .prepare(
      `SELECT id, resolution_id AS resolutionId, source_url AS url,
              retrieved_at AS retrievedAt, extracted_claim AS extractedClaim,
              source_model AS sourceModel, plate_model AS plateModel
         FROM resolution_sources WHERE resolution_id = ? ORDER BY created_at, id`,
    )
    .all(resolutionId) as SourceRow[]

/** Every source recorded against one resolution, judged against today's registry. */
export function sourcesFor(db: Db, resolutionId: string, ruled = rulings(db)): JudgedSource[] {
  return rowsFor(db, resolutionId).map((r) => ({ ...r, ...qualify(r, ruled) }))
}

/**
 * The honesty label of every resolution in an import, and why.
 *
 * ⚑ **The label is computed here and nowhere else.** `product_resolutions.honesty`
 * is not read — it says `Inferred` on every row by construction, and a reader
 * that trusted it would be reporting what the model claimed rather than what the
 * evidence supports.
 */
export interface ResolutionHonesty {
  resolutionId: string
  readingId: string
  product: string
  resolved: boolean
  honesty: Honesty
  sources: JudgedSource[]
}

/**
 * Hosts that have been read and never ruled — **the work queue, and the reason
 * the registry is a mechanism rather than a chore.**
 *
 * A host appears here once, however many resolutions cited it, because ruling it
 * settles all of them. That is the whole argument for ruling hosts instead of
 * confirming resolutions: one judgement, made once, reused.
 */
export const unruledHosts = (db: Db): { host: string; sources: number }[] =>
  db
    .prepare(
      `SELECT s.source_host AS host, COUNT(*) AS sources
         FROM resolution_sources s
        WHERE s.source_host <> ''
          AND NOT EXISTS (
            SELECT 1 FROM source_hosts h
             WHERE s.source_host = h.host OR s.source_host LIKE '%.' || h.host)
        GROUP BY s.source_host ORDER BY sources DESC, host`,
    )
    .all() as { host: string; sources: number }[]

/**
 * What §8a rule 2 actually costs, counted rather than argued.
 *
 * ⚑ **The rule is strict on purpose and this is how its price stays visible.**
 * A source from a ruled tier-1 host that failed only because the model strings
 * differ is a source a person would probably have accepted. If that number is
 * large, the ruling is worth revisiting — and the evidence for revisiting it is
 * on a screen rather than in an argument.
 */
export function refusedOnModel(db: Db): { host: string; sourceModel: string; plateModel: string }[] {
  const ruled = rulings(db)
  const rows = db
    .prepare(
      `SELECT source_host AS host, source_model AS sourceModel, plate_model AS plateModel,
              source_url AS url, retrieved_at AS retrievedAt, extracted_claim AS extractedClaim
         FROM resolution_sources ORDER BY source_host, created_at`,
    )
    .all() as (SourceClaim & { host: string })[]
  return rows
    .filter((r) => {
      const ruling = rulingFor(r.host, ruled)
      // Only the case worth knowing about: a tier-1 host, §8c satisfied, and the
      // model comparison is the one thing standing between it and `Documented`.
      if (!ruling || ruling.tier === 'excluded') return false
      if (r.extractedClaim.trim() === '' || r.retrievedAt.trim() === '') return false
      return !sameModel(r.sourceModel, r.plateModel)
    })
    .map((r) => ({ host: r.host, sourceModel: r.sourceModel, plateModel: r.plateModel }))
}

export function honestyForImport(db: Db, importId: string): ResolutionHonesty[] {
  const rows = db
    .prepare(
      `SELECT id, reading_id AS readingId, product, resolved
         FROM product_resolutions WHERE import_id = ? ORDER BY created_at, id`,
    )
    .all(importId) as { id: string; readingId: string; product: string; resolved: number }[]
  const ruled = rulings(db)
  return rows.map((r) => {
    const sources = sourcesFor(db, r.id, ruled)
    return {
      resolutionId: r.id,
      readingId: r.readingId,
      product: r.product,
      resolved: r.resolved === 1,
      honesty: honestyOf(sources),
      sources,
    }
  })
}
