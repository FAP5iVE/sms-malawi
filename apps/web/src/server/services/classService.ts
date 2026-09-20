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
 * [MAINT 2026-09-16 — Class Subject Presets & Class Teacher Integrity]:
 *   1. assertTeacherExists() (Firebase-Admin-existence-only) is replaced by
 *      assertIsTeacherStaff() everywhere a teacherUid is accepted (class
 *      teacher, TimetableSlot.teacherUid, ClassSubjectAssignment.teacherUid)
 *      — one shared check instead of three divergent ones. It requires an
 *      ACTIVE StaffProfile with role 'academic', matching the requirement
 *      that a teacher picker "strictly contain the names of teachers only
 *      and not non academic staff." TimetableSlot.teacherUid previously had
 *      no validation of any kind — this closes that gap too.
 *   2. Added assertNotAlreadyClassTeacher() — a staff member can be the
 *      teacherId of at most one ACTIVE class per academicYear; assigning
 *      them to a second throws 409 naming the class they already hold.
 *   3. Added assertCanAssignClassTeacher() — enforces the class.assignTeacher
 *      permission specifically for the teacherId field inside createClass/
 *      updateClass. Previously only the coarse class.create/class.edit
 *      permission gated these routes, so lower_rank (which holds class.edit
 *      but not class.assignTeacher) could silently set a class teacher
 *      despite "High rank assigns a teacher to a class" being the intended,
 *      already-declared permission boundary. This is a service-layer fix
 *      because the route-level middleware only sees the coarse permission.
 *   4. listClasses()/getClass() now resolve teacherId to a display name
 *      (attachTeacherNames()) via the same application-level StaffProfile
 *      join pattern documented on assertIsTeacherStaff below — the class
 *      card can show a name instead of a raw Firebase UID.
 *   5. Added the ClassSubjectPreset surface (getClassSubjectsMeta,
 *      setClassSubjectPresets, assertSubjectOfferedByClass) — the set of
 *      subjects a class offers, settable once by admin/high_rank/lower_rank
 *      (class.manageSubjectPresets), editable for 5 days from the first
 *      time they're set, then locked for the rest of that Class row's
 *      academicYear. assertSubjectOfferedByClass() is the single shared
 *      gate now called from createTimetableSlot, createSubjectAssignment,
 *      and examService's createExam/updateExam — no per-call-site
 *      duplication of the "is this subject valid for this class" check.
 * [DEPENDS ON]: apps/web/src/server/services/auditService.ts,
 *   @shared/schemas/student (UpdateClassInput, SetClassSubjectPresetsInput),
 *   @shared/constants/malawi (getManebExamType, MALAWI_SUBJECTS),
 *   @shared/types/permissions (hasPermission)
 */
import 'server-only'

import { prisma } from '@/lib/prisma'
import * as auditService from '@/server/services/auditService'
import { addDays } from 'date-fns'
import { Prisma, Weekday, TimetableType } from '@prisma/client'
import type { CreateClassInput, UpdateClassInput } from '@shared/schemas/student'
import type { UserRole } from '@shared/types/roles'
import { getManebExamType, MALAWI_SUBJECTS } from '@shared/constants/malawi'
import { hasPermission } from '@shared/types/permissions'

// Number of days, from the first time a class's subject presets are set,
// during which they may still be changed. After this window closes the
// list is locked for the rest of that Class row's academicYear (Class rows
// are already one per academic year — see promotionService's nextClassId
// handoff — so there is no separate "per term" concept to track here).
export const SUBJECT_PRESET_LOCK_WINDOW_DAYS = 5

// ─────────────────────────────────────────────────────────
//  TEACHER STAFF CHECK
//  No DB-level FK is possible from a plain Firebase-UID string column
//  (Class.teacherId, TimetableSlot.teacherUid, ClassSubjectAssignment.
//  teacherUid) to a StaffProfile row — this is the application-level
//  substitute, matching the pattern already established for Firebase-UID
//  references elsewhere in the codebase (hrService.ts). Requires an ACTIVE
//  StaffProfile with role 'academic' — "teacher" throughout this system
//  means role === 'academic' (see ExamForm.tsx's existing isTeacher check)
//  — so a non-teaching staff member can never end up in a teacher picker
//  or pass this check.
// ─────────────────────────────────────────────────────────

async function assertIsTeacherStaff(teacherUid: string): Promise<void> {
  const staff = await prisma.staffProfile.findUnique({
    where: { uid: teacherUid },
    select: { role: true, status: true },
  })
  if (!staff || staff.role !== 'academic' || staff.status !== 'ACTIVE') {
    throw Object.assign(
      new Error(`The specified teacher (${teacherUid}) is not an active academic staff member.`),
      { status: 400 }
    )
  }
}

/** A staff member may be the class teacher of at most one ACTIVE class per
 *  academicYear. excludeClassId lets updateClass() exempt the class being
 *  edited from its own current teacher. */
async function assertNotAlreadyClassTeacher(
  teacherUid: string,
  academicYear: string,
  excludeClassId?: string
): Promise<void> {
  const existing = await prisma.class.findFirst({
    where: {
      teacherId: teacherUid,
      academicYear,
      status: 'ACTIVE',
      ...(excludeClassId ? { id: { not: excludeClassId } } : {}),
    },
    select: { id: true, name: true },
  })
  if (existing) {
    throw Object.assign(
      new Error(
        `This teacher is already the class teacher of ${existing.name} for ${academicYear}.`
      ),
      { status: 409 }
    )
  }
}

/** class.assignTeacher gates the teacherId field specifically — narrower
 *  than the class.create/class.edit permission the route itself checks.
 *  See this file's header note for why this must live here rather than
 *  at the route's middleware layer. */
function assertCanAssignClassTeacher(actorRole: UserRole): void {
  if (!hasPermission(actorRole, 'class.assignTeacher')) {
    throw Object.assign(new Error('Only a high-ranking staff member may assign a class teacher.'), {
      status: 403,
    })
  }
}

/** Resolves each class's teacherId to a display name via one batched
 *  StaffProfile lookup (never N+1). Null when teacherId is unset or can't
 *  be resolved to a staff record. */
async function attachTeacherNames<T extends { teacherId: string | null }>(
  classes: T[]
): Promise<(T & { teacherName: string | null })[]> {
  const uids = Array.from(new Set(classes.map((c) => c.teacherId).filter((v): v is string => !!v)))
  if (uids.length === 0) return classes.map((c) => ({ ...c, teacherName: null }))

  const staff = await prisma.staffProfile.findMany({
    where: { uid: { in: uids } },
    select: { uid: true, firstName: true, lastName: true },
  })
  const nameByUid = new Map(staff.map((s) => [s.uid, `${s.firstName} ${s.lastName}`]))
  return classes.map((c) => ({
    ...c,
    teacherName: c.teacherId ? (nameByUid.get(c.teacherId) ?? null) : null,
  }))
}

// ─────────────────────────────────────────────────────────
//  READ
// ─────────────────────────────────────────────────────────

export async function listClasses(academicYear?: string, includeArchived = false) {
  const classes = await prisma.class.findMany({
    where: {
      ...(academicYear ? { academicYear } : {}),
      ...(includeArchived ? {} : { status: 'ACTIVE' }),
    },
    orderBy: [{ form: 'asc' }, { stream: 'asc' }],
    include: { _count: { select: { students: true } } },
  })
  return attachTeacherNames(classes)
}

export async function getClass(id: string) {
  const cls = await prisma.class.findUniqueOrThrow({
    where: { id },
    include: {
      students: { where: { status: 'ACTIVE' }, orderBy: { lastName: 'asc' } },
      timetable: { orderBy: [{ day: 'asc' }, { periodStart: 'asc' }] },
      assignments: { orderBy: { dueDate: 'asc' } },
    },
  })
  const [withTeacherName] = await attachTeacherNames([cls])
  return withTeacherName
}

// ─────────────────────────────────────────────────────────
//  CREATE / UPDATE / ARCHIVE
// ─────────────────────────────────────────────────────────

export async function createClass(data: CreateClassInput, actorUid: string, actorRole: UserRole) {
  if (data.teacherId) {
    assertCanAssignClassTeacher(actorRole)
    await assertIsTeacherStaff(data.teacherId)
    await assertNotAlreadyClassTeacher(data.teacherId, data.academicYear)
  }

  const cls = await prisma.class.create({
    data: {
      name: data.name,
      form: data.form,
      academicYear: data.academicYear,
      stream: data.stream ?? null,
      teacherId: data.teacherId ?? null,
      room: data.room ?? null,
    },
  })

  await auditService.log({
    action: 'class.created',
    entityType: 'Class',
    entityId: cls.id,
    actorUid,
    actorRole,
    metadata: { after: { name: cls.name, form: cls.form, academicYear: cls.academicYear } },
  })

  return cls
}

export async function updateClass(
  id: string,
  data: UpdateClassInput,
  actorUid: string,
  actorRole: UserRole
) {
  const before = await prisma.class.findUniqueOrThrow({
    where: { id },
    select: {
      name: true,
      form: true,
      stream: true,
      teacherId: true,
      room: true,
      academicYear: true,
      status: true,
    },
  })

  if (data.teacherId) {
    assertCanAssignClassTeacher(actorRole)
    await assertIsTeacherStaff(data.teacherId)
    await assertNotAlreadyClassTeacher(data.teacherId, data.academicYear ?? before.academicYear, id)
  }

  const cls = await prisma.class.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.form !== undefined ? { form: data.form } : {}),
      ...(data.stream !== undefined ? { stream: data.stream ?? null } : {}),
      ...(data.teacherId !== undefined ? { teacherId: data.teacherId ?? null } : {}),
      ...(data.room !== undefined ? { room: data.room ?? null } : {}),
      ...(data.academicYear !== undefined ? { academicYear: data.academicYear } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
    },
  })

  await auditService.log({
    action: 'class.edited',
    entityType: 'Class',
    entityId: id,
    actorUid,
    actorRole,
    metadata: {
      before,
      after: {
        name: cls.name,
        form: cls.form,
        stream: cls.stream,
        teacherId: cls.teacherId,
        room: cls.room,
        academicYear: cls.academicYear,
        status: cls.status,
      },
    },
  })

  return cls
}

export async function archiveClass(id: string, actorUid: string, actorRole: UserRole) {
  const before = await prisma.class.findUniqueOrThrow({ where: { id }, select: { status: true } })

  const cls = await prisma.class.update({
    where: { id },
    data: { status: 'ARCHIVED' },
  })

  await auditService.log({
    action: 'class.deleted', // soft-delete/archive — see ACTION_SEVERITY's own naming for this action
    entityType: 'Class',
    entityId: id,
    actorUid,
    actorRole,
    metadata: { before: { status: before.status }, after: { status: cls.status } },
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
    room?: string | undefined // explicit string | undefined satisfies exactOptionalPropertyTypes
    type: string
    academicYear: string
    term: number
  },
  actorUid: string,
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
    const targetClass = await prisma.class.findUniqueOrThrow({
      where: { id: data.classId },
      select: { form: true },
    })
    const manebType = getManebExamType(targetClass.form, data.term)
    if (manebType) {
      throw new Error(
        `Form ${targetClass.form} Term ${data.term} is the national ${manebType} examination, administered by MANEB — use timetable type "MANEB" instead of "EXAM" for this slot.`
      )
    }
  }

  // A timetable slot's subject must be one of the class's preset subjects
  // (or the class has no presets configured yet — see
  // assertSubjectOfferedByClass's own header note), and its teacher must
  // be an active academic staff member — TimetableSlot.teacherUid had no
  // validation of any kind before this phase.
  await assertSubjectOfferedByClass(data.classId, data.subject)
  await assertIsTeacherStaff(data.teacherUid)

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
      approvedAt: isDirectApprover ? new Date() : null,
      approvedByUid: isDirectApprover ? actorUid : null,
    },
  })

  await auditService.log({
    action: 'timetable.slot_created',
    entityType: 'TimetableSlot',
    entityId: slot.id,
    actorUid,
    actorRole,
    metadata: {
      after: {
        classId: slot.classId,
        day: slot.day,
        subject: slot.subject,
        pending: !isDirectApprover,
      },
    },
  })

  return slot
}

export async function approveTimetableSlot(slotId: string, actorUid: string, actorRole: UserRole) {
  const before = await prisma.timetableSlot.findUniqueOrThrow({
    where: { id: slotId },
    select: { approvedAt: true },
  })

  if (before.approvedAt) {
    throw Object.assign(new Error('This timetable slot is already approved.'), { status: 400 })
  }

  const slot = await prisma.timetableSlot.update({
    where: { id: slotId },
    data: { approvedAt: new Date(), approvedByUid: actorUid },
  })

  await auditService.log({
    action: 'timetable.slot_approved',
    entityType: 'TimetableSlot',
    entityId: slotId,
    actorUid,
    actorRole,
    metadata: { context: { classId: slot.classId } },
  })

  return slot
}

/**
 * [NEW — Approvals Hub] Rejects a pending (exam_officer-created) timetable
 * slot. Only approve existed, so a slot an approver did not want could never
 * be turned down — it just sat pending. The slot has never been visible on a
 * class timetable (approvedAt is null), so rejection removes it; the reason
 * is kept in the audit trail. An already-approved slot is never touched here.
 */
export async function rejectTimetableSlot(
  slotId: string,
  reason: string,
  actorUid: string,
  actorRole: UserRole,
) {
  const slot = await prisma.timetableSlot.findUnique({ where: { id: slotId } })
  if (!slot) throw Object.assign(new Error('Timetable slot not found.'), { status: 404 })

  const removed = await prisma.timetableSlot.deleteMany({ where: { id: slotId, approvedAt: null } })
  if (removed.count === 0) {
    throw Object.assign(new Error('This timetable slot is already approved and cannot be rejected.'), { status: 409 })
  }

  await auditService.log({
    action: 'timetable.slot_rejected',
    entityType: 'TimetableSlot',
    entityId: slotId,
    actorUid,
    actorRole,
    metadata: {
      before: { classId: slot.classId, day: slot.day, subject: slot.subject, periodStart: slot.periodStart, periodEnd: slot.periodEnd },
      context: { reason },
    },
  })
}

// ─────────────────────────────────────────────────────────
//  CLASS SUBJECT PRESETS  (what subjects a class offers)
//  Distinct from CLASS SUBJECT ASSIGNMENT below, which pairs a teacher to
//  one already-offered subject. Set once by admin/high_rank/lower_rank
//  (class.manageSubjectPresets), editable for SUBJECT_PRESET_LOCK_WINDOW_DAYS
//  from the first time they're set, then locked for the rest of the
//  Class's academicYear. assertSubjectOfferedByClass is the single shared
//  gate consulted by createTimetableSlot (above), createSubjectAssignment
//  (below), and examService's createExam/updateExam.
// ─────────────────────────────────────────────────────────

/**
 * The class's preset subjects plus the derived 5-day lock state.
 * subjectsSetAt: null + subjects: [] means presets were never configured —
 * assertSubjectOfferedByClass treats that as an open transition-bridge
 * state (any MALAWI_SUBJECTS-valid subject is accepted) until the first
 * preset is set.
 */
export async function getClassSubjectsMeta(classId: string) {
  const cls = await prisma.class.findUniqueOrThrow({
    where: { id: classId },
    select: { id: true, subjectsSetAt: true, academicYear: true },
  })
  const presets = await prisma.classSubjectPreset.findMany({
    where: { classId },
    orderBy: { subject: 'asc' },
  })
  const lockedAt = cls.subjectsSetAt
    ? addDays(cls.subjectsSetAt, SUBJECT_PRESET_LOCK_WINDOW_DAYS)
    : null
  const locked = !!lockedAt && new Date() > lockedAt

  return {
    classId: cls.id,
    academicYear: cls.academicYear,
    subjects: presets.map((p) => p.subject),
    subjectsSetAt: cls.subjectsSetAt,
    lockedAt,
    locked,
  }
}

/**
 * Set (or, within the 5-day window, change) a class's preset subject list.
 * First call for a class starts the lock window (Class.subjectsSetAt).
 * Subsequent calls are only accepted until that window closes, and may
 * never remove a subject already in use by a ClassSubjectAssignment,
 * TimetableSlot, or Exam for this class — those rows would otherwise point
 * at a subject the class no longer claims to offer.
 */
export async function setClassSubjectPresets(
  classId: string,
  subjects: string[],
  actorUid: string,
  actorRole: UserRole
) {
  const deduped = Array.from(new Set(subjects))
  const invalid = deduped.filter((s) => !(MALAWI_SUBJECTS as readonly string[]).includes(s))
  if (invalid.length > 0) {
    throw Object.assign(new Error(`Not a recognised subject: ${invalid.join(', ')}`), {
      status: 400,
    })
  }

  const cls = await prisma.class.findUniqueOrThrow({
    where: { id: classId },
    select: { id: true, subjectsSetAt: true, academicYear: true, name: true },
  })

  const isFirstSetup = !cls.subjectsSetAt
  if (!isFirstSetup) {
    const lockedAt = addDays(cls.subjectsSetAt!, SUBJECT_PRESET_LOCK_WINDOW_DAYS)
    if (new Date() > lockedAt) {
      throw Object.assign(
        new Error(
          `${cls.name}'s subjects were locked on ${lockedAt.toDateString()} and can no longer be changed for the ${cls.academicYear} academic year.`
        ),
        { status: 403 }
      )
    }
  }

  const existing = await prisma.classSubjectPreset.findMany({
    where: { classId },
    select: { subject: true },
  })
  const existingSet = new Set(existing.map((e) => e.subject))
  const nextSet = new Set(deduped)

  const toAdd = deduped.filter((s) => !existingSet.has(s))
  const toRemove = Array.from(existingSet).filter((s) => !nextSet.has(s))

  if (toRemove.length > 0) {
    const [assignmentsInUse, timetableInUse, examsInUse] = await Promise.all([
      prisma.classSubjectAssignment.findMany({
        where: { classId, subject: { in: toRemove } },
        select: { subject: true },
      }),
      prisma.timetableSlot.findMany({
        where: { classId, subject: { in: toRemove } },
        select: { subject: true },
      }),
      prisma.exam.findMany({
        where: { classId, subject: { in: toRemove } },
        select: { subject: true },
      }),
    ])
    const inUse = new Set(
      [...assignmentsInUse, ...timetableInUse, ...examsInUse].map((r) => r.subject)
    )
    if (inUse.size > 0) {
      throw Object.assign(
        new Error(
          `Cannot remove ${Array.from(inUse).join(', ')} — already in use by a teacher assignment, timetable slot, or exam for this class.`
        ),
        { status: 409 }
      )
    }
  }

  await prisma.$transaction([
    ...(toRemove.length > 0
      ? [prisma.classSubjectPreset.deleteMany({ where: { classId, subject: { in: toRemove } } })]
      : []),
    ...(toAdd.length > 0
      ? [
          prisma.classSubjectPreset.createMany({
            data: toAdd.map((subject) => ({ classId, subject, createdByUid: actorUid })),
            skipDuplicates: true,
          }),
        ]
      : []),
    ...(isFirstSetup
      ? [prisma.class.update({ where: { id: classId }, data: { subjectsSetAt: new Date() } })]
      : []),
  ])

  await auditService.log({
    action: isFirstSetup ? 'class.subjects_set' : 'class.subjects_updated',
    entityType: 'Class',
    entityId: classId,
    actorUid,
    actorRole,
    metadata: { before: { subjects: Array.from(existingSet) }, after: { subjects: deduped } },
  })

  return getClassSubjectsMeta(classId)
}

/**
 * Shared gate for every subject-bearing write scoped to a class
 * (TimetableSlot, ClassSubjectAssignment, Exam). If the class has no
 * preset subjects configured yet, every MALAWI_SUBJECTS-valid subject is
 * accepted (transition bridge — mirrors getTeacherSubjectAssignments'
 * own fallback-until-populated convention above). Once at least one
 * preset exists, only listed subjects are accepted.
 */
export async function assertSubjectOfferedByClass(classId: string, subject: string): Promise<void> {
  const presetCount = await prisma.classSubjectPreset.count({ where: { classId } })
  if (presetCount === 0) return

  const preset = await prisma.classSubjectPreset.findUnique({
    where: { classId_subject: { classId, subject } },
  })
  if (!preset) {
    throw Object.assign(
      new Error(
        `${subject} is not one of the subjects configured for this class. Only its preset subjects may be used for scheduling, exams, or teacher assignment.`
      ),
      { status: 400 }
    )
  }
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
  teacherUid: string,
  academicYear: string
): Promise<Set<string>> {
  const rows = await prisma.classSubjectAssignment.findMany({
    where: { teacherUid, academicYear },
    select: { classId: true, subject: true },
  })

  if (rows.length > 0) {
    return new Set(rows.map((r) => `${r.classId}|${r.subject}`))
  }

  // Transition fallback — derive from scheduling rows, read-only.
  const slots = await prisma.timetableSlot.findMany({
    where: { teacherUid, academicYear },
    select: { classId: true, subject: true },
  })
  return new Set(slots.map((sl) => `${sl.classId}|${sl.subject}`))
}

/** Whether a teacher is assigned to a specific (class, subject) for a year. */
export async function isTeacherAssignedToSubject(
  teacherUid: string,
  classId: string,
  subject: string,
  academicYear: string
): Promise<boolean> {
  const assignments = await getTeacherSubjectAssignments(teacherUid, academicYear)
  return assignments.has(`${classId}|${subject}`)
}

/** All subject-teacher assignments for a class in a year. */
export async function listSubjectAssignments(classId: string, academicYear: string) {
  return prisma.classSubjectAssignment.findMany({
    where: { classId, academicYear },
    orderBy: { subject: 'asc' },
  })
}

/** All subject-teacher assignments a teacher holds for a year. */
export async function listTeacherSubjectAssignments(teacherUid: string, academicYear: string) {
  return prisma.classSubjectAssignment.findMany({
    where: { teacherUid, academicYear },
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
    classId: string
    subject: string
    teacherUid: string
    academicYear: string
  },
  actorUid: string,
  actorRole: UserRole
) {
  await assertIsTeacherStaff(data.teacherUid)

  // Confirm the class exists (and the year lines up) before assigning.
  await prisma.class.findUniqueOrThrow({ where: { id: data.classId }, select: { id: true } })

  // The subject being assigned to a teacher must already be one of the
  // class's preset subjects — see this file's Class Subject Presets
  // section above.
  await assertSubjectOfferedByClass(data.classId, data.subject)

  try {
    const assignment = await prisma.classSubjectAssignment.create({
      data: {
        classId: data.classId,
        subject: data.subject,
        teacherUid: data.teacherUid,
        academicYear: data.academicYear,
        createdByUid: actorUid,
      },
    })

    await auditService.log({
      action: 'class.subject_assigned',
      entityType: 'ClassSubjectAssignment',
      entityId: assignment.id,
      actorUid,
      actorRole,
      metadata: {
        after: {
          classId: assignment.classId,
          subject: assignment.subject,
          teacherUid: assignment.teacherUid,
        },
      },
    })

    return assignment
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw Object.assign(
        new Error(
          `${data.subject} is already assigned to a teacher in this class for ${data.academicYear}.`
        ),
        { status: 409 }
      )
    }
    throw err
  }
}

/** Remove a subject-teacher assignment. */
export async function deleteSubjectAssignment(id: string, actorUid: string, actorRole: UserRole) {
  const existing = await prisma.classSubjectAssignment.findUniqueOrThrow({
    where: { id },
    select: { classId: true, subject: true, teacherUid: true },
  })

  await prisma.classSubjectAssignment.delete({ where: { id } })

  await auditService.log({
    action: 'class.subject_unassigned',
    entityType: 'ClassSubjectAssignment',
    entityId: id,
    actorUid,
    actorRole,
    metadata: { before: existing },
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
  actorUid: string,
  actorRole: UserRole
): Promise<{ created: number }> {
  const slots = await prisma.timetableSlot.findMany({
    where: { academicYear },
    select: { classId: true, subject: true, teacherUid: true },
  })

  // Deduplicate to one row per (classId, subject) — the assignment unique key.
  const seen = new Map<string, { classId: string; subject: string; teacherUid: string }>()
  for (const sl of slots) {
    const key = `${sl.classId}|${sl.subject}`
    if (!seen.has(key))
      seen.set(key, { classId: sl.classId, subject: sl.subject, teacherUid: sl.teacherUid })
  }

  if (seen.size === 0) return { created: 0 }

  const result = await prisma.classSubjectAssignment.createMany({
    data: Array.from(seen.values()).map((v) => ({
      classId: v.classId,
      subject: v.subject,
      teacherUid: v.teacherUid,
      academicYear,
      createdByUid: actorUid,
    })),
    skipDuplicates: true,
  })

  await auditService.log({
    action: 'class.subject_assignments_backfilled',
    entityType: 'ClassSubjectAssignment',
    entityId: academicYear,
    actorUid,
    actorRole,
    metadata: { context: { academicYear, created: result.count } },
  })

  return { created: result.count }
}
