/**
 * Where the golden set stands — printed on every CI run, costing nothing.
 *
 * `npm run golden` is the one that spends money: it calls a real model on
 * fifteen photographs. So it runs when somebody decides to run it, which means
 * the one number that decides whether the set has any authority — how much of
 * it is ratified — is only ever seen by someone who already went looking.
 *
 * A set at zero ratified gates nothing. It is a diagnostic wearing the clothes
 * of a safety net, and the failure mode is not that anyone is deceived on the
 * day: it is that six months pass, the number is still zero, and by then the
 * work is ninety values rather than twenty and nobody schedules it.
 *
 * So this reads `expected.json` and nothing else. No model, no key, no network,
 * no cost. It never fails a build — ratifying is a review sitting, not a merge
 * blocker, and a red build for it would teach people to ignore red builds.
 * It just makes the number impossible not to see.
 *
 * The order it asks for is the README's, and it is not arbitrary. Abstentions
 * first, because abstention collapse turns declines into invented values and
 * invented values get believed. Serials next, because a serial regresses by one
 * character and feeds decoding, which feeds install dates, which feeds the
 * capital plan.
 */

import {
  contested, currentValue, isRatified, loadExpected, wasEverRatified,
  type ExpectedImage, type ExpectedSet,
} from './golden.js'

const shortName = (file: string): string => file.replace(/^.*\//, '').replace(/\.[^.]+$/, '')

const isUnknown = (v: string): boolean => v.trim().toLowerCase() === 'unknown' || v.trim() === ''

/**
 * The fields whose abstention is a guard rather than a normal reading.
 *
 * A plate almost never prints an install date and often does not print a
 * capacity, so `unknown` on those is the ordinary state of a correct reading —
 * ratifying fifteen of them first is the ninety-value sitting nobody schedules.
 * `unknown` on a make, model or serial is a decline, and a decline is the thing
 * a prompt change collapses into an invented value.
 */
const IDENTITY = ['make', 'model', 'serial']

export interface StandingValue {
  file: string
  key: string
  value: string
  why: string
}

export interface Standing {
  ratified: number
  total: number
  /** The ~20 the README asks for first: guards, then the values that regress. */
  first: StandingValue[]
  /** The rest. Real work, but it can wait for the diff that summons it. */
  later: StandingValue[]
  /** Ratified once, then withdrawn. Every run in between validated against it. */
  lapsed: { file: string; key: string }[]
  contested: ReturnType<typeof contested>
}

/**
 * Every value the set has an opinion about, tiered by what it costs to be wrong.
 *
 * A `classification` counts as a value: deciding a photograph is not a nameplate
 * is a judgement a person makes, exactly as a field reading is.
 */
export function standing(set: ExpectedSet): Standing {
  const keysOf = (e: ExpectedImage): string[] => ['classification', ...Object.keys(e.fields)]

  let ratified = 0
  let total = 0
  const guards: StandingValue[] = []
  const regressors: StandingValue[] = []
  const later: StandingValue[] = []
  const lapsed: Standing['lapsed'] = []

  for (const entry of set.images) {
    for (const key of keysOf(entry)) {
      total++
      const value = currentValue(entry, key)
      if (isRatified(entry, key)) {
        ratified++
        continue
      }
      // Ratified at some point and not now: the window between is what needs
      // chasing, because runs validated against it and binders may have shipped.
      if (wasEverRatified(entry, key)) lapsed.push({ file: entry.file, key })

      const row = { file: entry.file, key, value }
      if (key === 'classification' && entry.classification !== 'yes') {
        guards.push({ ...row, why: 'the gate that stops extraction reaching something that is not a plate' })
      } else if (IDENTITY.includes(key) && isUnknown(value)) {
        guards.push({ ...row, why: 'a decline — the reading a prompt change collapses into an invented value' })
      } else if (key === 'serial') {
        regressors.push({ ...row, why: 'one character feeds decoding, then install dates, then the capital plan' })
      } else if (key === 'installDate' && !isUnknown(value)) {
        // A plate prints a MANUFACTURE date. One filed as an install date is
        // the laundering doctrine 2 forbids, so the few that carry a value are
        // worth guarding; the many that are `unknown` are the plate's normal
        // state and wait their turn.
        regressors.push({ ...row, why: 'an install date read off a plate — the one field that must not be a manufacture date' })
      } else {
        later.push({ ...row, why: '' })
      }
    }
  }

  return {
    ratified, total,
    first: [...guards, ...regressors],
    later,
    lapsed,
    contested: contested(set),
  }
}

export function format(s: Standing): string {
  const lines: string[] = []

  lines.push(`Golden set — ${s.ratified} of ${s.total} values ratified.`)
  lines.push('')

  if (s.ratified === 0) {
    lines.push('NOTHING IS RATIFIED. The set gates nothing: `npm run golden` is a diagnostic')
    lines.push('and a prompt change cannot be blocked by it. Every expectation in the file is')
    lines.push('a proposed reading made by Claude, and no model may check a model.')
  } else if (s.ratified < s.total) {
    lines.push(`${s.total - s.ratified} values are unratified and gate nothing. Differences against`)
    lines.push('them are reported as information, never as a regression.')
  } else {
    lines.push('Every value carries authority. A difference against any of them fails the run.')
  }
  lines.push('')

  if (s.first.length > 0) {
    lines.push(`START WITH THESE ${s.first.length}, in this order:`)
    lines.push('')
    for (const n of s.first) {
      lines.push(`    ${shortName(n.file)} ${n.key}  = "${n.value}"`)
      lines.push(`      ${n.why}`)
    }
    lines.push('')
    if (s.later.length > 0) {
      lines.push(`${s.later.length} others are unratified too. They can wait for the diff that summons`)
      lines.push('them — a value that has never moved is one nobody has needed to look at yet.')
      lines.push('')
    }
    lines.push('    export HOUSESTEADY_RATIFIER=<your name>')
    lines.push('    npm run golden:approve                      # the whole unratified list')
    lines.push('    npm run golden:approve -- <image> <field>   # one value, after looking at it')
    lines.push('')
    lines.push('Open the photograph and decide; the command copies the value across. Never')
    lines.push('hand-type an approval — a mistyped one is a wrong value that has been blessed.')
    lines.push('')
  }

  if (s.lapsed.length > 0) {
    lines.push(`${s.lapsed.length} previously ratified, no longer:`)
    for (const l of s.lapsed) lines.push(`    ${shortName(l.file)} ${l.key}`)
    lines.push('Every run between the ratification and its withdrawal validated against it.')
    lines.push('')
  }

  if (s.contested.length > 0) {
    lines.push(`CONTESTED — ${s.contested.length} value(s) ratified twice, to different answers:`)
    for (const c of s.contested) {
      lines.push(`    ${shortName(c.file)} ${c.key}: ${c.values.map((v) => `"${v}"`).join(' then ')} (${c.by.join(', ')})`)
    }
    lines.push('One of them is wrong, or the plate is genuinely ambiguous and wants a note.')
    lines.push('')
  }

  return lines.join('\n')
}

// Reports; never gates. A red build for an unratified value would teach people
// to ignore red builds, which costs more than the thing it was trying to buy.
console.log(format(standing(loadExpected())))
