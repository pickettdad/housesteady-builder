/**
 * Proposals as a portable fixture — the ruling of 2026-08-12.
 *
 * ⚑ **Generating proposals and scoring proposals are separate jobs, and only the
 * first needs photographs, an API key or a database.**
 *
 * The generating half costs money, needs half a gigabyte of a real house on
 * disk, and can only happen in a session with the export and a key. **The
 * scoring half needs two files.** Until this existed they were one command, so
 * every fix to the harness required the expensive half again — and the harness
 * turned out to be broken three ways and invisible.
 *
 * **So a run is generated once and its proposals are written out. After that the
 * harness is fixable, changeable and re-runnable on any machine** with nothing
 * but the key file and this fixture.
 *
 * ---
 *
 * ## What is in it, and what is deliberately not
 *
 * **Exactly what `scoreRun` reads**: the label, the class, the photographs cited,
 * the lane, and any model string read off a plate. *No photographs, no manifest,
 * no file paths* — the media ids are uuids the field app minted and mean nothing
 * outside the export.
 *
 * ⚑ **It is not a substitute for the run and does not pretend to be.** It records
 * what one pass proposed on one import at one moment. **Re-running the pass will
 * produce different proposals** — that is what a model is — so a fixture is
 * evidence of a run, never a prediction of the next one.
 *
 * ## ⚠ Personal data, and why the default output is `/data`
 *
 * **A label is a model's words about a photograph, and identification reads
 * plates.** One photograph in the owner's mechanical room carries an address, a
 * contractor's name and phone, a registration number and a fitter's licence
 * number — **any of which a model can return in a label or a model field.**
 *
 * **This repository is public.** So the fixture is written under `/data` by
 * default, which is gitignored, and **`scanForPersonalData` runs on every write
 * and prints what it found.** *Moving a fixture into the repo is a human act, and
 * the scan exists to make sure the human looks at the right rows before doing it.*
 *
 * ⚑ **A clean scan is not permission to commit.** It is a narrow set of shapes;
 * it cannot see a person's name, and it is deliberately blind to the shapes that
 * model numbers share with licence numbers. **It says "look here", never "this is
 * safe".**
 */

import type { ScoredProposal } from './score.js'

/** One proposal, as much of it as scoring and provenance need. */
export interface FixtureProposal {
  id: string
  label: string
  classId: string | null
  mediaIds: string[]
  /** `objects.derived_from` — pass 3's lane, or null for the identification pass. */
  lane: string | null
  /**
   * Model strings pass 1 read off a nameplate **in the photographs this proposal
   * cites**. Photograph-level, and it bleeds across the objects in a frame.
   *
   * ⚑ *Kept, and no longer what rule 6 reads.* The name has always overstated
   * it; the key is unchanged so the committed 2026-08-13 fixture still parses.
   */
  models: string[]
  /** Pass 3's own model reading for THIS object — `objects.model_read`. */
  modelRead?: string | null
  /**
   * ⚑ Which model call proposed it — the run discriminator.
   *
   * **A re-run appends rather than replaces**, and `import_id` and the lane are
   * identical across runs, so this is the only thing that tells run 1 from run 2.
   */
  generationId?: string | null
}

/**
 * What produced these proposals. **Provenance travels — doctrine 3.**
 *
 * A score means nothing without it: *34 correct* against which room, which
 * import, which pass, on what day.
 */
export interface FixtureProvenance {
  visitId: string
  importId: string
  /** The zone filter used, or null for every zone in the import. */
  zone: string | null
  /** ISO 8601. Passed in rather than read, so a fixture is reproducible. */
  producedAt: string
  /** Free text — which command, which session, which model tier. */
  note?: string
}

export interface ProposalFixture {
  /** Bumped when the shape changes. **Fail closed on structure — doctrine 7.** */
  schemaVersion: 1
  provenance: FixtureProvenance
  proposals: FixtureProposal[]
}

export const FIXTURE_VERSION = 1

export function buildFixture(provenance: FixtureProvenance, proposals: readonly ScoredProposal[]): ProposalFixture {
  return {
    schemaVersion: FIXTURE_VERSION,
    provenance,
    proposals: proposals.map((p) => ({
      id: p.id,
      label: p.label,
      classId: p.classId,
      mediaIds: [...p.mediaIds],
      lane: p.lane ?? null,
      models: [...(p.models ?? [])],
      ...(p.modelRead ? { modelRead: p.modelRead } : {}),
      ...(p.generationId ? { generationId: p.generationId } : {}),
    })),
  }
}

/**
 * Read a fixture back. **Fail closed on structure, fail open on vocabulary.**
 *
 * A wrong `schemaVersion`, a missing `proposals` array or a proposal without a
 * label is a refusal — those are the shapes doctrine 7 says to refuse loudly.
 * **A lane this build has not met is preserved and scored**, because a lane is a
 * word and the rule is the same one that governs every other open vocabulary.
 */
export function parseFixture(raw: unknown): ProposalFixture {
  const bad = (why: string): never => {
    throw new Error(`Not a proposal fixture: ${why}`)
  }
  if (typeof raw !== 'object' || raw === null) bad('not an object')
  const o = raw as Record<string, unknown>
  if (o.schemaVersion !== FIXTURE_VERSION) {
    bad(`schemaVersion is ${JSON.stringify(o.schemaVersion)}, this build reads ${FIXTURE_VERSION}`)
  }
  if (!Array.isArray(o.proposals)) bad('no proposals array')
  const prov = (o.provenance ?? {}) as Record<string, unknown>
  if (typeof prov.visitId !== 'string' || typeof prov.importId !== 'string') {
    bad('provenance is missing visitId or importId — a score with no provenance names no run')
  }

  const proposals = (o.proposals as unknown[]).map((p, i) => {
    if (typeof p !== 'object' || p === null) return bad(`proposal ${i} is not an object`)
    const q = p as Record<string, unknown>
    if (typeof q.id !== 'string' || typeof q.label !== 'string') bad(`proposal ${i} has no id or label`)
    if (!Array.isArray(q.mediaIds)) bad(`proposal ${i} has no mediaIds array`)
    return {
      id: q.id as string,
      label: q.label as string,
      classId: typeof q.classId === 'string' ? q.classId : null,
      mediaIds: (q.mediaIds as unknown[]).filter((m): m is string => typeof m === 'string'),
      // Open vocabulary: any string is a lane this fixture may carry.
      lane: typeof q.lane === 'string' ? q.lane : null,
      models: Array.isArray(q.models) ? (q.models as unknown[]).filter((m): m is string => typeof m === 'string') : [],
      ...(typeof q.modelRead === 'string' && q.modelRead !== '' ? { modelRead: q.modelRead } : {}),
      ...(typeof q.generationId === 'string' && q.generationId !== '' ? { generationId: q.generationId } : {}),
    }
  })

  return {
    schemaVersion: FIXTURE_VERSION,
    provenance: {
      visitId: prov.visitId as string,
      importId: prov.importId as string,
      zone: typeof prov.zone === 'string' ? prov.zone : null,
      producedAt: typeof prov.producedAt === 'string' ? prov.producedAt : '',
      ...(typeof prov.note === 'string' ? { note: prov.note } : {}),
    },
    proposals,
  }
}

/** A fixture's proposals in the shape `scoreRun` takes. */
export const proposalsOf = (f: ProposalFixture): ScoredProposal[] =>
  f.proposals.map((p) => ({
    id: p.id, label: p.label, classId: p.classId, mediaIds: p.mediaIds, lane: p.lane, models: p.models,
    modelRead: p.modelRead ?? null, generationId: p.generationId ?? null,
  }))

// --------------------------------------------------------- the personal-data scan

export interface PersonalDataHit {
  /** Which proposal, so a human can go and look at it. */
  proposalId: string
  kind: 'address' | 'phone' | 'postal-code' | 'email' | 'licence-or-registration'
  /** The field it was found in. */
  where: 'label' | 'model' | 'model-read'
  /** The matched text. **Shown to the reviewer, never logged anywhere durable.** */
  matched: string
}

/**
 * Shapes that mean a human must look before this file moves into the repository.
 *
 * ⚑ **Deliberately narrow, and the narrowness is the design.** A scan that fires
 * on every mechanical room is a scan nobody reads by the third run — and a
 * mechanical room is *full* of strings that look like licence numbers, because
 * model numbers and serials have the same shape. `TTV049BGC01ARKS` and a fitter's
 * licence number are indistinguishable as strings.
 *
 * **So the licence rule keys on the WORD, never on the shape.** *"Licence 12345"*
 * fires; `Q13734509` standing alone does not. That is a deliberate hole: it will
 * miss a bare licence number in a label, and **it would be a worse scan without
 * it**, because the version that catches that also flags every serial in the
 * house.
 *
 * **What it cannot see at all:** a person's name. There is no shape for one, and
 * pretending otherwise would be the more dangerous error — *a scan that appears
 * to cover names produces a reviewer who stops looking for them.*
 */
/**
 * ⚑ Every text a proposal carries, and the ONLY place that list is written down.
 *
 * **This existed inline and did not include `modelRead`.** The scan read `label`
 * and `models[]`, printed *the personal-data scan found nothing*, and told the
 * operator the file was ready to look at — while `modelRead`, **which is a string
 * read straight off a plate**, went unexamined. Proved rather than argued: a
 * planted `"Gas fitter licence 12345 613-555-0142 at 1 Nowhere Road"` produced
 * **zero hits** in `modelRead` and three in `models[]`.
 *
 * ⚑ **Reading the field is the smaller half of the fix.** *A scan that reports
 * "found nothing" is indistinguishable from a scan that is not looking* — which
 * is this repo's signature failure arriving inside the guard built against it.
 *
 * **So the field list is extracted here, exported, and covered by a test that
 * plants data in every string a proposal can hold.** Add a text-bearing field to
 * `FixtureProposal`, forget to add it here, and `proposal-fixture.test.ts` fails
 * — instead of the scan quietly going blind on one more field.
 */
/**
 * Fields deliberately NOT scanned, each with the reason it cannot carry plate text.
 *
 * ⚑ **A path goes in here with a sentence, never on its own** — same discipline as
 * `lanes.ts`'s `LANE_EXEMPT`. An exempt list of bare names is how a real field
 * gets parked: the next reader cannot tell an argued exemption from one somebody
 * added to make the suite green.
 *
 * **The test pairs this with the extractor and requires the two to cover every
 * string-bearing key between them.** Add a field to `FixtureProposal` and you must
 * either scan it or say why not — which is the only version of this guard that
 * survives the next field.
 *
 * ---
 *
 * ## ⛑ How this list decays, and the tell
 *
 * **An escape hatch defeats its own guard when somebody adds a field, sees the
 * test fail, and writes a lazy reason to make it pass.** *Recorded 2026-08-26,
 * the day the list was created, because a caution that lives only in a session
 * reply does not survive a handover.*
 *
 * ⚑ **The tell is a reason that RESTATES THE FIELD NAME rather than arguing from
 * what the field can hold:**
 *
 * | | |
 * |---|---|
 * | *"a minted uuid, never read off a photograph"* | **argues** — it says where the value comes from, and that source cannot carry plate text |
 * | *"not text"* · *"internal"* · *"an id"* | **restates** — it describes the field rather than its provenance, and would be equally true of a field that DID carry plate text |
 *
 * **The question a reason must answer is not *what is this field* but *what is
 * the furthest thing a model could ever write into it*.** A field a model
 * populates from a photograph is scanned, whatever it is called.
 */
export const NOT_SCANNED: ReadonlyMap<string, string> = new Map([
  ['id', 'A minted uuid. Never touched by a model and never read off a photograph.'],
  ['classId', 'A vocabulary term from this repo\'s own class frame, not free text.'],
  ['lane', 'One of `plate` / `appearance` / null — this builder\'s own word for which pass wrote the row.'],
  ['generationId', 'A minted uuid identifying the model call.'],
  // Caught by the coverage test on its first run rather than reasoned about,
  // which is the difference between this guard and the one it replaces.
  ['mediaIds', 'Field-minted media uuids. A filename, never a reading of one.'],
])

export function personalDataFields(p: FixtureProposal): { where: PersonalDataHit['where']; text: string }[] {
  return [
    { where: 'label', text: p.label },
    ...p.models.map((m) => ({ where: 'model' as const, text: m })),
    // Optional and nullable, and it is the one that was missed.
    ...(typeof p.modelRead === 'string' && p.modelRead !== ''
      ? [{ where: 'model-read' as const, text: p.modelRead }]
      : []),
  ]
}

export function scanForPersonalData(proposals: readonly FixtureProposal[]): PersonalDataHit[] {
  const RULES: { kind: PersonalDataHit['kind']; re: RegExp }[] = [
    // A number, then words, then a road word. The road word is what makes it an
    // address rather than a dimension.
    {
      kind: 'address',
      re: /\b\d+\s+(?:[A-Za-z][A-Za-z.'-]*\s+){0,3}(?:street|st|road|rd|avenue|ave|drive|dr|lane|ln|boulevard|blvd|court|crt|ct|concession|highway|hwy|sideroad|trail|crescent|cres)\b/gi,
    },
    // Separators required, so a ten-digit serial cannot be a telephone number.
    { kind: 'phone', re: /\b(?:\+?1[-. ])?\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b/g },
    { kind: 'postal-code', re: /\b[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d\b/g },
    { kind: 'email', re: /\b[^\s@]+@[^\s@.]+\.[^\s@]+\b/g },
    // ⚑ Keyed on the word, never the shape. See the note above.
    { kind: 'licence-or-registration', re: /\b(?:licen[cs]e|registration|reg\.?\s*no\.?)\b[^A-Za-z0-9]{0,4}[A-Za-z0-9-]{3,}/gi },
  ]

  const hits: PersonalDataHit[] = []
  for (const p of proposals) {
    const fields = personalDataFields(p)
    for (const f of fields) {
      for (const rule of RULES) {
        for (const m of f.text.matchAll(rule.re)) {
          hits.push({ proposalId: p.id, kind: rule.kind, where: f.where, matched: m[0] })
        }
      }
    }
  }
  return hits
}
