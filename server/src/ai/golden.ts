/**
 * The golden set.
 *
 * §3 calls this the highest-value piece of AI infrastructure in the build, and
 * it is not a test fixture. It is the thing that decides whether a prompt change
 * ships — and a prompt change silently alters the voice and the accuracy of
 * every binder produced afterwards. Without it a wording edit changes behaviour
 * and nobody notices for months.
 *
 * TWO RULES THAT SHAPE EVERYTHING HERE.
 *
 * 1. NO MODEL CHECKS A MODEL. Every comparison below is string equality against
 *    values a human approved. There is no judge model, no similarity score, no
 *    "close enough". A harness that asked a model whether an answer was good
 *    would be measuring agreement between two models, which is not accuracy and
 *    drifts in exactly the same direction as the thing it is meant to catch.
 *
 * 2. UNAPPROVED EXPECTATIONS DO NOT GATE ANYTHING. `expected.json` carries an
 *    `approved` flag. Until a human has ratified the readings, a difference
 *    against them is information, not a regression — reporting it as a failure
 *    would train everyone to ignore a red result, which is worse than having no
 *    harness at all.
 *
 * THE TWO FAILURE DIRECTIONS ARE NOT EQUAL, so they are never summed. Reading a
 * value the plate does not legibly show is the cardinal error: it gets believed
 * and copied into a permanent record of somebody's house. Failing to read one
 * that is there is a nuisance: it gets chased. A single "accuracy %" would let
 * the first hide inside the second, so `invented` is counted and reported on its
 * own and no headline figure merges them.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
export const fixturesRoot = process.env.HOUSESTEADY_FIXTURES ?? join(here, '..', '..', '..', 'fixtures')

export interface ExpectedImage {
  file: string
  subject?: string
  hard?: string
  classification: 'yes' | 'no' | 'unsure'
  abstains: boolean
  fields: Record<string, string>
  fieldNotes?: Record<string, string>
}

export interface ExpectedSet {
  version: number
  approved: boolean
  images: ExpectedImage[]
  notes?: string[]
}

export function loadExpected(root = fixturesRoot): ExpectedSet {
  const raw = readFileSync(join(root, 'nameplates', 'expected.json'), 'utf8')
  const parsed = JSON.parse(raw) as ExpectedSet & { $comment?: unknown }
  if (!Array.isArray(parsed.images)) {
    throw new Error('expected.json has no images array — the golden set cannot run against nothing.')
  }
  return parsed
}

export const imagePath = (entry: ExpectedImage, root = fixturesRoot): string =>
  join(root, 'nameplates', entry.file)

// --------------------------------------------------------------- comparison

export type FieldVerdict =
  /** Read exactly what the approved value says. */
  | 'match'
  /** Approved value is `unknown`; the model produced one anyway. THE BAD ONE. */
  | 'invented'
  /** Approved value exists; the model declined. Safe — it gets chased. */
  | 'missed'
  /** Both have a value and they differ. A misreading. */
  | 'misread'
  /** Differs only in letter case or spacing. Reported apart so it can be judged. */
  | 'match-but-formatting'

const squash = (s: string): string => s.trim().replace(/\s+/g, ' ')
const isUnknown = (s: string | undefined): boolean =>
  s === undefined || squash(s) === '' || squash(s).toLowerCase() === 'unknown'

export function compareField(expected: string | undefined, actual: string | undefined): FieldVerdict {
  const e = isUnknown(expected)
  const a = isUnknown(actual)
  if (e && a) return 'match'
  if (e && !a) return 'invented'
  if (!e && a) return 'missed'
  const ex = squash(expected!)
  const ac = squash(actual!)
  if (ex === ac) return 'match'
  // Case and spacing differences are usually the approved value having been
  // tidied rather than the model misreading. Surfaced separately so a person
  // decides which side is wrong, instead of it silently passing or silently
  // failing — both of which would put the judgement in the wrong place.
  if (ex.toLowerCase().replace(/\s/g, '') === ac.toLowerCase().replace(/\s/g, '')) return 'match-but-formatting'
  return 'misread'
}

export interface FieldResult {
  field: string
  expected: string
  actual: string
  verdict: FieldVerdict
}

export interface ImageResult {
  file: string
  /** Approved vs produced classification, and whether they agree. */
  classification: { expected: string; actual: string | null; match: boolean }
  /** Whether extraction ran at all. Skipped is correct for a non-nameplate. */
  extracted: boolean
  abstention: { expected: boolean; actual: boolean | null; match: boolean }
  fields: FieldResult[]
  /** Anything that stopped this entry running — a crash, a refusal, no key. */
  error?: string
}

export interface GoldenReport {
  approved: boolean
  images: ImageResult[]
  /** Counted separately and never summed — see the note at the top. */
  totals: {
    images: number
    classificationMismatches: number
    invented: number
    misread: number
    missed: number
    formatting: number
    matched: number
    errors: number
  }
  /** True only when nothing regressed AND the expectations are ratified. */
  clean: boolean
}

/**
 * Compare one produced reading against its approved one.
 *
 * Takes plain data rather than a database or a model, so the comparison logic
 * is testable without either — the part that decides whether a prompt ships
 * should not itself depend on a network being up.
 */
export function compareImage(
  entry: ExpectedImage,
  produced: {
    classification?: string | null
    extracted: boolean
    abstained?: boolean | null
    fields?: Record<string, string>
    error?: string
  },
): ImageResult {
  const classification = {
    expected: entry.classification,
    actual: produced.classification ?? null,
    match: produced.classification === entry.classification,
  }

  const abstention = {
    expected: entry.abstains,
    actual: produced.abstained ?? null,
    // A non-nameplate that was never extracted has abstained correctly by not
    // running at all — §11's "not extracted at all". Demanding an abstention
    // record from a job that rightly never happened would fail the gate for
    // working.
    match: produced.extracted ? produced.abstained === entry.abstains : entry.abstains,
  }

  const fields: FieldResult[] = produced.extracted
    ? Object.keys(entry.fields).map((field) => ({
        field,
        expected: entry.fields[field] ?? 'unknown',
        actual: produced.fields?.[field] ?? 'unknown',
        verdict: compareField(entry.fields[field], produced.fields?.[field]),
      }))
    : []

  return { file: entry.file, classification, extracted: produced.extracted, abstention, fields, error: produced.error }
}

export function summarise(approved: boolean, images: ImageResult[]): GoldenReport {
  const all = images.flatMap((i) => i.fields)
  const count = (v: FieldVerdict): number => all.filter((f) => f.verdict === v).length

  const totals = {
    images: images.length,
    classificationMismatches: images.filter((i) => !i.classification.match).length,
    invented: count('invented'),
    misread: count('misread'),
    missed: count('missed'),
    formatting: count('match-but-formatting'),
    matched: count('match'),
    errors: images.filter((i) => i.error).length,
  }

  // `formatting` is not counted against the run; it is a question for a person.
  // `missed` is not either — declining to read is the behaviour being asked for,
  // and penalising it here would push a future prompt edit toward guessing.
  const regressed =
    totals.invented > 0 ||
    totals.misread > 0 ||
    totals.classificationMismatches > 0 ||
    !images.every((i) => i.abstention.match) ||
    totals.errors > 0

  return { approved, images, totals, clean: approved && !regressed }
}

/**
 * The report as a person reads it.
 *
 * Written for the owner on a phone at midnight, not for a CI log: the
 * consequential line goes first, the unratified warning is impossible to miss,
 * and every difference names the file and the field.
 */
export function formatReport(report: GoldenReport): string {
  const lines: string[] = []
  const t = report.totals

  lines.push(`Golden set — ${t.images} images`)
  lines.push('')

  if (t.invented > 0) {
    lines.push(`  ${t.invented} INVENTED — a value where the plate shows none. This is the one that matters.`)
  } else {
    lines.push('  0 invented — nothing was read that the plate does not show.')
  }
  lines.push(`  ${t.misread} misread     — a value read wrongly`)
  lines.push(`  ${t.classificationMismatches} misclassified`)
  lines.push(`  ${t.missed} not read    — declined where a value exists (safe: it gets chased)`)
  lines.push(`  ${t.formatting} formatting  — same value, different case or spacing (a person decides)`)
  lines.push(`  ${t.matched} matched`)
  if (t.errors > 0) lines.push(`  ${t.errors} errored`)
  lines.push('')

  for (const image of report.images) {
    const problems: string[] = []
    if (image.error) problems.push(`errored: ${image.error}`)
    if (!image.classification.match) {
      problems.push(`classified ${image.classification.actual ?? 'nothing'}, approved as ${image.classification.expected}`)
    }
    if (!image.abstention.match) {
      problems.push(image.abstention.expected ? 'should have abstained and did not' : 'abstained where a reading was approved')
    }
    for (const f of image.fields) {
      if (f.verdict === 'invented') problems.push(`${f.field}: INVENTED "${f.actual}" — approved as unknown`)
      else if (f.verdict === 'misread') problems.push(`${f.field}: read "${f.actual}", approved "${f.expected}"`)
      else if (f.verdict === 'missed') problems.push(`${f.field}: not read, approved "${f.expected}"`)
      else if (f.verdict === 'match-but-formatting') problems.push(`${f.field}: "${f.actual}" vs approved "${f.expected}"`)
    }
    if (problems.length > 0) {
      lines.push(`${image.file}`)
      for (const p of problems) lines.push(`    ${p}`)
    }
  }

  lines.push('')
  if (!report.approved) {
    lines.push('NOT RATIFIED. expected.json is marked approved: false, so the readings above are')
    lines.push('proposed rather than ground truth. Differences here are information, not regressions,')
    lines.push('and this run cannot gate a prompt change until David has approved the set.')
  } else if (report.clean) {
    lines.push('Clean against the approved set.')
  } else {
    lines.push('Differences against the approved set. Review before shipping the prompt change.')
  }
  return lines.join('\n')
}
