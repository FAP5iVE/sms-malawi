/*
 * apps/web/src/server/services/hrService.ts
 *
 * [CHANGE TYPE]: TARGETED EDIT, three fixes (below) plus one carried over
 *   from R10
 * [R-PHASE]: R11 — HR Domain: Loans UI, Leave-Conflict Wiring & Directory
 *   Access Correction (previously R10 — Finance II)
 * [PURPOSE]:
 *   1. reviewLeave(): now calls leaveConflictService.checkLeaveConflicts()
 *      before persisting an APPROVED transition (matching that
 *      function's own header comment describing exactly this intended
 *      call site — a fully-built, multi-factor conflict engine ran for
 *      no one before this fix) and returns the full ConflictCheckResult
 *      on the response as `conflictResult` for LeaveConflictWarning.tsx
 *      to render (that component's props require
 *      hasBlockingConflicts/hasWarnings alongside the conflicts list,
 *      not just the array). Conflicts are surfaced, not blocking, per
 *      this phase's explicit design decision — the approval still
 *      proceeds regardless of severity.
 *   2. reviewLeave(): now calls notificationService.sendLeaveUpdate()
 *      after the status change is persisted, so staff are actually
 *      emailed when their leave is approved or rejected — the fourth
 *      confirmed instance in this audit of a correctly-wired
 *      notification pipeline with zero business-logic caller.
 *   3. getContractExpiryAlert(daysAhead): replaced the overlapping-range
 *      query (`gte: today, lte: today + daysAhead`) with exact-day
 *      matching — today any staff member expiring within 7 days matched
 *      all three of contractExpiryJob.ts's sequential
 *      daysAhead=7,30,60 calls and received up to three duplicate emails
 *      every day until expiry; each call now targets a single distinct
 *      day, so a given contractExpiry date can match at most one of the
 *      three.
 *   4. uploadStaffPhoto() — flagged in R10 as belonging to this phase:
 *      fixed the same StorageBucket-passed-where-FilePrefix-expected /
 *      UploadResult-object-returned-as-string defect R10 fixed in
 *      receiptService.ts and reportExportService.ts. Repointed at
 *      FILE_PREFIX.STAFF_PHOTO and now returns `.fileId`.
 *   Added `import 'server-only'`.
 *
 *   [POST-R11, user-requested follow-up beyond the roadmap's literal
 *   scope]: two gaps identified while reviewing the shipped Loans tab —
 *   5. disburseLoan() now writes the loan's monthlyDeduction into
 *      SalaryStructure.monthlyLoanDeduction (warns, does not fabricate a
 *      salary record, if the staff member has no SalaryStructure yet),
 *      and recordLoanRepayment() resets it to 0 once a loan is SETTLED.
 *      Previously these two fields were entirely disconnected: a
 *      disbursed loan never caused payroll to deduct anything.
 *   6. getMyLoans(uid) is new — a staff member who submits a loan
 *      request had no way to check its status afterward.
 * [DEPENDS ON]: leaveConflictService.ts (this phase's own rewrite — see
 *   its header for the additional bugs discovered and fixed there),
 *   notificationService.sendLeaveUpdate() (existing), SETTING_KEYS
 *   (unrelated to this file directly, transitively via
 *   leaveConflictService.ts). payrollService.ts (POST-R11) now calls
 *   recordLoanRepayment() after each monthly run.
 *
 * [MAINT 2026-09-16 — Class Subject Presets / Teacher Roster]: listStaff()
 *   gained a `role` filter, reusing the existing query/select shape rather
 *   than a second staff-listing function — backs the new GET
 *   /hr/teacher-roster (role: 'academic', status: 'ACTIVE'), the searchable
 *   staff picker classService.assertIsTeacherStaff's name-based UIs (class
 *   teacher, timetable slot teacher) now use instead of a free-text
 *   Firebase-UID field.
 */
import 'server-only'
import * as admin from 'firebase-admin'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { sendEmail, getSchoolDisplayName } from '@/lib/email'
import { generateTempPassword } from '@/lib/tempPassword'
import { addDays, startOfDay, endOfDay } from 'date-fns'
import * as auditService from '@/server/services/auditService'
import { assertNotSelfReview } from '@/server/lib/selfReview'

function getAuth() { return admin.auth() }
import type {
  CreateStaffInput, UpdateStaffInput, LeaveRequestInput, ReviewLeaveInput,
  LoanRequestInput, PerformanceNoteInput, UpdateSalaryInput, CreateAllowanceInput
} from '@shared/schemas/hr'
import type { LeaveType, Prisma, StaffRole } from '@prisma/client'
import { getRetirementInfo, type RetirementInfo } from '@shared/utils/retirement'
import type { TerminateStaffInput, StaffResponsibilityInput, UpdateOwnDetailsInput } from '@shared/schemas/hr'
import { contractExpiryRequired, CONTRACT_EXPIRY_REQUIRED_MESSAGE } from '@shared/schemas/hr'
import { qualificationNeedsProgram } from '@shared/constants/malawi/demographics'
import { idNumberParts, nextIdSequence, formatIdNumber } from '@shared/constants/malawi/registration'
import * as algolia from '@/server/services/algoliaService'
import { checkLeaveConflicts, type ConflictCheckResult } from '@/server/services/leaveConflictService'
import * as notificationService from '@/server/services/notificationService'
import * as settingsService from '@/server/services/settingsService'
import { SETTING_KEYS, LEAVE_TYPES, LEAVE_TYPE_LABELS, LEAVE_TYPE_SEX } from '@shared/types/settings'
import type { LeaveTypeKey, LeavePayPercent } from '@shared/types/settings'
import type { ApiLeaveOption, ApiOnLeaveNow } from '@shared/types/api'
import {
  toUtcDay, toDayString, isWeekendDay, countLeaveDays, nextWorkingDay,
  splitLeavePay, proRatedEntitlement, todayInMalawi,
} from '@shared/utils/leave'
  
// ─── STAFF PROFILES ─────────────────────────────────────
export async function listStaff(filters: {
  department?: string; jobTitle?: string; status?: string; search?: string; role?: string
} = {}) {
  await ensureLeaveStatusesFresh()
  const where:  Prisma.StaffProfileWhereInput = {}
  if (filters.department) where.department = filters.department
  if (filters.jobTitle) where.jobTitle = filters.jobTitle
  if (filters.status) where.status = filters.status as 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'TERMINATED'
  // [NEW 2026-09-16 — Class Subject Presets / Teacher Roster] role filter —
  // backs GET /hr/teacher-roster's role: 'academic' query, reusing this
  // function rather than a second staff-listing query.
  if (filters.role) where.role = filters.role as StaffRole
  if (filters.search) {
    where.OR = [
      { firstName: { contains: filters.search, mode: 'insensitive' } },
      { lastName:  { contains: filters.search, mode: 'insensitive' } },
      { employeeNo:{ contains: filters.search, mode: 'insensitive' } },
    ]
  }
  return prisma.staffProfile.findMany({
    where,
    orderBy: [{ department: 'asc' }, { lastName: 'asc' }],
    select: {
      id: true, uid: true, employeeNo: true, firstName: true, lastName: true, sex: true,
      role: true, department: true, jobTitle: true, status: true,
      employmentType: true, contractExpiry: true, photoKey: true, dateJoined: true,
    },
  })
}

/**
 * Minimal, non-sensitive staff list for "pick a person" controls — see
 * GET /hr/staff-picker in hr.ts. Includes ACTIVE and ON_LEAVE staff (a person
 * on leave can still be custodian of equipment); excludes SUSPENDED and
 * TERMINATED. Returns only what a picker displays and searches on.
 */
export async function listStaffForPicker() {
  return prisma.staffProfile.findMany({
    where: { status: { in: ['ACTIVE', 'ON_LEAVE'] } },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: {
      id: true, employeeNo: true, firstName: true, lastName: true,
      department: true, jobTitle: true,
    },
  })
}

/** '' from a form means "clear it": store null. */
function blankToNull(v: string | null | undefined): string | null {
  if (v == null) return null
  const t = v.trim()
  return t === '' ? null : t
}

/** Staff NRB numbers are unique but optional; fail with a clear 409, not a raw constraint error. */
async function assertStaffNrbAvailable(nrbNumber: string | null, excludeId?: string): Promise<void> {
  if (!nrbNumber) return
  const clash = await prisma.staffProfile.findFirst({
    where:  { nrbNumber, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { employeeNo: true },
  })
  if (clash) {
    throw Object.assign(
      new Error(`That NRB number is already recorded for staff member ${clash.employeeNo}.`),
      { status: 409 },
    )
  }
}

/**
 * Retirement date = date of birth + the school's retirement age (a setting,
 * default 60). Computed on read, never stored, so changing the setting moves
 * every staff member's date. Null when no date of birth is on file.
 */
async function buildRetirement(dateOfBirth: Date | null): Promise<RetirementInfo | null> {
  if (!dateOfBirth) return null
  const retirementAge = await settingsService.get(SETTING_KEYS.HR_RETIREMENT_AGE)
  return getRetirementInfo(dateOfBirth, retirementAge)
}

/** The staff fields that only roles holding hr.viewStaffSensitive may see. */
const STAFF_SENSITIVE_FIELDS = [
  'dateOfBirth', 'nationality', 'homeDistrict', 'nrbNumber', 'tpin',
  'nextOfKinName', 'nextOfKinPhone', 'nextOfKinRelation', 'retirement',
  'payrollNo', 'tcmRegistrationNo', 'tcmLicenceNo', 'tcmLicenceExpiry',
  'highestQualification', 'qualificationProgram', 'trainingRoute',
  'exitReason', 'exitDate',
] as const

/**
 * Removes identity, next-of-kin and retirement data from a staff profile for a
 * caller without hr.viewStaffSensitive. The HR profile route is already limited
 * to admin / hr / high_rank (all of whom hold it); this keeps the rule in the
 * data layer too, so widening a route later can't quietly widen who sees it.
 */
export function redactStaffSensitive<T extends Record<string, unknown>>(profile: T): Omit<T, (typeof STAFF_SENSITIVE_FIELDS)[number]> {
  const copy: Record<string, unknown> = { ...profile }
  for (const field of STAFF_SENSITIVE_FIELDS) delete copy[field]
  return copy as Omit<T, (typeof STAFF_SENSITIVE_FIELDS)[number]>
}

export async function getStaffProfile(id: string) {
  // Balances for this year exist and match today's settings before they are shown.
  await refreshLeaveBalances({ staffId: id }).catch((err) => logger.error({ event: 'leave.balance_refresh_failed', err }))
  const profile = await prisma.staffProfile.findUniqueOrThrow({
    where: { id },
    include: {
      leaveBalances: { where: { year: todayInMalawi().getUTCFullYear() }, orderBy: { leaveType: 'asc' } },
      leaveRequests: { orderBy: { createdAt: 'desc' }, take: 10 },
      loans: { where: { status: { in: ['APPROVED','DISBURSED','REPAYING'] } } },
      performanceNotes: { orderBy: { createdAt: 'desc' }, take: 5 },
      qualifiedSubjects: { orderBy: { subject: 'asc' }, select: { subject: true } },
      responsibilities: { orderBy: [{ endDate: { sort: 'asc', nulls: 'first' } }, { startDate: 'desc' }] },
    },
  })
  return { ...profile, retirement: await buildRetirement(profile.dateOfBirth) }
}

// [PRODUCTION FIX] Salary was never actually settable anywhere — see this
// function's route in hr.ts for the full account of what was missing.
// SalaryStructure has no Prisma relation back to StaffProfile (it's keyed
// by staffUid, a plain Firebase UID string — matching how
// payrollService.ts already reads it), so this resolves id -> uid first,
// same pattern as the loan functions below.
export async function getSalaryStructure(id: string) {
  const staff = await prisma.staffProfile.findUniqueOrThrow({ where: { id }, select: { uid: true } })
  return prisma.salaryStructure.findUnique({ where: { staffUid: staff.uid } })
}

export async function upsertSalaryStructure(id: string, data: UpdateSalaryInput, actorUid: string, actorRole: string) {
  const staff = await prisma.staffProfile.findUniqueOrThrow({ where: { id }, select: { uid: true } })
  const result = await prisma.salaryStructure.upsert({
    where:  { staffUid: staff.uid },
    update: { baseSalary: data.baseSalary },
    create: { staffUid: staff.uid, baseSalary: data.baseSalary },
  })
  await auditService.log({
    action:     'hr.salary.upsert',
    entityType: 'SalaryStructure',
    entityId:   result.id,
    actorUid,
    actorRole,
    metadata:   { context: { staffId: id, baseSalary: data.baseSalary } },
  })
  return result
}

// [PRODUCTION FIX] Itemized allowances — see StaffAllowance in
// schema.prisma and CreateAllowanceSchema for the full reasoning. These
// three functions are the entire CRUD surface for them; payrollService.ts
// reads listAllowances-equivalent logic directly (a slightly different
// query — recurring OR matching the specific run's month/year) to compute
// each month's gross.
export async function listAllowances(id: string) {
  const staff = await prisma.staffProfile.findUniqueOrThrow({ where: { id }, select: { uid: true } })
  return prisma.staffAllowance.findMany({
    where: { staffUid: staff.uid },
    orderBy: [{ recurring: 'desc' }, { createdAt: 'desc' }],
  })
}

export async function addAllowance(id: string, data: CreateAllowanceInput, actorUid: string, actorRole: string) {
  const staff = await prisma.staffProfile.findUniqueOrThrow({ where: { id }, select: { uid: true } })
  const result = await prisma.staffAllowance.create({
    data: {
      staffUid:     staff.uid,
      type:         data.type,
      amount:       data.amount,
      recurring:    data.recurring,
      paidMonth:    data.recurring ? null : data.paidMonth,
      paidYear:     data.recurring ? null : data.paidYear,
      notes:        data.notes,
      createdByUid: actorUid,
    },
  })
  await auditService.log({
    action: 'hr.allowance.create', entityType: 'StaffAllowance', entityId: result.id,
    actorUid, actorRole, metadata: { context: { staffId: id, type: data.type, amount: data.amount, recurring: data.recurring } },
  })
  return result
}

export async function deleteAllowance(allowanceId: string, actorUid: string, actorRole: string) {
  await prisma.staffAllowance.delete({ where: { id: allowanceId } })
  await auditService.log({
    action: 'hr.allowance.delete', entityType: 'StaffAllowance', entityId: allowanceId, actorUid, actorRole,
  })
}

// General "edit staff details" update — deliberately scoped to the same
// fields UpdateStaffSchema allows (see that schema's own comment): no
// employeeNo, role, or status. Role changes and status/termination changes
// carry their own, more sensitive permissions (hr.assignRole,
// hr.terminateStaff) and are not handled by this function.
export async function updateStaff(
  id: string,
  input: UpdateStaffInput,
  actor?: { uid: string; role: string },
) {
  const before = await prisma.staffProfile.findUnique({ where: { id } })
  if (!before) {
    throw Object.assign(new Error('Staff member not found.'), { status: 404 })
  }

  const updateData: Prisma.StaffProfileUncheckedUpdateInput = {}
  if (input.firstName         !== undefined) updateData.firstName         = input.firstName
  if (input.lastName          !== undefined) updateData.lastName          = input.lastName
  if (input.sex               !== undefined) updateData.sex               = input.sex
  if (input.email             !== undefined) updateData.email             = input.email
  if (input.phone             !== undefined) updateData.phone             = input.phone
  if (input.department        !== undefined) updateData.department        = input.department
  if (input.jobTitle          !== undefined) updateData.jobTitle          = input.jobTitle
  if (input.employmentType    !== undefined) updateData.employmentType    = input.employmentType
  // Full-time staff are employed indefinitely: no end date is kept for them.
  // Every other type must end up with one, whether it arrives in this edit or is
  // already on file. Only checked when the edit touches either field, so an
  // unrelated edit never trips over an older record.
  if (input.employmentType === 'FULL_TIME') {
    updateData.contractExpiry = null
  } else if (input.contractExpiry !== undefined) {
    updateData.contractExpiry = input.contractExpiry ? new Date(input.contractExpiry) : null
  }
  if (input.employmentType !== undefined || input.contractExpiry !== undefined) {
    const finalType   = input.employmentType ?? before.employmentType
    const finalExpiry = updateData.contractExpiry !== undefined ? updateData.contractExpiry : before.contractExpiry
    if (contractExpiryRequired(finalType) && !finalExpiry) {
      throw Object.assign(new Error(CONTRACT_EXPIRY_REQUIRED_MESSAGE), { status: 400 })
    }
  }

  // Identity fields ('' clears). Names of changed fields go to the audit log,
  // never their values (NRB / TPIN / date of birth are identity data).
  const identityChanged: string[] = []
  if (input.dateOfBirth       !== undefined) { updateData.dateOfBirth       = input.dateOfBirth ? new Date(input.dateOfBirth) : null; identityChanged.push('dateOfBirth') }
  if (input.nationality       !== undefined) { updateData.nationality       = blankToNull(input.nationality);       identityChanged.push('nationality') }
  if (input.homeDistrict      !== undefined) { updateData.homeDistrict      = blankToNull(input.homeDistrict);      identityChanged.push('homeDistrict') }
  if (input.nrbNumber         !== undefined) { updateData.nrbNumber         = blankToNull(input.nrbNumber);         identityChanged.push('nrbNumber') }
  if (input.tpin              !== undefined) { updateData.tpin              = blankToNull(input.tpin);              identityChanged.push('tpin') }
  if (input.nextOfKinName     !== undefined) { updateData.nextOfKinName     = blankToNull(input.nextOfKinName);     identityChanged.push('nextOfKinName') }
  if (input.nextOfKinPhone    !== undefined) { updateData.nextOfKinPhone    = blankToNull(input.nextOfKinPhone);    identityChanged.push('nextOfKinPhone') }
  if (input.nextOfKinRelation !== undefined) { updateData.nextOfKinRelation = blankToNull(input.nextOfKinRelation); identityChanged.push('nextOfKinRelation') }

  if (updateData.nrbNumber !== undefined) {
    await assertStaffNrbAvailable(updateData.nrbNumber as string | null, id)
  }

  // Teaching / licensing / qualifications / housing. Enum selects send '' for
  // "not set", which clears the column.
  const complianceChanged: string[] = []
  const enumOrNull = <T extends string>(v: T | '' | undefined): T | null => (v ? v : null)
  if (input.isTeaching           !== undefined) { updateData.isTeaching           = input.isTeaching;                          complianceChanged.push('isTeaching') }
  if (input.tcmRegistrationNo    !== undefined) { updateData.tcmRegistrationNo    = blankToNull(input.tcmRegistrationNo);      complianceChanged.push('tcmRegistrationNo') }
  if (input.tcmLicenceNo         !== undefined) { updateData.tcmLicenceNo         = blankToNull(input.tcmLicenceNo);           complianceChanged.push('tcmLicenceNo') }
  if (input.tcmLicenceExpiry     !== undefined) { updateData.tcmLicenceExpiry     = input.tcmLicenceExpiry ? new Date(input.tcmLicenceExpiry) : null; complianceChanged.push('tcmLicenceExpiry') }
  if (input.employmentCategory   !== undefined) { updateData.employmentCategory   = enumOrNull(input.employmentCategory);     complianceChanged.push('employmentCategory') }
  if (input.payrollNo            !== undefined) { updateData.payrollNo            = blankToNull(input.payrollNo);              complianceChanged.push('payrollNo') }
  if (input.highestQualification !== undefined) { updateData.highestQualification = enumOrNull(input.highestQualification);   complianceChanged.push('highestQualification') }
  if (input.qualificationProgram !== undefined) { updateData.qualificationProgram = blankToNull(input.qualificationProgram);   complianceChanged.push('qualificationProgram') }
  if (input.trainingRoute        !== undefined) { updateData.trainingRoute        = enumOrNull(input.trainingRoute);           complianceChanged.push('trainingRoute') }

  // The programme studied only exists for a diploma or a degree: any other
  // highest qualification clears it.
  if (input.highestQualification !== undefined && !qualificationNeedsProgram(input.highestQualification)) {
    updateData.qualificationProgram = null
  }

  // Teaching details belong to teaching staff only. Marking someone as not
  // teaching clears the licence, training route and qualified subjects.
  const clearTeaching = input.isTeaching === false
  if (clearTeaching) {
    updateData.tcmRegistrationNo = null
    updateData.tcmLicenceNo      = null
    updateData.tcmLicenceExpiry  = null
    updateData.trainingRoute     = null
  }

  const updated = await prisma.staffProfile.update({
    where: { id },
    data:  updateData,
  })

  // Subjects the teacher is qualified to teach: replace the whole set.
  if (input.qualifiedSubjects !== undefined || clearTeaching) {
    const subjects = clearTeaching ? [] : [...new Set(input.qualifiedSubjects ?? [])]
    await prisma.$transaction([
      prisma.staffQualifiedSubject.deleteMany({ where: { staffId: id } }),
      prisma.staffQualifiedSubject.createMany({ data: subjects.map((subject) => ({ staffId: id, subject })) }),
    ])
    complianceChanged.push('qualifiedSubjects')
  }

  if (complianceChanged.length > 0 && actor) {
    await auditService.log({
      action:     'hr.staff_compliance_edited',
      entityType: 'StaffProfile',
      entityId:   id,
      actorUid:   actor.uid,
      actorRole:  actor.role,
      metadata:   { context: { fieldsChanged: complianceChanged } },
    })
  }

  if (identityChanged.length > 0 && actor) {
    await auditService.log({
      action:     'hr.staff_identity_edited',
      entityType: 'StaffProfile',
      entityId:   id,
      actorUid:   actor.uid,
      actorRole:  actor.role,
      metadata:   { context: { fieldsChanged: identityChanged } },
    })
  }

  // Keep the Firebase Auth display name in step if either name field
  // changed — createStaff sets displayName from firstName+lastName at
  // creation, so an edit that changes either should carry through.
  if (input.firstName !== undefined || input.lastName !== undefined) {
    try {
      await getAuth().updateUser(updated.uid, {
        displayName: `${updated.firstName} ${updated.lastName}`,
      })
    } catch (err) {
      logger.error({ err, uid: updated.uid }, '[hrService.updateStaff] failed to sync Firebase displayName')
    }
  }

  void algolia.updateStaff({
    objectID:       updated.id,
    firstName:      updated.firstName,
    lastName:       updated.lastName,
    fullName:       `${updated.firstName} ${updated.lastName}`,
    department:     updated.department,
    email:          updated.email ?? null,
    // [ALGOLIA ROLLOUT — Tier 1 item 4] previously omitted — see the note
    // on AlgoliaStaff in algoliaService.ts.
    jobTitle:       updated.jobTitle,
    employmentType: updated.employmentType,
    contractExpiry: updated.contractExpiry ? updated.contractExpiry.toISOString() : null,
    dateJoined:     updated.dateJoined.toISOString(),
  })

  return getStaffProfile(id)
}

// ─── EMPLOYEE NUMBER GENERATOR ───────────────────────────
// The layout comes from Settings → ID numbers (HR_EMPLOYEE_NO_FORMAT, default
// EMP-{YYYY}-0000). The last run of zeros is the running number; {YYYY} / {YY}
// are the year the staff member is created. Numbers already issued keep their
// value; only new staff follow a changed layout. The next number is one more
// than the highest already issued in the current layout. Two people created at
// the same moment can read the same "highest", so a clash on the unique
// employeeNo column recomputes and retries (same approach as the student
// registration number in studentService).
const EMPLOYEE_NO_MAX_ATTEMPTS = 5

async function nextEmployeeNo(): Promise<string> {
  const format = await settingsService.get(SETTING_KEYS.HR_EMPLOYEE_NO_FORMAT)
  const parts  = idNumberParts(format)
  const issued = await prisma.staffProfile.findMany({
    where: {
      employeeNo: {
        startsWith: parts.prefix,
        ...(parts.suffix ? { endsWith: parts.suffix } : {}),
      },
    },
    select: { employeeNo: true },
  })
  return formatIdNumber(format, nextIdSequence(issued.map((s) => s.employeeNo), parts))
}

async function createWithNextEmployeeNo<T>(create: (employeeNo: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const employeeNo = await nextEmployeeNo()
    try {
      return await create(employeeNo)
    } catch (err) {
      const e = err as { code?: string; meta?: { target?: unknown } }
      const employeeNoClash = e?.code === 'P2002' && String(e.meta?.target ?? '').includes('employeeNo')
      if (!employeeNoClash || attempt >= EMPLOYEE_NO_MAX_ATTEMPTS - 1) throw err
      logger.warn({ event: 'hrService.employeeNo_collision', attempt: attempt + 1, employeeNo }, '[hrService] Employee number collision — retrying')
    }
  }
}

// Creating a staff member now provisions their login end-to-end, mirroring
// the student-conversion flow (studentService.ts): a Firebase Auth account is
// created, the role/subtitle/requiresPasswordChange claims are set, the real
// Auth UID is written onto StaffProfile.uid (so every self-service HR lookup
// keyed on req.user.uid resolves), and a welcome email with a generated temp
// password is sent. Previously this function created a bare StaffProfile row
// with a form-supplied placeholder uid, no login, and no claims — which is
// why a created staff member could neither sign in nor request a loan/leave.
//
// Ordering & failure handling (matches studentService's pattern): the Auth
// account is created FIRST (we need its uid to store on the profile). If the
// subsequent Prisma writes fail, the just-created Auth account is deleted so
// we never leave an orphaned login with no profile behind it. The welcome
// email is best-effort and sent LAST — a mail failure does not roll back a
// successfully-created staff member (the admin/HR user still sees the temp
// password in the create response and can relay it manually).
export async function createStaff(data: CreateStaffInput, actorUid: string) {
  // Reject a duplicate NRB before provisioning a login, so it can't orphan one.
  await assertStaffNrbAvailable(blankToNull(data.nrbNumber))

  const tempPassword = generateTempPassword()

  // 1. Firebase Auth account.
  //    [PRODUCTION FIX] This previously had no try/catch at all — any
  //    Firebase createUser error (confirmed in prod logs: duplicate phone
  //    number — auth/phone-number-already-exists) fell through as an
  //    "Unhandled Express error" mapped to a generic, unhelpful 500 by
  //    globalErrorHandler, instead of the clean 409/400 the equivalent
  //    student flow (provisionStudentAuthAccount) already returns. Mirrors
  //    that same mapping here.
  let authUser: Awaited<ReturnType<ReturnType<typeof getAuth>['createUser']>>
  try {
    authUser = await getAuth().createUser({
      email:         data.email,
      password:      tempPassword,
      displayName:   `${data.firstName} ${data.lastName}`,
      ...(data.phone ? { phoneNumber: data.phone } : {}),
      emailVerified: false,
      disabled:      false,
    })
  } catch (err: unknown) {
    const code = (err as { errorInfo?: { code?: string }; code?: string })?.errorInfo?.code
      ?? (err as { code?: string })?.code
    if (code === 'auth/email-already-exists') {
      throw Object.assign(
        new Error(`An account already exists for ${data.email}. Use a different email, or delete the existing Firebase account first.`),
        { status: 409 },
      )
    }
    if (code === 'auth/phone-number-already-exists') {
      throw Object.assign(
        new Error(`An account already exists with phone number ${data.phone}. Check for a duplicate/orphaned staff or student account, or use a different number.`),
        { status: 409 },
      )
    }
    if (code === 'auth/invalid-email') {
      throw Object.assign(new Error(`"${data.email}" is not a valid email address.`), { status: 400 })
    }
    if (code === 'auth/invalid-phone-number') {
      throw Object.assign(new Error(`"${data.phone}" is not a valid phone number — use E.164 format, e.g. +2659912345678.`), { status: 400 })
    }
    logger.error({ err, email: data.email }, '[hrService] Firebase createUser failed')
    throw Object.assign(new Error('Failed to create the login account for this staff member.'), { status: 502 })
  }

  // 2. Claims: role + subtitle (jobTitle) + first-login password change.
  //    setCustomUserClaims replaces the whole claims object, which is fine
  //    here since this is a brand-new account with no prior claims.
  await getAuth().setCustomUserClaims(authUser.uid, {
    role:                   data.role,
    subtitle:               data.jobTitle,
    requiresPasswordChange: true,
  })

  // 3. Persist the profile (with the REAL Auth uid) + leave balances. If any
  //    of this fails, roll back the Auth account so it isn't orphaned.
  let staff: Awaited<ReturnType<typeof prisma.staffProfile.create>>
  try {
    const createProfile = (employeeNo: string) => prisma.staffProfile.create({
      data: {
        employeeNo,
        firstName:         data.firstName,
        lastName:          data.lastName,
        sex:               data.sex ?? null,
        email:             data.email,
        role:              data.role,
        department:        data.department,
        jobTitle:          data.jobTitle,
        employmentType:    data.employmentType,
        dateJoined:        new Date(data.dateJoined),
        uid:               authUser.uid,   // the real Firebase Auth UID — not a form placeholder
        // Full-time staff have no end date, even if one was sent.
        contractExpiry:    data.employmentType !== 'FULL_TIME' && data.contractExpiry ? new Date(data.contractExpiry) : null,
        phone:             data.phone ?? null,
        salaryStructureId: data.salaryStructureId ?? null,
        dateOfBirth:       data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        nationality:       blankToNull(data.nationality) ?? 'Malawian',
        homeDistrict:      blankToNull(data.homeDistrict),
        nrbNumber:         blankToNull(data.nrbNumber),
        tpin:              blankToNull(data.tpin),
        nextOfKinName:     blankToNull(data.nextOfKinName),
        nextOfKinPhone:    blankToNull(data.nextOfKinPhone),
        nextOfKinRelation: blankToNull(data.nextOfKinRelation),
        // Licence, training route and qualified subjects are kept for teaching staff only.
        isTeaching:           data.isTeaching ?? false,
        tcmRegistrationNo:    data.isTeaching ? blankToNull(data.tcmRegistrationNo) : null,
        tcmLicenceNo:         data.isTeaching ? blankToNull(data.tcmLicenceNo) : null,
        tcmLicenceExpiry:     data.isTeaching && data.tcmLicenceExpiry ? new Date(data.tcmLicenceExpiry) : null,
        employmentCategory:   data.employmentCategory ? data.employmentCategory : null,
        payrollNo:            blankToNull(data.payrollNo),
        highestQualification: data.highestQualification ? data.highestQualification : null,
        qualificationProgram: qualificationNeedsProgram(data.highestQualification) ? blankToNull(data.qualificationProgram) : null,
        trainingRoute:        data.isTeaching && data.trainingRoute ? data.trainingRoute : null,
        qualifiedSubjects:    data.isTeaching && data.qualifiedSubjects?.length
          ? { create: [...new Set(data.qualifiedSubjects)].map((subject) => ({ subject })) }
          : undefined,
      },
    })
    staff = await createWithNextEmployeeNo(createProfile)

    // Yearly leave balances (annual, sick, emergency) from Settings -> HR;
    // annual leave is pro-rated if they join part way through the year.
    await refreshLeaveBalances({ staffId: staff.id })
  } catch (dbErr) {
    // Roll back the orphaned Auth account before rethrowing.
    try {
      await getAuth().deleteUser(authUser.uid)
    } catch (rollbackErr) {
      logger.error(
        { rollbackErr, uid: authUser.uid, actorUid },
        '[hrService.createStaff] failed to roll back orphaned Firebase account after DB error',
      )
    }
    throw dbErr
  }

  void algolia.indexStaff({
    objectID:       staff.id,
    uid:            staff.uid,
    firstName:      staff.firstName,
    lastName:       staff.lastName,
    fullName:       `${staff.firstName} ${staff.lastName}`,
    role:           staff.role,
    department:     staff.department,
    status:         staff.status,
    email:          staff.email ?? null,
    // [ALGOLIA ROLLOUT — Tier 1 item 4] previously omitted — see the note
    // on AlgoliaStaff in algoliaService.ts.
    jobTitle:       staff.jobTitle,
    employmentType: staff.employmentType,
    contractExpiry: staff.contractExpiry ? staff.contractExpiry.toISOString() : null,
    dateJoined:     staff.dateJoined.toISOString(),
  })

  // 4. Best-effort welcome email with the temp password. A failure here does
  //    not undo the created staff member — it's logged and the temp password
  //    is still returned to the caller for manual relay.
  const emailResult = await sendEmail({
    to:      data.email,
    subject: `Welcome to ${await getSchoolDisplayName()} — Your Login Details`,
    html: `<p>Dear ${data.firstName} ${data.lastName},</p>
      <p>A staff account has been created for you on the School Management System.</p>
      <p><strong>Email:</strong> ${data.email}<br>
         <strong>Temporary Password:</strong> <code>${tempPassword}</code></p>
      <p>You will be required to change your password on first login.</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? ''}/login">Login here</a></p>`,
    tags: [{ name: 'type', value: 'staff-welcome' }],
  })
  if (!emailResult.ok) {
    logger.warn(
      { staffId: staff.id, email: data.email, actorUid, reason: emailResult.error },
      '[hrService.createStaff] welcome email failed to send; temp password returned to caller for manual relay',
    )
  }

  logger.info({ event: 'staff.created', staffId: staff.id, uid: staff.uid, role: staff.role, actorUid })

  // Return the temp password so the create UI can display it to the HR/admin
  // user as a fallback when email delivery is delayed or fails.
  return { ...staff, tempPassword }
}

// [PRODUCTION FIX] Was uploadStaffPhoto(staffId, buffer, filename) — took
// the raw file bytes and called uploadFile() itself. The route now uploads
// directly to Appwrite from the browser (see hr.ts's /:id/photo/upload-ticket
// and storage.ts's createDirectUploadTicket()), so this only needs to
// record the resulting fileId against the staff profile.
export async function attachStaffPhoto(staffId: string, fileId: string): Promise<string> {
  await prisma.staffProfile.update({ where: { id: staffId }, data: { photoKey: fileId } })
  return fileId
}

// ─── LEAVE MANAGEMENT ────────────────────────────────────
// How leave works (2026-11 overhaul):
//  - A day of leave is a working day, Monday to Friday, not a public holiday
//    (shared/utils/leave.ts). The school is on a five-day week.
//  - Annual, sick and emergency leave are drawn from a yearly balance. The
//    entitlement comes from Settings -> HR (Employment Act minimums by
//    default), is rebuilt for every year, and never carries over: a new year
//    starts a fresh balance. Maternity, paternity and study leave have no
//    balance, only a longest-request cap from the same settings; unpaid leave
//    has no limit. HR / high_rank approve or reject every request.
//  - Each type has a pay percent in Settings (100 full, 50 half, 0 unpaid).
//    When a request is approved its days are split into full-pay / half-pay /
//    unpaid days and saved on the request. Payroll docks pay from that split.
//    Sick leave uses the full-pay days first, then the half-pay days.
//  - Staff status follows the dates, not the approval: ON_LEAVE while an
//    approved leave covers today, ACTIVE again the day after it ends
//    (syncLeaveStatuses, run daily by the cron and refreshed on read).
// Validation throws carry `.status` so globalErrorHandler passes the real
// message to the client instead of the generic 500 text.

/** Leave types drawn from a yearly balance. */
const BALANCE_TYPES: readonly LeaveType[] = ['ANNUAL', 'SICK', 'EMERGENCY']

interface LeavePolicy {
  annualDays:     number
  sickFullDays:   number
  sickHalfDays:   number
  emergencyDays:  number
  maternityDays:  number
  paternityDays:  number
  studyDays:      number
  payPercent:     LeavePayPercent
}

async function getLeavePolicy(): Promise<LeavePolicy> {
  const s = await settingsService.getMany([
    SETTING_KEYS.HR_ANNUAL_LEAVE_DAYS,
    SETTING_KEYS.HR_SICK_LEAVE_DAYS,
    SETTING_KEYS.HR_SICK_HALF_PAY_DAYS,
    SETTING_KEYS.HR_EMERGENCY_LEAVE_DAYS,
    SETTING_KEYS.HR_MATERNITY_LEAVE_DAYS,
    SETTING_KEYS.HR_PATERNITY_LEAVE_DAYS,
    SETTING_KEYS.HR_STUDY_LEAVE_DAYS,
    SETTING_KEYS.HR_LEAVE_PAY_PERCENT,
  ] as const)
  return {
    annualDays:    s[SETTING_KEYS.HR_ANNUAL_LEAVE_DAYS],
    sickFullDays:  s[SETTING_KEYS.HR_SICK_LEAVE_DAYS],
    sickHalfDays:  s[SETTING_KEYS.HR_SICK_HALF_PAY_DAYS],
    emergencyDays: s[SETTING_KEYS.HR_EMERGENCY_LEAVE_DAYS],
    maternityDays: s[SETTING_KEYS.HR_MATERNITY_LEAVE_DAYS],
    paternityDays: s[SETTING_KEYS.HR_PATERNITY_LEAVE_DAYS],
    studyDays:     s[SETTING_KEYS.HR_STUDY_LEAVE_DAYS],
    payPercent:    s[SETTING_KEYS.HR_LEAVE_PAY_PERCENT],
  }
}

function entitlementFor(type: LeaveType, policy: LeavePolicy, dateJoined: Date, year: number): number {
  switch (type) {
    case 'ANNUAL':    return proRatedEntitlement(policy.annualDays, dateJoined, year)
    case 'SICK':      return policy.sickFullDays + policy.sickHalfDays
    case 'EMERGENCY': return policy.emergencyDays
    default:          return 0
  }
}

/** Longest single request for the types that have a cap instead of a balance. */
function perRequestCap(type: LeaveType, policy: LeavePolicy): number | null {
  if (type === 'MATERNITY') return policy.maternityDays
  if (type === 'PATERNITY') return policy.paternityDays
  if (type === 'STUDY')     return policy.studyDays
  return null
}

function payNoteFor(type: LeaveType, policy: LeavePolicy): string {
  const pct = policy.payPercent[type]
  const rate = pct >= 100 ? 'Full pay' : pct <= 0 ? 'Unpaid' : `${pct}% pay`
  if (type === 'SICK' && policy.sickHalfDays > 0) {
    return `${rate} for the first ${policy.sickFullDays} days, then half pay for up to ${policy.sickHalfDays} more`
  }
  return rate
}

/**
 * Makes sure the yearly balances exist for `year` (default: this year) and
 * match the current settings. One staff member, or everyone not terminated.
 * Used/pending days are never touched. A new year has no rows yet, so it
 * starts from zero used: there is no carry-over.
 */
export async function refreshLeaveBalances(opts: { staffId?: string; year?: number } = {}) {
  const year = opts.year ?? todayInMalawi().getUTCFullYear()
  const [policy, people] = await Promise.all([
    getLeavePolicy(),
    prisma.staffProfile.findMany({
      where:  { ...(opts.staffId ? { id: opts.staffId } : {}), status: { not: 'TERMINATED' } },
      select: { id: true, dateJoined: true },
    }),
  ])
  const ops = people.flatMap((p) =>
    BALANCE_TYPES.map((leaveType) => {
      const totalDays = entitlementFor(leaveType, policy, p.dateJoined, year)
      return prisma.leaveBalance.upsert({
        where:  { staffId_leaveType_year: { staffId: p.id, leaveType, year } },
        create: { staffId: p.id, leaveType, year, totalDays },
        update: { totalDays },
      })
    }),
  )
  for (let i = 0; i < ops.length; i += 100) await prisma.$transaction(ops.slice(i, i + 100))
  return { staff: people.length, year }
}

/**
 * Puts every staff member's status in line with their approved leave:
 * ON_LEAVE while a leave covers today (Malawi date), ACTIVE once it is over.
 * Only ACTIVE <-> ON_LEAVE moves; SUSPENDED and TERMINATED are never touched.
 * Leave that has not started yet leaves the person ACTIVE.
 */
export async function syncLeaveStatuses() {
  const today = todayInMalawi()
  const covering = await prisma.leaveRequest.findMany({
    where:  { status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today } },
    select: { staffId: true },
  })
  const awayIds = [...new Set(covering.map((c) => c.staffId))]
  const [toOnLeave, toActive] = await Promise.all([
    prisma.staffProfile.updateMany({ where: { id: { in: awayIds }, status: 'ACTIVE' }, data: { status: 'ON_LEAVE' } }),
    prisma.staffProfile.updateMany({ where: { id: { notIn: awayIds }, status: 'ON_LEAVE' }, data: { status: 'ACTIVE' } }),
  ])
  lastStatusSync = Date.now()
  return { toOnLeave: toOnLeave.count, toActive: toActive.count }
}

let lastStatusSync = 0
/** Cheap guard for read paths: re-sync at most every five minutes per server instance. */
async function ensureLeaveStatusesFresh() {
  if (Date.now() - lastStatusSync < 5 * 60 * 1000) return
  try {
    await syncLeaveStatuses()
  } catch (err) {
    logger.error({ event: 'leave.status_sync_failed', err })
  }
}

function leaveError(message: string, status = 400) {
  return Object.assign(new Error(message), { status })
}

export async function applyForLeave(staffId: string, data: LeaveRequestInput) {
  const start = toUtcDay(data.startDate)
  const end   = toUtcDay(data.endDate)
  const leaveType = data.leaveType as LeaveType

  if (end.getTime() < start.getTime()) throw leaveError('End date must be on or after the start date.')
  if (isWeekendDay(start) || isWeekendDay(end)) throw leaveError('Leave cannot start or end on a weekend.')

  const days = countLeaveDays(start, end)
  if (days <= 0) throw leaveError('Those dates contain no working days. Weekends and public holidays are not counted as leave.')

  const staff = await prisma.staffProfile.findUniqueOrThrow({
    where:  { id: staffId },
    select: { sex: true, status: true },
  })
  if (staff.status === 'TERMINATED') throw leaveError('A terminated staff account cannot apply for leave.', 403)

  const onlyFor = LEAVE_TYPE_SEX[leaveType as LeaveTypeKey]
  if (onlyFor && staff.sex && staff.sex !== onlyFor) {
    throw leaveError(`${LEAVE_TYPE_LABELS[leaveType as LeaveTypeKey]} is not available for this staff profile.`)
  }

  const overlap = await prisma.leaveRequest.findFirst({
    where: {
      staffId,
      status:    { in: ['PENDING', 'APPROVED'] },
      startDate: { lte: end },
      endDate:   { gte: start },
    },
    select: { startDate: true, endDate: true, status: true },
  })
  if (overlap) {
    throw leaveError(
      `You already have a ${overlap.status.toLowerCase()} leave request from ${toDayString(overlap.startDate)} to ${toDayString(overlap.endDate)} that overlaps these dates.`,
      409,
    )
  }

  const policy = await getLeavePolicy()
  const cap = perRequestCap(leaveType, policy)
  if (cap !== null && days > cap) {
    throw leaveError(`${LEAVE_TYPE_LABELS[leaveType as LeaveTypeKey]} is limited to ${cap} working days per request. You asked for ${days}.`)
  }

  const create = {
    staffId, leaveType, startDate: start, endDate: end, days, reason: data.reason,
  }

  if (BALANCE_TYPES.includes(leaveType)) {
    const year = start.getUTCFullYear()
    if (end.getUTCFullYear() !== year) {
      throw leaveError('Leave cannot run across two calendar years. Please submit one request for each year.')
    }
    await refreshLeaveBalances({ staffId, year })
    const balance = await prisma.leaveBalance.findUniqueOrThrow({
      where: { staffId_leaveType_year: { staffId, leaveType, year } },
    })
    const remaining = balance.totalDays - balance.usedDays - balance.pendingDays
    if (days > remaining) {
      throw leaveError(`Not enough ${LEAVE_TYPE_LABELS[leaveType as LeaveTypeKey].toLowerCase()} left for ${year}. You asked for ${days} working days and ${Math.max(0, remaining)} are available.`)
    }
    // Reserve the days and create the request together so neither can happen alone.
    const [request] = await prisma.$transaction([
      prisma.leaveRequest.create({ data: create }),
      prisma.leaveBalance.update({
        where: { staffId_leaveType_year: { staffId, leaveType, year } },
        data:  { pendingDays: { increment: days } },
      }),
    ])
    logger.info({ event: 'leave.applied', requestId: request.id, staffId, days })
    return request
  }

  const request = await prisma.leaveRequest.create({ data: create })
  logger.info({ event: 'leave.applied', requestId: request.id, staffId, days })
  return request
}

export async function reviewLeave(requestId: string, data: ReviewLeaveInput, actorUid: string) {
  const req = await prisma.leaveRequest.findUniqueOrThrow({
    where:   { id: requestId },
    include: { staff: { select: { id: true, uid: true, firstName: true, lastName: true, email: true } } },
  })
  if (req.status !== 'PENDING') throw new Error('Request is no longer pending.')
  // [Issue 7] Same separation-of-duties rule the Approvals Hub applies — the
  // direct /hr/leave/requests/:id/review route must not be a way around it.
  assertNotSelfReview(req.staff.uid, actorUid, 'leave request')

  // [R11] Conflicts are surfaced to the caller, not blocking — the
  // approval still proceeds regardless of severity, per this phase's
  // explicit design decision (LeaveConflictWarning.tsx frames these as
  // warnings, not hard stops).
  let conflictResult: ConflictCheckResult | undefined
  if (data.status === 'APPROVED') {
    conflictResult = await checkLeaveConflicts({
      staffId:   req.staffId,
      startDate: req.startDate,
      endDate:   req.endDate,
      leaveType: req.leaveType,
      requestId: req.id,
    })
  }

  const isBalanceType = BALANCE_TYPES.includes(req.leaveType)
  const year = req.startDate.getUTCFullYear()
  const balanceKey = { staffId_leaveType_year: { staffId: req.staffId, leaveType: req.leaveType, year } }

  // Fix how the days are paid at the moment of approval. Sick leave depends on
  // how much of the year's full-pay allowance is already used, so it is worked
  // out here, not at application time.
  let pay: { fullPayDays: number; halfPayDays: number; unpaidDays: number } | undefined
  if (data.status === 'APPROVED') {
    const policy = await getLeavePolicy()
    const percent = policy.payPercent[req.leaveType as LeaveTypeKey]
    if (req.leaveType === 'SICK') {
      const balance = await prisma.leaveBalance.findUnique({ where: balanceKey })
      const used = balance?.usedDays ?? 0
      const fullTierLeft = Math.max(0, policy.sickFullDays - used)
      const halfTierLeft = Math.max(0, policy.sickHalfDays - Math.max(0, used - policy.sickFullDays))
      pay = splitLeavePay(req.days, percent, { fullTierLeft, halfTierLeft })
    } else {
      pay = splitLeavePay(req.days, percent)
    }
  }

  const reviewData = {
    status: data.status, reviewedByUid: actorUid, reviewedAt: new Date(), reviewNotes: data.reviewNotes ?? null,
    ...(pay ?? {}),
  }
  const updateRequest = prisma.leaveRequest.update({ where: { id: requestId }, data: reviewData })

  let updated: Awaited<typeof updateRequest>
  if (isBalanceType) {
    // Move the reserved days to used (approved) or hand them back (rejected).
    const balanceChange = data.status === 'APPROVED'
      ? { pendingDays: { decrement: req.days }, usedDays: { increment: req.days } }
      : { pendingDays: { decrement: req.days } }
    ;[updated] = await prisma.$transaction([
      updateRequest,
      prisma.leaveBalance.updateMany({
        where: { staffId: req.staffId, leaveType: req.leaveType, year },
        data:  balanceChange,
      }),
    ])
  } else {
    updated = await updateRequest
  }

  // Status follows the dates: ON_LEAVE only if the approved leave covers today.
  if (data.status === 'APPROVED') {
    await syncLeaveStatuses().catch((err) => logger.error({ event: 'leave.status_sync_failed', err }))
  }

  // [R11] Reconnect the leave-review workflow to email — staff were
  // never actually notified of an approval or rejection before this fix.
  try {
    const reviewer = await prisma.staffProfile.findFirst({
      where:  { uid: actorUid },
      select: { firstName: true, lastName: true },
    })
    await notificationService.sendLeaveUpdate({
      to:       req.staff.email,
      staffUid: req.staff.uid,
      data: {
        staffName:   `${req.staff.firstName} ${req.staff.lastName}`,
        leaveType:   req.leaveType,
        startDate:   req.startDate,
        endDate:     req.endDate,
        days:        req.days,
        status:      data.status,
        reviewedBy:  reviewer ? `${reviewer.firstName} ${reviewer.lastName}` : undefined,
        reviewNotes: data.reviewNotes,
        requestDate: req.createdAt,
      },
    })
  } catch (err) {
    logger.error({ event: 'leave_update.send_failed', requestId, err })
  }

  logger.info({ event: 'leave.reviewed', requestId, status: data.status, actorUid })
  // [R11] Full ConflictCheckResult (not just the conflicts array) —
  // LeaveConflictWarning.tsx's props require hasBlockingConflicts/
  // hasWarnings alongside the conflicts list.
  return {
    ...updated,
    conflictResult: conflictResult ?? { hasBlockingConflicts: false, hasWarnings: false, conflicts: [] },
  }
}

/**
 * [NEW — Approvals Hub] A staff member withdraws their OWN leave request
 * while it is still pending. Releases the reserved days exactly the way a
 * rejection does. Nothing else in the system could cancel a request, so a
 * mistaken application stayed on the reviewer's queue until someone rejected
 * it on the applicant's behalf.
 */
export async function cancelLeave(requestId: string, actorUid: string) {
  const req = await prisma.leaveRequest.findUniqueOrThrow({
    where:   { id: requestId },
    include: { staff: { select: { uid: true } } },
  })
  if (req.staff.uid !== actorUid) {
    throw Object.assign(new Error('You can only withdraw your own leave requests.'), { status: 403 })
  }
  if (req.status !== 'PENDING') {
    throw Object.assign(new Error('Only a pending leave request can be withdrawn.'), { status: 409 })
  }

  const updateRequest = prisma.leaveRequest.update({
    where: { id: requestId },
    data:  { status: 'CANCELLED', reviewedAt: new Date(), reviewNotes: 'Withdrawn by the applicant.' },
  })
  let updated: Awaited<typeof updateRequest>
  if (BALANCE_TYPES.includes(req.leaveType)) {
    ;[updated] = await prisma.$transaction([
      updateRequest,
      prisma.leaveBalance.updateMany({
        where: { staffId: req.staffId, leaveType: req.leaveType, year: req.startDate.getUTCFullYear() },
        data:  { pendingDays: { decrement: req.days } },
      }),
    ])
  } else {
    updated = await updateRequest
  }

  logger.info({ event: 'leave.cancelled', requestId, actorUid })
  return updated
}

export async function listLeaveRequests(filters: { staffId?: string; status?: string } = {}) {
  const [rows, payNotes] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: {
        ...(filters.staffId ? { staffId: filters.staffId } : {}),
        ...(filters.status  ? { status: filters.status as 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' } : {}),
      },
      include: { staff: { select: { firstName: true, lastName: true, department: true, photoKey: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    getLeavePayNotes(),
  ])
  // Once approved, the request carries its real pay split; before that, show
  // how the type is paid under the current settings.
  return rows.map((r) => {
    const approved = r.status === 'APPROVED'
    const parts = [
      r.fullPayDays > 0 ? `${r.fullPayDays} full pay` : '',
      r.halfPayDays > 0 ? `${r.halfPayDays} half pay` : '',
      r.unpaidDays  > 0 ? `${r.unpaidDays} unpaid` : '',
    ].filter(Boolean)
    return { ...r, payNote: approved && parts.length > 0 ? parts.join(', ') : (payNotes[r.leaveType] ?? 'Full pay') }
  })
}

/** One-line pay description per leave type ("Full pay", "Unpaid"...), for approval screens. */
export async function getLeavePayNotes(): Promise<Record<string, string>> {
  const policy = await getLeavePolicy()
  return Object.fromEntries(LEAVE_TYPES.map((t) => [t, payNoteFor(t as LeaveType, policy)]))
}

/** The signed-in staff member's own requests (the "My leave" list). */
export async function listMyLeaveRequests(uid: string) {
  const me = await prisma.staffProfile.findFirst({ where: { uid }, select: { id: true } })
  if (!me) return []
  return listLeaveRequests({ staffId: me.id })
}

/**
 * What the signed-in staff member can ask for, with the days left and how it
 * is paid. Maternity / paternity are left out for the other sex when the
 * profile records it. Backs the Request leave form.
 */
export async function getMyLeaveOptions(uid: string): Promise<ApiLeaveOption[]> {
  const me = await prisma.staffProfile.findFirst({ where: { uid }, select: { id: true, sex: true } })
  if (!me) return []
  const year = todayInMalawi().getUTCFullYear()
  await refreshLeaveBalances({ staffId: me.id, year })
  const [policy, balances] = await Promise.all([
    getLeavePolicy(),
    prisma.leaveBalance.findMany({ where: { staffId: me.id, year } }),
  ])
  return LEAVE_TYPES
    .filter((t) => { const only = LEAVE_TYPE_SEX[t]; return !only || !me.sex || me.sex === only })
    .map((t) => {
      const b = balances.find((x) => x.leaveType === t)
      const remaining = b ? b.totalDays - b.usedDays - b.pendingDays : null
      return {
        leaveType:     t,
        label:         LEAVE_TYPE_LABELS[t],
        payPercent:    policy.payPercent[t],
        payNote:       payNoteFor(t as LeaveType, policy),
        maxDays:       BALANCE_TYPES.includes(t as LeaveType) ? Math.max(0, remaining ?? 0) : perRequestCap(t as LeaveType, policy),
        remainingDays: BALANCE_TYPES.includes(t as LeaveType) ? Math.max(0, remaining ?? 0) : null,
        totalDays:     b?.totalDays ?? null,
      }
    })
}

/**
 * Everyone whose approved leave covers today, with the day they are back.
 * Deliberately NOT filtered by request status or a date range: this is the
 * "who is away right now" list, separate from the request queue.
 */
export async function listOnLeaveNow(): Promise<ApiOnLeaveNow[]> {
  await ensureLeaveStatusesFresh()
  const today = todayInMalawi()
  const rows = await prisma.leaveRequest.findMany({
    where: {
      status:    'APPROVED',
      startDate: { lte: today },
      endDate:   { gte: today },
      staff:     { status: { not: 'TERMINATED' } },
    },
    include: { staff: { select: { id: true, firstName: true, lastName: true, department: true, jobTitle: true } } },
    orderBy: { endDate: 'asc' },
  })
  return rows.map((r) => ({
    requestId:  r.id,
    staffId:    r.staff.id,
    firstName:  r.staff.firstName,
    lastName:   r.staff.lastName,
    department: r.staff.department,
    jobTitle:   r.staff.jobTitle,
    leaveType:  r.leaveType,
    startDate:  toDayString(r.startDate),
    endDate:    toDayString(r.endDate),
    returnDate: nextWorkingDay(r.endDate),
    daysLeft:   countLeaveDays(today, r.endDate),
  }))
}

// ─── STAFF LOANS ─────────────────────────────────────────
// [R11] listLoans() is new — the Loans tab's admin-management view needs
// to see loan requests across all staff, and no such listing existed
// (getStaffProfile() includes a staff member's own loans, but only that
// one staff member's, and only APPROVED/DISBURSED/REPAYING statuses —
// insufficient for reviewing PENDING requests school-wide).
export async function listLoans(status?: 'PENDING' | 'APPROVED' | 'DISBURSED' | 'REPAYING' | 'SETTLED' | 'REJECTED') {
  return prisma.staffLoan.findMany({
    where:   status ? { status } : {},
    include: { staff: { select: { firstName: true, lastName: true, employeeNo: true, department: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

// [POST-R11] Self-service loan status — a staff member who submits a
// request via requestLoan() previously had no way to check on it
// afterward; getStaffProfile() returns a staff member's own loans, but
// only REVIEWERS (admin/hr/high_rank) may call GET /hr/:id, and even
// then it filters out PENDING/REJECTED/SETTLED. This resolves the
// requester's own StaffProfile from their Firebase UID and returns every
// loan they have ever had, regardless of status.
export async function getMyLoans(uid: string) {
  const sp = await prisma.staffProfile.findFirst({ where: { uid }, select: { id: true } })
  if (!sp) return []
  return prisma.staffLoan.findMany({
    where:   { staffId: sp.id },
    orderBy: { createdAt: 'desc' },
  })
}

// [BUGFIX — ERR-3, 2026-09-16] Same root cause and same fix as
// applyForLeave() above: `existing` was thrown as a plain Error (implicit
// 500 → generic message in production), instead of surfacing to the
// requesting staff member. Tagged `{ status: 409 }` — this is a conflict
// with an existing resource (an active loan), the same status this file
// already uses for the analogous "account already exists" conflicts in
// createStaff() above.
export async function requestLoan(staffId: string, data: LoanRequestInput) {
  const existing = await prisma.staffLoan.findFirst({
    where: { staffId, status: { in: ['PENDING','APPROVED','DISBURSED','REPAYING'] } },
  })
  if (existing) throw Object.assign(new Error('You already have an active loan. Settle it before applying for a new one.'), { status: 409 })

  // [PRODUCTION FIX 2026-07-28] No interest rate concept existed anywhere —
  // loans were interest-free by omission, not by design decision. Flat
  // (simple, non-compounding) interest applied once at request time:
  // `amount` stays the pure disbursed principal for records/reporting;
  // `balance` (what repayments actually pay down) reflects principal +
  // interest. Rate of 0 (the setting's default) reproduces the previous
  // interest-free behaviour exactly.
  const interestRate = await settingsService.get(SETTING_KEYS.STAFF_LOAN_INTEREST_RATE)
  const balance = data.amount + (data.amount * interestRate) / 100

  return prisma.staffLoan.create({
    data: { staffId, amount: data.amount, monthlyDeduction: data.monthlyDeduction, balance, reason: data.reason },
  })
}

export async function approveLoan(loanId: string, actorUid: string) {
  // [FIX] No status guard before — any loan (even a REJECTED/REPAYING one)
  // could be flipped back to APPROVED and re-stamped by a stray call.
  const loan = await prisma.staffLoan.findUnique({
    where: { id: loanId },
    select: { status: true, staff: { select: { uid: true } } },
  })
  if (!loan) throw Object.assign(new Error('Loan not found.'), { status: 404 })
  if (loan.status !== 'PENDING') {
    throw Object.assign(new Error('Only a pending loan can be approved.'), { status: 409 })
  }
  // [Issue 7] A borrower may not approve their own loan (Approvals Hub parity).
  assertNotSelfReview(loan.staff.uid, actorUid, 'loan request')
  return prisma.staffLoan.update({
    where: { id: loanId },
    data: { status: 'APPROVED', approvedByUid: actorUid, approvedAt: new Date() },
  })
}

/**
 * [NEW — Approvals Hub] StaffLoan already has a REJECTED status but no code
 * path ever set it, so a reviewer who did not want to grant a loan had no
 * way to say so. The reason is written to the audit trail (the loan row has
 * no notes column) and shown back to the requester by the Approvals page.
 */
export async function rejectLoan(loanId: string, actorUid: string, actorRole: string, reason: string) {
  const loan = await prisma.staffLoan.findUnique({
    where: { id: loanId },
    select: { status: true, staff: { select: { uid: true } } },
  })
  if (!loan) throw Object.assign(new Error('Loan not found.'), { status: 404 })
  if (loan.status !== 'PENDING') {
    throw Object.assign(new Error('Only a pending loan can be rejected.'), { status: 409 })
  }
  assertNotSelfReview(loan.staff.uid, actorUid, 'loan request')
  const updated = await prisma.staffLoan.update({
    where: { id: loanId },
    data:  { status: 'REJECTED' },
  })
  await auditService.log({
    action:     'hr.loan_rejected',
    entityType: 'StaffLoan',
    entityId:   loanId,
    actorUid,
    actorRole,
    metadata:   { context: { reason } },
  })
  return updated
}

// [POST-R11] Disbursing a loan now also wires its monthly deduction into
// payroll (SalaryStructure.monthlyLoanDeduction) — previously these two
// fields were entirely disconnected: a disbursed loan never actually
// caused payroll to deduct anything, and nothing populated the field
// processMonthlyPayroll() reads. If the staff member has no
// SalaryStructure row yet (not onboarded into payroll), the loan is
// still marked disbursed — that already happened in the real world — but
// a warning is logged rather than fabricating a salary record.
export async function disburseLoan(loanId: string) {
  // [Issue 7] Money may only be released against an APPROVED loan. Without
  // this guard, finance could disburse a PENDING / REJECTED / already
  // disbursed loan directly, skipping the approval step and (re)setting the
  // payroll deduction. The conditional updateMany makes the check atomic.
  const claim = await prisma.staffLoan.updateMany({
    where: { id: loanId, status: 'APPROVED' },
    data:  { status: 'DISBURSED', disbursedAt: new Date() },
  })
  if (claim.count === 0) {
    const existing = await prisma.staffLoan.findUnique({ where: { id: loanId }, select: { status: true } })
    if (!existing) throw Object.assign(new Error('Loan not found.'), { status: 404 })
    throw Object.assign(new Error('Only an approved loan can be disbursed.'), { status: 409 })
  }
  const loan = await prisma.staffLoan.findUniqueOrThrow({
    where:   { id: loanId },
    include: { staff: { select: { uid: true } } },
  })

  const salaryStructure = await prisma.salaryStructure.findUnique({
    where: { staffUid: loan.staff.uid },
  })
  if (salaryStructure) {
    await prisma.salaryStructure.update({
      where: { staffUid: loan.staff.uid },
      data:  { monthlyLoanDeduction: loan.monthlyDeduction },
    })
  } else {
    logger.warn({ event: 'loan.disbursed_no_salary_structure', loanId, staffUid: loan.staff.uid })
  }

  return loan
}

// [POST-R11] Once a loan is fully repaid, its SalaryStructure deduction
// is reset to 0 so future payroll runs stop deducting for a settled
// loan. Uses updateMany (not update) since a SalaryStructure row may not
// exist (e.g. disburseLoan() logged a warning instead of one existing) —
// updateMany silently matches zero rows rather than throwing.
export async function recordLoanRepayment(loanId: string, amount: number) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw Object.assign(new Error('Valid amount required.'), { status: 400 })
  }
  const loan = await prisma.staffLoan.findUniqueOrThrow({
    where:   { id: loanId },
    include: { staff: { select: { uid: true } } },
  })
  // [Issue 7] Repayments only make sense against a loan that has been paid out.
  if (loan.status !== 'DISBURSED' && loan.status !== 'REPAYING') {
    throw Object.assign(new Error('Repayments can only be recorded against a disbursed loan.'), { status: 409 })
  }
  const newBalance = Math.max(0, Number(loan.balance) - amount)
  const newRepaid  = Number(loan.totalRepaid) + amount
  const settled    = newBalance === 0
  const updated = await prisma.staffLoan.update({
    where: { id: loanId },
    data: { balance: newBalance, totalRepaid: newRepaid, status: settled ? 'SETTLED' : 'REPAYING' },
  })
  if (settled) {
    await prisma.salaryStructure.updateMany({
      where: { staffUid: loan.staff.uid },
      data:  { monthlyLoanDeduction: 0 },
    })
  }
  return updated
}

// ─── PERFORMANCE NOTES ───────────────────────────────────
export async function addPerformanceNote(data: PerformanceNoteInput, actorUid: string) {
  return prisma.performanceNote.create({ data: { ...data, authorUid: actorUid } })
}

export async function getContractExpiryAlert(daysAhead: number) {
  // [R11] Exact-day matching — the prior overlapping range (gte: today,
  // lte: today + daysAhead) meant a contract expiring in 5 days matched
  // all three of contractExpiryJob.ts's sequential daysAhead=7,30,60
  // calls, sending up to three duplicate emails per staff member every
  // day until expiry. Each call now targets a single, distinct day.
  const target = addDays(new Date(), daysAhead)
  return prisma.staffProfile.findMany({
    where: { contractExpiry: { gte: startOfDay(target), lte: endOfDay(target) }, status: 'ACTIVE' },
    select: {
      id: true, firstName: true, lastName: true, email: true, contractExpiry: true,
      department: true, jobTitle: true, employeeNo: true,
    },
  })
}

/**
 * TCM licences expiring exactly `daysAhead` days from today, for TEACHING staff
 * only (isTeaching). Exact-day matching for the same reason as
 * getContractExpiryAlert(): the job's sequential 7/30/60 calls must never email
 * the same licence twice.
 */
export async function getLicenceExpiryAlert(daysAhead: number) {
  const target = addDays(new Date(), daysAhead)
  return prisma.staffProfile.findMany({
    where: {
      isTeaching: true,
      status: 'ACTIVE',
      tcmLicenceExpiry: { gte: startOfDay(target), lte: endOfDay(target) },
    },
    select: {
      id: true, firstName: true, lastName: true, email: true, tcmLicenceExpiry: true,
      department: true, jobTitle: true, employeeNo: true,
    },
  })
}

/**
 * [PRODUCTION FIX] Contracts expiring at any point in the next `daysAhead`
 * days — a genuine range query, unlike getContractExpiryAlert() above.
 * That function intentionally checks a single exact day (today + N) so
 * contractExpiryJob.ts's sequential 7/30/60 cron calls never re-email the
 * same staff member — correct for its job, but wrong for a dashboard
 * "Contract Expiry Alerts" widget: reused as-is, the widget would only
 * ever show a contract expiring exactly N days from today, which is
 * empty on almost every visit. This is the range version HRDashboard.tsx's
 * widget (and its "Contract Expiries" stat card, which had the identical
 * mismatch) actually need. Ordered soonest-first for display.
 */
export async function getUpcomingContractExpiries(daysAhead: number) {
  const today  = startOfDay(new Date())
  const target = endOfDay(addDays(new Date(), daysAhead))
  return prisma.staffProfile.findMany({
    where: { contractExpiry: { gte: today, lte: target }, status: 'ACTIVE' },
    select: {
      id: true, firstName: true, lastName: true, email: true, contractExpiry: true,
      department: true, jobTitle: true, employeeNo: true,
    },
    orderBy: { contractExpiry: 'asc' },
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// TERMINATION and RESPONSIBILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ends a staff member's employment. A reason and date are required (they feed
 * the Ministry staffing return and, with date of birth, tell a retirement from a
 * resignation). The login is NOT disabled here: that stays an explicit step in
 * User Management, because disabling an account is a separate permission and
 * HR may need to finish handover first.
 */
export async function terminateStaff(
  id: string,
  input: TerminateStaffInput,
  actor: { uid: string; role: string },
) {
  const current = await prisma.staffProfile.findUnique({ where: { id }, select: { status: true } })
  if (!current) throw Object.assign(new Error('Staff member not found.'), { status: 404 })
  if (current.status === 'TERMINATED') {
    throw Object.assign(new Error('This staff member has already been terminated.'), { status: 409 })
  }

  await prisma.staffProfile.update({
    where: { id },
    data: {
      status:     'TERMINATED',
      exitReason: input.exitReason,
      exitDate:   new Date(`${input.exitDate}T00:00:00Z`),
    },
  })

  await auditService.log({
    action:     'hr.staff_terminated',
    entityType: 'StaffProfile',
    entityId:   id,
    actorUid:   actor.uid,
    actorRole:  actor.role,
    metadata:   {
      before:  { status: current.status },
      after:   { status: 'TERMINATED', exitReason: input.exitReason, exitDate: input.exitDate },
    },
  })
  return getStaffProfile(id)
}

async function auditResponsibility(id: string, actor: { uid: string; role: string }, context: Record<string, unknown>) {
  await auditService.log({
    action:     'hr.staff_compliance_edited',
    entityType: 'StaffProfile',
    entityId:   id,
    actorUid:   actor.uid,
    actorRole:  actor.role,
    metadata:   { context },
  })
}

export async function addResponsibility(
  staffId: string,
  input: StaffResponsibilityInput,
  actor: { uid: string; role: string },
) {
  const exists = await prisma.staffProfile.findUnique({ where: { id: staffId }, select: { id: true } })
  if (!exists) throw Object.assign(new Error('Staff member not found.'), { status: 404 })
  const row = await prisma.staffResponsibility.create({
    data: {
      staffId,
      title:     input.title,
      startDate: new Date(`${input.startDate}T00:00:00Z`),
      endDate:   input.endDate ? new Date(`${input.endDate}T00:00:00Z`) : null,
    },
  })
  await auditResponsibility(staffId, actor, { change: 'responsibilityAdded', responsibilityId: row.id })
  return row
}

export async function updateResponsibility(
  staffId: string,
  responsibilityId: string,
  input: StaffResponsibilityInput,
  actor: { uid: string; role: string },
) {
  const current = await prisma.staffResponsibility.findFirst({ where: { id: responsibilityId, staffId } })
  if (!current) throw Object.assign(new Error('Responsibility not found.'), { status: 404 })
  const row = await prisma.staffResponsibility.update({
    where: { id: responsibilityId },
    data: {
      title:     input.title,
      startDate: new Date(`${input.startDate}T00:00:00Z`),
      endDate:   input.endDate ? new Date(`${input.endDate}T00:00:00Z`) : null,
    },
  })
  await auditResponsibility(staffId, actor, { change: 'responsibilityUpdated', responsibilityId })
  return row
}

export async function deleteResponsibility(
  staffId: string,
  responsibilityId: string,
  actor: { uid: string; role: string },
) {
  const current = await prisma.staffResponsibility.findFirst({ where: { id: responsibilityId, staffId } })
  if (!current) throw Object.assign(new Error('Responsibility not found.'), { status: 404 })
  await prisma.staffResponsibility.delete({ where: { id: responsibilityId } })
  await auditResponsibility(staffId, actor, { change: 'responsibilityRemoved', responsibilityId })
}

// ═══════════════════════════════════════════════════════════════════════════
// SELF-SERVICE (hr.editOwnLimitedFields)
//
// A staff member's own phone and next of kin. The subject is ALWAYS the verified
// uid from the token, never an id from the request, so one member of staff can't
// read or change another's record through this path.
// ═══════════════════════════════════════════════════════════════════════════

const OWN_DETAILS_SELECT = {
  phone: true, nextOfKinName: true, nextOfKinPhone: true, nextOfKinRelation: true,
} as const

export async function getOwnDetails(uid: string) {
  const row = await prisma.staffProfile.findUnique({ where: { uid }, select: OWN_DETAILS_SELECT })
  if (!row) throw Object.assign(new Error('No staff profile is linked to this account.'), { status: 404 })
  return row
}

export async function updateOwnDetails(uid: string, input: UpdateOwnDetailsInput, actorRole: string) {
  const current = await prisma.staffProfile.findUnique({ where: { uid }, select: { id: true } })
  if (!current) throw Object.assign(new Error('No staff profile is linked to this account.'), { status: 404 })

  const data: Prisma.StaffProfileUncheckedUpdateInput = {}
  const fieldsChanged: string[] = []
  if (input.phone             !== undefined) { data.phone             = blankToNull(input.phone);             fieldsChanged.push('phone') }
  if (input.nextOfKinName     !== undefined) { data.nextOfKinName     = blankToNull(input.nextOfKinName);     fieldsChanged.push('nextOfKinName') }
  if (input.nextOfKinPhone    !== undefined) { data.nextOfKinPhone    = blankToNull(input.nextOfKinPhone);    fieldsChanged.push('nextOfKinPhone') }
  if (input.nextOfKinRelation !== undefined) { data.nextOfKinRelation = blankToNull(input.nextOfKinRelation); fieldsChanged.push('nextOfKinRelation') }
  if (fieldsChanged.length === 0) return getOwnDetails(uid)

  const updated = await prisma.staffProfile.update({ where: { uid }, data, select: OWN_DETAILS_SELECT })
  await auditService.log({
    action:     'hr.staff_identity_edited',
    entityType: 'StaffProfile',
    entityId:   current.id,
    actorUid:   uid,
    actorRole,
    metadata:   { context: { fieldsChanged, self: true } },
  })
  return updated
}
