/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/server/services/assignmentService.ts
 * [R-PHASE]: R6 — Academics II: Classes, Assignments & the Attendance Rebuild
 * [PURPOSE]: Extracts the Prisma logic that previously lived inline in
 *   assignments.ts's route handlers into a proper service layer, matching
 *   the established studentService.ts/classService.ts convention: import
 *   'server-only', Prisma singleton import, named exports, auditService.
 *   log(...) on every mutation. Access-control checks that depend on
 *   req.user (role gates, the teacher-ownership check) remain in the route
 *   file, matching where classes.ts/attendance.ts keep theirs.
 * [DEPENDS ON]: apps/web/src/server/services/auditService.ts,
 *   @shared/schemas/student (CreateAssignmentInput)
 */
import 'server-only'

import { prisma }        from '@/lib/prisma'
import * as auditService from '@/server/services/auditService'
import type { CreateAssignmentInput } from '@shared/schemas/student'
import type { UserRole } from '@shared/types/roles'

// ─────────────────────────────────────────────────────────
//  LIST
// ─────────────────────────────────────────────────────────

export async function listForClass(classId: string) {
  return prisma.assignment.findMany({
    where: { classId },
    include: { submissions: { select: { studentId: true, status: true, submittedAt: true } } },
    orderBy: { dueDate: 'asc' },
  })
}

// ─────────────────────────────────────────────────────────
//  CREATE
// ─────────────────────────────────────────────────────────

export async function createAssignment(
  classId:   string,
  data:      CreateAssignmentInput,
  actorUid:  string,
  actorRole: UserRole
) {
  const assignment = await prisma.assignment.create({
    data: {
      title:        data.title.trim(),
      description:  data.description?.trim() ?? null,
      subject:      data.subject.trim(),
      dueDate:      new Date(data.dueDate),
      classId,
      createdByUid: actorUid,
    },
  })

  await auditService.log({
    action:     'assignment.created',
    entityType: 'Assignment',
    entityId:   assignment.id,
    actorUid,
    actorRole,
    metadata:   { after: { title: assignment.title, classId, dueDate: assignment.dueDate.toISOString() } },
  })

  return assignment
}

// ─────────────────────────────────────────────────────────
//  SUBMIT (student)
//  Re-submission (the student uploads a replacement file before the
//  deadline) updates the existing row rather than erroring on the
//  AssignmentSubmission.@@unique([assignmentId, studentId]) constraint —
//  matches the "replace my submission" UX a resubmission implies.
// ─────────────────────────────────────────────────────────

export async function submitAssignment(
  assignmentId: string,
  studentId:    string,
  fileKey:      string | null,
  actorUid:     string,
  actorRole:    UserRole
) {
  const assignment = await prisma.assignment.findUniqueOrThrow({
    where:  { id: assignmentId },
    select: { dueDate: true, classId: true },
  })

  const submittedAt = new Date()
  const status = submittedAt > assignment.dueDate ? 'LATE' : 'SUBMITTED'

  const submission = await prisma.assignmentSubmission.upsert({
    where: {
      assignmentId_studentId: { assignmentId, studentId },
    },
    create: {
      assignmentId,
      studentId,
      fileKey,
      submittedAt,
      status,
    },
    update: {
      fileKey,
      submittedAt,
      status,
    },
  })

  await auditService.log({
    action:     'assignment.submitted',
    entityType: 'AssignmentSubmission',
    entityId:   submission.id,
    actorUid,
    actorRole,
    metadata:   { after: { assignmentId, studentId, status } },
  })

  return submission
}
