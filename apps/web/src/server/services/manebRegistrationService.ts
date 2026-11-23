/**
 * apps/web/src/server/services/manebRegistrationService.ts
 *
 * [PURPOSE]: The school's own record of who is registered for MANEB. Candidates register with
 *   MANEB online themselves (a teacher may help); this keeps the list in-house so that:
 *     - marks entry (ManebRecord) is only allowed for a student on the list (examService),
 *     - every student shows Registered or Not registered,
 *     - the MANEB examination number is stored once and reused by placement and graduate selection,
 *     - public statistics can say how many candidates are registered.
 *   JCE is written at the end of Form 2 and MSCE at the end of Form 4 (Term 3), so only a student in a
 *   Form 2 class can be registered for JCE and only a Form 4 student for MSCE.
 *
 *   The list can be closed (ManebListLock) once all marks are entered: after that nobody new can be
 *   registered. A candidate who already has marks cannot be withdrawn.
 */
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import * as auditService from '@/server/services/auditService'
import * as settingsService from '@/server/services/settingsService'
import { SETTING_KEYS } from '@shared/types/settings'
import type { UserRole } from '@shared/types/roles'
import type { RegisterManebCandidateInput, UpdateManebRegistrationInput } from '@shared/schemas/exam'
import { Prisma } from '@prisma/client'

export type ManebExamTypeKey = 'JCE' | 'MSCE'
export interface RegistrationActor { uid: string; role: UserRole }

/** The form that sits each exam: JCE at Form 2, MSCE at Form 4. */
export const FORM_FOR_EXAM: Record<ManebExamTypeKey, number> = { JCE: 2, MSCE: 4 }

function httpError(status: 400 | 404 | 409, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status })
}

function clean(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t ? t : null
}

function examLabel(examType: ManebExamTypeKey): string {
  return examType === 'JCE' ? 'JCE' : 'MSCE'
}

export async function isListLocked(academicYear: string, examType: ManebExamTypeKey): Promise<boolean> {
  const lock = await prisma.manebListLock.findUnique({
    where: { academicYear_examType: { academicYear, examType } },
    select: { id: true },
  })
  return Boolean(lock)
}

// ─── The board: every student who must sit, with their registration ─────────────

export interface ManebBoardRow {
  studentId:      string
  registrationNo: string
  name:           string
  className:      string
  sex:            string | null
  /** Registered | Not registered (a withdrawn candidate counts as not registered). */
  registered:     boolean
  registrationId: string | null
  withdrawn:      boolean
  withdrawnReason: string | null
  registeredVia:  'SELF' | 'SCHOOL' | null
  candidateNo:    string | null
  centerNo:       string | null
  invoiceNo:      string | null
  feePaid:        boolean
  subjects:       string[]
  notes:          string | null
  /** True once a result (marks) exists for this candidate, so the registration is fixed. */
  hasResult:      boolean
}

export interface ManebBoard {
  academicYear:   string
  examType:       ManebExamTypeKey
  form:           number
  locked:         boolean
  lockedAt:       string | null
  centreNumber:   string
  /** MANEB registration deadline from Settings (YYYY-MM-DD). */
  deadline:       string
  totals:         { students: number; registered: number; notRegistered: number; withNumber: number; feePaid: number; withResults: number }
  rows:           ManebBoardRow[]
}

export async function getBoard(academicYear: string, examType: ManebExamTypeKey): Promise<ManebBoard> {
  const form = FORM_FOR_EXAM[examType]
  const [students, registrations, lock, centreNumber, deadline] = await Promise.all([
    prisma.student.findMany({
      where: { status: 'ACTIVE', class: { form, academicYear, status: { not: 'ARCHIVED' } } },
      select: { id: true, registrationNo: true, firstName: true, lastName: true, sex: true, class: { select: { name: true } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    }),
    prisma.manebRegistration.findMany({ where: { academicYear, examType } }),
    prisma.manebListLock.findUnique({ where: { academicYear_examType: { academicYear, examType } } }),
    settingsService.get(SETTING_KEYS.EXAM_MANEB_CENTRE_NUMBER),
    settingsService.get(SETTING_KEYS.EXAM_MANEB_REG_DEADLINE),
  ])
  const byStudent = new Map(registrations.map((r) => [r.studentId, r]))
  const records = await prisma.manebRecord.findMany({
    where: { academicYear, examType, studentId: { in: students.map((s) => s.id) } },
    select: { studentId: true },
  })
  const withResult = new Set(records.map((r) => r.studentId))

  const rows: ManebBoardRow[] = students.map((s) => {
    const reg = byStudent.get(s.id)
    const withdrawn = reg?.status === 'WITHDRAWN'
    return {
      studentId: s.id,
      registrationNo: s.registrationNo,
      name: `${s.firstName} ${s.lastName}`,
      className: s.class?.name ?? '',
      sex: s.sex ?? null,
      registered: Boolean(reg) && !withdrawn,
      registrationId: reg?.id ?? null,
      withdrawn,
      withdrawnReason: reg?.withdrawnReason ?? null,
      registeredVia: reg?.registeredVia ?? null,
      candidateNo: reg?.candidateNo ?? null,
      centerNo: reg?.centerNo ?? null,
      invoiceNo: reg?.invoiceNo ?? null,
      feePaid: Boolean(reg?.feePaidAt),
      subjects: Array.isArray(reg?.subjects) ? (reg?.subjects as string[]) : [],
      notes: reg?.notes ?? null,
      hasResult: withResult.has(s.id),
    }
  })
  const registered = rows.filter((r) => r.registered)
  return {
    academicYear, examType, form,
    locked: Boolean(lock),
    lockedAt: lock?.lockedAt.toISOString() ?? null,
    centreNumber: String(centreNumber ?? ''),
    deadline: String(deadline ?? ''),
    totals: {
      students: rows.length,
      registered: registered.length,
      notRegistered: rows.length - registered.length,
      withNumber: registered.filter((r) => r.candidateNo).length,
      feePaid: registered.filter((r) => r.feePaid).length,
      withResults: registered.filter((r) => r.hasResult).length,
    },
    rows,
  }
}

// ─── Register ────────────────────────────────────────────────────────────────

async function assertEligible(studentId: string, examType: ManebExamTypeKey, academicYear: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, firstName: true, lastName: true, status: true, class: { select: { form: true, academicYear: true, name: true } } },
  })
  if (!student) throw httpError(404, 'That student does not exist.')
  const name = `${student.firstName} ${student.lastName}`
  if (student.status !== 'ACTIVE') {
    throw httpError(400, `${name} is not an active student, so cannot be registered.`)
  }
  const needForm = FORM_FOR_EXAM[examType]
  if (!student.class || student.class.form !== needForm || student.class.academicYear !== academicYear) {
    throw httpError(400, `${name} is not in a Form ${needForm} class for ${academicYear}. ${examLabel(examType)} is written by Form ${needForm} students.`)
  }
  return student
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

export async function register(input: RegisterManebCandidateInput, actor: RegistrationActor) {
  const { studentId, examType, academicYear } = input
  if (await isListLocked(academicYear, examType)) {
    throw httpError(409, `The ${examLabel(examType)} list for ${academicYear} is closed. Ask an administrator to reopen it to add a candidate.`)
  }
  const student = await assertEligible(studentId, examType, academicYear)
  const name = `${student.firstName} ${student.lastName}`

  const existing = await prisma.manebRegistration.findUnique({
    where: { studentId_academicYear_examType: { studentId, academicYear, examType } },
  })
  if (existing && existing.status === 'REGISTERED') {
    throw httpError(409, `${name} is already registered for ${examLabel(examType)} ${academicYear}.`)
  }

  const data = {
    registeredVia: input.registeredVia,
    candidateNo: clean(input.candidateNo),
    centerNo: clean(input.centerNo),
    invoiceNo: clean(input.invoiceNo),
    feePaidAt: input.feePaid ? new Date() : null,
    subjects: input.subjects,
    notes: clean(input.notes),
  }
  try {
    const row = existing
      // A withdrawn candidate who registers again reuses the same row.
      ? await prisma.manebRegistration.update({
          where: { id: existing.id },
          data: { ...data, status: 'REGISTERED', withdrawnAt: null, withdrawnReason: null },
        })
      : await prisma.manebRegistration.create({
          data: { studentId, academicYear, examType, createdById: actor.uid, ...data },
        })
    await auditService.log({
      action: 'maneb.candidate_registered', entityType: 'ManebRegistration', entityId: row.id,
      actorUid: actor.uid, actorRole: actor.role,
      metadata: { after: { studentId, examType, academicYear, registeredVia: row.registeredVia, hasCandidateNo: Boolean(row.candidateNo) } },
    })
    logger.info({ event: 'maneb.registration.create', registrationId: row.id, examType, academicYear, actorUid: actor.uid })
    return row
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw httpError(409, `The examination number ${data.candidateNo ?? ''} already belongs to another ${examLabel(examType)} candidate in ${academicYear}.`.replace('  ', ' '))
    }
    throw err
  }
}

/** Register a whole group at once (for example every student in the class). Each row stands alone. */
export async function bulkRegister(
  input: { studentIds: string[]; examType: ManebExamTypeKey; academicYear: string; registeredVia: 'SELF' | 'SCHOOL' },
  actor: RegistrationActor,
) {
  let registered = 0
  const skipped: Array<{ studentId: string; reason: string }> = []
  for (const studentId of input.studentIds) {
    try {
      await register({
        studentId, examType: input.examType, academicYear: input.academicYear,
        registeredVia: input.registeredVia, feePaid: false, subjects: [],
      }, actor)
      registered += 1
    } catch (err) {
      skipped.push({ studentId, reason: err instanceof Error ? err.message : 'Could not register.' })
    }
  }
  return { registered, skipped }
}

// ─── Update, number import, withdraw ─────────────────────────────────────────

export async function update(id: string, patch: UpdateManebRegistrationInput, actor: RegistrationActor) {
  const reg = await prisma.manebRegistration.findUnique({ where: { id } })
  if (!reg) throw httpError(404, 'That registration does not exist.')
  if (reg.status === 'WITHDRAWN') throw httpError(409, 'This candidate is withdrawn. Register them again to change details.')

  const data: Prisma.ManebRegistrationUpdateInput = {}
  if (patch.registeredVia !== undefined) data.registeredVia = patch.registeredVia
  if (patch.candidateNo !== undefined)   data.candidateNo   = clean(patch.candidateNo)
  if (patch.centerNo !== undefined)      data.centerNo      = clean(patch.centerNo)
  if (patch.invoiceNo !== undefined)     data.invoiceNo     = clean(patch.invoiceNo)
  if (patch.subjects !== undefined)      data.subjects      = patch.subjects
  if (patch.notes !== undefined)         data.notes         = clean(patch.notes)
  if (patch.feePaid !== undefined)       data.feePaidAt     = patch.feePaid ? (reg.feePaidAt ?? new Date()) : null

  try {
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.manebRegistration.update({ where: { id }, data })
      // The result row keeps the same examination number (placement reads it from there).
      if (patch.candidateNo !== undefined && updated.candidateNo) {
        await tx.manebRecord.updateMany({
          where: { studentId: reg.studentId, academicYear: reg.academicYear, examType: reg.examType },
          data: { candidateNo: updated.candidateNo, registrationId: updated.id },
        })
      }
      return updated
    })
    await auditService.log({
      action: 'maneb.registration_updated', entityType: 'ManebRegistration', entityId: id,
      actorUid: actor.uid, actorRole: actor.role,
      metadata: { context: { fields: Object.keys(data) } },
    })
    return row
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw httpError(409, 'That examination number already belongs to another candidate for this exam and year.')
    }
    throw err
  }
}

/**
 * Paste the examination numbers MANEB issued. Matches each row by the student's registration
 * number (SMS-2026-0001) to a registered candidate; rows that do not match come back as errors.
 */
export async function importCandidateNumbers(
  input: { academicYear: string; examType: ManebExamTypeKey; rows: Array<{ registrationNo: string; candidateNo: string }> },
  actor: RegistrationActor,
) {
  let updated = 0
  const errors: Array<{ registrationNo: string; error: string }> = []
  for (const row of input.rows) {
    const student = await prisma.student.findUnique({ where: { registrationNo: row.registrationNo }, select: { id: true } })
    const reg = student
      ? await prisma.manebRegistration.findUnique({
          where: { studentId_academicYear_examType: { studentId: student.id, academicYear: input.academicYear, examType: input.examType } },
          select: { id: true, status: true },
        })
      : null
    if (!reg || reg.status !== 'REGISTERED') {
      errors.push({ registrationNo: row.registrationNo, error: 'Not on the registered list for this exam and year.' })
      continue
    }
    try {
      await update(reg.id, { candidateNo: row.candidateNo }, actor)
      updated += 1
    } catch (err) {
      errors.push({ registrationNo: row.registrationNo, error: err instanceof Error ? err.message : 'Could not save.' })
    }
  }
  return { updated, errors }
}

export async function withdraw(id: string, reason: string, actor: RegistrationActor) {
  const reg = await prisma.manebRegistration.findUnique({ where: { id } })
  if (!reg) throw httpError(404, 'That registration does not exist.')
  if (reg.status === 'WITHDRAWN') throw httpError(409, 'This candidate is already withdrawn.')
  const result = await prisma.manebRecord.findFirst({
    where: { studentId: reg.studentId, academicYear: reg.academicYear, examType: reg.examType },
    select: { id: true },
  })
  if (result) {
    throw httpError(409, 'This candidate already has marks entered, so the registration cannot be withdrawn.')
  }
  const row = await prisma.manebRegistration.update({
    where: { id },
    data: { status: 'WITHDRAWN', withdrawnAt: new Date(), withdrawnReason: reason.trim() },
  })
  await auditService.log({
    action: 'maneb.candidate_withdrawn', entityType: 'ManebRegistration', entityId: id,
    actorUid: actor.uid, actorRole: actor.role,
    metadata: { context: { studentId: reg.studentId, examType: reg.examType, academicYear: reg.academicYear, reason: reason.trim() } },
  })
  return row
}

// ─── Close and reopen the list ───────────────────────────────────────────────

export async function lockList(academicYear: string, examType: ManebExamTypeKey, actor: RegistrationActor) {
  const registered = await prisma.manebRegistration.count({ where: { academicYear, examType, status: 'REGISTERED' } })
  if (registered === 0) throw httpError(400, 'Nobody is registered yet, so there is no list to close.')
  const lock = await prisma.manebListLock.upsert({
    where: { academicYear_examType: { academicYear, examType } },
    create: { academicYear, examType, lockedById: actor.uid },
    update: {},
  })
  await auditService.log({
    action: 'maneb.list_closed', entityType: 'ManebListLock', entityId: lock.id,
    actorUid: actor.uid, actorRole: actor.role,
    metadata: { context: { academicYear, examType, registered } },
  })
  return lock
}

export async function unlockList(academicYear: string, examType: ManebExamTypeKey, actor: RegistrationActor) {
  const lock = await prisma.manebListLock.findUnique({ where: { academicYear_examType: { academicYear, examType } } })
  if (!lock) throw httpError(404, 'The list is not closed.')
  await prisma.manebListLock.delete({ where: { id: lock.id } })
  await auditService.log({
    action: 'maneb.list_reopened', entityType: 'ManebListLock', entityId: lock.id,
    actorUid: actor.uid, actorRole: actor.role,
    metadata: { context: { academicYear, examType } },
  })
}

// ─── Used by other services ──────────────────────────────────────────────────

/** The live registration a result is entered against, or null when the student is not on the list. */
export async function findLiveRegistration(studentId: string, academicYear: string, examType: ManebExamTypeKey) {
  return prisma.manebRegistration.findFirst({
    where: { studentId, academicYear, examType, status: 'REGISTERED' },
  })
}

/** What a student's own screens show: registered or not, for the exam their form sits. Null for other forms. */
export async function registrationSummaryForStudent(
  studentId: string,
  cls: { form: number; academicYear: string } | null | undefined,
): Promise<{ examType: ManebExamTypeKey; academicYear: string; registered: boolean; candidateNo: string | null } | null> {
  if (!cls) return null
  const examType: ManebExamTypeKey | null = cls.form === 2 ? 'JCE' : cls.form === 4 ? 'MSCE' : null
  if (!examType) return null
  const reg = await findLiveRegistration(studentId, cls.academicYear, examType)
  return { examType, academicYear: cls.academicYear, registered: Boolean(reg), candidateNo: reg?.candidateNo ?? null }
}

/** Registered candidate counts for a year (public statistics). */
export async function countRegistered(academicYear: string): Promise<Record<ManebExamTypeKey, number>> {
  const groups = await prisma.manebRegistration.groupBy({
    by: ['examType'],
    where: { academicYear, status: 'REGISTERED' },
    _count: { _all: true },
  })
  const out: Record<ManebExamTypeKey, number> = { JCE: 0, MSCE: 0 }
  for (const g of groups) out[g.examType as ManebExamTypeKey] = g._count._all
  return out
}
