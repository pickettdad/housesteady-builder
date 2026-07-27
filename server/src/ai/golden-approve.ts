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
 *   npm run golden:approve                        what is still unratified
 *   npm run golden:approve -- IMG_0029            ratify that image's values
 *   npm run golden:approve -- IMG_0029 serial     ratify one value
 *   npm run golden:approve -- --revoke IMG_0029   take ratification back
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fixturesRoot, isRatified, loadExpected, type ExpectedImage } from './golden.js'

const FILE = join(fixturesRoot, 'nameplates', 'expected.json')

const keysOf = (entry: ExpectedImage): string[] => ['classification', ...Object.keys(entry.fields)]

const valueOf = (entry: ExpectedImage, key: string): string =>
  key === 'classification' ? entry.classification : (entry.fields[key] ?? 'unknown')

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
  if (outstanding > 0) {
    console.log('\nLook at the image, then ratify what you have checked:')
    console.log('    npm run golden:approve -- <image> [key ...]')
  }
}

function apply(match: string, keys: string[], revoke: boolean): void {
  // Read and write the raw text through JSON so comments and ordering survive
  // as far as they can; the $comment array is data, not a code comment.
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
      } else {
        // Copy the value, never a flag. This is what makes the approval lapse
        // by itself if the value is edited afterwards.
        entry.approved[key] = valueOf(entry, key)
        console.log(`  ${entry.file}  ${key} = ${valueOf(entry, key)}`)
      }
    }
  }

  writeFileSync(FILE, JSON.stringify(raw, null, 2) + '\n')
  console.log(`\n${revoke ? 'Withdrawn' : 'Ratified'}. Commit expected.json so the approval is in the record.`)
}

const args = process.argv.slice(2)
const revoke = args[0] === '--revoke'
const rest = revoke ? args.slice(1) : args

if (rest.length === 0) listUnratified()
else apply(rest[0]!, rest.slice(1), revoke)
