/**
 * Guardian-portal configuration read from the environment, validated where it is used.
 *
 * GUARDIAN_INVITATION_PEPPER: >= 32 random characters, a secret OUTSIDE the database.
 * It keys the hash of every claim code, so a database leak alone cannot be used to verify
 * or brute-force a code. Generate with: openssl rand -base64 48
 * A missing or short value makes issuing and claiming fail loudly. It never means
 * "skip the protection".
 */
import { assertPepper } from '@/server/lib/guardian/invitationCode'

export function getInvitationPepper(): string {
  const v = process.env.GUARDIAN_INVITATION_PEPPER
  assertPepper(v)
  return v
}

export function getClaimUrl(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '')
  return `${base}/login?claim=1`
}
