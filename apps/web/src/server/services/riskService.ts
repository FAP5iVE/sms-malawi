/*
 * apps/web/src/server/services/riskService.ts — unified student risk engine
 *
 * [CHANGE TYPE]: MAJOR REWRITE (built on the Phase D7 / R8 engine it replaces —
 *   same exports, same RiskLevel semantics, same factor ids where they existed).
 * [PURPOSE]: ONE place that answers "how at risk is this student?" for every
 *   screen in the app. Before this there were two engines that disagreed:
 *     • studentService.computeRiskLevel — fee debt on the LATEST invoice only,
 *       drove the Students list, the profile card and (by omission) the class
 *       roster. Its HIGH branch needed a termAverage that was never passed in,
 *       so HIGH was unreachable.
 *     • this file — a 4-factor engine that only fed a dashboard widget whose
 *       route (/students/at-risk) was never registered, and a weekly Algolia
 *       job. It ignored the library entirely, ignored the admin-configurable
 *       RISK_* settings (hard-coded its own constants), ignored the term for
 *       subject fails (counted the whole year), and ran ~5 queries PER STUDENT.
 *
 *   Now: every consumer calls assessStudents()/assessStudentRisk() and gets the
 *   same answer for the same (student, academic year, term).
 *
 * ARCHITECTURE (three layers, so each is testable and cheap):
 *   1. gatherFacts()   — batched reads, ~7 queries per 250 students regardless
 *                        of how many students are asked about.
 *   2. evaluateRisk()  — PURE function: facts + config -> assessment. No I/O.
 *   3. assessStudents() / dashboards / job — orchestration + caching of the
 *                        school-wide aggregates only. Per-student results are
 *                        always computed fresh so a payment, an attendance
 *                        mark, a returned book or a released result changes
 *                        the badge on the very next request.
 *
 * DOMAINS AND FACTORS (each domain maps to the module that owns the data):
 *   FEES        FEE_DEBT        arrears for the year up to the viewed term
 *   ACADEMICS   POOR_GRADES     term average vs pass mark
 *               SUBJECT_FAILS   subjects below pass mark IN THE VIEWED TERM
 *               GRADE_DECLINE   average fell vs the previous term
 *               MISSED_EXAMS    absent from released exams
 *   ATTENDANCE  HIGH_ABSENCE    absence rate for the term
 *               ABSENCE_STREAK  consecutive absences up to the latest record
 *   LIBRARY     LIBRARY_OVERDUE overdue books
 *               LIBRARY_FINES   unpaid fines and lost books
 *
 * AGGREGATION (how the factors combine into one badge):
 *   Each factor is HIGH/MEDIUM/LOW => 60/30/10 points. Within a domain the
 *   worst factor counts in full and the rest at 25% (one underlying problem
 *   isn't triple-counted). Domains are weighted (library counts half: an
 *   overdue book on its own is not a dropout signal). Concerns in SEVERAL
 *   domains compound (+10 for two, +20 for three or more) because a student
 *   who is behind on fees, absent AND failing is at disproportionate risk.
 *   Score >= 60 HIGH, >= 25 MEDIUM, >= 1 LOW, else NONE. Consequences:
 *     • any HIGH fee/academic/attendance problem alone => HIGH  (as before)
 *     • two MEDIUM problems in different domains        => HIGH  (as before)
 *     • a HIGH library problem alone                    => MEDIUM (new, deliberate)
 *   Thresholds come from the admin settings (RISK_*), not constants.
 *
 * [DEPENDS ON]: gradeService.getPassMarkThreshold, settingsService,
 *   attendanceService.getTermDateRange
 */

import 'server-only'
import { prisma }               from '@/lib/prisma'
import { logger }               from '@/lib/logger'
import { getPassMarkThreshold } from '@/server/services/gradeService'
import { getTermDateRange }     from '@/server/services/attendanceService'
import * as settingsService     from '@/server/services/settingsService'
import { SETTING_KEYS }         from '@shared/types/settings'
import { formatMWK }            from '@shared/constants/malawi'
import { hasPermission }        from '@shared/types/permissions'
import type { UserRole }        from '@shared/types/roles'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type RiskLevel  = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
export type RiskDomain = 'FEES' | 'ACADEMICS' | 'ATTENDANCE' | 'LIBRARY'
export type RiskFactorId =
  | 'FEE_DEBT'
  | 'POOR_GRADES' | 'SUBJECT_FAILS' | 'GRADE_DECLINE' | 'MISSED_EXAMS'
  | 'HIGH_ABSENCE' | 'ABSENCE_STREAK'
  | 'LIBRARY_OVERDUE' | 'LIBRARY_FINES'

export interface RiskFactor {
  id:       RiskFactorId
  domain:   RiskDomain
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  detail:   string
}

export interface RiskMetrics {
  feeDebtPct:     number          // outstanding / billed * 100 (year up to viewed term)
  feeBalance:     number          // MWK outstanding (same scope)
  termAverage:    number | null   // null = no results yet for the term
  subjectFails:   number
  absencePct:     number
  daysAbsent:     number
  libraryOverdue: number          // books currently overdue
  libraryFines:   number          // MWK of unpaid library fines
}

export interface RiskAssessment {
  studentId:   string
  riskLevel:   RiskLevel
  /** 0-100, for ordering and for the profile card. Higher = more at risk. */
  riskScore:   number
  factors:     RiskFactor[]
  /** Cross-domain observations ("fees + absence together …"). */
  insights:    string[]
  /** Which modules flagged something — drives deep links in the UI. */
  domains:     RiskDomain[]
  assessedAt:  Date
  academicYear: string
  term:         number
  metrics:     RiskMetrics
}

export interface RiskPeriod {
  academicYear: string
  term:         number
}

/** Everything the scorer needs about one student, already fetched. */
export interface RiskFacts {
  studentId: string
  fees: {
    billed:         number
    balance:        number
    /** Longest overdue among invoices that still have a balance (days; 0 = none). */
    overdueDays:    number
  }
  results: {
    termAverage:     number | null
    previousAverage: number | null
    subjectFails:    number
    subjectsAssessed: number
    missedExams:     number
  }
  attendance: {
    present: number
    absent:  number
    late:    number
    /** Consecutive ABSENT records at the end of the term's records. */
    trailingAbsentStreak: number
    /** true when the latest attendance record is recent (the streak is ongoing). */
    streakIsRecent: boolean
  }
  library: {
    overdueCount:   number
    maxDaysOverdue: number
    lostCount:      number
    pendingFines:   number   // MWK
  }
}

export interface RiskConfig {
  passMark:              number
  feeDebtHigh:           number
  feeDebtMedium:         number
  absenceHigh:           number
  absenceMedium:         number
  subjectFailsHigh:      number
  subjectFailsMedium:    number
  libraryOverdueDaysHigh:   number
  libraryOverdueDaysMedium: number
  libraryFinesMedium:    number
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORING CONSTANTS (the *shape* of the aggregation — the thresholds are settings)
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_POINTS: Record<RiskFactor['severity'], number> = { HIGH: 60, MEDIUM: 30, LOW: 10 }
const DOMAIN_WEIGHT:   Record<RiskDomain, number> = { FEES: 1, ACADEMICS: 1, ATTENDANCE: 1, LIBRARY: 0.5 }
const SECONDARY_FACTOR_SHARE = 0.25
const COMPOUND_BONUS = { 2: 10, 3: 20 } as const

const LEVEL_HIGH_AT   = 60
const LEVEL_MEDIUM_AT = 25

/** A GRADE_DECLINE needs at least this many points of drop to register. */
const DECLINE_MEDIUM_POINTS = 15
const DECLINE_LOW_POINTS    = 8
/** Consecutive absences that count as a streak. */
const STREAK_HIGH   = 5
const STREAK_MEDIUM = 3
/** A streak only matters while it is ongoing: latest record this recent. */
const STREAK_RECENT_DAYS = 14

const ID_CHUNK = 250
const DAY_MS   = 86_400_000

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 2 — PURE SCORING (no I/O; unit-tested directly)
// ─────────────────────────────────────────────────────────────────────────────

export function levelFromScore(score: number): RiskLevel {
  if (score >= LEVEL_HIGH_AT)   return 'HIGH'
  if (score >= LEVEL_MEDIUM_AT) return 'MEDIUM'
  if (score >= 1)               return 'LOW'
  return 'NONE'
}

function pct(n: number, d: number): number {
  return d > 0 ? (n / d) * 100 : 0
}

export function evaluateRisk(facts: RiskFacts, cfg: RiskConfig, period: RiskPeriod): RiskAssessment {
  const factors: RiskFactor[] = []
  const add = (f: RiskFactor) => { factors.push(f) }

  // ── FEES ───────────────────────────────────────────────────────────────────
  const feeDebtPct = pct(facts.fees.balance, facts.fees.billed)
  if (facts.fees.billed > 0 && facts.fees.balance > 0) {
    const owed = `${formatMWK(facts.fees.balance)} unpaid (${feeDebtPct.toFixed(0)}% of fees billed)`
    const overdue = facts.fees.overdueDays > 0 ? `, ${facts.fees.overdueDays} day(s) past due` : ''
    if (feeDebtPct > cfg.feeDebtHigh) {
      add({ id: 'FEE_DEBT', domain: 'FEES', severity: 'HIGH',   detail: `${owed}${overdue}` })
    } else if (feeDebtPct > cfg.feeDebtMedium) {
      add({ id: 'FEE_DEBT', domain: 'FEES', severity: 'MEDIUM', detail: `${owed}${overdue}` })
    } else if (facts.fees.overdueDays > 0) {
      // Small balance, but past its due date: an early, low-severity signal.
      add({ id: 'FEE_DEBT', domain: 'FEES', severity: 'LOW',    detail: `${owed}${overdue}` })
    }
  }

  // ── ACADEMICS ──────────────────────────────────────────────────────────────
  const { termAverage, previousAverage } = facts.results
  if (termAverage != null) {
    if (termAverage < cfg.passMark - 5) {
      add({ id: 'POOR_GRADES', domain: 'ACADEMICS', severity: 'HIGH',
            detail: `Term average ${termAverage.toFixed(1)}% is below the pass mark of ${cfg.passMark}%` })
    } else if (termAverage < cfg.passMark + 5) {
      add({ id: 'POOR_GRADES', domain: 'ACADEMICS', severity: 'MEDIUM',
            detail: `Term average ${termAverage.toFixed(1)}% is borderline (pass mark ${cfg.passMark}%)` })
    }
    if (previousAverage != null) {
      const drop = previousAverage - termAverage
      if (drop >= DECLINE_MEDIUM_POINTS) {
        add({ id: 'GRADE_DECLINE', domain: 'ACADEMICS', severity: 'MEDIUM',
              detail: `Average dropped ${drop.toFixed(0)} points since last term (${previousAverage.toFixed(1)}% → ${termAverage.toFixed(1)}%)` })
      } else if (drop >= DECLINE_LOW_POINTS) {
        add({ id: 'GRADE_DECLINE', domain: 'ACADEMICS', severity: 'LOW',
              detail: `Average dropped ${drop.toFixed(0)} points since last term (${previousAverage.toFixed(1)}% → ${termAverage.toFixed(1)}%)` })
      }
    }
  }
  if (facts.results.subjectFails > cfg.subjectFailsHigh) {
    add({ id: 'SUBJECT_FAILS', domain: 'ACADEMICS', severity: 'HIGH',
          detail: `${facts.results.subjectFails} subjects below the pass mark of ${cfg.passMark}%` })
  } else if (facts.results.subjectFails >= cfg.subjectFailsMedium && facts.results.subjectFails > 0) {
    add({ id: 'SUBJECT_FAILS', domain: 'ACADEMICS', severity: 'MEDIUM',
          detail: `${facts.results.subjectFails} subjects below the pass mark of ${cfg.passMark}%` })
  }
  if (facts.results.missedExams >= 2) {
    add({ id: 'MISSED_EXAMS', domain: 'ACADEMICS', severity: 'MEDIUM',
          detail: `Absent from ${facts.results.missedExams} exams this term` })
  } else if (facts.results.missedExams === 1) {
    add({ id: 'MISSED_EXAMS', domain: 'ACADEMICS', severity: 'LOW',
          detail: 'Absent from 1 exam this term' })
  }

  // ── ATTENDANCE ─────────────────────────────────────────────────────────────
  const totalDays  = facts.attendance.present + facts.attendance.absent + facts.attendance.late
  const absencePct = pct(facts.attendance.absent, totalDays)
  if (totalDays > 0) {
    const txt = `${absencePct.toFixed(0)}% absence rate (${facts.attendance.absent} of ${totalDays} days)`
    if (absencePct > cfg.absenceHigh) {
      add({ id: 'HIGH_ABSENCE', domain: 'ATTENDANCE', severity: 'HIGH',   detail: txt })
    } else if (absencePct > cfg.absenceMedium) {
      add({ id: 'HIGH_ABSENCE', domain: 'ATTENDANCE', severity: 'MEDIUM', detail: txt })
    }
  }
  if (facts.attendance.streakIsRecent) {
    const s = facts.attendance.trailingAbsentStreak
    if (s >= STREAK_HIGH) {
      add({ id: 'ABSENCE_STREAK', domain: 'ATTENDANCE', severity: 'HIGH',   detail: `Absent for the last ${s} school days in a row` })
    } else if (s >= STREAK_MEDIUM) {
      add({ id: 'ABSENCE_STREAK', domain: 'ATTENDANCE', severity: 'MEDIUM', detail: `Absent for the last ${s} school days in a row` })
    }
  }

  // ── LIBRARY ────────────────────────────────────────────────────────────────
  const lib = facts.library
  if (lib.overdueCount > 0) {
    const detail = `${lib.overdueCount} book(s) overdue, longest ${lib.maxDaysOverdue} day(s)`
    if (lib.maxDaysOverdue >= cfg.libraryOverdueDaysHigh) {
      add({ id: 'LIBRARY_OVERDUE', domain: 'LIBRARY', severity: 'HIGH',   detail })
    } else if (lib.maxDaysOverdue >= cfg.libraryOverdueDaysMedium || lib.overdueCount >= 3) {
      add({ id: 'LIBRARY_OVERDUE', domain: 'LIBRARY', severity: 'MEDIUM', detail })
    } else {
      add({ id: 'LIBRARY_OVERDUE', domain: 'LIBRARY', severity: 'LOW',    detail })
    }
  }
  if (lib.pendingFines > 0 || lib.lostCount > 0) {
    const parts: string[] = []
    if (lib.pendingFines > 0) parts.push(`${formatMWK(lib.pendingFines)} in unpaid library fines`)
    if (lib.lostCount > 0)    parts.push(`${lib.lostCount} lost book(s) not yet settled`)
    const detail = parts.join(', ')
    if (lib.lostCount > 0 || lib.pendingFines >= cfg.libraryFinesMedium * 2) {
      add({ id: 'LIBRARY_FINES', domain: 'LIBRARY', severity: 'HIGH',   detail })
    } else if (lib.pendingFines >= cfg.libraryFinesMedium) {
      add({ id: 'LIBRARY_FINES', domain: 'LIBRARY', severity: 'MEDIUM', detail })
    } else {
      add({ id: 'LIBRARY_FINES', domain: 'LIBRARY', severity: 'LOW',    detail })
    }
  }

  // ── AGGREGATE ──────────────────────────────────────────────────────────────
  const domains = Array.from(new Set(factors.map((f) => f.domain)))
  let score = 0
  for (const d of domains) {
    const pts = factors
      .filter((f) => f.domain === d)
      .map((f) => SEVERITY_POINTS[f.severity])
      .sort((a, b) => b - a)
    const domainScore = (pts[0] ?? 0) + pts.slice(1).reduce((s, p) => s + p * SECONDARY_FACTOR_SHARE, 0)
    score += Math.min(domainScore, 75) * DOMAIN_WEIGHT[d]
  }
  const compoundKey = Math.min(domains.length, 3) as 2 | 3
  if (domains.length >= 2) score += COMPOUND_BONUS[compoundKey]
  const riskScore = Math.min(100, Math.round(score))

  // Most severe first, then by domain order, so factors[0] is the headline.
  const sevRank = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const
  factors.sort((a, b) => sevRank[a.severity] - sevRank[b.severity])

  return {
    studentId:    facts.studentId,
    riskLevel:    levelFromScore(riskScore),
    riskScore,
    factors,
    insights:     buildInsights(domains),
    domains,
    assessedAt:   new Date(),
    academicYear: period.academicYear,
    term:         period.term,
    metrics: {
      feeDebtPct,
      feeBalance:     facts.fees.balance,
      termAverage:    facts.results.termAverage,
      subjectFails:   facts.results.subjectFails,
      absencePct,
      daysAbsent:     facts.attendance.absent,
      libraryOverdue: lib.overdueCount,
      libraryFines:   lib.pendingFines,
    },
  }
}

/** What the combination of flagged domains suggests. Pure; tested. */
export function buildInsights(domains: RiskDomain[]): string[] {
  const has = (d: RiskDomain) => domains.includes(d)
  const out: string[] = []
  if (has('FEES') && has('ATTENDANCE')) {
    out.push('Fee arrears together with absence are a common early sign of dropout — consider contacting the guardian.')
  }
  if (has('ATTENDANCE') && has('ACADEMICS')) {
    out.push('Absence is likely contributing to the weak results — getting the student back in class is the first lever.')
  }
  if (has('FEES') && has('LIBRARY')) {
    out.push('Unpaid library fines add to this student\'s outstanding balance — finance can settle both together.')
  }
  if (has('ACADEMICS') && has('FEES') && !has('ATTENDANCE')) {
    out.push('Results and fees are both flagged — check whether the fee position is limiting the student\'s access to learning.')
  }
  if (domains.length >= 3) {
    out.push(`Concerns span ${domains.length} areas — a coordinated review (class teacher, finance, library) is recommended.`)
  }
  return out
}

/** The "nothing to report" assessment (non-active students, or risk not visible). */
export function noRisk(studentId: string, period: RiskPeriod): RiskAssessment {
  return {
    studentId, riskLevel: 'NONE', riskScore: 0, factors: [], insights: [], domains: [],
    assessedAt: new Date(), academicYear: period.academicYear, term: period.term,
    metrics: {
      feeDebtPct: 0, feeBalance: 0, termAverage: null, subjectFails: 0,
      absencePct: 0, daysAbsent: 0, libraryOverdue: 0, libraryFines: 0,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PERIOD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The (year, term) risk is assessed for. Callers pass the global viewing period
 * from the request; anything missing falls back to the school's current period,
 * identically for every consumer.
 */
export async function resolveRiskPeriod(p?: { academicYear?: string; term?: number }): Promise<RiskPeriod> {
  const [academicYear, term] = await Promise.all([
    p?.academicYear ? Promise.resolve(p.academicYear) : settingsService.get(SETTING_KEYS.CURRENT_ACADEMIC_YEAR),
    p?.term         ? Promise.resolve(p.term)         : settingsService.get(SETTING_KEYS.CURRENT_TERM),
  ])
  return { academicYear, term }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG (admin-editable thresholds)
// ─────────────────────────────────────────────────────────────────────────────

async function loadThresholds(): Promise<Omit<RiskConfig, 'passMark'>> {
  const [fh, fm, ah, am, sh, sm, lh, lm, lf] = await Promise.all([
    settingsService.get(SETTING_KEYS.RISK_FEE_DEBT_HIGH),
    settingsService.get(SETTING_KEYS.RISK_FEE_DEBT_MEDIUM),
    settingsService.get(SETTING_KEYS.RISK_ABSENCE_HIGH),
    settingsService.get(SETTING_KEYS.RISK_ABSENCE_MEDIUM),
    settingsService.get(SETTING_KEYS.RISK_SUBJECT_FAILS_HIGH),
    settingsService.get(SETTING_KEYS.RISK_SUBJECT_FAILS_MEDIUM),
    settingsService.get(SETTING_KEYS.RISK_LIBRARY_OVERDUE_DAYS_HIGH),
    settingsService.get(SETTING_KEYS.RISK_LIBRARY_OVERDUE_DAYS_MEDIUM),
    settingsService.get(SETTING_KEYS.RISK_LIBRARY_FINES_MEDIUM),
  ])
  return {
    feeDebtHigh: fh, feeDebtMedium: fm,
    absenceHigh: ah, absenceMedium: am,
    subjectFailsHigh: sh, subjectFailsMedium: sm,
    libraryOverdueDaysHigh: lh, libraryOverdueDaysMedium: lm,
    libraryFinesMedium: lf,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 1 — BATCHED FACT GATHERING
// ─────────────────────────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function emptyFacts(studentId: string): RiskFacts {
  return {
    studentId,
    fees:       { billed: 0, balance: 0, overdueDays: 0 },
    results:    { termAverage: null, previousAverage: null, subjectFails: 0, subjectsAssessed: 0, missedExams: 0 },
    attendance: { present: 0, absent: 0, late: 0, trailingAbsentStreak: 0, streakIsRecent: false },
    library:    { overdueCount: 0, maxDaysOverdue: 0, lostCount: 0, pendingFines: 0 },
  }
}

async function gatherFacts(ids: string[], period: RiskPeriod): Promise<{
  facts: Map<string, RiskFacts>
  passMarkByStudent: Map<string, number>
}> {
  const { academicYear, term } = period
  const { start, end } = getTermDateRange(academicYear, term)
  const now = new Date()
  const facts = new Map<string, RiskFacts>(ids.map((id) => [id, emptyFacts(id)]))
  const passMarkByStudent = new Map<string, number>()

  const [passLow, passHigh] = await Promise.all([
    getPassMarkThreshold('INTERNAL_F1F2'),
    getPassMarkThreshold('INTERNAL_F3F4'),
  ])

  for (const part of chunk(ids, ID_CHUNK)) {
    const [students, invoices, termResults, marks, attendance, borrowings, fines] = await Promise.all([
      prisma.student.findMany({
        where:  { id: { in: part } },
        select: { id: true, class: { select: { form: true } } },
      }),
      // Arrears: this year's invoices up to and including the viewed term, so an
      // unpaid Term 1 still counts while looking at Term 2.
      prisma.invoice.findMany({
        where:  { studentId: { in: part }, academicYear, term: { lte: term } },
        select: { studentId: true, totalAmount: true, balance: true, dueDate: true },
      }),
      prisma.termResult.findMany({
        where:  { studentId: { in: part }, academicYear, term: { in: term > 1 ? [term, term - 1] : [term] } },
        select: { studentId: true, term: true, average: true },
      }),
      prisma.examMark.findMany({
        where: {
          studentId: { in: part },
          exam: { academicYear, term, status: 'RESULTS_RELEASED' },
        },
        select: {
          studentId: true, mark: true, absent: true,
          exam: { select: { subject: true, maxMark: true, weightPercent: true } },
        },
      }),
      prisma.attendance.findMany({
        where:   { studentId: { in: part }, date: { gte: start, lte: end } },
        select:  { studentId: true, date: true, status: true },
        orderBy: { date: 'asc' },
      }),
      prisma.borrowing.findMany({
        where:  { studentId: { in: part }, borrowerType: 'STUDENT', status: { in: ['ACTIVE', 'OVERDUE'] } },
        select: { studentId: true, dueDate: true },
      }),
      prisma.libraryFine.findMany({
        where:  { studentId: { in: part }, status: 'PENDING' },
        select: { studentId: true, amount: true, borrowing: { select: { status: true } } },
      }),
    ])

    for (const s of students) {
      passMarkByStudent.set(s.id, (s.class?.form ?? 0) >= 3 ? passHigh : passLow)
    }

    // FEES
    for (const inv of invoices) {
      const f = facts.get(inv.studentId)
      if (!f) continue
      const balance = Number(inv.balance)
      f.fees.billed  += Number(inv.totalAmount)
      f.fees.balance += Math.max(balance, 0)
      if (balance > 0 && inv.dueDate < now) {
        f.fees.overdueDays = Math.max(f.fees.overdueDays, Math.floor((now.getTime() - inv.dueDate.getTime()) / DAY_MS))
      }
    }

    // ACADEMICS — averages (stored TermResult wins; else derive from released marks)
    const stored = new Map<string, { current: number | null; previous: number | null }>()
    for (const tr of termResults) {
      const slot = stored.get(tr.studentId) ?? { current: null, previous: null }
      if (tr.term === term) slot.current = Number(tr.average)
      else slot.previous = Number(tr.average)
      stored.set(tr.studentId, slot)
    }
    const bySubject = new Map<string, Map<string, { weighted: number; weight: number }>>()
    for (const m of marks) {
      const f = facts.get(m.studentId)
      if (!f) continue
      if (m.absent || m.mark == null) { f.results.missedExams++; continue }
      const max = Number(m.exam.maxMark)
      if (max <= 0) continue
      const w = Number(m.exam.weightPercent) || 100
      const subj = bySubject.get(m.studentId) ?? new Map()
      const cur  = subj.get(m.exam.subject) ?? { weighted: 0, weight: 0 }
      cur.weighted += (Number(m.mark) / max) * 100 * w
      cur.weight   += w
      subj.set(m.exam.subject, cur)
      bySubject.set(m.studentId, subj)
    }
    for (const id of part) {
      const f = facts.get(id)!
      const pass = passMarkByStudent.get(id) ?? passLow
      const subj = bySubject.get(id)
      let derivedAvg: number | null = null
      if (subj && subj.size > 0) {
        const pcts = Array.from(subj.values()).map((v) => v.weighted / v.weight)
        f.results.subjectsAssessed = pcts.length
        f.results.subjectFails = pcts.filter((p) => p < pass).length
        derivedAvg = pcts.reduce((a, b) => a + b, 0) / pcts.length
      }
      const st = stored.get(id)
      f.results.termAverage     = st?.current ?? derivedAvg
      f.results.previousAverage = st?.previous ?? null
    }

    // ATTENDANCE (rows are date-ascending)
    const lastDate = new Map<string, Date>()
    const streak   = new Map<string, number>()
    for (const a of attendance) {
      const f = facts.get(a.studentId)
      if (!f) continue
      if (a.status === 'PRESENT')      f.attendance.present++
      else if (a.status === 'ABSENT')  f.attendance.absent++
      else                             f.attendance.late++
      streak.set(a.studentId, a.status === 'ABSENT' ? (streak.get(a.studentId) ?? 0) + 1 : 0)
      lastDate.set(a.studentId, a.date)
    }
    for (const id of part) {
      const f = facts.get(id)!
      f.attendance.trailingAbsentStreak = streak.get(id) ?? 0
      const last = lastDate.get(id)
      f.attendance.streakIsRecent = !!last && (now.getTime() - last.getTime()) <= STREAK_RECENT_DAYS * DAY_MS
    }

    // LIBRARY (current standing — books and fines are live obligations)
    for (const b of borrowings) {
      const f = b.studentId ? facts.get(b.studentId) : undefined
      if (!f || b.dueDate >= now) continue
      f.library.overdueCount++
      f.library.maxDaysOverdue = Math.max(f.library.maxDaysOverdue, Math.floor((now.getTime() - b.dueDate.getTime()) / DAY_MS))
    }
    for (const fine of fines) {
      const f = fine.studentId ? facts.get(fine.studentId) : undefined
      if (!f) continue
      f.library.pendingFines += Number(fine.amount)
      if (fine.borrowing?.status === 'LOST') f.library.lostCount++
    }
  }

  return { facts, passMarkByStudent }
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 3 — ORCHESTRATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assess many students at once. Every consumer (list, profile, class roster,
 * dashboard, weekly job) goes through here, so the same student always gets the
 * same answer for the same period. Result always contains every requested id.
 */
export async function assessStudents(
  studentIds: string[],
  period: RiskPeriod,
): Promise<Map<string, RiskAssessment>> {
  const ids = Array.from(new Set(studentIds))
  const out = new Map<string, RiskAssessment>()
  if (ids.length === 0) return out

  try {
    const thresholds = await loadThresholds()
    const { facts, passMarkByStudent } = await gatherFacts(ids, period)
    for (const id of ids) {
      const f = facts.get(id) ?? emptyFacts(id)
      const cfg: RiskConfig = { ...thresholds, passMark: passMarkByStudent.get(id) ?? 35 }
      out.set(id, evaluateRisk(f, cfg, period))
    }
  } catch (err) {
    // A risk failure must never take down the screen that asked (the student
    // list, a profile, a roster) — degrade to "no data" and log loudly.
    logger.error({ event: 'risk.assess_failed', count: ids.length, err }, 'Risk assessment failed — returning NONE')
    for (const id of ids) out.set(id, noRisk(id, period))
  }
  return out
}

/** Single-student convenience wrapper (kept: original signature). */
export async function assessStudentRisk(
  studentId:    string,
  academicTerm: number,
  academicYear: string,
): Promise<RiskAssessment> {
  const map = await assessStudents([studentId], { academicYear, term: academicTerm })
  return map.get(studentId) ?? noRisk(studentId, { academicYear, term: academicTerm })
}

export async function assessClassRisk(
  classId:      string,
  academicTerm: number,
  academicYear: string,
): Promise<RiskAssessment[]> {
  const students = await prisma.student.findMany({
    where:  { classId, status: 'ACTIVE' },
    select: { id: true },
  })
  const map = await assessStudents(students.map((s) => s.id), { academicYear, term: academicTerm })
  return students.map((s) => map.get(s.id)!).filter(Boolean)
}

// ─────────────────────────────────────────────────────────────────────────────
// ROLE-AWARE REDACTION
// A viewer who may see "risk" but not, say, a student's fee position must not
// be able to read the fee amount back out of a factor's detail text.
// ─────────────────────────────────────────────────────────────────────────────

export interface RiskVisibility {
  fees:       boolean
  library:    boolean
  attendance: boolean
}

const REDACTED_DETAIL: Record<RiskDomain, string> = {
  FEES:       'A fee concern is flagged',
  LIBRARY:    'A library concern is flagged',
  ATTENDANCE: 'An attendance concern is flagged',
  ACADEMICS:  '',   // academics are never redacted
}

/** What a given viewer may see of the risk engine's output. */
export interface RiskViewer {
  /** student.viewRiskStatus — without it the badge is not shown at all. */
  canViewRisk: boolean
  visibility:  RiskVisibility
}

export const FULL_RISK_VIEWER: RiskViewer = {
  canViewRisk: true,
  visibility:  { fees: true, library: true, attendance: true },
}

/** Safe default for any caller that has not explicitly derived a viewer. */
export const NO_RISK_VIEWER: RiskViewer = {
  canViewRisk: false,
  visibility:  { fees: false, library: false, attendance: false },
}

/**
 * Derive the viewer's risk visibility from the SAME permissions that already
 * gate the fee / library / attendance data on the student record, so the risk
 * badge can never leak more than the underlying tabs would show that person.
 */
export function riskViewerFor(role: UserRole | undefined, superUser = false): RiskViewer {
  if (!role) return { canViewRisk: false, visibility: { fees: false, library: false, attendance: false } }
  return {
    canViewRisk: hasPermission(role, 'student.viewRiskStatus', superUser),
    visibility: {
      fees:       hasPermission(role, 'student.viewFeeStatus', superUser),
      library:    hasPermission(role, 'student.viewLibraryStatus', superUser),
      attendance: hasPermission(role, 'student.viewAttendance', superUser),
    },
  }
}

export function redactAssessment(a: RiskAssessment, vis: RiskVisibility): RiskAssessment {
  const hidden = (d: RiskDomain) =>
    (d === 'FEES' && !vis.fees) || (d === 'LIBRARY' && !vis.library) || (d === 'ATTENDANCE' && !vis.attendance)
  if (vis.fees && vis.library && vis.attendance) return a   // nothing to hide
  return {
    ...a,
    factors: a.factors.map((f) => (hidden(f.domain) ? { ...f, detail: REDACTED_DETAIL[f.domain] } : f)),
    insights: a.insights.filter((i) => {
      if (!vis.fees && /fee|balance|finance/i.test(i)) return false
      if (!vis.library && /library/i.test(i)) return false
      return true
    }),
    metrics: {
      ...a.metrics,
      feeDebtPct:     vis.fees       ? a.metrics.feeDebtPct     : 0,
      feeBalance:     vis.fees       ? a.metrics.feeBalance     : 0,
      absencePct:     vis.attendance ? a.metrics.absencePct     : 0,
      daysAbsent:     vis.attendance ? a.metrics.daysAbsent     : 0,
      libraryOverdue: vis.library    ? a.metrics.libraryOverdue : 0,
      libraryFines:   vis.library    ? a.metrics.libraryFines   : 0,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHOOL-WIDE VIEWS (dashboards). These aggregates are TTL-cached per
// (year, term): they scan every active student, change slowly, and a minute of
// staleness on a dashboard widget is acceptable. Per-student assessments above
// are never cached.
// ─────────────────────────────────────────────────────────────────────────────

export interface SchoolRiskSummary {
  HIGH:   number
  MEDIUM: number
  LOW:    number
  NONE:   number
  total:  number
  /** How many active students are flagged in each module. */
  byDomain: Record<RiskDomain, number>
}

export interface HighRiskStudentSummary {
  id:        string
  firstName: string
  lastName:  string
  classId:   string | null
  className: string | null
  riskLevel: RiskLevel
  riskScore: number
  topFactor: string | null
  domains:   RiskDomain[]
}

interface Overview { summary: SchoolRiskSummary; ranked: HighRiskStudentSummary[] }

const OVERVIEW_TTL_MS = 60_000
const overviewCache = new Map<string, { at: number; value: Overview }>()

/** Drop cached dashboard aggregates (called by tests and by any bulk write). */
export function invalidateRiskOverview(): void {
  overviewCache.clear()
}

async function getOverview(period: RiskPeriod): Promise<Overview> {
  const key = `${period.academicYear}|${period.term}`
  const hit = overviewCache.get(key)
  if (hit && Date.now() - hit.at < OVERVIEW_TTL_MS) return hit.value

  const students = await prisma.student.findMany({
    where:  { status: 'ACTIVE' },
    select: { id: true, firstName: true, lastName: true, classId: true, class: { select: { name: true } } },
  })
  const assessed = await assessStudents(students.map((s) => s.id), period)

  const summary: SchoolRiskSummary = {
    HIGH: 0, MEDIUM: 0, LOW: 0, NONE: 0, total: students.length,
    byDomain: { FEES: 0, ACADEMICS: 0, ATTENDANCE: 0, LIBRARY: 0 },
  }
  const ranked: HighRiskStudentSummary[] = []
  for (const s of students) {
    const a = assessed.get(s.id)
    if (!a) continue
    summary[a.riskLevel]++
    for (const d of a.domains) summary.byDomain[d]++
    if (a.riskLevel === 'HIGH') {
      ranked.push({
        id: s.id, firstName: s.firstName, lastName: s.lastName,
        classId: s.classId,
        className: s.class?.name ?? null,
        riskLevel: a.riskLevel, riskScore: a.riskScore,
        topFactor: a.factors[0]?.detail ?? null,
        domains: a.domains,
      })
    }
  }
  ranked.sort((x, y) => y.riskScore - x.riskScore)

  const value = { summary, ranked }
  overviewCache.set(key, { at: Date.now(), value })
  return value
}

export async function getSchoolRiskSummary(academicTerm: number, academicYear: string): Promise<SchoolRiskSummary> {
  return (await getOverview({ academicYear, term: academicTerm })).summary
}

/** The "Students Needing Attention" widget: HIGH-risk students, worst first. */
export async function getHighRiskStudents(
  academicTerm: number,
  academicYear: string,
  limit = 6,
  /** Restrict to these classes (a teacher sees only classes they teach). Undefined = whole school. */
  classIds?: string[],
): Promise<HighRiskStudentSummary[]> {
  const { ranked } = await getOverview({ academicYear, term: academicTerm })
  const scoped = classIds ? ranked.filter((s) => s.classId && classIds.includes(s.classId)) : ranked
  return scoped.slice(0, limit)
}
