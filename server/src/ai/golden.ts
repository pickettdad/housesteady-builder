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
   * The ratification log for this image — every act, oldest first.
   *
   * A LOG, NOT A MAP OF CURRENT STATE. The same doctrine that governs overlays:
   * an undo is a superseding record, never a deletion. If a wrong value is
   * ratified and later revoked, you have to be able to see that it WAS ratified,
   * because every golden run in between validated against it and binders may
   * have shipped on that basis. Deleting the approval would erase the only
   * evidence that a window of false confidence existed.
   *
   * Current state is computed from the log on read — `isRatified` — for the same
   * reason the overlay layer computes state on read: a stored answer is a second
   * copy that can drift from the acts it summarises, and only one can be right.
   */
  ratifications?: RatificationAct[]
}

/**
 * One act of ratifying or revoking one value.
 *
 * `value` is a COPY of what was ratified, not a flag. A flag drifts off the
 * thing it approved: ratify a serial, let someone edit that serial later, and
 * the approval silently transfers to a value nobody looked at. Storing the value
 * means ratification lapses by itself the moment the value moves, the same way a
 * prompt's hash stops matching when its text does.
 *
 * `by` is required everywhere. Not for blame — for tracing. If a wrong value
 * turns out to have been ratified, the question that matters next is which
 * review it came through, so the rest of that sitting can be re-checked. That is
 * not reconstructible afterwards.
 */
export interface RatificationAct {
  /** A field name, or `classification`. */
  key: string
  act: 'ratify' | 'revoke'
  /** Present on `ratify`. The exact value approved. */
  value?: string
  by: string
  at: string
  /** Why it was taken back. Worth having when the log is read years later. */
  reason?: string
}

export interface ExpectedSet {
  version: number
  images: ExpectedImage[]
  notes?: string[]
}

export const currentValue = (entry: ExpectedImage, key: string): string =>
  key === 'classification' ? entry.classification : (entry.fields[key] ?? 'unknown')

/** Every act touching one value, oldest first. */
export const historyFor = (entry: ExpectedImage, key: string): RatificationAct[] =>
  (entry.ratifications ?? []).filter((r) => r.key === key)

/** The act in force for one value, if any. */
export const latestAct = (entry: ExpectedImage, key: string): RatificationAct | undefined => {
  const acts = historyFor(entry, key)
  return acts[acts.length - 1]
}

export const isRatified = (entry: ExpectedImage, key: string): boolean => {
  const act = latestAct(entry, key)
  return act?.act === 'ratify' && act.value === currentValue(entry, key)
}

/** Who ratified this value, if it still stands. */
export const ratifiedBy = (entry: ExpectedImage, key: string): RatificationAct | undefined =>
  isRatified(entry, key) ? latestAct(entry, key) : undefined

/**
 * Was this value ever ratified, even if it is not now?
 *
 * The question a bad value raises: did anything validate against this while it
 * stood? A revoked ratification still had a window, and that window is what
 * needs chasing.
 */
export const wasEverRatified = (entry: ExpectedImage, key: string): boolean =>
  historyFor(entry, key).some((r) => r.act === 'ratify')

export interface Contest {
  file: string
  key: string
  /** Distinct values that have been ratified for this key, oldest first. */
  values: string[]
  /** Who ratified each. Two names here is the drift signal. */
  by: string[]
}

/**
 * Values that have been ratified more than once, to different answers.
 *
 * This is the drift signal, and a list of who-has-ratified-how-many is not it.
 * Several reviewers agreeing is exactly what a company artifact looks like
 * working. The thing to catch is two reviewers who looked at the same plate and
 * wrote down different values — because that is a set quietly forking, and it
 * fragments accuracy the way the binder voice would fragment without house
 * style. It surfaces as a question for the review role rather than an error:
 * one of them is wrong, or the plate is genuinely ambiguous and the entry needs
 * a note saying so.
 */
export function contested(set: ExpectedSet): Contest[] {
  const out: Contest[] = []
  for (const entry of set.images) {
    const keys = new Set((entry.ratifications ?? []).map((r) => r.key))
    for (const key of keys) {
      const ratifies = historyFor(entry, key).filter((r) => r.act === 'ratify')
      const values = [...new Set(ratifies.map((r) => r.value ?? ''))]
      if (values.length > 1) out.push({ file: entry.file, key, values, by: ratifies.map((r) => r.by) })
    }
  }
  return out
}

export function loadExpected(root = fixturesRoot): ExpectedSet {
  const raw = readFileSync(join(root, 'nameplates', 'expected.json'), 'utf8')
  const parsed = JSON.parse(raw) as ExpectedSet & { $comment?: unknown; approved?: unknown }
  if (!Array.isArray(parsed.images)) {
    throw new Error('expected.json has no images array — the golden set cannot run against nothing.')
  }
  for (const image of parsed.images as (ExpectedImage & { approved?: unknown })[]) {
    if (image.approved && Object.keys(image.approved).length > 0) {
      // The earlier shape kept only the approval in force, so a revocation
      // erased the fact that anything had been approved. Refuse rather than
      // migrate: a log reconstructed from current state has no history in it,
      // which is the whole thing the log is for.
      throw new Error(
        `${image.file}: carries an \`approved\` map. Ratification is an append-only log now — ` +
          're-ratify with `npm run golden:approve` so the acts are recorded.',
      )
    }
    for (const act of image.ratifications ?? []) {
      if (!act.by || act.by.trim() === '') {
        throw new Error(
          `${image.file}: a ratification of "${act.key}" has no author. An approval whose author ` +
            'is unknown is exactly the approval you cannot trace when it turns out to be wrong.',
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
    // CLAUDE.md §9, all three guards. The EVIDENCE is the two readings and they
    // come first. BOTH options are offered and they are the same length to type,
    // because an alternative that is more work than the top option is not really
    // offered. And neither is applied for you — a command you have to run cannot
    // become the default the way a pre-filled box can.
    for (const p of report.pendingRatification) {
      lines.push(`    ${shortName(p.file)} ${p.key}`)
      lines.push(`      the set says   "${p.expected}"`)
      lines.push(`      the model read "${p.actual}"`)
      if (p.expected === p.actual) {
        lines.push(`      npm run golden:approve -- ${shortName(p.file)} ${p.key}`)
      } else {
        lines.push(`      keep the set's:  npm run golden:approve -- ${shortName(p.file)} ${p.key}`)
        lines.push(`      take the model's: npm run golden:approve -- ${shortName(p.file)} ${p.key} --as "${p.actual}"`)
        lines.push(`      neither:          open the photograph and use --as with what it says`)
      }
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
