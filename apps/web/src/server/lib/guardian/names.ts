/**
 * [FILE]: apps/web/src/server/lib/guardian/names.ts
 * [PURPOSE]: Name normalisation and similarity for guardian matching.
 *
 *   Matching is only ever a SUGGESTION shown to staff (two profiles can share a
 *   phone, and names are not unique), so this is tuned to avoid missing a likely
 *   duplicate, not to be a perfect oracle. Handles titles ("Mrs", "Rev"), token
 *   order ("Banda John"), initials ("J. Banda"), diacritics, apostrophes in Malawian
 *   surnames ("Ng'oma"), and one-letter typos.
 *
 * Pure (no I/O) so it is unit-tested directly.
 */

const TITLES = new Set([
  'mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'prof', 'professor', 'rev', 'reverend', 'pastor',
  'pst', 'bishop', 'fr', 'sr', 'sir', 'madam', 'hon', 'honourable', 'chief', 'inkosi',
  'snr', 'jnr', 'jr', 'senior', 'junior', 'late',
])

const PLACEHOLDERS = new Set([
  'na', 'n a', 'none', 'nil', 'null', 'unknown', 'unk', 'tbc', 'tbd', 'xx', 'xxx',
  'guardian', 'parent', 'father', 'mother', 'no name', 'not known', 'not available',
])

export function tokenizeName(raw: unknown): string[] {
  if (typeof raw !== 'string') return []
  const base = raw
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc`]/g, "'")
    .replace(/[^a-z'\-\s.]/g, ' ')
    .replace(/\./g, ' ') // "j.banda" -> "j banda"
  return base
    .split(/\s+/)
    .map((t) => t.replace(/^['-]+|['-]+$/g, ''))
    .filter((t) => t.length > 0 && !TITLES.has(t))
}

export function normalizeName(raw: unknown): string {
  return tokenizeName(raw).join(' ')
}

export function isPlaceholderName(raw: unknown): boolean {
  const n = normalizeName(raw)
  if (n.length < 2) return true
  if (PLACEHOLDERS.has(n)) return true
  const letters = n.replace(/[^a-z]/g, '')
  return letters.length < 2
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[n]!
}

function tokenScore(a: string, b: string): number {
  if (a === b) return 1
  if (a.length === 1 || b.length === 1) {
    const [short, long] = a.length === 1 ? [a, b] : [b, a]
    return long.startsWith(short) ? 0.7 : 0
  }
  if (Math.min(a.length, b.length) >= 5 && levenshtein(a, b) <= 1) return 0.85
  return 0
}

/** 0..1. 1 = same tokens in any order. Order-insensitive, initial- and typo-tolerant. */
export function nameSimilarity(a: unknown, b: unknown): number {
  const ta = tokenizeName(a)
  const tb = tokenizeName(b)
  if (ta.length === 0 || tb.length === 0) return 0
  if ([...ta].sort().join(' ') === [...tb].sort().join(' ')) return 1
  const [small, large] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  const used = new Set<number>()
  let total = 0
  for (const t of small) {
    let best = 0, bestIdx = -1
    large.forEach((u, i) => {
      if (used.has(i)) return
      const s = tokenScore(t, u)
      if (s > best) { best = s; bestIdx = i }
    })
    if (bestIdx >= 0) { used.add(bestIdx); total += best }
  }
  return total / large.length
}

export const SAME_PERSON_THRESHOLD = 0.8
