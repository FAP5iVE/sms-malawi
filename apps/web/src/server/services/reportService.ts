/**
 * apps/web/src/server/services/reportService.ts
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R14 — Analytics & Reports Domain
 * [PURPOSE]: Two confirmed defects, both of which silently returned wrong
 *   data rather than failing visibly.
 *
 *   1. getAcademicReport(teacherUid, academicYear) — its own comment says
 *      "Teacher sees their own classes' performance", but its
 *      prisma.class.findMany() filtered on academicYear ALONE, with no
 *      teacherId constraint at all, so it returned the ENTIRE school's class
 *      performance to any academic-role caller. The teacherUid parameter was
 *      accepted, echoed back in the response, and otherwise unused. This is
 *      inconsistent with analyticsService's correctly-scoped
 *      getAcademicClassSubjectPerformance()/getAcademicAssignmentCompletion(),
 *      which answer the same framing for the same role and DO scope by
 *      teacher. The missing `teacherId: teacherUid` constraint is added.
 *
 *   2. getHRReport() — its contract-expiry lookahead was a hardcoded 60-day
 *      literal (`60 * 24 * 60 * 60 * 1000`), a second independent hardcoding
 *      of the same window the contract-alert pipeline uses, free to drift
 *      from it silently. Now read from
 *      SETTING_KEYS.HR_CONTRACT_EXPIRY_LOOKAHEAD_DAYS (S/types/settings.ts,
 *      same phase) — the admin-configurable source — and echoed back on the
 *      response as `lookaheadDays` so the report can state the window it
 *      actually applied rather than leaving the reader to assume one.
 *
 *   Also adds `import 'server-only'`, matching every other service file.
 * [DEPENDS ON]: S/types/settings.ts (HR_CONTRACT_EXPIRY_LOOKAHEAD_DAYS),
 *   W/server/services/settingsService.ts
 */
import 'server-only'
import { prisma }  from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { SETTING_KEYS } from '@shared/types/settings'
import * as settingsService from '@/server/services/settingsService'

// ─── ADMIN REPORTS ────────────────────────────────────────
export async function getAdminSystemReport() {
  const [
    totalStudents, activeStudents, totalStaff,
    totalInvoices, paidInvoices, totalExams,
    recentAudit
  ] = await prisma.$transaction([
    prisma.student.count(),
    prisma.student.count({ where: { status: 'ACTIVE' } }),
    prisma.staffProfile.count({ where: { status: 'ACTIVE' } }),
    prisma.invoice.count(),
    prisma.invoice.count({ where: { status: 'PAID' } }),
    prisma.exam.count(),
    prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
  ])
  return { totalStudents, activeStudents, totalStaff, totalInvoices, paidInvoices, totalExams, recentAudit }
}

// ─── HIGH RANK REPORTS ───────────────────────────────────
export async function getSchoolPerformanceReport(academicYear: string, term: number) {
  const [termResults, classStats, enrollmentByForm] = await prisma.$transaction([
    prisma.termResult.findMany({
      where: { academicYear, term },
      select: { average: true, passStatus: true, grade: true, classId: true },
    }),
    prisma.class.findMany({
      where: { academicYear },
      include: { _count: { select: { students: true } } },
      orderBy: { form: 'asc' },
    }),
    prisma.student.groupBy({
  by: ['classId'],
  where: { status: 'ACTIVE' },
  _count: true,
  orderBy: { classId: 'asc' },
    }),
  ])
  const overall = termResults.length > 0 ? {
    passRate: Math.round((termResults.filter((r) => r.passStatus).length / termResults.length) * 100),
    average: Math.round((termResults.reduce((s, r) => s + Number(r.average), 0) / termResults.length) * 100) / 100,
    total: termResults.length,
  } : null
  return { overall, classStats, enrollmentByForm }
}

// ─── FINANCE REPORTS ─────────────────────────────────────
export async function getFeeCollectionReport(academicYear: string, term?: number) {
  const where = { academicYear, ...(term ? { term } : {}) }
  const [invoices, expenses, payrollRuns] = await prisma.$transaction([
    prisma.invoice.findMany({
      where,
      select: { totalAmount: true, paidAmount: true, balance: true, status: true, term: true, studentId: true },
    }),
    prisma.expense.findMany({
      where: { academicYear, status: 'APPROVED' },
      select: { amount: true, category: true, incurredAt: true },
    }),
    prisma.payrollRun.findMany({
      select: { month: true, year: true, totalNet: true, status: true },
      orderBy: { createdAt: 'desc' },
      take: 12,
    }),
  ])
  const collected   = invoices.reduce((s, i) => s + Number(i.paidAmount), 0)
  const outstanding = invoices.reduce((s, i) => s + Number(i.balance), 0)
  const target      = invoices.reduce((s, i) => s + Number(i.totalAmount), 0)
  const collectionPct = target > 0 ? Math.round((collected / target) * 100) : 0
  return { collected, outstanding, target, collectionPct, invoices, expenses, payrollRuns }
}

// ─── LIBRARY REPORTS ─────────────────────────────────────
export async function getLibraryReport() {
  const [stats, overdueBorrowings, topBooks, pendingApprovals] = await prisma.$transaction([
    prisma.book.aggregate({ _sum: { totalCopies: true, availableCopies: true } }),
    prisma.borrowing.findMany({
      where: { status: 'OVERDUE' },
      include: { book: { select: { title: true, author: true } } },
      orderBy: { dueDate: 'asc' },
      take: 50,
    }),
    prisma.borrowing.groupBy({
      by: ['bookId'],
      _count: true,
      orderBy: { _count: { bookId: 'desc' } },
      take: 10,
    }),
    prisma.digitalResource.count({ where: { approved: false } }),
  ])
  return { stats, overdueBorrowings, topBooks, pendingApprovals }
}

// ─── HR REPORTS ──────────────────────────────────────────
export async function getHRReport() {
  // [R14] Was a hardcoded 60-day window. Contract-expiry lookahead is a real
  // school policy value, so it comes from SystemSettings — the mechanism that
  // exists precisely so a value like this is never a literal, and never a
  // SECOND literal independently maintained alongside the contract-alert
  // pipeline's own.
  const lookaheadDays = await settingsService.get(
    SETTING_KEYS.HR_CONTRACT_EXPIRY_LOOKAHEAD_DAYS,
  )
  const expiryCutoff = new Date(Date.now() + lookaheadDays * 24 * 60 * 60 * 1000)

  const [staffByDept, leaveUsage, activeLoans, expiringContracts] = await prisma.$transaction([
    prisma.staffProfile.groupBy({
      by: ['department'],
      _count: true,
      where: { status: 'ACTIVE' },
      orderBy: { department: 'asc' },
    }),
    prisma.leaveRequest.groupBy({
      by: ['leaveType'],
      _count: true,
      orderBy: { leaveType: 'asc' },
      where: { status: 'APPROVED', startDate: { gte: new Date(new Date().getFullYear(), 0, 1) } },
    }),
    prisma.staffLoan.findMany({
      where: { status: { in: ['DISBURSED','REPAYING'] } },
      select: { amount: true, balance: true, totalRepaid: true },
    }),
    prisma.staffProfile.count({
      where: { contractExpiry: { lte: expiryCutoff }, status: 'ACTIVE' },
    }),
  ])
  const totalLoanBalance = activeLoans.reduce((s, l) => s + Number(l.balance), 0)
  return {
    staffByDept,
    leaveUsage,
    activeLoans: activeLoans.length,
    totalLoanBalance,
    expiringContracts,
    lookaheadDays,
  }
}

// ─── ACADEMIC REPORTS ────────────────────────────────────
export async function getAcademicReport(teacherUid: string, academicYear: string) {
  // [R14] `teacherId: teacherUid` was missing entirely. This function's own
  // comment has always said "Teacher sees their own classes' performance",
  // but the query filtered on academicYear alone — so it returned every class
  // in the school to any academic-role caller, and the teacherUid argument
  // was accepted, echoed back in the response, and otherwise never used.
  const myClasses = await prisma.class.findMany({
    where: { academicYear, teacherId: teacherUid },
    select: { id: true, name: true, form: true },
    orderBy: [{ form: 'asc' }, { name: 'asc' }],
  })

  // For each class, get term results summary
  const summaries = await Promise.all(
    myClasses.map(async (c) => {
      const results = await prisma.termResult.findMany({
        where: { classId: c.id, academicYear },
        select: { average: true, passStatus: true, term: true },
      })
      return {
        classId: c.id,
        className: c.name,
        form: c.form,
        total: results.length,
        passRate: results.length > 0 ? Math.round((results.filter((r) => r.passStatus).length / results.length) * 100) : 0,
        avg: results.length > 0 ? Math.round(results.reduce((s, r) => s + Number(r.average), 0) / results.length * 10) / 10 : 0,
      }
    })
  )
  return { summaries, teacherUid, academicYear }
}

// ─── EXAM OFFICER REPORTS ────────────────────────────────
export async function getExamOfficerReport(academicYear: string, term: number) {
  const [pendingMarks, approvedResults, manebRecords] = await prisma.$transaction([
    prisma.exam.count({ where: { academicYear, term, status: { in: ['MARKS_PENDING','MARKS_DRAFT'] } } }),
    prisma.exam.count({ where: { academicYear, term, status: 'RESULTS_APPROVED' } }),
    prisma.manebRecord.findMany({ where: { academicYear }, orderBy: { candidateNo: 'asc' } }),
  ])
  return { pendingMarks, approvedResults, manebRecords }
}

// ─── STUDENT REPORTS (own results only) ─────────────────
export async function getStudentReport(studentId: string) {
  const [results, borrowings] = await prisma.$transaction([
    prisma.termResult.findMany({ where: { studentId }, orderBy: [{ academicYear: 'desc' }, { term: 'desc' }] }),
    prisma.borrowing.findMany({
      where: { studentId, status: { in: ['ACTIVE','OVERDUE'] } },
      include: { book: { select: { title: true } } },
    }),
  ])
  return { results, borrowings }
}

// ─── AUDIT LOG VIEWER ────────────────────────────────────
export async function getAuditLogs(filters: {
  entityType?: string; actorUid?: string; action?: string
  from?: string; to?: string; page?: number; limit?: number
} = {}) {
  const { page = 1, limit = 50, from, to, entityType, actorUid, action } = filters
  const where: Prisma.AuditLogWhereInput = {}
  if (entityType) where.entityType = entityType
  if (actorUid)   where.actorUid   = actorUid
  if (action)     where.action     = { contains: action, mode: 'insensitive' }
  if (from || to) where.createdAt  = {
    ...(from ? { gte: new Date(from) } : {}),
    ...(to   ? { lte: new Date(to)   } : {}),
  }
  const [logs, total] = await prisma.$transaction([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.auditLog.count({ where }),
  ])
  return { logs, total, page, pages: Math.ceil(total / limit) }
}