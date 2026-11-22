/**
 * [FILE]: apps/web/src/server/services/guardian/parentPortalService.ts
 * [PURPOSE]: What a guardian sees for ONE child, once authorizeChild has said yes. Every
 *   reader returns a DTO from parentDto.ts; nothing is passed through from a database row.
 *
 * [SECURITY NOTES]
 *   - Callers MUST obtain a GuardianContext from authorizeChild for the capability they serve.
 *     These functions trust it and never re-derive access.
 *   - Results honour the school's fee gate PER TERM (same rule students get). A term held back for
 *     unpaid fees returns no marks at all, and the gate failing to answer counts as "held back".
 *   - ONLY RELEASED RESULTS. A computed term result is shown only while every end-of-term exam
 *     of the child's class for that term is RESULTS_RELEASED. This is checked against the exams
 *     themselves, not inferred from a result row existing, because unlocking marks rewinds an
 *     exam without deleting the row computed from it. An individual exam appears only while its
 *     own status is RESULTS_RELEASED and its mark is final. Anything unreleased is omitted
 *     entirely (not "withheld": that wording is reserved for the fee gate).
 *   - The fee gate still decides per term whether marks, exams and the report card are shown.
 *   - Reads are bounded (take) so a child with a long history cannot turn one request into an
 *     unbounded scan.
 */
import {
  toAttendanceDto, toAttendanceSummaryDto, toExamDto, toExamOnlyTermDto, toInvoiceDto, toPaymentDto, toResultsTermDto,
  type AttendanceDto, type AttendanceSummaryDto, type ExamDto, type InvoiceDto, type PaymentDto, type ResultsTermDto,
} from '@/server/lib/guardian/parentDto'
import type { GuardianDb } from './db'
import type { GuardianContext } from './guardianAccess'

export interface ParentDeps {
  /** true = results may be shown for this term (the school's existing fee gate). */
  isResultsGateOpen(studentId: string, term: number, academicYear: string): Promise<boolean>
  /** The school's official report card payload for one term (the same builder students use). */
  getReportCardData(studentId: string, term: 1 | 2 | 3, academicYear: string): Promise<unknown>
  /** The requested period if well-formed, else the school's current one. */
  resolvePeriod(input: { academicYear?: unknown; term?: unknown }): Promise<{ academicYear: string; term: number }>
  /** The student's own term attendance summary: the exact function behind the student's attendance page. */
  getTermAttendance(studentId: string, academicYear: string, term: number): Promise<Record<string, unknown>>
}

const MAX_TERMS = 12
const MAX_INVOICES = 36
const MAX_PAYMENTS = 100
const MAX_EXAM_MARKS = 600
/** About two school years of daily records: enough for the calendar to page back through. */
const MAX_ATTENDANCE_RECORDS = 400

const termKey = (year: unknown, term: unknown) => `${String(year)}|${Number(term)}`

/**
 * Which (class, year, term) combinations are fully released: at least one end-of-term exam
 * exists and EVERY one of them is RESULTS_RELEASED. Releasing happens for all classes of a
 * term together, so "all" matches how the school releases, and one exam being unlocked for
 * editing hides the term again until it is re-released. Anything we cannot tell is unreleased.
 */
async function releasedTermKeys(db: GuardianDb, rows: readonly Record<string, unknown>[]): Promise<Set<string>> {
  const classIds = [...new Set(rows.map((r) => r.classId).filter((c): c is string => typeof c === 'string'))]
  if (classIds.length === 0) return new Set()
  const exams = await db.exam.findMany({ where: { type: 'END_TERM', classId: { in: classIds } } })
  const groups = new Map<string, { total: number; released: number }>()
  for (const e of exams) {
    const k = `${String(e.classId)}|${termKey(e.academicYear, e.term)}`
    const g = groups.get(k) ?? { total: 0, released: 0 }
    g.total += 1
    if (e.status === 'RESULTS_RELEASED') g.released += 1
    groups.set(k, g)
  }
  const out = new Set<string>()
  for (const [k, g] of groups) if (g.total > 0 && g.released === g.total) out.add(k)
  return out
}

async function gateOpen(deps: ParentDeps, studentId: string, term: number, academicYear: string): Promise<boolean> {
  try { return (await deps.isResultsGateOpen(studentId, term, academicYear)) === true }
  catch { return false }                                  // fail closed: unknown means withheld
}

/** The child's released exams with their own marks, grouped by `year|term`, newest first within a term. */
async function releasedExamsByTerm(db: GuardianDb, studentId: string): Promise<Map<string, ExamDto[]>> {
  const marks = await db.examMark.findMany({ where: { studentId, isDraft: false }, take: MAX_EXAM_MARKS })
  const out = new Map<string, ExamDto[]>()
  if (marks.length === 0) return out
  const exams = await db.exam.findMany({ where: { id: { in: marks.map((m) => m.examId) }, status: 'RESULTS_RELEASED' } })
  const examById = new Map(exams.map((e) => [String(e.id), e]))
  for (const m of marks) {
    const e = examById.get(String(m.examId))
    if (!e) continue                                       // not released: omitted entirely
    const k = termKey(e.academicYear, e.term)
    const list = out.get(k) ?? []
    list.push(toExamDto(e, m))
    out.set(k, list)
  }
  for (const list of out.values()) list.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  return out
}

export async function getChildResults(db: GuardianDb, ctx: GuardianContext, deps: ParentDeps): Promise<{ terms: ResultsTermDto[] }> {
  const studentId = ctx.student.id as string
  const rows = await db.termResult.findMany({
    where: { studentId },
    orderBy: [{ academicYear: 'desc' }, { term: 'desc' }],
    take: MAX_TERMS,
  })
  const released = await releasedTermKeys(db, rows)
  const examsByTerm = await releasedExamsByTerm(db, studentId)

  // A computed result counts only while its term is released; a term with only released exams
  // (e.g. a mid-term test) is listed on the strength of those exams alone.
  const resultByKey = new Map<string, Record<string, unknown>>()
  for (const r of rows) if (released.has(`${String(r.classId)}|${termKey(r.academicYear, r.term)}`)) resultByKey.set(termKey(r.academicYear, r.term), r)
  const keys = [...new Set([...resultByKey.keys(), ...examsByTerm.keys()])]
    .sort((x, y) => {                                      // newest year, then newest term
      const [yx, tx] = x.split('|'), [yy, ty] = y.split('|')
      return (yy ?? '').localeCompare(yx ?? '') || Number(ty) - Number(tx)
    })
    .slice(0, MAX_TERMS)

  const terms: ResultsTermDto[] = []
  for (const k of keys) {
    const [year = '', termStr = ''] = k.split('|')
    const term = Number(termStr)
    const row = resultByKey.get(k)
    const open = await gateOpen(deps, studentId, term, year)
    if (row) terms.push(toResultsTermDto(row, !open, { exams: examsByTerm.get(k) ?? [], reportCard: open }))
    else if (!open) terms.push(toResultsTermDto({ academicYear: year, term }, true))
    else terms.push(toExamOnlyTermDto(year, term, examsByTerm.get(k) ?? []))
  }
  return { terms }
}

/**
 * The official report card for one term, as the school builds it for the student. Offered only
 * when the term is released, the fee gate is open and a result has been computed; every other
 * case is `null` and the caller answers with the same generic not-found as any refusal.
 */
export async function getChildReportCard(
  db: GuardianDb, ctx: GuardianContext, deps: ParentDeps, input: { academicYear: string; term: 1 | 2 | 3 },
): Promise<unknown | null> {
  const studentId = ctx.student.id as string
  const rows = await db.termResult.findMany({ where: { studentId, academicYear: input.academicYear, term: input.term }, take: 1 })
  const row = rows[0]
  if (!row) return null
  const released = await releasedTermKeys(db, [row])
  if (!released.has(`${String(row.classId)}|${termKey(row.academicYear, row.term)}`)) return null
  if (!(await gateOpen(deps, studentId, input.term, input.academicYear))) return null
  return deps.getReportCardData(studentId, input.term, input.academicYear)
}

export async function getChildFees(db: GuardianDb, ctx: GuardianContext): Promise<{
  currency: 'MWK'; totalOutstanding: number; invoices: InvoiceDto[]; payments: PaymentDto[]
}> {
  const invoices = await db.invoice.findMany({
    where: { studentId: ctx.student.id }, orderBy: [{ academicYear: 'desc' }, { term: 'desc' }], take: MAX_INVOICES,
  })
  const payments = invoices.length
    ? await db.payment.findMany({ where: { invoiceId: { in: invoices.map((i) => i.id) } }, orderBy: { paidAt: 'desc' }, take: MAX_PAYMENTS })
    : []
  const dto = invoices.map(toInvoiceDto)
  const totalOutstanding = dto.reduce((sum, i) => sum + Math.max(i.balance ?? 0, 0), 0)
  return { currency: 'MWK', totalOutstanding, invoices: dto, payments: payments.map(toPaymentDto) }
}

export async function getChildAttendance(
  db: GuardianDb, ctx: GuardianContext, deps: ParentDeps, query: { academicYear?: unknown; term?: unknown } = {},
): Promise<{ period: { academicYear: string; term: number }; summary: AttendanceSummaryDto; records: AttendanceDto[] }> {
  const studentId = ctx.student.id as string
  const period = await deps.resolvePeriod(query)
  const [figures, rows] = await Promise.all([
    deps.getTermAttendance(studentId, period.academicYear, period.term),
    db.attendance.findMany({ where: { studentId }, orderBy: { date: 'desc' }, take: MAX_ATTENDANCE_RECORDS }),
  ])
  return { period, summary: toAttendanceSummaryDto(figures), records: rows.map(toAttendanceDto) }
}
