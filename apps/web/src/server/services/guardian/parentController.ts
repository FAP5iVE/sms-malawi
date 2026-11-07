/**
 * [FILE]: apps/web/src/server/services/guardian/parentController.ts
 * [PURPOSE]: Request -> response logic for the guardian API, independent of Express so the
 *   behaviour (not just the wiring) is tested. The routers are thin adapters around this.
 *
 * [SECURITY NOTES]
 *   - A module's capability is derived HERE from the module name. A route cannot ask for
 *     "results" data under the "profile" capability by mistake.
 *   - EVERY refusal for a child is the same frozen NOT_FOUND result. A guardian cannot tell
 *     "no such child" from "not yours" from "suspended" from "that module is not granted".
 *     The specific reason goes to the access log only.
 *   - Allowed reads of money and results are logged (who opened what, when); denials always are.
 */
import type { GuardianCapability } from '@shared/constants/guardianPortal'
import { toChildDto } from '@/server/lib/guardian/parentDto'
import type { GuardianDb } from './db'
import { authorizeChild, findGuardianProfile, listChildren, recordAccess } from './guardianAccess'
import { getChildAttendance, getChildFees, getChildResults, type ParentDeps } from './parentPortalService'

export interface HttpResult { status: number; body: unknown }

export const NOT_FOUND: HttpResult = Object.freeze({ status: 404, body: Object.freeze({ error: 'Not found' }) }) as HttpResult
export const FORBIDDEN: HttpResult = Object.freeze({ status: 403, body: Object.freeze({ error: 'Access denied for your role' }) }) as HttpResult

export type ChildModule = 'profile' | 'results' | 'fees' | 'attendance'

/** The single source of truth for which capability each module needs. */
export const MODULE_CAPABILITY: Readonly<Record<ChildModule, GuardianCapability>> = Object.freeze({
  profile: 'profile', results: 'results', fees: 'fees', attendance: 'attendance',
})

/** Reads worth a "who looked at what" record even when allowed. Denials are always recorded. */
const LOG_WHEN_ALLOWED: readonly ChildModule[] = ['results', 'fees']

export async function getMe(db: GuardianDb, uid: unknown): Promise<HttpResult> {
  const profile = await findGuardianProfile(db, uid)
  if (!profile || profile.status !== 'ACTIVE') return FORBIDDEN
  return { status: 200, body: { displayName: profile.fullName } }
}

export async function getChildren(db: GuardianDb, uid: unknown): Promise<HttpResult> {
  const r = await listChildren(db, uid)
  if (!r) return FORBIDDEN
  return { status: 200, body: { children: r.children } }
}

export async function getChildModule(
  db: GuardianDb, deps: ParentDeps, input: { uid: unknown; linkId: unknown; module: ChildModule },
): Promise<HttpResult> {
  const capability = MODULE_CAPABILITY[input.module]
  if (!capability) return NOT_FOUND                                   // unknown module name: same answer
  const d = await authorizeChild(db, { uid: input.uid, linkId: input.linkId, capability })
  if (!d.allowed) {
    if (d.profileId) {
      await recordAccess(db, { profileId: d.profileId, linkId: d.linkId ?? null, module: input.module, outcome: 'DENIED', reason: d.reason })
    }
    return NOT_FOUND
  }
  const { ctx } = d
  if (LOG_WHEN_ALLOWED.includes(input.module)) {
    await recordAccess(db, { profileId: ctx.profile.id, linkId: ctx.link.id, studentId: ctx.student.id, module: input.module, outcome: 'ALLOWED' })
  }
  switch (input.module) {
    case 'profile': {
      const cls = typeof ctx.student.classId === 'string' ? await db.class.findUnique({ where: { id: ctx.student.classId } }) : null
      return { status: 200, body: { child: toChildDto(ctx.link, ctx.student, cls?.name ?? null) } }
    }
    case 'results': return { status: 200, body: await getChildResults(db, ctx, deps) }
    case 'fees': return { status: 200, body: await getChildFees(db, ctx) }
    case 'attendance': return { status: 200, body: await getChildAttendance(db, ctx) }
  }
}
