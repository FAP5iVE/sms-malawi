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
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { uploadFile, FILE_PREFIX } from '@/lib/storage'
import { differenceInBusinessDays, isWeekend, addDays, startOfDay, endOfDay } from 'date-fns'
import type {
  CreateStaffInput, LeaveRequestInput, ReviewLeaveInput,
  LoanRequestInput, PerformanceNoteInput
} from '@shared/schemas/hr'
import type { LeaveType, Prisma} from '@prisma/client'
import * as algolia from '@/server/services/algoliaService'
import { checkLeaveConflicts, type ConflictCheckResult } from '@/server/services/leaveConflictService'
import * as notificationService from '@/server/services/notificationService'
  
// ─── STAFF PROFILES ─────────────────────────────────────
export async function listStaff(filters: {
  department?: string; status?: string; search?: string
} = {}) {
  const where:  Prisma.StaffProfileWhereInput = {}
  if (filters.department) where.department = filters.department
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

export async function createStaff(data: CreateStaffInput, actorUid: string) {
  const staff = await prisma.staffProfile.create({
    data: {
      ...data,
      dateJoined: new Date(data.dateJoined),
      contractExpiry: data.contractExpiry ? new Date(data.contractExpiry) : null,
      phone: data.phone ?? null,
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
  return staff
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

  return prisma.staffLoan.create({
    data: { staffId, amount: data.amount, monthlyDeduction: data.monthlyDeduction, balance: data.amount, reason: data.reason },
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