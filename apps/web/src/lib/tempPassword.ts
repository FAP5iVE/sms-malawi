/**
 * apps/web/src/lib/tempPassword.ts
 *
 * [CHANGE TYPE]: NEW FILE (production fix, 2026-07-26).
 * [PURPOSE]: One cryptographically-secure temporary-password generator,
 *   shared by every server-side flow that mints an initial credential
 *   (userManagementService.createUser for admin-created logins, and
 *   hrService.createStaff for HR-created staff logins). Uses node:crypto's
 *   randomInt (CSPRNG) instead of Math.random(), which is not suitable for
 *   security-sensitive values — the old module-private generator in
 *   userManagementService.ts used Math.random() and is replaced by this.
 *
 *   Guarantees the generated password satisfies a typical strength policy:
 *   at least one lowercase, one uppercase, one digit and one symbol, at a
 *   default length of 14. The character-class guarantee matters because
 *   Firebase Auth (and any future self-hosted policy) can reject a password
 *   that happens to draw only from one class.
 * [DEPENDS ON]: none
 */
import 'server-only'
import { randomInt } from 'node:crypto'

const LOWER   = 'abcdefghjkmnpqrstuvwxyz'   // no i/l/o — avoid look-alikes
const UPPER   = 'ABCDEFGHJKMNPQRSTUVWXYZ'   // no I/L/O
const DIGITS  = '23456789'                  // no 0/1
const SYMBOLS = '!@#$%*?-_'

const ALL = LOWER + UPPER + DIGITS + SYMBOLS

/** Pick one random character from a set using a CSPRNG. */
function pick(set: string): string {
  return set.charAt(randomInt(set.length))
}

/** Fisher–Yates shuffle using randomInt so the guaranteed-class characters
 *  are not always at the front. */
function shuffle(chars: string[]): string[] {
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    const tmp = chars[i]!
    chars[i] = chars[j]!
    chars[j] = tmp
  }
  return chars
}

/**
 * Generate a cryptographically-secure temporary password.
 * @param length total length (minimum 8, default 14).
 */
export function generateTempPassword(length = 14): string {
  const len = Math.max(8, length)

  // Guarantee one character from each required class, then fill the rest
  // from the full alphabet, then shuffle so class positions are random.
  const required = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)]
  const remaining = Array.from({ length: len - required.length }, () => pick(ALL))

  return shuffle([...required, ...remaining]).join('')
}