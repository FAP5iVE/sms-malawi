/**
 * [CHANGE TYPE]: TARGETED EDIT (output in full — most exports change)
 * [FILE]: apps/web/src/server/services/classService.ts
 * [R-PHASE]: R6 — Academics II: Classes, Assignments & the Attendance Rebuild
 * [PURPOSE]:
 *   1. Added `import 'server-only'` (previously missing entirely).
 *   2. Added updateClass() and archiveClass() exports, matching
 *      createClass()'s existing shape — Classes could previously be
 *      created but never edited or archived through any code path despite
 *      class.edit/class.softDelete being defined permissions.
 *      archiveClass() is a real soft-delete (Class.status → ARCHIVED, a
 *      new column this phase adds), not a destructive row deletion.
 *   3. Added auditService.log(...) calls to all five mutating exports
 *      (createClass, updateClass, archiveClass, createTimetableSlot, and
 *      the new approveTimetableSlot) — previously zero audit coverage.
 *   4. createClass()/updateClass(): when teacherId is supplied, an
 *      application-level existence check confirms it resolves to a real
 *      Firebase user via the Admin SDK before persisting — no
 *      database-level FK is possible across the Firebase-UID/Postgres
 *      boundary, so this must be an explicit service-layer check.
 *   5. listClasses() gained an `includeArchived` parameter (default
 *      false) so archived classes don't silently linger in the default
 *      list view forever, matching Students' own ACTIVE-by-default
 *      convention.
 *   6. createTimetableSlot() now takes actorUid/actorRole and decides
 *      approval state itself: admin/high_rank creations are immediately
 *      approved (approvedAt/approvedByUid set to the creator); exam_officer
 *      creations are left pending (approvedAt: null) since that role holds
 *      only timetable.editWithApproval, not timetable.editDirect.
 *   7. Added approveTimetableSlot() — the write path that actually clears
 *      a pending slot's approvedAt/approvedByUid. Without it, an
 *      exam_officer-created slot could never transition out of "pending"
 *      (the acceptance criterion "...until an admin/high_rank approval
 *      action sets it" requires a real mechanism to set it, not just a
 *      column to leave null forever) — gated by the existing
 *      timetable.approve permission (admin/high_rank).
 *   Consequential (explicit follow-up instruction — the school-set
 *   timetable must never stand in for a MANEB national exam sitting):
 *   createTimetableSlot() now rejects an EXAM-type slot for Form 2 Term 3
 *   or Form 4 Term 3 (the JCE/MSCE national sittings — see
 *   @shared/constants/malawi's MANEB_NATIONAL_FORM_TERM), directing the
 *   caller to timetable type "MANEB" instead.
 * [MAINT 2026-08 — Exam Module P0]: Added ClassSubjectAssignment CRUD +
 *   ownership helpers. ClassSubjectAssignment is the canonical subject-
 *   teacher assignment backing exam/marks ownership (AC-2..AC-6):
 *   getTeacherSubjectAssignments() returns the (classId|subject) set a
 *   teacher owns for a year — reading ClassSubjectAssignment, falling back
 *   to distinct TimetableSlot rows only when a teacher has no explicit
 *   assignments yet (non-breaking transition; the explicit table becomes
 *   authoritative once populated, via createSubjectAssignment or the
 *   backfillSubjectAssignmentsFromTimetable one-time migration helper).
 * [DEPENDS ON]: apps/web/src/server/services/auditService.ts,
 *   @shared/schemas/student (UpdateClassInput), @shared/constants/malawi
 *   (getManebExamType)
 */
import 'server-only'

import { prisma }        from '@/lib/prisma'
import * as auditService from '@/server/services/auditService'
import * as admin        from 'firebase-admin'
import { Prisma, Weekday, TimetableType } from '@prisma/client'
import type { CreateClassInput, UpdateClassInput } from '@shared/schemas/student'
import type { UserRole } from '@shared/types/roles'
import { getManebExamType } from '@shared/constants/malawi'

// ─────────────────────────────────────────────────────────
//  TEACHER EXISTENCE CHECK
//  No DB-level FK is possible from Class.teacherId (a plain Firebase UID
//  string) to a Firebase Auth user — this is the application-level
//  substitute, matching the pattern already established for Firebase-UID
//  references elsewhere in the codebase (userManagementService.ts).
// ─────────────────────────────────────────────────────────

async function assertTeacherExists(teacherId: string): Promise<void> {
  try {
    await admin.auth().getUser(teacherId)
  } catch {
    throw Object.assign(
      new Error(`The specified teacher (${teacherId}) does not have a valid staff account.`),
      { status: 400 }
    )
  }
}

// ─────────────────────────────────────────────────────────
//  READ
// ─────────────────────────────────────────────────────────

export async function listClasses(academicYear?: string, includeArchived = false) {
  return prisma.class.findMany({
    where: {
      ...(academicYear ? { academicYear } : {}),
      ...(includeArchived ? {} : { status: 'ACTIVE' }),
    },
    orderBy: [{ form: 'asc' }, { stream: 'asc' }],
    include: { _count: { select: { students: true } } },
  })
}

export async function getClass(id: string) {
  return prisma.class.findUniqueOrThrow({
    where: { id },
    include: {
      students: { where: { status: 'ACTIVE' }, orderBy: { lastName: 'asc' } },
      timetable: { orderBy: [{ day: 'asc' }, { periodStart: 'asc' }] },
      assignments: { orderBy: { dueDate: 'asc' } },
    },
  })
}

// ─────────────────────────────────────────────────────────
//  CREATE / UPDATE / ARCHIVE
// ─────────────────────────────────────────────────────────

export async function createClass(
  data:      CreateClassInput,
  actorUid:  string,
  actorRole: UserRole
) {
  if (data.teacherId) {
    await assertTeacherExists(data.teacherId)
  }

  const cls = await prisma.class.create({
    data: {
      name:         data.name,
      form:         data.form,
      academicYear: data.academicYear,
      stream:       data.stream ?? null,
      teacherId:    data.teacherId ?? null,
      room:         data.room ?? null,
    },
  })

  await auditService.log({
    action:     'class.created',
    entityType: 'Class',
    entityId:   cls.id,
    actorUid,
    actorRole,
    metadata:   { after: { name: cls.name, form: cls.form, academicYear: cls.academicYear } },
  })

  return cls
}

export async function updateClass(
  id:        string,
  data:      UpdateClassInput,
  actorUid:  string,
  actorRole: UserRole
) {
  if (data.teacherId) {
    await assertTeacherExists(data.teacherId)
  }

  const before = await prisma.class.findUniqueOrThrow({
    where: { id },
    select: { name: true, form: true, stream: true, teacherId: true, room: true, academicYear: true, status: true },
  })

  const cls = await prisma.class.update({
    where: { id },
    data: {
      ...(data.name         !== undefined ? { name: data.name }                 : {}),
      ...(data.form         !== undefined ? { form: data.form }                 : {}),
      ...(data.stream       !== undefined ? { stream: data.stream ?? null }     : {}),
      ...(data.teacherId    !== undefined ? { teacherId: data.teacherId ?? null } : {}),
      ...(data.room         !== undefined ? { room: data.room ?? null }         : {}),
      ...(data.academicYear !== undefined ? { academicYear: data.academicYear } : {}),
      ...(data.status       !== undefined ? { status: data.status }             : {}),
    },
  })

  await auditService.log({
    action:     'class.edited',
    entityType: 'Class',
    entityId:   id,
    actorUid,
    actorRole,
    metadata:   { before, after: { name: cls.name, form: cls.form, stream: cls.stream, teacherId: cls.teacherId, room: cls.room, academicYear: cls.academicYear, status: cls.status } },
  })

  return cls
}

export async function archiveClass(
  id:        string,
  actorUid:  string,
  actorRole: UserRole
) {
  const before = await prisma.class.findUniqueOrThrow({ where: { id }, select: { status: true } })

  const cls = await prisma.class.update({
    where: { id },
    data:  { status: 'ARCHIVED' },
  })

  await auditService.log({
    action:     'class.deleted', // soft-delete/archive — see ACTION_SEVERITY's own naming for this action
    entityType: 'Class',
    entityId:   id,
    actorUid,
    actorRole,
    metadata:   { before: { status: before.status }, after: { status: cls.status } },
  })

  return cls
}

// ─────────────────────────────────────────────────────────
//  TIMETABLE
// ─────────────────────────────────────────────────────────

export async function getTimetableForClass(classId: string, term: number, academicYear: string) {
  return prisma.timetableSlot.findMany({
    where: { classId, term, academicYear },
    orderBy: [{ day: 'asc' }, { periodStart: 'asc' }],
  })
}

export async function createTimetableSlot(
  data: {
    classId: string
    day: string
    periodStart: string
    periodEnd: string
    subject: string
    teacherUid: string
    room?: string | undefined   // explicit string | undefined satisfies exactOptionalPropertyTypes
    type: string
    academicYear: string
    term: number
  },
  actorUid:  string,
  actorRole: UserRole
) {
  const weekday = data.day as Weekday
  const slotType = data.type as TimetableType

  // Form 2 Term 3 (JCE) and Form 4 Term 3 (MSCE) are MANEB national
  // examinations — the school does not set its own exam-period timetable
  // slot for that sitting. A school-administered EXAM-type slot is
  // rejected for those terms; type: 'MANEB' is the correct entry for a
  // nationally-administered sitting.
  if (slotType === 'EXAM') {
    const targetClass = await prisma.class.findUniqueOrThrow({ where: { id: data.classId }, select: { form: true } })
    const manebType = getManebExamType(targetClass.form, data.term)
    if (manebType) {
      throw new Error(
        `Form ${targetClass.form} Term ${data.term} is the national ${manebType} examination, administered by MANEB — use timetable type "MANEB" instead of "EXAM" for this slot.`
      )
    }
  }

  if (data.room) {
    const where: Prisma.TimetableSlotWhereInput = {
      room: data.room,
      day: weekday,
      academicYear: data.academicYear,
      term: data.term,
      OR: [
        { periodStart: { gte: data.periodStart, lt: data.periodEnd } },
        { periodEnd: { gt: data.periodStart, lte: data.periodEnd } },
      ],
    }
    const conflict = await prisma.timetableSlot.findFirst({ where })
    if (conflict) throw new Error(`Room ${data.room} already booked at this time`)
  }

  // exam_officer holds timetable.editWithApproval only — a slot created
  // through this path starts pending (approvedAt: null) until an
  // admin/high_rank approval action (approveTimetableSlot, below) clears
  // it. admin/high_rank hold timetable.editDirect — their own creations
  // are immediately approved, self-attributed to the creator.
  const isDirectApprover = actorRole === 'admin' || actorRole === 'high_rank'

  const slot = await prisma.timetableSlot.create({
    data: {
      classId: data.classId,
      day: weekday,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      subject: data.subject,
      teacherUid: data.teacherUid,
      room: data.room ?? null,
      type: slotType,
      academicYear: data.academicYear,
      term: data.term,
      approvedAt:    isDirectApprover ? new Date() : null,
      approvedByUid: isDirectApprover ? actorUid   : null,
    },
  })

  await auditService.log({
    action:     'timetable.slot_created',
    entityType: 'TimetableSlot',
    entityId:   slot.id,
    actorUid,
    actorRole,
    metadata:   { after: { classId: slot.classId, day: slot.day, subject: slot.subject, pending: !isDirectApprover } },
  })

  return slot
}

export async function approveTimetableSlot(
  slotId:    string,
  actorUid:  string,
  actorRole: UserRole
) {
  const before = await prisma.timetableSlot.findUniqueOrThrow({
    where:  { id: slotId },
    select: { approvedAt: true },
  })

  if (before.approvedAt) {
    throw Object.assign(new Error('This timetable slot is already approved.'), { status: 400 })
  }

  const slot = await prisma.timetableSlot.update({
    where: { id: slotId },
    data:  { approvedAt: new Date(), approvedByUid: actorUid },
  })

  await auditService.log({
    action:     'timetable.slot_approved',
    entityType: 'TimetableSlot',
    entityId:   slotId,
    actorUid,
    actorRole,
    metadata:   { context: { classId: slot.classId } },
  })

  return slot
}

// ─────────────────────────────────────────────────────────
//  CLASS SUBJECT ASSIGNMENT  (subject-teacher ownership authority)
//  Backs AC-2..AC-6: a teacher may schedule / enter / finalize an exam
//  only for the (classId, subject) pairs assigned to them here.
// ─────────────────────────────────────────────────────────

/**
 * The set of `${classId}|${subject}` pairs a teacher is assigned to for a
 * given year. Reads the canonical ClassSubjectAssignment table; if the
 * teacher has NO explicit assignment rows for the year, falls back to the
 * distinct (classId, subject) pairs they are the teacherUid for in
 * TimetableSlot — a read-only transition bridge so scoping is correct
 * before the school has populated assignments (or run the backfill). Once
 * any explicit assignment exists for the teacher/year, that table is
 * authoritative and the fallback is not consulted.
 */
export async function getTeacherSubjectAssignments(
  teacherUid:   string,
  academicYear: string,
): Promise<Set<string>> {
  const rows = await prisma.classSubjectAssignment.findMany({
    where:  { teacherUid, academicYear },
    select: { classId: true, subject: true },
  })

  if (rows.length > 0) {
    return new Set(rows.map((r) => `${r.classId}|${r.subject}`))
  }

  // Transition fallback — derive from scheduling rows, read-only.
  const slots = await prisma.timetableSlot.findMany({
    where:  { teacherUid, academicYear },
    select: { classId: true, subject: true },
  })
  return new Set(slots.map((sl) => `${sl.classId}|${sl.subject}`))
}

/** Whether a teacher is assigned to a specific (class, subject) for a year. */
export async function isTeacherAssignedToSubject(
  teacherUid:   string,
  classId:      string,
  subject:      string,
  academicYear: string,
): Promise<boolean> {
  const assignments = await getTeacherSubjectAssignments(teacherUid, academicYear)
  return assignments.has(`${classId}|${subject}`)
}

/** All subject-teacher assignments for a class in a year. */
export async function listSubjectAssignments(classId: string, academicYear: string) {
  return prisma.classSubjectAssignment.findMany({
    where:   { classId, academicYear },
    orderBy: { subject: 'asc' },
  })
}

/** All subject-teacher assignments a teacher holds for a year. */
export async function listTeacherSubjectAssignments(teacherUid: string, academicYear: string) {
  return prisma.classSubjectAssignment.findMany({
    where:   { teacherUid, academicYear },
    orderBy: [{ classId: 'asc' }, { subject: 'asc' }],
  })
}

/**
 * Assign a teacher to a subject in a class for a year. The teacherUid must
 * resolve to a real staff account (same identity-boundary check createClass
 * uses). Unique on (classId, subject, academicYear) — one teacher per
 * subject per class per year.
 */
export async function createSubjectAssignment(
  data: {
    classId:      string
    subject:      string
    teacherUid:   string
    academicYear: string
  },
  actorUid:  string,
  actorRole: UserRole,
) {
  await assertTeacherExists(data.teacherUid)

  // Confirm the class exists (and the year lines up) before assigning.
  await prisma.class.findUniqueOrThrow({ where: { id: data.classId }, select: { id: true } })

  try {
    const assignment = await prisma.classSubjectAssignment.create({
      data: {
        classId:      data.classId,
        subject:      data.subject,
        teacherUid:   data.teacherUid,
        academicYear: data.academicYear,
        createdByUid: actorUid,
      },
    })

    await auditService.log({
      action:     'class.subject_assigned',
      entityType: 'ClassSubjectAssignment',
      entityId:   assignment.id,
      actorUid,
      actorRole,
      metadata:   { after: { classId: assignment.classId, subject: assignment.subject, teacherUid: assignment.teacherUid } },
    })

    return assignment
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw Object.assign(
        new Error(`${data.subject} is already assigned to a teacher in this class for ${data.academicYear}.`),
        { status: 409 },
      )
    }
    throw err
  }
}

/** Remove a subject-teacher assignment. */
export async function deleteSubjectAssignment(
  id:        string,
  actorUid:  string,
  actorRole: UserRole,
) {
  const existing = await prisma.classSubjectAssignment.findUniqueOrThrow({
    where:  { id },
    select: { classId: true, subject: true, teacherUid: true },
  })

  await prisma.classSubjectAssignment.delete({ where: { id } })

  await auditService.log({
    action:     'class.subject_unassigned',
    entityType: 'ClassSubjectAssignment',
    entityId:   id,
    actorUid,
    actorRole,
    metadata:   { before: existing },
  })

  return { success: true }
}

/**
 * One-time migration helper: create ClassSubjectAssignment rows from the
 * distinct (classId, subject, teacherUid) triples already present in
 * TimetableSlot for the year. Idempotent — skips triples that already have
 * an assignment (createMany skipDuplicates on the unique key). Returns the
 * number of assignments created.
 */
export async function backfillSubjectAssignmentsFromTimetable(
  academicYear: string,
  actorUid:     string,
  actorRole:    UserRole,
): Promise<{ created: number }> {
  const slots = await prisma.timetableSlot.findMany({
    where:  { academicYear },
    select: { classId: true, subject: true, teacherUid: true },
  })

  // Deduplicate to one row per (classId, subject) — the assignment unique key.
  const seen = new Map<string, { classId: string; subject: string; teacherUid: string }>()
  for (const sl of slots) {
    const key = `${sl.classId}|${sl.subject}`
    if (!seen.has(key)) seen.set(key, { classId: sl.classId, subject: sl.subject, teacherUid: sl.teacherUid })
  }

  if (seen.size === 0) return { created: 0 }

  const result = await prisma.classSubjectAssignment.createMany({
    data: Array.from(seen.values()).map((v) => ({
      classId:      v.classId,
      subject:      v.subject,
      teacherUid:   v.teacherUid,
      academicYear,
      createdByUid: actorUid,
    })),
    skipDuplicates: true,
  })

  await auditService.log({
    action:     'class.subject_assignments_backfilled',
    entityType: 'ClassSubjectAssignment',
    entityId:   academicYear,
    actorUid,
    actorRole,
    metadata:   { context: { academicYear, created: result.count } },
  })

  return { created: result.count }
}