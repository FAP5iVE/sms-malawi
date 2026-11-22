/**
 * [FILE]: apps/web/src/server/lib/guardian/nationalId.ts
 * [PURPOSE]: Normalise a guardian's NATIONAL ID number so two cards that spell it differently
 *   ("ab 12-cd34", "AB12CD34") compare equal, and so junk that people type into a required-looking
 *   box ("N/A", "none", "00000000") is never treated as an identity.
 *
 *   A national ID is the one detail that is unique to a person, which is why matching treats it as
 *   the strongest signal. That is exactly why a bogus value must never reach the matcher: a
 *   placeholder shared by fifty cards would otherwise suggest that fifty different people are one.
 *
 * Pure (no I/O) so it is unit-tested directly.
 */

const MIN_LENGTH = 6
const MAX_LENGTH = 20

/** Words people type when they have no number. Compared after stripping punctuation and spaces. */
const PLACEHOLDERS = new Set([
  'NA', 'NIL', 'NONE', 'NULL', 'UNKNOWN', 'NOID', 'NOTAVAILABLE', 'NOTKNOWN', 'NOTAPPLICABLE',
  'TBC', 'TBD', 'PENDING', 'LOST', 'NONEYET',
])

/**
 * Upper-case letters and digits only, or null when the value cannot be a real ID
 * (too short or long, a placeholder word, or one character repeated: "00000000", "AAAAAAAA").
 * Also rejects a plain run of ascending digits ("12345678"), a common stand-in.
 */
export function normalizeNationalId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const v = raw.normalize('NFKD').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (v.length < MIN_LENGTH || v.length > MAX_LENGTH) return null
  if (PLACEHOLDERS.has(v)) return null
  if (/^(.)\1*$/.test(v)) return null
  if ('01234567890123456789'.includes(v) || '98765432109876543210'.includes(v)) return null
  return v
}

/** "AB12CD34" -> "•••••D34": enough for staff to compare against a document, not enough to copy. */
export function maskNationalId(normalized: string | null | undefined): string | null {
  if (!normalized) return null
  const tail = normalized.slice(-3)
  return `${'•'.repeat(Math.max(normalized.length - 3, 3))}${tail}`
}

/** Two IDs that are both present and different: strong evidence these are two people. */
export function nationalIdsConflict(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a !== b
}
