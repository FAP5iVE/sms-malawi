/**
 * [FILE]: apps/web/src/server/lib/guardian/invitationCode.ts
 * [PURPOSE]: One-time claim codes: generation, parsing, keyed hashing and constant-time
 *   verification.
 *
 *   A code is `<REF 6><SECRET 10>`, shown as `ABCDEF-GHJKM-NPQRS`. The REF is not secret:
 *   it locates the invitation row, so wrong guesses can be counted against that row and
 *   lock it. The SECRET (about 49 bits, from a CSPRNG, with look-alike characters removed)
 *   is never stored: only HMAC-SHA256(pepper, ref + secret) is. The pepper lives outside
 *   the database, so a database leak alone does not let anyone verify or brute-force a code
 *   offline.
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { INVITATION_CODE_ALPHABET, INVITATION_REF_LENGTH, INVITATION_SECRET_LENGTH } from '@shared/constants/guardianPortal'

export const MIN_PEPPER_LENGTH = 32
const CODE_LENGTH = INVITATION_REF_LENGTH + INVITATION_SECRET_LENGTH

export interface GeneratedCode { ref: string; secret: string; display: string }

function randomChars(n: number, rand: (max: number) => number): string {
  let out = ''
  for (let i = 0; i < n; i++) out += INVITATION_CODE_ALPHABET[rand(INVITATION_CODE_ALPHABET.length)]!
  return out
}

/** `rand` is injectable for tests only; production uses node's CSPRNG-backed randomInt. */
export function generateInvitationCode(rand: (max: number) => number = (m) => randomInt(m)): GeneratedCode {
  const ref = randomChars(INVITATION_REF_LENGTH, rand)
  const secret = randomChars(INVITATION_SECRET_LENGTH, rand)
  return { ref, secret, display: formatInvitationCode(ref, secret) }
}

export function formatInvitationCode(ref: string, secret: string): string {
  return `${ref}-${secret.slice(0, 5)}-${secret.slice(5)}`
}

/** Accepts any case and any spaces/dashes. Returns null for anything that cannot be a code. */
export function parseInvitationCode(input: unknown): { ref: string; secret: string } | null {
  if (typeof input !== 'string' || input.length > 64) return null
  const compact = input.toUpperCase().replace(/[\s-]/g, '')
  if (compact.length !== CODE_LENGTH) return null
  for (const ch of compact) if (!INVITATION_CODE_ALPHABET.includes(ch)) return null
  return { ref: compact.slice(0, INVITATION_REF_LENGTH), secret: compact.slice(INVITATION_REF_LENGTH) }
}

export function assertPepper(pepper: unknown): asserts pepper is string {
  if (typeof pepper !== 'string' || pepper.length < MIN_PEPPER_LENGTH) {
    throw new Error(`GUARDIAN_INVITATION_PEPPER must be set to at least ${MIN_PEPPER_LENGTH} characters.`)
  }
}

/** Binds the secret to its row (ref) so a hash cannot be replayed against another invitation. */
export function hashInvitationSecret(ref: string, secret: string, pepper: string): string {
  assertPepper(pepper)
  return createHmac('sha256', pepper).update(`guardian-invite:v1:${ref}:${secret}`).digest('hex')
}

export function verifyInvitationSecret(ref: string, secret: string, storedHash: unknown, pepper: string): boolean {
  assertPepper(pepper)
  if (typeof storedHash !== 'string') return false
  const expected = Buffer.from(hashInvitationSecret(ref, secret, pepper), 'hex')
  const actual = Buffer.from(storedHash, 'hex')
  // timingSafeEqual throws on unequal lengths, so a malformed stored value is just "no".
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
