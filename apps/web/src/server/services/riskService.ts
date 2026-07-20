/*
 * apps/web/src/server/services/riskService.ts — Phase D7
 *
 * [CHANGE TYPE]: MAJOR REWRITE of assessStudentRisk()'s data-gathering only
 *   (the risk-scoring thresholds/logic/resolveRiskLevel() are unaffected
 *   in this pass).
 * [R-PHASE]: R8 — Academics IV: Report Cards, Transcripts, Promotion & Risk
 *   Assessment
 * [PURPOSE]: Repointed the unconditionally-crashing `prisma.attendance.
 *   aggregate({_sum: {present, absent}})` call at attendanceService.
 *   getAttendanceSummaryForTerm() (R6's real Attendance model) — the
 *   assumed shape never existed on any Attendance model this codebase has
 *   had. Added proper error handling around each of the four factor
 *   queries (fee debt, academic performance, attendance, subject fails) —
 *   previously there was none, so a genuinely missing record (e.g. a
 *   brand-new student with no invoice yet) would throw and abort the
 *   entire assessment instead of that factor degrading gracefully to "no
 *   data, no risk contribution from this factor." getPassMarkThreshold()
 *   (already correctly imported and called here — the only confirmed live
 *   caller in the audit) is unaffected.
 * [DEPENDS ON]: apps/web/src/server/services/attendanceService.ts
 *   (getAttendanceSummaryForTerm)
 *
 * Multi-factor student risk assessment engine.
 * Replaces the lightweight computeRiskLevel() heuristic in studentService.ts.
 *
 * Risk factors evaluated:
 *   FEE_DEBT       — unpaid fees relative to total fee structure
 *   POOR_GRADES    — term/annual average below pass threshold
 *   HIGH_ABSENCE   — attendance below acceptable threshold
 *   SUBJECT_FAILS  — number of failed subjects in last assessed term
 *
 * Risk level assignment:
 *   HIGH   — any single HIGH-severity factor, or ≥ 2 factors of any severity
 *   MEDIUM — exactly 1 MEDIUM/LOW severity factor
 *   LOW    — no factors but borderline on one metric
 *   NONE   — all clear
 *
 * Usage:
 *   const { riskLevel, factors } = await assessStudentRisk(studentId, term, year)
 *   const batch = await assessClassRisk(classId, term, year)
 */

import 'server-only'
import { prisma }               from '@/lib/prisma'
import { logger }               from '@/lib/logger'
import { getPassMarkThreshold } from '@/server/services/gradeService'
import * as attendanceService   from '@/server/services/attendanceService'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type RiskLevel   = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
export type RiskFactorId = 'FEE_DEBT' | 'POOR_GRADES' | 'HIGH_ABSENCE' | 'SUBJECT_FAILS'

export interface RiskFactor {
  id:       RiskFactorId
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  detail:   string
}

export interface RiskAssessment {
  studentId:   string
  riskLevel:   RiskLevel
  factors:     RiskFactor[]
  assessedAt:  Date
  metrics: {
    feeDebtPct:   number   // outstanding / total fees * 100
    termAverage:  number   // last computed term average
    absencePct:   number   // days absent / total school days * 100
    subjectFails: number   // count of subjects below pass mark
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// THRESHOLDS
// ─────────────────────────────────────────────────────────────────────────────

const FEE_DEBT_HIGH   = 70   // %: > 70% balance remaining = HIGH risk
const FEE_DEBT_MEDIUM = 40   // %: 40–70% balance remaining = MEDIUM risk

const ABSENCE_HIGH   = 25   // %: > 25% absent = HIGH
const ABSENCE_MEDIUM = 15   // %: 15–25% absent = MEDIUM

const SUBJECT_FAILS_HIGH   = 4   // > 4 subjects failing = HIGH
const SUBJECT_FAILS_MEDIUM = 2   // 2–4 subjects failing = MEDIUM

// ─────────────────────────────────────────────────────────────────────────────
// LEVEL RESOLVER
// ─────────────────────────────────────────────────────────────────────────────

function resolveRiskLevel(factors: RiskFactor[]): RiskLevel {
  if (factors.length === 0) return 'NONE'
  if (factors.some((f) => f.severity === 'HIGH')) return 'HIGH'
  if (factors.length >= 2) return 'HIGH'
  if (factors.some((f) => f.severity === 'MEDIUM')) return 'MEDIUM'
  return 'LOW'
}

// ─────────────────────────────────────────────────────────────────────────────
// ASSESS SINGLE STUDENT
// ─────────────────────────────────────────────────────────────────────────────

export async function assessStudentRisk(
  studentId:    string,
  academicTerm: number,
  academicYear: string,
): Promise<RiskAssessment> {
  const passMark = await getPassMarkThreshold('INTERNAL_F1F2')
  const factors: RiskFactor[] = []

  // ── 1. Fee debt ────────────────────────────────────────────────────────────
  let feeDebtPct = 0
  try {
    // There is no StudentFee model — per-student fee balance lives on
    // Invoice (totalAmount, paidAmount, and the already-precomputed
    // balance = totalAmount - paidAmount). Aggregating `balance` directly
    // rather than re-deriving it from totalAmount/paidAmount matches how
    // the rest of the codebase (e.g. analyticsService.ts's
    // getFinanceOutstandingByClass) treats the stored balance field as
    // authoritative.
    const feeData = await prisma.invoice.aggregate({
      where: { studentId, academicYear },
      _sum:  { totalAmount: true, balance: true },
    })
    const feeTotal   = Number(feeData._sum.totalAmount ?? 0)
    const feeBalance = Number(feeData._sum.balance ?? 0)
    feeDebtPct = feeTotal > 0 ? (feeBalance / feeTotal) * 100 : 0

    if (feeDebtPct > FEE_DEBT_HIGH) {
      factors.push({
        id:       'FEE_DEBT',
        severity: 'HIGH',
        detail:   `${feeDebtPct.toFixed(0)}% of fees outstanding (MWK ${feeBalance.toLocaleString()} unpaid)`,
      })
    } else if (feeDebtPct > FEE_DEBT_MEDIUM) {
      factors.push({
        id:       'FEE_DEBT',
        severity: 'MEDIUM',
        detail:   `${feeDebtPct.toFixed(0)}% of fees outstanding (MWK ${feeBalance.toLocaleString()} unpaid)`,
      })
    }
  } catch (err) {
    logger.error({ event: 'risk.fee_debt_error', studentId, err }, 'Fee debt factor degraded — no data')
  }

  // ── 2. Academic performance ────────────────────────────────────────────────
  let termAverage = 0
  try {
    const termResult = await prisma.termResult.findFirst({
      where:   { studentId, academicYear, term: academicTerm },
      orderBy: { createdAt: 'desc' },
    })
    termAverage = termResult ? Number(termResult.average) : 0

    if (termResult) {
      if (termAverage < passMark - 5) {
        factors.push({
          id:       'POOR_GRADES',
          severity: 'HIGH',
          detail:   `Term average ${termAverage.toFixed(1)}% is below pass mark of ${passMark}%`,
        })
      } else if (termAverage < passMark + 5) {
        factors.push({
          id:       'POOR_GRADES',
          severity: 'MEDIUM',
          detail:   `Term average ${termAverage.toFixed(1)}% is borderline (pass mark ${passMark}%)`,
        })
      }
    }
  } catch (err) {
    logger.error({ event: 'risk.academic_error', studentId, err }, 'Academic performance factor degraded — no data')
  }

  // ── 3. Attendance ──────────────────────────────────────────────────────────
  let absencePct = 0
  try {
    const { daysAbsent, totalDays } = await attendanceService.getAttendanceSummaryForTerm(
      studentId, academicYear, academicTerm,
    )
    absencePct = totalDays > 0 ? (daysAbsent / totalDays) * 100 : 0

    if (absencePct > ABSENCE_HIGH) {
      factors.push({
        id:       'HIGH_ABSENCE',
        severity: 'HIGH',
        detail:   `${absencePct.toFixed(0)}% absence rate (${daysAbsent} days absent)`,
      })
    } else if (absencePct > ABSENCE_MEDIUM) {
      factors.push({
        id:       'HIGH_ABSENCE',
        severity: 'MEDIUM',
        detail:   `${absencePct.toFixed(0)}% absence rate (${daysAbsent} days absent)`,
      })
    }
  } catch (err) {
    logger.error({ event: 'risk.attendance_error', studentId, err }, 'Attendance factor degraded — no data')
  }

  // ── 4. Subject fails ───────────────────────────────────────────────────────
  let subjectFails = 0
  try {
    const marks = await prisma.examMark.findMany({
      where: {
        studentId,
        exam: {
          academicYear,
          status:    'RESULTS_RELEASED',
        },
      },
      include: {
        exam: { select: { maxMark: true } },
      },
    })

    for (const m of marks) {
      const markNum = Number(m.mark ?? 0)
      const maxMark = Number(m.exam.maxMark)
      const pct     = maxMark > 0 ? (markNum / maxMark) * 100 : 0
      if (pct < passMark) subjectFails++
    }

    if (subjectFails > SUBJECT_FAILS_HIGH) {
      factors.push({
        id:       'SUBJECT_FAILS',
        severity: 'HIGH',
        detail:   `${subjectFails} subjects below pass mark of ${passMark}%`,
      })
    } else if (subjectFails >= SUBJECT_FAILS_MEDIUM) {
      factors.push({
        id:       'SUBJECT_FAILS',
        severity: 'MEDIUM',
        detail:   `${subjectFails} subjects below pass mark of ${passMark}%`,
      })
    }
  } catch (err) {
    logger.error({ event: 'risk.subject_fails_error', studentId, err }, 'Subject fails factor degraded — no data')
  }

  return {
    studentId,
    riskLevel:  resolveRiskLevel(factors),
    factors,
    assessedAt: new Date(),
    metrics: {
      feeDebtPct,
      termAverage,
      absencePct,
      subjectFails,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ASSESS ENTIRE CLASS (batch)
// Used by the class dashboard and the attendanceRiskJob cron.
// ─────────────────────────────────────────────────────────────────────────────

export async function assessClassRisk(
  classId:      string,
  academicTerm: number,
  academicYear: string,
): Promise<RiskAssessment[]> {
  const students = await prisma.student.findMany({
    where:  { classId, status: 'ACTIVE' },
    select: { id: true },
  })
  return Promise.all(
    students.map((s) => assessStudentRisk(s.id, academicTerm, academicYear)),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHOOL-WIDE RISK SUMMARY (for dashboard widgets)
// ─────────────────────────────────────────────────────────────────────────────

export interface SchoolRiskSummary {
  HIGH:   number
  MEDIUM: number
  LOW:    number
  NONE:   number
  total:  number
}

export async function getSchoolRiskSummary(
  academicTerm: number,
  academicYear: string,
): Promise<SchoolRiskSummary> {
  const students = await prisma.student.findMany({
    where:  { status: 'ACTIVE' },
    select: { id: true },
  })

  const results = await Promise.all(
    students.map((s) => assessStudentRisk(s.id, academicTerm, academicYear)),
  )

  const summary: SchoolRiskSummary = { HIGH: 0, MEDIUM: 0, LOW: 0, NONE: 0, total: students.length }
  for (const r of results) summary[r.riskLevel]++
  return summary
}