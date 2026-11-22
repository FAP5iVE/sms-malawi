/**
 * [FILE]: apps/web/src/server/lib/guardian/claimResponse.ts
 * [PURPOSE]: The exact HTTP response for each outcome of POST /guardian-claim. Pure, so a test
 *   can prove that every reason that must be indistinguishable returns IDENTICAL bytes.
 */
import type { PublicClaimResult } from '@/server/services/guardian/guardianClaimService'

export interface HttpResult { status: number; body: Record<string, unknown> }

// One frozen object per answer: identical status and body, by construction.
const GENERIC_FAILURE: HttpResult = Object.freeze({
  status: 400,
  body: Object.freeze({ error: 'That code could not be used. Check it and try again, or ask the school for a new one.', code: 'CLAIM_FAILED' }),
}) as HttpResult

export function claimHttpResult(r: PublicClaimResult): HttpResult {
  if (r.ok) return { status: 200, body: { ok: true } }
  switch (r.code) {
    case 'EMAIL_IN_USE':
      return { status: 409, body: { error: 'That email address cannot be used. Try a different one, or contact the school.', code: 'EMAIL_IN_USE' } }
    case 'WEAK_PASSWORD':
      return { status: 422, body: { error: 'Choose a password of at least 10 characters that is not your email address.', code: 'WEAK_PASSWORD' } }
    case 'INVALID_EMAIL':
      return { status: 422, body: { error: 'Enter a valid email address.', code: 'INVALID_EMAIL' } }
    default:
      return GENERIC_FAILURE
  }
}
