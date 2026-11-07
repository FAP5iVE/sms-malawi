/**
 * [FILE]: apps/web/src/server/services/guardian/guardianAccess.ts
 * [PURPOSE]: The per-request decision "may THIS signed-in guardian see THIS part of THIS
 *   child". Run on EVERY parent request against the database. Nothing is cached into the
 *   token, so suspending a person or revoking a link takes effect on their next request.
 *
 * [SECURITY NOTES]
 *   - A child is named by the guardian LINK id, never the student id, and the lookup is
 *     `{ id: linkId, profileId: <the caller's own profile> }`. A guardian cannot even
 *     address another family's child: the row simply is not found. (Object-level
 *     authorization by construction, not by a comparison someone could forget.)
 *   - The caller's profile is found from the VERIFIED token uid. A missing or empty uid
 *     is refused up front: Prisma treats `where: { x: undefined }` as "no filter", which
 *     would otherwise match someone's profile.
 *   - Every denial is one of a small set of reasons for the access log. The HTTP layer
 *     turns ALL of them into the same response, so a guardian cannot tell "no such child"
 *     from "not yours" from "not allowed".
 *   - A link flagged for re-verification keeps the low-risk modules (results, attendance,
 *     profile, notices) but loses the ones that move money or files (fees, documents)
 *     until staff re-confirm: the contact details behind it changed.
 */
import { isEnrolledForParent, sanitizeCapabilities, type GuardianCapability } from '@shared/constants/guardianPortal'
import { grantsAccess } from '@/server/lib/guardian/linkStateMachine'
import { toChildDto, type ChildDto } from '@/server/lib/guardian/parentDto'
import type { GuardianDb } from './db'

export type DenyReason =
  | 'NO_PROFILE' | 'PROFILE_INACTIVE' | 'NO_LINK' | 'LINK_INACTIVE' | 'STUDENT_MISSING'
  | 'CAPABILITY_MISSING' | 'REVERIFY_PENDING' | 'NOT_ENROLLED'

export interface GuardianContext {
  profile: Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  link: Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  student: Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
}

export type AccessDecision =
  | { allowed: true; ctx: GuardianContext }
  | { allowed: false; reason: DenyReason; profileId?: string; linkId?: string }

const HELD_WHILE_REVERIFYING: readonly GuardianCapability[] = ['fees', 'documents']

export async function findGuardianProfile(db: GuardianDb, uid: unknown) {
  // Never let an undefined/empty uid become an unfiltered query.
  if (typeof uid !== 'string' || uid.length === 0) return null
  return db.guardianProfile.findFirst({ where: { firebaseUid: uid } })
}

export async function authorizeChild(
  db: GuardianDb,
  input: { uid: unknown; linkId: unknown; capability: GuardianCapability },
): Promise<AccessDecision> {
  const profile = await findGuardianProfile(db, input.uid)
  if (!profile) return { allowed: false, reason: 'NO_PROFILE' }
  if (profile.status !== 'ACTIVE') return { allowed: false, reason: 'PROFILE_INACTIVE', profileId: profile.id }

  if (typeof input.linkId !== 'string' || input.linkId.length === 0) return { allowed: false, reason: 'NO_LINK', profileId: profile.id }
  const link = await db.guardianLink.findFirst({ where: { id: input.linkId, profileId: profile.id } })
  if (!link) return { allowed: false, reason: 'NO_LINK', profileId: profile.id }
  const base = { profileId: profile.id as string, linkId: link.id as string }

  if (!grantsAccess(link.status)) return { allowed: false, reason: 'LINK_INACTIVE', ...base }
  const student = await db.student.findUnique({ where: { id: link.studentId } })
  if (!student) return { allowed: false, reason: 'STUDENT_MISSING', ...base }

  if (!sanitizeCapabilities(link.capabilities).includes(input.capability)) return { allowed: false, reason: 'CAPABILITY_MISSING', ...base }
  if (link.reverifyRequired === true && HELD_WHILE_REVERIFYING.includes(input.capability)) return { allowed: false, reason: 'REVERIFY_PENDING', ...base }
  if (!isEnrolledForParent(student.status)) return { allowed: false, reason: 'NOT_ENROLLED', ...base }

  return { allowed: true, ctx: { profile, link, student } }
}

/** The guardian's children: ACTIVE links only. A child who has left is listed as not enrolled, with no data. */
export async function listChildren(db: GuardianDb, uid: unknown): Promise<{ profileId: string; children: ChildDto[] } | null> {
  const profile = await findGuardianProfile(db, uid)
  if (!profile || profile.status !== 'ACTIVE') return null
  const links = await db.guardianLink.findMany({ where: { profileId: profile.id, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } })
  if (links.length === 0) return { profileId: profile.id as string, children: [] }
  const students = await db.student.findMany({ where: { id: { in: links.map((l) => l.studentId) } } })
  const classIds = [...new Set(students.map((s) => s.classId).filter((c): c is string => typeof c === 'string'))]
  const classes = classIds.length ? await db.class.findMany({ where: { id: { in: classIds } } }) : []
  const className = (classId: unknown) => classes.find((c) => c.id === classId)?.name ?? null
  const children = links.map((l) => {
    const s = students.find((x) => x.id === l.studentId) ?? null
    return toChildDto(l, s, s ? className(s.classId) : null)
  })
  return { profileId: profile.id as string, children }
}

/** Best-effort safeguarding trail. A failure here never blocks or changes the response. */
export async function recordAccess(
  db: GuardianDb,
  rec: { profileId: string; linkId?: string | null; studentId?: string | null; module: string; outcome: 'ALLOWED' | 'DENIED'; reason?: string | null },
): Promise<void> {
  try {
    await db.guardianAccessLog.create({
      data: { profileId: rec.profileId, linkId: rec.linkId ?? null, studentId: rec.studentId ?? null, module: rec.module, outcome: rec.outcome, reason: rec.reason ?? null },
    })
  } catch { /* the access log must never break a guardian's request */ }
}
