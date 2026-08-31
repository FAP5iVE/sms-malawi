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
 */
import 'server-only'
import * as admin from 'firebase-admin'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { uploadFile, FILE_PREFIX } from '@/lib/storage'
import { sendEmail } from '@/lib/email'
import { generateTempPassword } from '@/lib/tempPassword'
import { differenceInBusinessDays, isWeekend, addDays, startOfDay, endOfDay } from 'date-fns'
import * as auditService from '@/server/services/auditService'

function getAuth() { return admin.auth() }
import type {
  CreateStaffInput, UpdateStaffInput, LeaveRequestInput, ReviewLeaveInput,
  LoanRequestInput, PerformanceNoteInput, UpdateSalaryInput, CreateAllowanceInput
} from '@shared/schemas/hr'
import type { LeaveType, Prisma} from '@prisma/client'
import * as algolia from '@/server/services/algoliaService'
import { checkLeaveConflicts, type ConflictCheckResult } from '@/server/services/leaveConflictService'
import * as notificationService from '@/server/services/notificationService'
import * as settingsService from '@/server/services/settingsService'
import { SETTING_KEYS } from '@shared/types/settings'
  
// ─── STAFF PROFILES ─────────────────────────────────────
export async function listStaff(filters: {
  department?: string; jobTitle?: string; status?: string; search?: string
} = {}) {
  const where:  Prisma.StaffProfileWhereInput = {}
  if (filters.department) where.department = filters.department
  if (filters.jobTitle) where.jobTitle = filters.jobTitle
  if (filters.status) where.status = filters.status as 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'TERMINATED'
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
      id: true, uid: true, employeeNo: true, firstName: true, lastName: true,
      role: true, department: true, jobTitle: true, status: true,
      employmentType: true, contractExpiry: true, photoKey: true, dateJoined: true,
    },
  })
}

export async function getStaffProfile(id: string) {
  return prisma.staffProfile.findUniqueOrThrow({
    where: { id },
    include: {
      leaveBalances: true,
      leaveRequests: { orderBy: { createdAt: 'desc' }, take: 10 },
      loans: { where: { status: { in: ['APPROVED','DISBURSED','REPAYING'] } } },
      performanceNotes: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  })
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
export async function updateStaff(id: string, input: UpdateStaffInput) {
  const before = await prisma.staffProfile.findUnique({ where: { id } })
  if (!before) {
    throw Object.assign(new Error('Staff member not found.'), { status: 404 })
  }

  const updateData: Prisma.StaffProfileUncheckedUpdateInput = {}
  if (input.firstName         !== undefined) updateData.firstName         = input.firstName
  if (input.lastName          !== undefined) updateData.lastName          = input.lastName
  if (input.email             !== undefined) updateData.email             = input.email
  if (input.phone             !== undefined) updateData.phone             = input.phone
  if (input.department        !== undefined) updateData.department        = input.department
  if (input.jobTitle          !== undefined) updateData.jobTitle          = input.jobTitle
  if (input.employmentType    !== undefined) updateData.employmentType    = input.employmentType
  if (input.contractExpiry    !== undefined) updateData.contractExpiry    = new Date(input.contractExpiry)

  const updated = await prisma.staffProfile.update({
    where: { id },
    data:  updateData,
  })

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
    objectID:   updated.id,
    firstName:  updated.firstName,
    lastName:   updated.lastName,
    fullName:   `${updated.firstName} ${updated.lastName}`,
    department: updated.department,
    email:      updated.email ?? null,
  })

  return getStaffProfile(id)
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
  const tempPassword = generateTempPassword()

  // 1. Firebase Auth account. StaffProfile.email is @unique and Firebase
  //    rejects a duplicate email, so a second account can't be created for
  //    an email that already has one — the P2002/auth-error surfaces to the
  //    caller via globalErrorHandler.
  const authUser = await getAuth().createUser({
    email:         data.email,
    password:      tempPassword,
    displayName:   `${data.firstName} ${data.lastName}`,
    ...(data.phone ? { phoneNumber: data.phone } : {}),
    emailVerified: false,
    disabled:      false,
  })

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
    staff = await prisma.staffProfile.create({
      data: {
        employeeNo:        data.employeeNo,
        firstName:         data.firstName,
        lastName:          data.lastName,
        email:             data.email,
        role:              data.role,
        department:        data.department,
        jobTitle:          data.jobTitle,
        employmentType:    data.employmentType,
        dateJoined:        new Date(data.dateJoined),
        uid:               authUser.uid,   // the real Firebase Auth UID — not a form placeholder
        contractExpiry:    data.contractExpiry ? new Date(data.contractExpiry) : null,
        phone:             data.phone ?? null,
        salaryStructureId: data.salaryStructureId ?? null,
      },
    })

    // Initialise annual leave balance for the current year
    const year = new Date().getFullYear()
    await prisma.leaveBalance.createMany({
      data: [
        { staffId: staff.id, leaveType: 'ANNUAL',    totalDays: 21, year },
        { staffId: staff.id, leaveType: 'SICK',      totalDays: 10, year },
        { staffId: staff.id, leaveType: 'EMERGENCY', totalDays: 3,  year },
      ],
    })
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
    objectID:   staff.id,
    uid:        staff.uid,
    firstName:  staff.firstName,
    lastName:   staff.lastName,
    fullName:   `${staff.firstName} ${staff.lastName}`,
    role:       staff.role,
    department: staff.department,
    status:     staff.status,
    email:      staff.email ?? null,
  })

  // 4. Best-effort welcome email with the temp password. A failure here does
  //    not undo the created staff member — it's logged and the temp password
  //    is still returned to the caller for manual relay.
  const emailResult = await sendEmail({
    to:      data.email,
    subject: 'Welcome to SMS Malawi — Your Login Details',
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

export async function uploadStaffPhoto(staffId: string, buffer: Buffer, filename: string): Promise<string> {
  const uploaded = await uploadFile(FILE_PREFIX.STAFF_PHOTO, buffer, filename, 'image/jpeg')
  await prisma.staffProfile.update({ where: { id: staffId }, data: { photoKey: uploaded.fileId } })
  return uploaded.fileId
}

// ─── LEAVE MANAGEMENT ────────────────────────────────────
export async function applyForLeave(staffId: string, data: LeaveRequestInput) {
  const start = new Date(data.startDate)
  const end   = new Date(data.endDate)
  const days  = differenceInBusinessDays(end, start) + 1

  if (days <= 0) throw new Error('End date must be after start date.')
  if (isWeekend(start) || isWeekend(end)) throw new Error('Leave cannot start or end on a weekend.')

  // Check balance for annual/sick leave
  if (['ANNUAL', 'SICK'].includes(data.leaveType)) {
    const year = start.getFullYear()
    const balance = await prisma.leaveBalance.findUnique({
      where: { staffId_leaveType_year: { staffId, leaveType: data.leaveType as LeaveType, year } },
    })
    const remaining = (balance?.totalDays ?? 0) - (balance?.usedDays ?? 0) - (balance?.pendingDays ?? 0)
    if (days > remaining) throw new Error(`Insufficient ${data.leaveType} leave balance. Available: ${remaining} days.`)
    // Reserve pending days
    await prisma.leaveBalance.update({
      where: { staffId_leaveType_year: { staffId, leaveType: data.leaveType as LeaveType, year } },
      data: { pendingDays: { increment: days } },
    })
  }

  const request = await prisma.leaveRequest.create({
    data: { staffId, leaveType: data.leaveType as LeaveType, startDate: start, endDate: end, days, reason: data.reason },
  })
  logger.info({ event: 'leave.applied', requestId: request.id, staffId, days })
  return request
}

export async function reviewLeave(requestId: string, data: ReviewLeaveInput, actorUid: string) {
  const req = await prisma.leaveRequest.findUniqueOrThrow({
    where:   { id: requestId },
    include: { staff: { select: { id: true, uid: true, firstName: true, lastName: true, email: true } } },
  })
  if (req.status !== 'PENDING') throw new Error('Request is no longer pending.')

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

  const updated = await prisma.leaveRequest.update({
    where: { id: requestId },
    data: { status: data.status, reviewedByUid: actorUid, reviewedAt: new Date(), reviewNotes: data.reviewNotes ?? null },
  })

  if (['ANNUAL', 'SICK'].includes(req.leaveType)) {
    const year = req.startDate.getFullYear()
    const key = { staffId: req.staffId, leaveType: req.leaveType, year }
    if (data.status === 'APPROVED') {
      await prisma.leaveBalance.update({
        where: { staffId_leaveType_year: key },
        data: { pendingDays: { decrement: req.days }, usedDays: { increment: req.days } },
      })
      // Update staff status to ON_LEAVE
      await prisma.staffProfile.update({ where: { id: req.staffId }, data: { status: 'ON_LEAVE' } })
    } else {
      // Rejected — release pending days
      await prisma.leaveBalance.update({
        where: { staffId_leaveType_year: key },
        data: { pendingDays: { decrement: req.days } },
      })
    }
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

export async function listLeaveRequests(filters: { staffId?: string; status?: string } = {}) {
  return prisma.leaveRequest.findMany({
    where: {
      ...(filters.staffId ? { staffId: filters.staffId } : {}),
      ...(filters.status  ? { status: filters.status as 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' } : {}),
    },
    include: { staff: { select: { firstName: true, lastName: true, department: true, photoKey: true } } },
    orderBy: { createdAt: 'desc' },
  })
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

export async function requestLoan(staffId: string, data: LoanRequestInput) {
  const existing = await prisma.staffLoan.findFirst({
    where: { staffId, status: { in: ['PENDING','APPROVED','DISBURSED','REPAYING'] } },
  })
  if (existing) throw new Error('You already have an active loan. Settle it before applying for a new one.')

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
  return prisma.staffLoan.update({
    where: { id: loanId },
    data: { status: 'APPROVED', approvedByUid: actorUid, approvedAt: new Date() },
  })
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
  const loan = await prisma.staffLoan.update({
    where:   { id: loanId },
    data:    { status: 'DISBURSED', disbursedAt: new Date() },
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
  const loan = await prisma.staffLoan.findUniqueOrThrow({
    where:   { id: loanId },
    include: { staff: { select: { uid: true } } },
  })
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