/**
 * Regenerate the golden session plan — `npm run plan-fixture`.
 *
 * **Run this when `session-plan-fixture.test.ts` fails and the new shape is the
 * one you meant.** The test failing is the signal; this is the response.
 *
 *   npm run plan-fixture            # rewrite the committed artifact
 *   npm run plan-fixture -- --check # emit and diff, write nothing
 *
 * ---
 *
 * ## ⚑ Regenerating is half the job
 *
 * The other half is **telling the field side**, and nothing here can do it. This
 * repo cannot see the field repo and cannot fail its build. The fixture is a
 * tripwire that fires on *this* side; the note that follows is a person's.
 *
 * So this prints what changed and what to send, every time it writes. A silent
 * regenerate is a shape change that left no trace anybody would act on — which
 * is the exact failure the fixture exists to prevent, arriving through the tool
 * built to prevent it.
 */

import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import {
  emitGoldenPlan,
  GOLDEN_PATH,
  readGolden,
  repoRoot,
  serialise,
  stabilise,
} from '../src/plan/goldenFixture.js'

const check = process.argv.includes('--check')

const { plan, volatile } = await emitGoldenPlan(mkdtempSync(join(tmpdir(), 'housesteady-plan-fixture-')))
const fresh = serialise(stabilise(plan, volatile))
const existing = existsSync(GOLDEN_PATH) ? serialise(readGolden()) : null

const where = relative(repoRoot, GOLDEN_PATH)

if (existing === fresh) {
  console.log(`\n${where} is current — the emitter reproduces it exactly.\n`)
  process.exit(0)
}

if (existing === null) {
  console.log(`\n${where} does not exist yet.`)
} else {
  // Which top-level sections moved, so the note to the field side can say what
  // rather than "something".
  const a = JSON.parse(existing) as Record<string, unknown>
  const b = JSON.parse(fresh) as Record<string, unknown>
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
  const moved = keys.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
  console.log(`\n${where} is STALE. Changed at the top level: ${moved.join(', ') || '(nothing — ordering only)'}`)
  if (!Object.hasOwn(b, 'planSchemaVersion') || a.planSchemaVersion !== b.planSchemaVersion) {
    console.log(`⚑ planSchemaVersion moved ${String(a.planSchemaVersion)} → ${String(b.planSchemaVersion)}.`)
  }
}

if (check) {
  console.error(`\nRun \`npm run plan-fixture\` to rewrite it. Nothing was written.\n`)
  process.exit(1)
}

mkdirSync(dirname(GOLDEN_PATH), { recursive: true })
writeFileSync(GOLDEN_PATH, fresh, 'utf8')
console.log(`\nWrote ${where}.`)
console.log(
  `\n⚑ HALF DONE. The field side holds a copy of this file and a test that parses it, and nothing\n` +
    `  here can fail their build. Send them the new artifact and say what moved — an emitted shape\n` +
    `  that changed with no note is exactly what this fixture exists to catch, and regenerating\n` +
    `  quietly is how it would happen anyway.\n\n` +
    `  The contract and its reasoning: docs/HouseSteady_Binder-Builder_Session-Plan-v0_Contract_2026-07-31.md\n`,
)
