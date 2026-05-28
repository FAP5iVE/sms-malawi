import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { uploadFile, STORAGE_BUCKETS } from '@/lib/storage'
import { differenceInBusinessDays, isWeekend } from 'date-fns'
import type {
  CreateStaffInput, LeaveRequestInput, ReviewLeaveInput,
  LoanRequestInput, PerformanceNoteInput
} from '@shared/schemas/hr'
import type { LeaveType, Prisma} from '@prisma/client'
  
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
  logger.info({ event: 'staff.create', staffId: staff.id, actorUid })
  return staff
}

export async function uploadStaffPhoto(staffId: string, buffer: Buffer, filename: string): Promise<string> {
  const fileId = await uploadFile(STORAGE_BUCKETS.STUDENT_FILES, buffer, filename, 'image/jpeg')
  await prisma.staffProfile.update({ where: { id: staffId }, data: { photoKey: fileId } })
  return fileId
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
  const req = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: requestId } })
  if (req.status !== 'PENDING') throw new Error('Request is no longer pending.')

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
  logger.info({ event: 'leave.reviewed', requestId, status: data.status, actorUid })
  return updated
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

export async function disburseLoan(loanId: string) {
  return prisma.staffLoan.update({
    where: { id: loanId },
    data: { status: 'DISBURSED', disbursedAt: new Date() },
  })
}

export async function recordLoanRepayment(loanId: string, amount: number) {
  const loan = await prisma.staffLoan.findUniqueOrThrow({ where: { id: loanId } })
  const newBalance = Math.max(0, Number(loan.balance) - amount)
  const newRepaid  = Number(loan.totalRepaid) + amount
  const settled    = newBalance === 0
  return prisma.staffLoan.update({
    where: { id: loanId },
    data: { balance: newBalance, totalRepaid: newRepaid, status: settled ? 'SETTLED' : 'REPAYING' },
  })
}

// ─── PERFORMANCE NOTES ───────────────────────────────────
export async function addPerformanceNote(data: PerformanceNoteInput, actorUid: string) {
  return prisma.performanceNote.create({ data: { ...data, authorUid: actorUid } })
}

export async function getContractExpiryAlert(daysAhead: number) {
  const target = new Date()
  target.setDate(target.getDate() + daysAhead)
  const today   = new Date()
  return prisma.staffProfile.findMany({
    where: { contractExpiry: { gte: today, lte: target }, status: 'ACTIVE' },
    select: { id: true, firstName: true, lastName: true, email: true, contractExpiry: true, department: true },
  })
}