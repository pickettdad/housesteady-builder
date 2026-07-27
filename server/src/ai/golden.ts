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
  /**
   * Ratification, per value.
   *
   * Carries a COPY of the exact value approved, not a boolean. A flag drifts off
   * the thing it approved: ratify a serial, let someone edit that serial later,
   * and the approval silently transfers to a value nobody ever looked at.
   * Storing the value means approval lapses by itself the moment the value
   * changes, the same way a prompt's hash stops matching when its text moves.
   *
   * It also carries WHO ratified it and when. Not for blame — for tracing. If a
   * wrong value turns out to have been ratified, the question that matters next
   * is which review it came through, so the others from that same sitting can be
   * re-checked. That cannot be reconstructed afterwards, so it is recorded now
   * while it costs nothing.
   *
   * Keys are field names plus `classification`. An absent key is simply not
   * ratified, which is the honest default for everything until someone looks.
   */
  approved?: Record<string, Ratification>
}

export interface Ratification {
  /** The exact value ratified. Approval lapses if the value moves away from it. */
  value: string
  /** Who ratified it. A role as much as a person — see the note on the set. */
  by: string
  at: string
}

export interface ExpectedSet {
  version: number
  images: ExpectedImage[]
  notes?: string[]
}

/**
 * Is this key ratified, and still ratified for the value it is attached to?
 *
 * Approval is per value, so approving forty at once is forty acts rather than
 * one — a wrong entry can no longer ride in on the back of thirty-nine right
 * ones and become permanent truth.
 */
export const currentValue = (entry: ExpectedImage, key: string): string =>
  key === 'classification' ? entry.classification : (entry.fields[key] ?? 'unknown')

export const isRatified = (entry: ExpectedImage, key: string): boolean => {
  const approved = entry.approved?.[key]
  if (approved === undefined) return false
  return approved.value === currentValue(entry, key)
}

/** Who ratified this value, if anyone still has. */
export const ratifiedBy = (entry: ExpectedImage, key: string): Ratification | undefined =>
  isRatified(entry, key) ? entry.approved?.[key] : undefined

export function loadExpected(root = fixturesRoot): ExpectedSet {
  const raw = readFileSync(join(root, 'nameplates', 'expected.json'), 'utf8')
  const parsed = JSON.parse(raw) as ExpectedSet & { $comment?: unknown; approved?: unknown }
  if (!Array.isArray(parsed.images)) {
    throw new Error('expected.json has no images array — the golden set cannot run against nothing.')
  }
  for (const image of parsed.images) {
    for (const [key, value] of Object.entries(image.approved ?? {})) {
      if (typeof value === 'string') {
        // The earlier shape stored a bare value with no ratifier. Refuse rather
        // than assume one — an approval whose author is unknown is exactly the
        // approval you cannot trace when it turns out to be wrong.
        throw new Error(
          `${image.file}: approval for "${key}" has no ratifier. Approvals record who ratified ` +
            'them; re-ratify with `npm run golden:approve`.',
        )
      }
    }
  }
  if (typeof parsed.approved === 'boolean') {
    // A single flag over the whole set is the thing this design removed. Refuse
    // rather than quietly ignore it: a file still carrying one was written
    // against the old rules and its approvals mean something different.
    throw new Error(
      'expected.json carries a set-wide `approved` flag. Approval is per value now — ' +
        'each entry carries an `approved` map holding a copy of each ratified value.',
    )
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
  /** Whether this value is ratified. Unratified differences never gate. */
  ratified: boolean
}

export interface ImageResult {
  file: string
  classification: { expected: string; actual: string | null; match: boolean; ratified: boolean }
  /** Whether extraction ran at all. Skipped is correct for a non-nameplate. */
  extracted: boolean
  abstention: { expected: boolean; actual: boolean | null; match: boolean }
  fields: FieldResult[]
  /** Anything that stopped this entry running — a crash, a refusal, no key. */
  error?: string
}

export interface GoldenReport {
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
  /** How much of the set is ratified, which is the honest measure of its authority. */
  ratification: { ratified: number; total: number }
  /** Regressions among RATIFIED values only. These are the ones that gate. */
  regressions: number
  /**
   * Unratified values that produced a difference — the set's next work.
   *
   * "Until they have earned it" needs a trigger, and nothing earns ratification
   * except someone looking. A value that has never moved is a value nobody needs
   * to have looked at yet; a value that just moved is one somebody must look at
   * now, because either the model changed its answer or the expectation was
   * wrong and there is no third possibility.
   *
   * So the set completes itself through use, in the order the work surfaces,
   * and nobody ever sits down to ratify ninety things at once.
   */
  pendingRatification: { file: string; key: string; expected: string; actual: string }[]
  /** True when no ratified value regressed. Says nothing about unratified ones. */
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
    ratified: isRatified(entry, 'classification'),
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
        ratified: isRatified(entry, field),
      }))
    : []

  return { file: entry.file, classification, extracted: produced.extracted, abstention, fields, error: produced.error }
}

/** Verdicts that count against a run — when the value they are about is ratified. */
const REGRESSION: FieldVerdict[] = ['invented', 'misread']

export function summarise(images: ImageResult[]): GoldenReport {
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

  // Every value the set has an opinion about, ratified or not. Classification
  // counts as one, because it is a judgement a person makes about the image the
  // same way a field value is.
  const ratifiable = all.length + images.length
  const ratified = all.filter((f) => f.ratified).length + images.filter((i) => i.classification.ratified).length

  // Only ratified values gate. `formatting` never does — which side is wrong is
  // a judgement. `missed` never does either: penalising a decline would push the
  // next prompt edit toward guessing, which is the opposite of the point.
  const regressions =
    all.filter((f) => f.ratified && REGRESSION.includes(f.verdict)).length +
    images.filter((i) => i.classification.ratified && !i.classification.match).length +
    images.filter((i) => !i.abstention.match).length +
    totals.errors

  const pendingRatification: GoldenReport['pendingRatification'] = []
  for (const image of images) {
    if (!image.classification.ratified && !image.classification.match) {
      pendingRatification.push({
        file: image.file, key: 'classification',
        expected: image.classification.expected, actual: image.classification.actual ?? 'nothing',
      })
    }
    for (const f of image.fields) {
      if (f.ratified || f.verdict === 'match') continue
      pendingRatification.push({ file: image.file, key: f.field, expected: f.expected, actual: f.actual })
    }
  }

  return {
    images,
    totals,
    ratification: { ratified, total: ratifiable },
    regressions,
    pendingRatification,
    clean: regressions === 0,
  }
}

/** The image name as the approve command wants it — no path, no extension. */
const shortName = (file: string): string => file.replace(/^.*\//, '').replace(/\.[^.]+$/, '')

/**
 * The report as a person reads it.
 *
 * Written for the owner on a phone at midnight, not for a CI log: the
 * consequential line goes first, how much of the set actually has authority is
 * impossible to miss, and every difference names the file and the field.
 */
export function formatReport(report: GoldenReport): string {
  const lines: string[] = []
  const t = report.totals
  const r = report.ratification

  lines.push(`Golden set — ${t.images} images, ${r.ratified} of ${r.total} values ratified`)
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
    const mark = (ratified: boolean): string => (ratified ? '' : '  (not ratified)')
    if (image.error) problems.push(`errored: ${image.error}`)
    if (!image.classification.match) {
      problems.push(
        `classified ${image.classification.actual ?? 'nothing'}, expected ${image.classification.expected}` +
          mark(image.classification.ratified),
      )
    }
    if (!image.abstention.match) {
      problems.push(image.abstention.expected ? 'should have abstained and did not' : 'abstained where a reading was expected')
    }
    for (const f of image.fields) {
      const m = mark(f.ratified)
      if (f.verdict === 'invented') problems.push(`${f.field}: INVENTED "${f.actual}" — expected unknown${m}`)
      else if (f.verdict === 'misread') problems.push(`${f.field}: read "${f.actual}", expected "${f.expected}"${m}`)
      else if (f.verdict === 'missed') problems.push(`${f.field}: not read, expected "${f.expected}"${m}`)
      else if (f.verdict === 'match-but-formatting') problems.push(`${f.field}: "${f.actual}" vs expected "${f.expected}"${m}`)
    }
    if (problems.length > 0) {
      lines.push(`${image.file}`)
      for (const p of problems) lines.push(`    ${p}`)
    }
  }

  lines.push('')

  // The diff is what summons a person to a value. Printed before the verdict,
  // because it is the actionable half — the verdict is only news the first time.
  if (report.pendingRatification.length > 0) {
    lines.push(`RATIFY THESE ${report.pendingRatification.length} NOW — each one moved, so either the model`)
    lines.push('changed its answer or the expectation was wrong. There is no third possibility,')
    lines.push('and whichever it is, somebody has to look at the photograph.')
    lines.push('')
    for (const p of report.pendingRatification) {
      lines.push(`    ${shortName(p.file)} ${p.key}`)
      lines.push(`      expected "${p.expected}"   read "${p.actual}"`)
      lines.push(
        p.expected === p.actual
          ? `      npm run golden:approve -- ${shortName(p.file)} ${p.key}`
          : `      npm run golden:approve -- ${shortName(p.file)} ${p.key} --as "${p.actual}"   # if the model is right`,
      )
    }
    lines.push('')
  }

  if (r.ratified === 0) {
    lines.push('NOTHING IS RATIFIED YET. Every expectation above is proposed, so this run is a')
    lines.push('diagnostic and cannot gate a prompt change.')
  } else if (report.clean) {
    lines.push(`Clean — no ratified value regressed (${r.ratified} of ${r.total} carry authority).`)
    if (r.ratified < r.total) {
      lines.push(`${r.total - r.ratified} values are still unratified and gate nothing.`)
    }
  } else {
    lines.push(`${report.regressions} regression(s) among ratified values. Review before shipping the prompt change.`)
  }
  return lines.join('\n')
}
