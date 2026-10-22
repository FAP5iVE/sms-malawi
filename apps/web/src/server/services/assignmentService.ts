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
 * [MAINT 2026-10-22 — Assignment visibility]: one rule, applied everywhere an
 *   assignment is read (class Assignments tab, calendar, student report,
 *   submissions), via scopeForViewer():
 *     - admin / high_rank /
 *       exam_officer .............. every assignment (view only)
 *     - class teacher ............. every assignment of THEIR class, plus the
 *                                   assignments of any other class where they
 *                                   are the assigned teacher of that subject
 *     - subject teacher ........... only (their class, their subject) pairs
 *     - student ................... only their own class, and only subjects
 *                                   that have a teacher assigned; and only
 *                                   their own submission rows
 *     - everyone else ............. nothing
 *   "Assigned" means a ClassSubjectAssignment row (the per-class subject
 *   -> teacher workflow). Creating an assignment requires that row to exist
 *   and the creator to be that subject's teacher or the class teacher.
 * [DEPENDS ON]: apps/web/src/server/services/auditService.ts,
 *   @shared/schemas/student (CreateAssignmentInput)
 */
import 'server-only'

import { prisma }        from '@/lib/prisma'
import type { Prisma }   from '@prisma/client'
import * as auditService from '@/server/services/auditService'
import type { CreateAssignmentInput } from '@shared/schemas/student'
import type { UserRole } from '@shared/types/roles'

// ─────────────────────────────────────────────────────────
//  LIST
// ─────────────────────────────────────────────────────────

export interface AssignmentViewer {
  uid:        string
  role:       UserRole
  superUser?: boolean
}

const noAccess = (msg: string, status = 403) => Object.assign(new Error(msg), { status })

/** Subjects of a class that currently have a teacher assigned (explicit
 *  ClassSubjectAssignment rows for the class's own academic year). */
export async function assignedSubjectsForClass(classId: string): Promise<string[]> {
  const cls = await prisma.class.findUnique({ where: { id: classId }, select: { academicYear: true } })
  if (!cls) return []
  const rows = await prisma.classSubjectAssignment.findMany({
    where:  { classId, academicYear: cls.academicYear },
    select: { subject: true },
  })
  return rows.map((r) => r.subject)
}

/**
 * The Prisma `where` that limits assignments to what `viewer` may see, or
 * null when they may see none (callers answer 403 / empty). Pass `classId`
 * to scope to one class — a class the viewer has no relationship to yields
 * null, never an empty-looking success.
 */
export async function scopeForViewer(
  viewer: AssignmentViewer,
  classId?: string,
): Promise<Prisma.AssignmentWhereInput | null> {
  if (viewer.superUser === true || viewer.role === 'admin' || viewer.role === 'high_rank' || viewer.role === 'exam_officer') {
    return classId ? { classId } : {}
  }

  if (viewer.role === 'student') {
    const student = await prisma.student.findFirst({
      where:  { firebaseUid: viewer.uid, ...(classId ? { classId } : {}) },
      select: { classId: true },
    })
    if (!student?.classId) return null
    const subjects = await assignedSubjectsForClass(student.classId)
    return { classId: student.classId, subject: { in: subjects } }
  }

  if (viewer.role === 'academic') {
    const [headed, taught] = await Promise.all([
      prisma.class.findMany({
        where:  { teacherId: viewer.uid, ...(classId ? { id: classId } : {}) },
        select: { id: true },
      }),
      prisma.classSubjectAssignment.findMany({
        where:  { teacherUid: viewer.uid, ...(classId ? { classId } : {}) },
        select: { classId: true, subject: true },
      }),
    ])
    const or: Prisma.AssignmentWhereInput[] = []
    if (headed.length > 0) or.push({ classId: { in: headed.map((c) => c.id) } })
    for (const t of taught) or.push({ classId: t.classId, subject: t.subject })
    return or.length > 0 ? { OR: or } : null
  }

  return null
}

export async function listForViewer(classId: string, viewer: AssignmentViewer) {
  const scope = await scopeForViewer(viewer, classId)
  if (!scope) throw noAccess('You do not have access to this class\u2019s assignments.')

  // A student sees only their OWN submission status, never classmates'.
  const own = viewer.role === 'student'
    ? await prisma.student.findFirst({ where: { firebaseUid: viewer.uid }, select: { id: true } })
    : null

  return prisma.assignment.findMany({
    where: scope,
    include: {
      submissions: {
        ...(own ? { where: { studentId: own.id } } : {}),
        select: { studentId: true, status: true, submittedAt: true },
      },
    },
    orderBy: { dueDate: 'asc' },
  })
}

/**
 * Who may set an assignment for (class, subject): the subject must have a
 * teacher assigned in this class, and the actor must be that teacher or the
 * class teacher. Throws a 4xx with guidance otherwise.
 */
export async function assertCanCreateForSubject(classId: string, subject: string, actorUid: string): Promise<void> {
  const cls = await prisma.class.findUnique({
    where:  { id: classId },
    select: { teacherId: true, academicYear: true },
  })
  if (!cls) throw noAccess('Class not found.', 404)

  const assigned = await prisma.classSubjectAssignment.findUnique({
    where: { classId_subject_academicYear: { classId, subject, academicYear: cls.academicYear } },
    select: { teacherUid: true },
  })
  if (!assigned) {
    throw noAccess(
      `${subject} has no teacher assigned in this class yet. Assign a subject teacher first (class page \u2192 Subjects & teachers).`,
      409,
    )
  }
  if (assigned.teacherUid !== actorUid && cls.teacherId !== actorUid) {
    throw noAccess(`Only the teacher assigned to ${subject} in this class, or the class teacher, can set ${subject} assignments.`)
  }
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
  await assertCanCreateForSubject(classId, data.subject.trim(), actorUid)

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
  actorRole:    UserRole,
  /** The :classId of the request - the assignment must belong to it. */
  expectedClassId?: string,
) {
  // The student may only submit to an assignment they are allowed to SEE
  // (own class, assigned subject) - closes submitting to any assignment id.
  const scope = await scopeForViewer({ uid: actorUid, role: actorRole })
  const assignment = scope
    ? await prisma.assignment.findFirst({
        where:  { AND: [{ id: assignmentId }, scope, ...(expectedClassId ? [{ classId: expectedClassId }] : [])] },
        select: { dueDate: true, classId: true },
      })
    : null
  if (!assignment) throw noAccess('Assignment not found.', 404)

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
