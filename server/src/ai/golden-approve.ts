/**
 * Ratify golden-set values, one at a time.
 *
 * Per-value approval is only real if ratifying is practical. If it means
 * hand-editing JSON, it will not happen — and a design nobody can follow is
 * worse than the set-wide flag it replaced, because it looks stricter while
 * being ignored.
 *
 * So the division of labour is: the human looks at the photograph and decides;
 * the machine copies the value across. Hand-transcribing an approval is exactly
 * the failure this whole design exists to prevent — a mistyped approval is a
 * wrong value that has been blessed.
 *
 *   npm run golden:approve                              what is still unratified
 *   npm run golden:approve -- IMG_0029                  ratify that image's values
 *   npm run golden:approve -- IMG_0029 serial           ratify one value
 *   npm run golden:approve -- IMG_0029 serial --as 153713   correct it, then ratify
 *   npm run golden:approve -- --revoke IMG_0029         take ratification back
 *
 * `--as` exists because of how ratification is actually triggered: a value gets
 * looked at when it produces a diff, and at that moment either the expectation
 * was wrong or the model was. If the model was right, correcting the expectation
 * and ratifying it are one decision and should be one action — two commands
 * would leave a window where the file holds a corrected value nobody approved.
 *
 * WHO RATIFIED IT is recorded. Set HOUSESTEADY_RATIFIER, or pass --by.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { openDb } from '../db/index.js'
import { displayNameFor, resolveOperator } from '../operators/registry.js'
import { join } from 'node:path'
import {
  contested, currentValue, fixturesRoot, historyFor, isRatified, latestAct, loadExpected,
  ratifiedBy, wasEverRatified, type ExpectedImage, type ExpectedSet,
} from './golden.js'

const FILE = join(fixturesRoot, 'nameplates', 'expected.json')

/**
 * One handle, opened on first use.
 *
 * The registry is consulted once per ratification act when a contest report is
 * printed, and opening the database inside that loop would leak a handle per
 * row for the sake of one lookup.
 */
let handle: ReturnType<typeof openDb> | undefined
const registry = (): ReturnType<typeof openDb> => (handle ??= openDb())

const keysOf = (entry: ExpectedImage): string[] => ['classification', ...Object.keys(entry.fields)]

const valueOf = currentValue

/**
 * Who is ratifying — as an operator id.
 *
 * Required rather than defaulted to a username, because an approval whose author
 * is a machine guess is not traceable in the way the whole point requires.
 *
 * Resolved against the operator registry rather than kept as free text, so that
 * `dave`, `Dave` and `David Pickett` are one reviewer rather than three. The
 * drift check asks whether two DIFFERENT people ratified one key to different
 * answers; spelling variants would make it cry drift at one person changing
 * their mind, and miss it when it matters.
 */
function ratifier(explicit?: string): string {
  const who = explicit ?? process.env.HOUSESTEADY_RATIFIER ?? process.env.HOUSESTEADY_OPERATOR
  if (!who || who.trim() === '') {
    console.error(
      'Who is ratifying? Set HOUSESTEADY_RATIFIER, or pass --by <name or short code>.\n' +
        'An approval has to record its author: if a wrong value is ever ratified, the question\n' +
        'that matters next is which review it came through, so the rest of that sitting can be\n' +
        're-checked. That is not reconstructible afterwards.',
    )
    process.exit(1)
  }
  try {
    return resolveOperator(registry(), who.trim()).id
  } catch (e) {
    console.error(
      `${(e as Error).message}\n\n` +
        'Ratification uses the same operator registry as everything else, so one reviewer is one\n' +
        'identity everywhere. Add them:  npm run operator -- add "Full Name" <short-code>',
    )
    process.exit(1)
  }
}

function listUnratified(): void {
  const set = loadExpected()
  let outstanding = 0
  for (const entry of set.images) {
    const pending = keysOf(entry).filter((k) => !isRatified(entry, k))
    if (pending.length === 0) continue
    outstanding += pending.length
    console.log(`\n${entry.file}`)
    if (entry.hard) console.log(`  ${entry.hard}`)
    for (const key of pending) console.log(`    ${key.padEnd(14)} ${valueOf(entry, key)}`)
  }
  const total = set.images.reduce((n, e) => n + keysOf(e).length, 0)
  console.log(`\n${total - outstanding} of ${total} values ratified.`)

  // Who has ratified what. The golden set is one company artifact, so several
  // names here is normal; the thing to catch is them drifting apart, because a
  // set fragmenting per operator is how the binder voice would fragment too.
  const byWhom = new Map<string, number>()
  for (const entry of set.images) {
    for (const key of keysOf(entry)) {
      const r = ratifiedBy(entry, key)
      if (r) {
        // Stored as an id; shown as the name a person recognises.
        const name = displayNameFor(registry(), r.by)
        byWhom.set(name, (byWhom.get(name) ?? 0) + 1)
      }
    }
  }
  if (byWhom.size > 0) {
    console.log('\nRatified by:')
    for (const [who, n] of [...byWhom].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${String(n).padStart(4)}  ${who}`)
    }
  }

  // Several names above is a company artifact working. THIS is the drift signal:
  // the same value ratified twice, to different answers, by different people.
  const splits = contested(set)
  if (splits.length > 0) {
    console.log('\nCONTESTED — ratified more than once, to different answers:')
    for (const c of splits) {
      console.log(`    ${c.file}  ${c.key}`)
      c.values.forEach((v, i) => console.log(`        "${v}"  (${displayNameFor(registry(), c.by[i])})`))
    }
    console.log('\n    One of them is wrong, or the plate is genuinely ambiguous and the entry')
    console.log('    needs a note saying so. Either way it is a question for the review role,')
    console.log('    not something to resolve by whoever ratifies last.')
  }

  // Values that were ratified and then taken back. Worth seeing: every golden
  // run inside that window validated against them.
  const withdrawn = set.images.flatMap((e) =>
    keysOf(e)
      .filter((k) => !isRatified(e, k) && wasEverRatified(e, k))
      .map((k) => ({ file: e.file, key: k, act: latestAct(e, k) })),
  )
  if (withdrawn.length > 0) {
    console.log('\nPreviously ratified, no longer:')
    for (const w of withdrawn) {
      const why = w.act?.act === 'revoke' ? (w.act.reason ?? 'withdrawn') : 'the value changed underneath it'
      console.log(`    ${w.file}  ${w.key} — ${why}`)
    }
  }
  if (outstanding > 0) {
    console.log('\nLook at the image, then ratify what you have checked:')
    console.log('    npm run golden:approve -- <image> [key ...]')
  }
}

function apply(
  match: string,
  keys: string[],
  opts: { revoke: boolean; as?: string; by?: string; reason?: string },
): void {
  const { revoke, as } = opts
  // Read and write the raw text through JSON so comments and ordering survive
  // as far as they can; the $comment array is data, not a code comment.
  if (as !== undefined && keys.length !== 1) {
    console.error('--as sets one value, so name exactly one key.')
    process.exit(1)
  }
  // A withdrawal is an act too, so it records its author like any other.
  const who = ratifier(opts.by)
  const at = new Date().toISOString()
  const raw = JSON.parse(readFileSync(FILE, 'utf8')) as ExpectedSet
  const targets = raw.images.filter((e) => e.file.toLowerCase().includes(match.toLowerCase()))
  if (targets.length === 0) {
    console.error(`No image in the set matches "${match}".`)
    process.exit(1)
  }

  for (const entry of targets) {
    entry.ratifications ??= []
    const chosen = keys.length > 0 ? keys : keysOf(entry)
    for (const key of chosen) {
      if (!keysOf(entry).includes(key)) {
        console.error(`  ${entry.file}: no such value "${key}"`)
        continue
      }
      if (revoke) {
        if (!isRatified(entry, key)) {
          console.log(`  ${entry.file}  ${key} — was not ratified; nothing to withdraw`)
          continue
        }
        // Appended, never deleted. The window in which this value stood is what
        // somebody will need to chase if it turns out to have been wrong.
        entry.ratifications.push({ key, act: 'revoke', by: who, at, reason: opts.reason })
        console.log(`  ${entry.file}  ${key} — withdrawn (${who}); the ratification stays in the log`)
        continue
      }
      if (as !== undefined) {
        // Correcting and ratifying are one decision, so they are one action.
        if (key === 'classification') entry.classification = as as ExpectedImage['classification']
        else entry.fields[key] = as
      }
      const value = valueOf(entry, key)
      const prior = historyFor(entry, key).filter((r) => r.act === 'ratify').at(-1)
      entry.ratifications.push({ key, act: 'ratify', value, by: who, at })
      console.log(`  ${entry.file}  ${key} = ${value}   (${who})`)
      if (prior && prior.value !== value && prior.by !== who) {
        console.log(
          `      NOTE: ${displayNameFor(registry(), prior.by)} ratified this as "${prior.value}". ` +
            'Both acts are in the log.',
        )
      }
    }
  }

  writeFileSync(FILE, JSON.stringify(raw, null, 2) + '\n')
  console.log(`\n${revoke ? 'Withdrawn' : 'Ratified'}. Commit expected.json so the approval is in the record.`)
}

const argv = process.argv.slice(2)
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? undefined : argv[i + 1]
}
const as = flag('as')
const by = flag('by')
const reason = flag('reason')
const revoke = argv.includes('--revoke')

// Everything that is not a flag or a flag's value.
const positional = argv.filter((a, i) => {
  if (a.startsWith('--')) return false
  const prev = argv[i - 1]
  return !(prev === '--as' || prev === '--by' || prev === '--reason')
})

if (positional.length === 0) listUnratified()
else apply(positional[0]!, positional.slice(1), { revoke, as, by, reason })
