/**
 * The component types an export's config snapshot declares — as a table the
 * owner can work from while writing the class list.
 *
 * WHY A SCRIPT RATHER THAN A CHECKED-IN LIST. The class list maps each class to
 * a component type, and Increment 5 §1a requires every one of those to be
 * checked against **the import's own config snapshot** rather than a copy kept
 * here. A hand-maintained inventory would be exactly the second taxonomy §1a
 * names as the failure — it would drift, and nobody would notice until a session
 * plan seeded the wrong checklist. So this reads a manifest and prints what that
 * manifest says, and the CSV it writes is a working document, never an authority.
 *
 * It reads the graph through `audit/components.ts` rather than walking
 * `componentLists` itself, so the typed/stub/undeclared distinction and the
 * inheritance chain come from the one resolver the audit already trusts.
 *
 * TWO COLUMNS FOR THE ITEM COUNT, BECAUSE THERE ARE TWO ANSWERS.
 * `ownItems` is what the type's own list declares. `effectiveItems` includes
 * everything it inherits — `water-softener` declares four and carries eleven.
 * A class list author needs the second; anyone editing the config needs the
 * first. Collapsing them would hide the inheritance that makes the difference.
 *
 * Run it:  npx tsx server/scripts/component-types.ts [manifest.json] [out.csv]
 * Default: the walk fixture → docs/reference/HouseSteady_Component-Types_<version>.csv
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { componentGraph } from '../src/audit/components.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

interface Entry {
  types?: unknown
  items?: unknown
  note?: unknown
}

const manifestPath =
  process.argv[2] ?? join(repoRoot, 'fixtures', 'walk-2026-07-31', 'housesteady-019fb92d-manifest.json')

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
const config = manifest.config as { snapshot?: Record<string, unknown>; version?: string } | undefined
const snapshot = config?.snapshot
if (!snapshot) {
  throw new Error(`${manifestPath} carries no config snapshot — nothing to report.`)
}

const version = String(config.version ?? snapshot.configVersion ?? 'unknown')
const outPath = process.argv[3] ?? join(repoRoot, 'docs', 'reference', `HouseSteady_Component-Types_config-v${version}.csv`)

const graph = componentGraph(snapshot)
const entries = Array.isArray(snapshot.componentLists) ? (snapshot.componentLists as Entry[]) : []

// One list can serve several types — `smoke-alarm` and `co-alarm` share theirs —
// so the map is built per type rather than per entry, and the item rows are
// counted distinctly further down.
const ownItems = new Map<string, { id: string }[]>()
const noteFor = new Map<string, string>()
for (const e of entries) {
  const types = Array.isArray(e.types) ? (e.types as string[]) : []
  const items = Array.isArray(e.items) ? (e.items as { id: string }[]) : []
  for (const t of types) {
    ownItems.set(t, items)
    if (typeof e.note === 'string') noteFor.set(t, e.note)
  }
}

/**
 * The aliases, which are the nearest thing the config has to a label — and are
 * not one. They point inward: a phrase a concierge might say, mapped to a type.
 * The class list's client-facing label is its own to write.
 */
const aliasesFor = new Map<string, string[]>()
for (const a of (Array.isArray(snapshot.componentAliases) ? snapshot.componentAliases : []) as {
  alias?: string
  type?: string
}[]) {
  if (typeof a.type !== 'string' || typeof a.alias !== 'string') continue
  aliasesFor.set(a.type, [...(aliasesFor.get(a.type) ?? []), a.alias])
}

const quote = (s: string): string => `"${s.replace(/"/g, '""')}"`

const rows = [...graph.declared].sort().map((type) => {
  const effective = new Set<string>()
  for (const ancestor of graph.lineage(type)) {
    for (const item of ownItems.get(ancestor) ?? []) effective.add(item.id)
  }
  return [
    type,
    graph.state(type),
    graph.parentOf(type) ?? '',
    String((ownItems.get(type) ?? []).length),
    String(effective.size),
    quote((aliasesFor.get(type) ?? []).join('; ')),
    quote(noteFor.get(type) ?? ''),
  ].join(',')
})

writeFileSync(outPath, ['type,state,parent,ownItems,effectiveItems,aliases,note', ...rows].join('\n') + '\n')

const typed = [...graph.declared].filter((t) => graph.state(t) === 'typed').length
const stubs = [...graph.declared].filter((t) => graph.state(t) === 'stub')
const distinctItems = new Set(entries.flatMap((e) => (Array.isArray(e.items) ? (e.items as { id: string }[]) : [])).map((i) => i.id))

console.log(`config v${version} — ${graph.declared.size} component types: ${typed} typed, ${stubs.length} stub`)
console.log(`${entries.length} lists carrying ${distinctItems.size} distinct items`)
console.log(`stubs (ids reserved, no items): ${stubs.sort().join(', ')}`)
if (graph.anomalies.length > 0) console.log(`anomalies: ${graph.anomalies.join(' · ')}`)
console.log(`→ ${outPath.replace(repoRoot, '')}`)
