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
 *   - Result rows only exist once a term has been computed from released exams, so unreleased
 *     marks cannot appear here. Reads are bounded (take) so a child with a long history cannot
 *     turn one request into an unbounded scan.
 */
import {
  summariseAttendance, toAttendanceDto, toInvoiceDto, toPaymentDto, toResultsTermDto,
  type AttendanceDto, type InvoiceDto, type PaymentDto, type ResultsTermDto,
} from '@/server/lib/guardian/parentDto'
import type { GuardianDb } from './db'
import type { GuardianContext } from './guardianAccess'

export interface ParentDeps {
  /** true = results may be shown for this term (the school's existing fee gate). */
  isResultsGateOpen(studentId: string, term: number, academicYear: string): Promise<boolean>
}

const MAX_TERMS = 12
const MAX_INVOICES = 36
const MAX_PAYMENTS = 100
const ATTENDANCE_WINDOW = 120
const RECENT_ATTENDANCE = 30

export async function getChildResults(db: GuardianDb, ctx: GuardianContext, deps: ParentDeps): Promise<{ terms: ResultsTermDto[] }> {
  const rows = await db.termResult.findMany({
    where: { studentId: ctx.student.id },
    orderBy: [{ academicYear: 'desc' }, { term: 'desc' }],
    take: MAX_TERMS,
  })
  const terms: ResultsTermDto[] = []
  for (const row of rows) {
    let open = false
    try { open = (await deps.isResultsGateOpen(ctx.student.id as string, Number(row.term), String(row.academicYear))) === true }
    catch { open = false }                              // fail closed: unknown means withheld
    terms.push(toResultsTermDto(row, !open))
  }
  return { terms }
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

export async function getChildAttendance(db: GuardianDb, ctx: GuardianContext): Promise<{
  summary: { windowSize: number; byStatus: Record<string, number> }; recent: AttendanceDto[]
}> {
  const rows = await db.attendance.findMany({ where: { studentId: ctx.student.id }, orderBy: { date: 'desc' }, take: ATTENDANCE_WINDOW })
  return { summary: summariseAttendance(rows), recent: rows.slice(0, RECENT_ATTENDANCE).map(toAttendanceDto) }
}
