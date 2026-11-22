/**
 * [FILE]: apps/web/src/server/routes/guardianClaim.ts
 * [PURPOSE]: POST /guardian-claim: the PUBLIC door through which an invited guardian turns a
 *   one-time code into an account. No identity exists yet, so this route is intentionally not
 *   behind verifyAuth; it is declared in the access-policy registry and protected instead by:
 *
 *     - the strictest rate-limit policy (guardian-claim: per-IP, deployment-wide ceiling,
 *       FAIL-CLOSED if the shared store is unreachable),
 *     - an attempt cap that locks the invitation itself (see guardianClaimService),
 *     - one generic answer for every kind of failure (see claimResponse),
 *     - no caching, and no logging of the request body.
 *
 *   The password never reaches a log, an audit entry, Sentry, or a response.
 */
import 'server-only'
import { Router } from 'express'
import { rateLimit } from '@/lib/ratelimit'
import { logger } from '@/lib/logger'
import * as auditService from '@/server/services/auditService'
import { ClaimInvitationSchema } from '@shared/schemas/guardianPortal'
import { prismaGuardianDb } from '@/server/services/guardian/prismaDb'
import { claimInvitation, toPublicResult } from '@/server/services/guardian/guardianClaimService'
import { firebaseIdentity } from '@/server/services/guardian/firebaseIdentity'
import { getInvitationPepper } from '@/server/services/guardian/config'
import { claimHttpResult } from '@/server/lib/guardian/claimResponse'

export const guardianClaimRouter = Router()

guardianClaimRouter.post('/', rateLimit('guardian-claim'), async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  const body = ClaimInvitationSchema.safeParse(req.body)
  if (!body.success) {
    // Same answer as a wrong code: validation detail would be a probing aid.
    const r = claimHttpResult({ ok: false, code: 'CLAIM_FAILED' })
    res.status(r.status).json(r.body)
    return
  }
  try {
    const result = await claimInvitation(prismaGuardianDb(), body.data, {
      identity: firebaseIdentity(),
      pepper: getInvitationPepper(),
      audit: async (rec) => { await auditService.log(rec) },
    })
    const out = claimHttpResult(toPublicResult(result))
    res.status(out.status).json(out.body)
  } catch (err) {
    // Never include the request, the code, the e-mail or the error text in the response or the log line.
    logger.error({ event: 'guardian.claim_error', errName: err instanceof Error ? err.name : 'unknown' }, '[guardianClaim] unexpected failure')
    res.status(503).json({ error: 'Something went wrong. Please try again later.' })
  }
})
