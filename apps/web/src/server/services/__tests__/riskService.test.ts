/**
 * riskService.test.ts
 * [CHANGE TYPE]: REWRITTEN for the unified risk engine.
 *
 * Two layers are tested separately, mirroring the service's own structure:
 *   1. evaluateRisk()/buildInsights()/redactAssessment() — PURE: facts + config
 *      in, assessment out. Pins the aggregation rules (single HIGH => HIGH, two
 *      MEDIUMs in different modules => HIGH, library weighted half, compounding).
 *   2. assessStudents() — the batched DB reads, against mocked Prisma. Pins the
 *      things that used to be wrong: arrears carry over from earlier terms,
 *      subject fails are scoped to the viewed term, library is included, the
 *      whole page is ONE batch, and a DB failure degrades to NONE instead of
 *      throwing into the screen that asked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SETTING_META } from '@shared/types/settings'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    gradingScale: { findMany: vi.fn() },
    student:      { findMany: vi.fn() },
    invoice:      { findMany: vi.fn() },
    termResult:   { findMany: vi.fn() },
    examMark:     { findMany: vi.fn() },
    attendance:   { findMany: vi.fn() },
    borrowing:    { findMany: vi.fn() },
    libraryFine:  { findMany: vi.fn() },
  },
}))

// Admin thresholds resolve to their documented defaults.
vi.mock('@/server/services/settingsService', () => ({
  get: vi.fn(async (key: string) => (SETTING_META as Record<string, { defaultValue: unknown }>)[key]?.defaultValue),
}))

import { prisma } from '@/lib/prisma'
import { DEFAULT_GRADING_SCALES } from '../gradeService'
import * as risk from '../riskService'

type Fn = ReturnType<typeof vi.fn>
const mp = prisma as unknown as Record<string, { findMany: Fn }>

const PERIOD = { academicYear: '2025/2026', term: 2 }
const CFG: risk.RiskConfig = {
  passMark: 35,
  feeDebtHigh: 70, feeDebtMedium: 40,
  absenceHigh: 25, absenceMedium: 15,
  subjectFailsHigh: 4, subjectFailsMedium: 2,
  libraryOverdueDaysHigh: 30, libraryOverdueDaysMedium: 14, libraryFinesMedium: 5000,
}

function facts(mut: (f: risk.RiskFacts) => void = () => {}): risk.RiskFacts {
  const f: risk.RiskFacts = {
    studentId: 's',
    fees:       { billed: 0, balance: 0, overdueDays: 0 },
    results:    { termAverage: null, previousAverage: null, subjectFails: 0, subjectsAssessed: 0, missedExams: 0 },
    attendance: { present: 0, absent: 0, late: 0, trailingAbsentStreak: 0, streakIsRecent: false },
    library:    { overdueCount: 0, maxDaysOverdue: 0, lostCount: 0, pendingFines: 0 },
  }
  mut(f)
  return f
}
const level = (mut: (f: risk.RiskFacts) => void) => risk.evaluateRisk(facts(mut), CFG, PERIOD).riskLevel

describe('evaluateRisk — single modules', () => {
  it('a clean student is NONE with no factors', () => {
    const a = risk.evaluateRisk(facts(), CFG, PERIOD)
    expect(a.riskLevel).toBe('NONE')
    expect(a.factors).toHaveLength(0)
    expect(a.riskScore).toBe(0)
  })

  it('fees: >70% unpaid is HIGH, >40% MEDIUM, small-but-overdue LOW, small-and-current NONE', () => {
    expect(level((f) => { f.fees = { billed: 100000, balance: 80000, overdueDays: 0 } })).toBe('HIGH')
    expect(level((f) => { f.fees = { billed: 100000, balance: 50000, overdueDays: 0 } })).toBe('MEDIUM')
    expect(level((f) => { f.fees = { billed: 100000, balance: 5000,  overdueDays: 12 } })).toBe('LOW')
    expect(level((f) => { f.fees = { billed: 100000, balance: 5000,  overdueDays: 0 } })).toBe('NONE')
  })

  it('academics: below pass mark HIGH, borderline MEDIUM, healthy NONE; decline and missed exams register', () => {
    expect(level((f) => { f.results.termAverage = 20 })).toBe('HIGH')
    expect(level((f) => { f.results.termAverage = 37 })).toBe('MEDIUM')
    expect(level((f) => { f.results.termAverage = 60 })).toBe('NONE')
    expect(level((f) => { f.results.subjectFails = 5 })).toBe('HIGH')
    expect(level((f) => { f.results.subjectFails = 2 })).toBe('MEDIUM')
    expect(level((f) => { f.results.termAverage = 55; f.results.previousAverage = 75 })).toBe('MEDIUM')
    expect(level((f) => { f.results.missedExams = 1 })).toBe('LOW')
  })

  it('attendance: rate thresholds and an ONGOING streak, but not a stale one', () => {
    expect(level((f) => { f.attendance.present = 70; f.attendance.absent = 30 })).toBe('HIGH')
    expect(level((f) => { f.attendance.present = 82; f.attendance.absent = 18 })).toBe('MEDIUM')
    expect(level((f) => { f.attendance = { present: 60, absent: 5, late: 0, trailingAbsentStreak: 5, streakIsRecent: true } })).toBe('HIGH')
    expect(level((f) => { f.attendance = { present: 60, absent: 5, late: 0, trailingAbsentStreak: 5, streakIsRecent: false } })).toBe('NONE')
  })

  it('library alone is weighted half: a HIGH library problem is MEDIUM, a minor one LOW', () => {
    expect(level((f) => { f.library.overdueCount = 1; f.library.maxDaysOverdue = 40 })).toBe('MEDIUM')
    expect(level((f) => { f.library.overdueCount = 1; f.library.maxDaysOverdue = 3 })).toBe('LOW')
    expect(level((f) => { f.library.pendingFines = 6000 })).toBe('LOW')
  })
})

describe('evaluateRisk — modules combine', () => {
  const mediumFees = (f: risk.RiskFacts) => { f.fees = { billed: 100000, balance: 50000, overdueDays: 0 } }
  const mediumAbsence = (f: risk.RiskFacts) => { f.attendance.present = 82; f.attendance.absent = 18 }

  it('two MEDIUM problems in different modules escalate to HIGH (each alone is only MEDIUM)', () => {
    expect(level(mediumFees)).toBe('MEDIUM')
    expect(level(mediumAbsence)).toBe('MEDIUM')
    const both = risk.evaluateRisk(facts((f) => { mediumFees(f); mediumAbsence(f) }), CFG, PERIOD)
    expect(both.riskLevel).toBe('HIGH')
    expect(both.domains.sort()).toEqual(['ATTENDANCE', 'FEES'])
    expect(both.insights.join(' ')).toMatch(/dropout/i)
  })

  it('a MEDIUM fee problem plus a trivial library one stays MEDIUM', () => {
    expect(level((f) => { mediumFees(f); f.library.overdueCount = 1; f.library.maxDaysOverdue = 3 })).toBe('MEDIUM')
  })

  it('everything wrong caps at 100 and lists the most severe factor first', () => {
    const a = risk.evaluateRisk(facts((f) => {
      f.fees = { billed: 100000, balance: 80000, overdueDays: 20 }
      f.attendance = { present: 60, absent: 40, late: 0, trailingAbsentStreak: 6, streakIsRecent: true }
      f.results.termAverage = 22; f.results.subjectFails = 6
      f.library = { overdueCount: 2, maxDaysOverdue: 35, lostCount: 1, pendingFines: 12000 }
    }), CFG, PERIOD)
    expect(a.riskScore).toBe(100)
    expect(a.riskLevel).toBe('HIGH')
    expect(a.factors[0]?.severity).toBe('HIGH')
    expect(a.insights.some((i) => /span 4 areas/.test(i))).toBe(true)
  })
})

describe('redactAssessment', () => {
  const full = risk.evaluateRisk(facts((f) => {
    f.fees = { billed: 100000, balance: 80000, overdueDays: 0 }
    f.results.termAverage = 22
  }), CFG, PERIOD)

  it('hides fee amounts and zeroes fee metrics for a viewer without fee access, keeping the level', () => {
    const r = risk.redactAssessment(full, { fees: false, library: true, attendance: true })
    expect(r.factors.find((x) => x.id === 'FEE_DEBT')?.detail).not.toMatch(/MWK|\d%/)
    expect(r.metrics.feeBalance).toBe(0)
    expect(r.riskLevel).toBe(full.riskLevel)
    expect(r.factors.find((x) => x.id === 'POOR_GRADES')?.detail).toMatch(/22\.0%/)
  })

  it('riskViewerFor: a student can never see risk', () => {
    expect(risk.riskViewerFor('student').canViewRisk).toBe(false)
    expect(risk.riskViewerFor(undefined).canViewRisk).toBe(false)
    expect(risk.riskViewerFor('admin').canViewRisk).toBe(true)
  })
})

describe('assessStudents — batched reads', () => {
  const NOW = Date.now()
  const day = 86_400_000

  beforeEach(() => {
    vi.clearAllMocks()
    risk.invalidateRiskOverview()
    mp.gradingScale!.findMany.mockResolvedValue(DEFAULT_GRADING_SCALES)
    mp.student!.findMany.mockResolvedValue([{ id: 'stu-1', firstName: 'A', lastName: 'B', classId: 'c1', class: { form: 2, name: '2A' } }])
    for (const k of ['invoice', 'termResult', 'examMark', 'attendance', 'borrowing', 'libraryFine']) {
      mp[k]!.findMany.mockResolvedValue([])
    }
  })

  it('returns NONE with zeroed metrics for a student with no data', async () => {
    const a = await risk.assessStudentRisk('stu-1', 2, '2025/2026')
    expect(a.riskLevel).toBe('NONE')
    expect(a.metrics.feeBalance).toBe(0)
    expect(a.metrics.termAverage).toBeNull()
  })

  it('assesses a whole page of students with ONE query per source, not one per student', async () => {
    const ids = Array.from({ length: 25 }, (_, i) => `s${i}`)
    await risk.assessStudents(ids, PERIOD)
    for (const k of ['invoice', 'termResult', 'examMark', 'attendance', 'borrowing', 'libraryFine']) {
      expect(mp[k]!.findMany).toHaveBeenCalledTimes(1)
    }
  })

  it('counts arrears from an earlier term while viewing a later one (invoices up to the viewed term)', async () => {
    mp.invoice!.findMany.mockResolvedValue([
      { studentId: 'stu-1', totalAmount: 100000, balance: 100000, dueDate: new Date(NOW - 60 * day) },  // Term 1, unpaid
      { studentId: 'stu-1', totalAmount: 100000, balance: 0,      dueDate: new Date(NOW + 10 * day) },  // Term 2, paid
    ])
    const a = await risk.assessStudentRisk('stu-1', 2, '2025/2026')
    expect(a.metrics.feeBalance).toBe(100000)
    expect(a.metrics.feeDebtPct).toBeCloseTo(50)
    expect(a.factors.find((f) => f.id === 'FEE_DEBT')?.severity).toBe('MEDIUM')
    // The where-clause must ask for terms <= the viewed term of the viewed year.
    expect(mp.invoice!.findMany.mock.calls[0]![0].where).toMatchObject({ academicYear: '2025/2026', term: { lte: 2 } })
  })

  it('scopes subject fails to the viewed term and averages repeated exams per subject', async () => {
    mp.examMark!.findMany.mockResolvedValue([
      { studentId: 'stu-1', mark: 20, absent: false, exam: { subject: 'Maths',   maxMark: 100, weightPercent: 100 } },
      { studentId: 'stu-1', mark: 30, absent: false, exam: { subject: 'Maths',   maxMark: 100, weightPercent: 100 } },  // Maths avg 25 -> fail
      { studentId: 'stu-1', mark: 80, absent: false, exam: { subject: 'English', maxMark: 100, weightPercent: 100 } },  // pass
      { studentId: 'stu-1', mark: null, absent: true, exam: { subject: 'Biology', maxMark: 100, weightPercent: 100 } }, // missed
    ])
    const a = await risk.assessStudentRisk('stu-1', 2, '2025/2026')
    expect(a.metrics.subjectFails).toBe(1)
    expect(a.factors.find((f) => f.id === 'MISSED_EXAMS')?.severity).toBe('LOW')
    expect(mp.examMark!.findMany.mock.calls[0]![0].where.exam).toMatchObject({ academicYear: '2025/2026', term: 2, status: 'RESULTS_RELEASED' })
  })

  it('prefers a stored term result over the average derived from marks, and reads the previous term for decline', async () => {
    mp.termResult!.findMany.mockResolvedValue([
      { studentId: 'stu-1', term: 2, average: 50 },
      { studentId: 'stu-1', term: 1, average: 72 },
    ])
    const a = await risk.assessStudentRisk('stu-1', 2, '2025/2026')
    expect(a.metrics.termAverage).toBe(50)
    expect(a.factors.find((f) => f.id === 'GRADE_DECLINE')?.severity).toBe('MEDIUM')
  })

  it('includes the library: an overdue book plus unpaid fines raise the library module', async () => {
    mp.borrowing!.findMany.mockResolvedValue([{ studentId: 'stu-1', dueDate: new Date(NOW - 40 * day) }])
    mp.libraryFine!.findMany.mockResolvedValue([{ studentId: 'stu-1', amount: 3000, borrowing: { status: 'OVERDUE' } }])
    const a = await risk.assessStudentRisk('stu-1', 2, '2025/2026')
    expect(a.domains).toContain('LIBRARY')
    expect(a.metrics.libraryOverdue).toBe(1)
    expect(a.metrics.libraryFines).toBe(3000)
    expect(a.factors.find((f) => f.id === 'LIBRARY_OVERDUE')?.severity).toBe('HIGH')
  })

  it('combines fees + attendance + library from the database into one HIGH badge', async () => {
    mp.invoice!.findMany.mockResolvedValue([{ studentId: 'stu-1', totalAmount: 100000, balance: 50000, dueDate: new Date(NOW + day) }])
    mp.attendance!.findMany.mockResolvedValue([
      ...Array.from({ length: 82 }, () => ({ studentId: 'stu-1', date: new Date(NOW - 30 * day), status: 'PRESENT' })),
      ...Array.from({ length: 18 }, () => ({ studentId: 'stu-1', date: new Date(NOW - 20 * day), status: 'ABSENT' })),
    ])
    mp.borrowing!.findMany.mockResolvedValue([{ studentId: 'stu-1', dueDate: new Date(NOW - 20 * day) }])
    const a = await risk.assessStudentRisk('stu-1', 2, '2025/2026')
    expect(a.riskLevel).toBe('HIGH')
    expect(a.domains.sort()).toEqual(['ATTENDANCE', 'FEES', 'LIBRARY'])
    expect(a.insights.length).toBeGreaterThan(0)
  })

  it('degrades to NONE (and does not throw) when the database fails', async () => {
    mp.invoice!.findMany.mockRejectedValue(new Error('db down'))
    const a = await risk.assessStudentRisk('stu-1', 2, '2025/2026')
    expect(a.riskLevel).toBe('NONE')
    expect(a.studentId).toBe('stu-1')
  })
})

describe('school-wide views', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    risk.invalidateRiskOverview()
    mp.gradingScale!.findMany.mockResolvedValue(DEFAULT_GRADING_SCALES)
    for (const k of ['invoice', 'termResult', 'examMark', 'attendance', 'borrowing', 'libraryFine']) mp[k]!.findMany.mockResolvedValue([])
  })

  it('counts every active student across the buckets and per module', async () => {
    mp.student!.findMany.mockResolvedValue([
      { id: 'stu-1', firstName: 'A', lastName: 'One', classId: 'c1', class: { form: 2, name: '2A' } },
      { id: 'stu-2', firstName: 'B', lastName: 'Two', classId: 'c2', class: { form: 2, name: '2B' } },
    ])
    mp.invoice!.findMany.mockResolvedValue([{ studentId: 'stu-1', totalAmount: 100000, balance: 90000, dueDate: new Date(Date.now() + 86_400_000) }])
    const s = await risk.getSchoolRiskSummary(2, '2025/2026')
    expect(s.total).toBe(2)
    expect(s.HIGH + s.MEDIUM + s.LOW + s.NONE).toBe(2)
    expect(s.HIGH).toBe(1)
    expect(s.byDomain.FEES).toBe(1)
  })

  it('getHighRiskStudents ranks worst first and can be scoped to a teacher\'s classes', async () => {
    mp.student!.findMany.mockResolvedValue([
      { id: 'stu-1', firstName: 'A', lastName: 'One', classId: 'c1', class: { form: 2, name: '2A' } },
      { id: 'stu-2', firstName: 'B', lastName: 'Two', classId: 'c2', class: { form: 2, name: '2B' } },
    ])
    mp.invoice!.findMany.mockResolvedValue([
      { studentId: 'stu-1', totalAmount: 100000, balance: 80000, dueDate: new Date(Date.now() + 86_400_000) },
      { studentId: 'stu-2', totalAmount: 100000, balance: 95000, dueDate: new Date(Date.now() - 20 * 86_400_000) },
    ])
    // stu-2 is worse in two modules (fees AND a 40-day-overdue book), stu-1 only in fees.
    mp.borrowing!.findMany.mockResolvedValue([{ studentId: 'stu-2', dueDate: new Date(Date.now() - 40 * 86_400_000) }])
    const all = await risk.getHighRiskStudents(2, '2025/2026', 6)
    expect(all.map((s) => s.id)).toEqual(['stu-2', 'stu-1'])      // compounded score outranks fees alone
    const mine = await risk.getHighRiskStudents(2, '2025/2026', 6, ['c1'])
    expect(mine.map((s) => s.id)).toEqual(['stu-1'])
  })
})
