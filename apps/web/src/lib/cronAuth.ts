/**
 * apps/web/src/lib/cronAuth.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: The one place that authenticates a scheduled-job request
 *   (Vercel Cron / the GitHub Actions scheduler send `Authorization: Bearer
 *   $CRON_SECRET`). Before this, nine route files each repeated the check with
 *   a plain `!==` string compare (not constant-time), and
 *   pendingActions.ts had a tenth copy. Centralising it means:
 *     - the secret is compared in constant time (both sides are hashed to a
 *       fixed length first, so length differences leak nothing either);
 *     - it fails CLOSED when CRON_SECRET is unset (500, never "Bearer undefined");
 *     - routeContract.test.ts can assert every cron route calls guardCron()
 *       before doing any work.
 */
import 'server-only'
import { createHash, timingSafeEqual } from 'node:crypto'

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

/** True only when `authorization` is exactly `Bearer <CRON_SECRET>` and the secret is configured. */
export function isValidCronAuthorization(authorization: string | null | undefined): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret || !authorization) return false
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`))
}

/**
 * Route-handler guard. Returns a ready-made error response when the caller is
 * not the scheduler, or null when the job may run:
 *
 *   const denied = await guardCron()
 *   if (denied) return denied
 */
export async function guardCron(): Promise<import('next/server').NextResponse | null> {
  // Loaded lazily so the pure comparison above can be imported from Express
  // route modules (pendingActions.ts) without pulling in Next request scope.
  const { NextResponse } = await import('next/server')
  const { headers } = await import('next/headers')
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
  }
  const h = await headers()
  if (!isValidCronAuthorization(h.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
