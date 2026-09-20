/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/server/services/pendingActionExecutor.ts
 * [PURPOSE]: Applies an APPROVED PendingAction's stored `targetState` to the
 *   real record. Until now pendingActionService.approve() only flipped the
 *   row's status to APPROVED and the comment said "the calling route handler
 *   executes the business operation" — but the approve route never did, so an
 *   approved "create student" or "archive class" silently did nothing.
 *
 *   Each handler delegates to the same service function the direct (admin /
 *   high_rank) path already uses, so validation, audit logging and search
 *   indexing are identical whichever way the change arrives. The reviewer is
 *   the audited actor; the original requester is preserved on the
 *   PendingAction row itself.
 *
 *   Action types with no handler (timetable.*, announcement.*,
 *   hr.leaveApproval, application.statusChange) are recorded as a decision
 *   only — `applied: false` tells the caller so it can say so honestly.
 *
 * [DEPENDS ON]: studentService, classService, @shared/schemas/student
 */

import 'server-only'
import { CreateClassSchema, UpdateClassSchema, StudentStatusSchema } from '@shared/schemas/student'
import type { UserRole } from '@shared/types/roles'
import * as studentService from '@/server/services/studentService'
import * as classService from '@/server/services/classService'

export interface ExecutablePendingAction {
  id: string
  action: string
  entityId: string
  targetState: Record<string, unknown> | null
}

export interface ExecutionActor {
  uid: string
  role: UserRole
}

export interface ExecutionResult {
  applied: boolean
  note: string | null
}

type Handler = (pa: ExecutablePendingAction, actor: ExecutionActor) => Promise<void>

function badRequest(message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status: 400 })
}

function requireState(pa: ExecutablePendingAction): Record<string, unknown> {
  if (!pa.targetState || Object.keys(pa.targetState).length === 0) {
    throw badRequest('This request has no stored change to apply.')
  }
  return pa.targetState
}

// Same required fields POST /students checks before it will create anyone.
const REQUIRED_STUDENT_FIELDS = [
  'firstName', 'lastName', 'dateOfBirth', 'sex', 'nationality', 'district',
  'email', 'guardianName', 'guardianPhone', 'guardianRelation',
] as const

const HANDLERS: Readonly<Record<string, Handler>> = {
  'student.create': async (pa, actor) => {
    const state = requireState(pa)
    const missing = REQUIRED_STUDENT_FIELDS.filter((f) => !state[f])
    if (missing.length > 0) {
      throw badRequest(`This request is missing required student details: ${missing.join(', ')}.`)
    }
    await studentService.create(state as unknown as studentService.CreateStudentInput, actor.uid, actor.role)
  },

  'student.edit': async (pa, actor) => {
    await studentService.update(
      pa.entityId,
      requireState(pa) as unknown as studentService.UpdateStudentInput,
      actor.uid,
      actor.role,
    )
  },

  'student.softDelete': async (pa, actor) => {
    await studentService.softDelete(pa.entityId, actor.uid, actor.role)
  },

  'student.statusChange': async (pa, actor) => {
    const parsed = StudentStatusSchema.safeParse(requireState(pa)['status'])
    if (!parsed.success) throw badRequest('The requested student status is not valid.')
    await studentService.changeStatus(pa.entityId, parsed.data, actor.uid, actor.role)
  },

  'class.create': async (pa, actor) => {
    const parsed = CreateClassSchema.safeParse(requireState(pa))
    if (!parsed.success) throw badRequest('The stored class details are no longer valid.')
    await classService.createClass(parsed.data, actor.uid, actor.role)
  },

  'class.edit': async (pa, actor) => {
    const parsed = UpdateClassSchema.safeParse(requireState(pa))
    if (!parsed.success) throw badRequest('The stored class changes are no longer valid.')
    await classService.updateClass(pa.entityId, parsed.data, actor.uid, actor.role)
  },

  'class.softDelete': async (pa, actor) => {
    await classService.archiveClass(pa.entityId, actor.uid, actor.role)
  },
}

/** true when approving this action type changes real data. */
export function appliesChange(action: string): boolean {
  return action in HANDLERS
}

export async function applyApproved(
  pa: ExecutablePendingAction,
  actor: ExecutionActor,
): Promise<ExecutionResult> {
  const handler = HANDLERS[pa.action]
  if (!handler) {
    return { applied: false, note: 'Decision recorded — no automatic change is attached to this request type.' }
  }
  await handler(pa, actor)
  return { applied: true, note: null }
}
