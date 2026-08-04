/**
 * The one import error with no recovery.
 *
 * A manifest carries no property id and no address — only `session.propertyLabel`,
 * free text typed by the operator ("443 Wannamaker Rd" one visit, "443 Wannamaker
 * Road" the next, or a typo). So the builder can never match a manifest to a
 * property automatically, and this module does not try to.
 *
 * What it does is guard the mistake that corrupts data permanently: filing visit
 * two into the wrong house. The field-minted `pinId` uuid is the cross-visit
 * identity — the human-facing number is session-scoped and restarts each visit —
 * so a misfiled import silently merges two houses' pin histories and both are
 * wrong from then on, undetectably. Everything else an import can get wrong is
 * fixable.
 *
 * So: compare the label to what we know about the chosen property, and warn on a
 * poor match. The warning is advisory and dismissible — the operator decides,
 * because a legitimately renamed property must still import.
 */

/** Street-type abbreviations that vary between visits for no meaningful reason. */
const ABBREVIATIONS: Record<string, string> = {
  rd: 'road',
  st: 'street',
  ave: 'avenue',
  av: 'avenue',
  dr: 'drive',
  ln: 'lane',
  ct: 'court',
  cres: 'crescent',
  blvd: 'boulevard',
  hwy: 'highway',
  pl: 'place',
  terr: 'terrace',
  con: 'concession',
  n: 'north',
  s: 'south',
  e: 'east',
  w: 'west',
  apt: 'unit',
  ste: 'unit',
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => ABBREVIATIONS[tok] ?? tok)
    .join(' ')
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const curr = [i]
    for (let k = 1; k <= b.length; k++) {
      const cost = a[i - 1] === b[k - 1] ? 0 : 1
      curr[k] = Math.min(curr[k - 1]! + 1, prev[k]! + 1, prev[k - 1]! + cost)
    }
    prev = curr
  }
  return prev[b.length]!
}

/** 0 (nothing in common) to 1 (identical after normalization). */
export function similarity(a: string, b: string): number {
  const na = normalize(a)
  const nb = normalize(b)
  if (!na || !nb) return 0
  if (na === nb) return 1

  const longest = Math.max(na.length, nb.length)
  const editScore = 1 - levenshtein(na, nb) / longest

  const ta = new Set(na.split(' '))
  const tb = new Set(nb.split(' '))
  const shared = [...ta].filter((t) => tb.has(t)).length
  const tokenScore = shared / Math.max(ta.size, tb.size)

  // Containment: does the shorter string sit inside the longer one? This is the
  // usual real case — the label is "443 Wannamaker Road" and the address adds a
  // town, a province and a postal code. Plain token overlap punishes that for no
  // good reason; the extra words are agreement, not disagreement.
  const containment = shared / Math.min(ta.size, tb.size)

  // Any one signal is enough. "443 wannamaker road" vs "wannamaker 443" scores
  // badly on edit distance and perfectly on tokens; the reverse happens with a
  // typo in a long string. A match on any reading is a match.
  return Math.max(editScore, tokenScore, containment)
}

/** Below this, the operator gets asked to confirm. Tuned to be quiet on real variation. */
export const MATCH_THRESHOLD = 0.6

export interface MatchCandidate {
  /** What we are comparing against. */
  source: 'property.address' | 'property.label' | 'previous import'
  value: string
  score: number
}

export interface RivalProperty {
  id: string
  label: string
  score: number
}

export interface MatchResult {
  manifestLabel: string
  best: MatchCandidate | null
  candidates: MatchCandidate[]
  /** True when nothing to compare against — a first import is not suspicious. */
  firstImport: boolean
  looksWrong: boolean
  /**
   * A different property on file that this export resembles more than the one
   * chosen. This is the sharp test: "12 Dundas St W" and "12 Dundas St E" are
   * 90% similar to each other, so an absolute threshold will never separate
   * them — but a relative comparison will, and the misfile it catches is
   * exactly the one that has no recovery.
   */
  betterMatch: RivalProperty | null
}

export function checkPropertyLabel(args: {
  manifestLabel: string | null | undefined
  propertyLabel: string
  propertyAddress?: string | null
  previousImportLabels?: string[]
  /** Every OTHER property on file, so a near-miss neighbour can be spotted. */
  otherProperties?: { id: string; label: string; address: string | null }[]
}): MatchResult {
  const manifestLabel = args.manifestLabel ?? ''
  const candidates: MatchCandidate[] = []

  if (args.propertyAddress) {
    candidates.push({
      source: 'property.address',
      value: args.propertyAddress,
      score: similarity(manifestLabel, args.propertyAddress),
    })
  }
  candidates.push({
    source: 'property.label',
    value: args.propertyLabel,
    score: similarity(manifestLabel, args.propertyLabel),
  })
  // The strongest signal on visit two: the same operator typing the same thing
  // into the same field a month later.
  for (const prev of args.previousImportLabels ?? []) {
    candidates.push({ source: 'previous import', value: prev, score: similarity(manifestLabel, prev) })
  }

  candidates.sort((a, b) => b.score - a.score)
  const best = candidates[0] ?? null
  const firstImport = (args.previousImportLabels ?? []).length === 0

  // Does some other house on file fit this export better than the chosen one?
  let betterMatch: RivalProperty | null = null
  if (manifestLabel) {
    const chosenScore = best?.score ?? 0
    for (const other of args.otherProperties ?? []) {
      const score = Math.max(
        similarity(manifestLabel, other.label),
        other.address ? similarity(manifestLabel, other.address) : 0,
      )
      if (score > chosenScore && score > (betterMatch?.score ?? 0)) {
        betterMatch = { id: other.id, label: other.label, score }
      }
    }
  }

  return {
    manifestLabel,
    best,
    candidates,
    firstImport,
    looksWrong: Boolean(manifestLabel) && best !== null && best.score < MATCH_THRESHOLD,
    betterMatch,
  }
}
