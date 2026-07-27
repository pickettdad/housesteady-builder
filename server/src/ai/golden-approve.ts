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
import { join } from 'node:path'
import { currentValue, fixturesRoot, isRatified, loadExpected, ratifiedBy, type ExpectedImage } from './golden.js'

const FILE = join(fixturesRoot, 'nameplates', 'expected.json')

const keysOf = (entry: ExpectedImage): string[] => ['classification', ...Object.keys(entry.fields)]

const valueOf = currentValue

/**
 * Who is ratifying.
 *
 * Required rather than defaulted to a username, because an approval whose author
 * is a machine guess is not traceable in the way the whole point requires.
 */
function ratifier(explicit?: string): string {
  const who = explicit ?? process.env.HOUSESTEADY_RATIFIER
  if (!who || who.trim() === '') {
    console.error(
      'Who is ratifying? Set HOUSESTEADY_RATIFIER, or pass --by <name>.\n' +
        'An approval has to record its author: if a wrong value is ever ratified, the question\n' +
        'that matters next is which review it came through, so the rest of that sitting can be\n' +
        're-checked. That is not reconstructible afterwards.',
    )
    process.exit(1)
  }
  return who.trim()
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
      if (r) byWhom.set(r.by, (byWhom.get(r.by) ?? 0) + 1)
    }
  }
  if (byWhom.size > 0) {
    console.log('\nRatified by:')
    for (const [who, n] of [...byWhom].sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(4)}  ${who}`)
  }
  if (outstanding > 0) {
    console.log('\nLook at the image, then ratify what you have checked:')
    console.log('    npm run golden:approve -- <image> [key ...]')
  }
}

function apply(match: string, keys: string[], opts: { revoke: boolean; as?: string; by?: string }): void {
  const { revoke, as } = opts
  // Read and write the raw text through JSON so comments and ordering survive
  // as far as they can; the $comment array is data, not a code comment.
  if (as !== undefined && keys.length !== 1) {
    console.error('--as sets one value, so name exactly one key.')
    process.exit(1)
  }
  const who = revoke ? '' : ratifier(opts.by)
  const at = new Date().toISOString()
  const raw = JSON.parse(readFileSync(FILE, 'utf8')) as { images: ExpectedImage[] }
  const targets = raw.images.filter((e) => e.file.toLowerCase().includes(match.toLowerCase()))
  if (targets.length === 0) {
    console.error(`No image in the set matches "${match}".`)
    process.exit(1)
  }

  for (const entry of targets) {
    entry.approved ??= {}
    const chosen = keys.length > 0 ? keys : keysOf(entry)
    for (const key of chosen) {
      if (!keysOf(entry).includes(key)) {
        console.error(`  ${entry.file}: no such value "${key}"`)
        continue
      }
      if (revoke) {
        delete entry.approved[key]
        console.log(`  ${entry.file}  ${key} — ratification withdrawn`)
        continue
      }
      if (as !== undefined) {
        // Correcting and ratifying are one decision, so they are one action.
        if (key === 'classification') entry.classification = as as ExpectedImage['classification']
        else entry.fields[key] = as
      }
      // Copy the value, never a flag. This is what makes the approval lapse by
      // itself if the value is edited afterwards.
      entry.approved[key] = { value: valueOf(entry, key), by: who, at }
      console.log(`  ${entry.file}  ${key} = ${valueOf(entry, key)}   (${who})`)
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
const revoke = argv.includes('--revoke')

// Everything that is not a flag or a flag's value.
const positional = argv.filter((a, i) => {
  if (a.startsWith('--')) return false
  const prev = argv[i - 1]
  return !(prev === '--as' || prev === '--by')
})

if (positional.length === 0) listUnratified()
else apply(positional[0]!, positional.slice(1), { revoke, as, by })
