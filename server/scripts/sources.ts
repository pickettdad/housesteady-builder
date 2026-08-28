/**
 * What each resolution read, and what it would take to make it `Documented` —
 * `npm run sources`.
 *
 *   npm run sources -- --visit <id>                     # the state of one visit
 *   npm run sources -- --hosts                          # the registry, and what is unruled
 *   npm run sources -- rule <host> <tier> --why "..." [--as "A. O. Smith"]
 *   npm run sources -- record <resolutionId> --url ... --claim "..." \
 *                        --model <model on the page> --on YYYY-MM-DD
 *
 * ---
 *
 * ## ⚑ This is the reader Binder 6b was built with, not a debugging aid
 *
 * The failure this project keeps meeting is *a value being computed is not the
 * same as a reader being able to reach it* — seven recorded instances, every one
 * of which passed its own tests. **An honesty label nobody can look at is that
 * failure with the highest possible stakes**, because the label is the claim.
 *
 * So the two halves shipped together, and this half answers the question a
 * person actually has: **not *what is documented* but *what is one judgement
 * away from being documented*.**
 *
 * ## The manual path, and it is the only one that works today
 *
 * `record` is how a concierge who has the manufacturer's PDF open puts it on the
 * record. **There is no automated search in this build** — that needs an API key
 * and a spend decision, which is a runner session's job, not a code session's.
 *
 * ⚑ **`record` takes no honesty argument, and neither will the search when it
 * arrives.** Whether a source qualifies is computed from the registry and the
 * plate, every time, in `engine/sources.ts`. There is no flag on this script
 * that can make something `Documented`.
 */

import { openDb } from '../src/db/index.js'
import { latestImport } from '../src/ai/tasks/identify.js'
import { claimsForImport } from '../src/ai/tasks/readSurfaces.js'
import { buildQueries } from '../src/engine/lookup.js'
import {
  honestyForImport, recordSource, refusedOnModel, ruleHost, rulings, unruledHosts,
  HOST_TIERS, type HostTier,
} from '../src/engine/sources.js'
import { currentOperator, OperatorRefused } from '../src/operators/registry.js'

const argv = process.argv.slice(2)
const arg = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? undefined : argv[i + 1]
}
const flag = (name: string): boolean => argv.includes(`--${name}`)
const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1]!.startsWith('--')))

const db = openDb()

const actor = (): string => {
  try {
    return currentOperator(db).id
  } catch (e) {
    if (e instanceof OperatorRefused) {
      console.error(`${e.message}\n\nSet HOUSESTEADY_OPERATOR, or run \`npm run operator\` to see who is registered.`)
      process.exit(1)
    }
    throw e
  }
}

// ------------------------------------------------------------------ rule a host

if (positional[0] === 'rule') {
  const host = positional[1]
  const tier = positional[2] as HostTier | undefined
  const why = arg('why')
  if (!host || !tier || !HOST_TIERS.includes(tier) || !why) {
    console.error(
      `Usage: npm run sources -- rule <host> <${HOST_TIERS.join('|')}> --why "..." [--as "A. O. Smith"]\n\n` +
        `  regulator     a regulator, certifier or government source (§8b tier 1)\n` +
        `  manufacturer  the manufacturer's own material — --as names whose\n` +
        `  excluded      trade, retail, forum, blog or video. Never Documented (§8b)\n\n` +
        `--why is required and is stored verbatim. A ruling nobody wrote a reason for\n` +
        `is a ruling nobody can disagree with later.`,
    )
    process.exit(1)
  }
  if (tier === 'manufacturer' && !arg('as')) {
    console.error('A manufacturer host records whose it is: add --as "A. O. Smith".')
    process.exit(1)
  }
  ruleHost(db, { host, tier, belongsTo: arg('as') ?? '', ruling: why, actorId: actor() })
  console.log(`\nRuled \`${host}\` as ${tier}${arg('as') ? ` — ${arg('as')}` : ''}.`)
  console.log(
    tier === 'excluded'
      ? 'Sources from this host stay Inferred. §8d sends the valuable ones to the hypothesis channel, which is not built.\n'
      : 'Sources from this host qualify when they also carry a retrieval date, an extracted claim, and the plate\'s own model number.\n',
  )
  process.exit(0)
}

// -------------------------------------------------------------- record a source

if (positional[0] === 'record') {
  const resolutionId = positional[1]
  const url = arg('url')
  const claim = arg('claim')
  const model = arg('model')
  const on = arg('on')
  if (!resolutionId || !url || !claim || !model || !on) {
    console.error(
      'Usage: npm run sources -- record <resolutionId> --url <https://...> --claim "what the page says" \\\n' +
        '                        --model <the model number printed on the page> --on YYYY-MM-DD\n\n' +
        '§8c: the retrieval date and the extracted claim are recorded, not only the link.\n' +
        'A link on its own decays into a 404 without changing its label.',
    )
    process.exit(1)
  }
  const row = db
    .prepare('SELECT id, product, import_id AS importId, reading_id AS readingId FROM product_resolutions WHERE id = ?')
    .get(resolutionId) as { id: string; product: string; importId: string | null; readingId: string } | undefined
  if (!row) {
    console.error(`No resolution ${resolutionId}. \`npm run sources -- --visit <id>\` lists them.`)
    process.exit(1)
  }

  /**
   * ⚑ **The plate's own model string, read off the plate, not typed here.**
   *
   * §8b: *any hierarchy starting at the manufacturer's website has skipped the
   * best thing this service has.* Tier 0 is the photograph, and pass 1 already
   * stored what it says — so asking a person to retype it would be inviting the
   * one transcription error that makes §8a rule 2 compare the wrong strings.
   */
  const plateModels = row.importId
    ? (buildQueries(claimsForImport(db, row.importId)).find((q) => q.readingId === row.readingId)?.models ?? [])
    : []
  const plateModel = arg('plate') ?? (plateModels.length === 1 ? plateModels[0]! : '')
  if (plateModel === '') {
    console.error(
      plateModels.length === 0
        ? 'This plate names no model number, so §8a rule 2 has nothing to compare a source against and this\n' +
          'resolution cannot become Documented. That is the plate\'s answer, not a bug — pass `--plate "..."`\n' +
          'only if you are reading a model off the photograph that pass 1 did not capture.'
        : `This label carries ${plateModels.length} model-shaped strings and a person has to say which is the\n` +
          `model: ${plateModels.map((m) => `--plate "${m}"`).join('  ')}`,
    )
    process.exit(1)
  }
  const stored = recordSource(db, {
    resolutionId, url, retrievedAt: on, extractedClaim: claim,
    sourceModel: model, plateModel, actorId: actor(),
  })
  console.log(`\nRecorded against ${resolutionId}${row.product ? ` — ${row.product}` : ''}`)
  console.log(`  host      ${stored.host || '(none)'}`)
  console.log(`  qualifies ${stored.qualifies ? 'yes — this resolution is now Documented' : 'no'}`)
  console.log(`  why       ${stored.why}\n`)
  process.exit(0)
}

// ------------------------------------------------------------------ the registry

if (flag('hosts') || argv.length === 0) {
  const ruled = rulings(db)
  console.log(`\nThe source registry — ${ruled.length} host${ruled.length === 1 ? '' : 's'} ruled.\n`)
  for (const r of ruled) {
    console.log(`  ${r.tier.padEnd(13)} ${r.host}${r.belongsTo ? ` — ${r.belongsTo}` : ''}`)
    console.log(`                ${r.ruling}`)
  }
  const open = unruledHosts(db)
  if (open.length === 0) {
    console.log('\nNo unruled host has been read yet.')
  } else {
    console.log(`\n⚑ ${open.length} host${open.length === 1 ? ' has' : 's have'} been read and never ruled. Each is one judgement that settles every resolution citing it:\n`)
    for (const h of open) {
      console.log(`  ${String(h.sources).padStart(4)} source(s)  ${h.host}`)
      console.log(`                   npm run sources -- rule ${h.host} <${HOST_TIERS.join('|')}> --why "..."`)
    }
  }
  const refused = refusedOnModel(db)
  if (refused.length > 0) {
    console.log(`\n§8a rule 2 refused ${refused.length} source${refused.length === 1 ? '' : 's'} from ruled tier-1 hosts on the model string alone:\n`)
    for (const r of refused.slice(0, 15)) {
      console.log(`  ${r.host}: page says \`${r.sourceModel}\`, plate says \`${r.plateModel}\``)
    }
    console.log(
      '\n  The rule is strict on purpose — a source for the wrong model is not a source. This count is here so\n' +
        '  that if it is too strict, the case for changing it is evidence rather than an argument.',
    )
  }
  if (argv.length === 0) console.log('\nAdd --visit <id> for one visit\'s resolutions.\n')
  process.exit(0)
}

// -------------------------------------------------------------------- one visit

const visitId = arg('visit')
if (!visitId) {
  console.error('Usage: npm run sources -- --visit <visitId>   |   --hosts   |   rule ...   |   record ...')
  process.exit(1)
}
const importId = latestImport(db, visitId)
if (!importId) {
  console.error(`Visit ${visitId} has no import.`)
  process.exit(1)
}

const rows = honestyForImport(db, importId)
if (rows.length === 0) {
  console.log(`\nVisit ${visitId} · import ${importId}`)
  console.log('No product resolutions are stored. Pass 2 has not run against this import — `npm run resolve`.\n')
  process.exit(0)
}

const documented = rows.filter((r) => r.honesty === 'Documented')
console.log(`\nVisit ${visitId} · import ${importId} · ${rows.length} resolution(s)`)
console.log(`${documented.length} Documented · ${rows.length - documented.length} Inferred\n`)

for (const r of rows) {
  const name = r.resolved ? r.product : '(unresolved)'
  console.log(`  ${r.honesty.padEnd(10)} ${name.slice(0, 70)}`)
  console.log(`  ${' '.repeat(10)} ${r.resolutionId}`)
  if (r.sources.length === 0) {
    console.log(`  ${' '.repeat(10)} no source has been recorded — nothing has been read for this one`)
  }
  for (const s of r.sources) {
    console.log(`  ${' '.repeat(10)} ${s.qualifies ? '✓' : '·'} ${s.url}`)
    console.log(`  ${' '.repeat(12)} ${s.why}`)
  }
  console.log('')
}

console.log(
  'Documented means a source was read, its host ruled tier 1 by a person, its retrieval date and the claim\n' +
    'extracted from it recorded, and the model on the page equal to the model on the plate. Nothing here can\n' +
    'set it directly — Honesty-Label-Mapping v1.3 §8.\n',
)
