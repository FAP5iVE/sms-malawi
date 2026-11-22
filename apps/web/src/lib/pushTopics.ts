/**
 * [FILE]: apps/web/src/lib/pushTopics.ts
 * [PURPOSE]: Which FCM topics a signed-in user is subscribed to, by role.
 *
 *   The previous logic was `if (role === 'student') {...} else { staff topic }`:
 *   every role that was not a student, including any role added later, landed on
 *   the staff topic. For the guardian portal that would deliver internal staff
 *   announcements to members of the public. Each branch is now a POSITIVE check
 *   and an unrecognised role subscribes to nothing.
 *
 *   Parents are deliberately NOT on `announcements_all` ("every authenticated
 *   user" historically meant staff and students). School-wide notices reach
 *   guardians through the dedicated `announcements_parents` topic. Anything
 *   specific to one child is sent directly to that guardian's tokens, never to a
 *   topic that other households share.
 *
 * Pure (no I/O) so it is unit-tested directly.
 */
import { isStaffRole, isValidRole } from '@shared/types/roles'

export const PARENT_TOPIC = 'announcements_parents' as const

export function defaultTopicsForRole(role: unknown, classId?: string | null): string[] {
  if (!isValidRole(role)) return []

  if (role === 'parent') return [PARENT_TOPIC]

  const topics: string[] = ['announcements_all']

  if (role === 'student') {
    topics.push('announcements_students')
    if (classId) topics.push(`announcements_class_${classId}`)
  } else if (isStaffRole(role)) {
    topics.push('announcements_staff')
  }

  if (role === 'academic' || role === 'exam_officer') {
    topics.push('announcements_academic')
  }

  return topics
}
