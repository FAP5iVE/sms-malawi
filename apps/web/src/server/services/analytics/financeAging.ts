/**
 * Pure receivables-aging maths (no database access, unit-tested).
 *
 * Aging is measured from each invoice's DUE DATE — not its creation date — so
 * an invoice raised in September but due in October is "current" until October
 * passes. Invoices that are not yet due, and invoices due today, are "current".
 */
import type {
  AgingBucketKey,
  ApiAgingBucket,
  ApiAgingDebtorRow,
  ApiAgingFormRow,
} from '@shared/types/reporting-finance'
import { AGING_BUCKETS } from '@/server/services/reporting/thresholds'
import { daysBetween, ratioPct, round } from '@/server/services/reporting/kpi'

export function bucketForDaysOverdue(daysOverdue: number): AgingBucketKey {
  for (const b of AGING_BUCKETS) {
    if (daysOverdue >= b.minDays && daysOverdue <= b.maxDays) return b.key
  }
  return 'current'
}

export interface AgingInvoiceInput {
  invoiceId: string
  invoiceNumber: string
  studentId: string
  studentName: string
  className: string | null
  form: number | null
  balance: number
  dueDate: Date
}

export interface AgingResult {
  totalOutstanding: number
  overdueAmount: number
  severeAmount: number
  severeShare: number | null
  buckets: ApiAgingBucket[]
  byForm: ApiAgingFormRow[]
  debtors: ApiAgingDebtorRow[]
  debtorsTruncated: boolean
}

const EMPTY_BUCKETS = (): Record<AgingBucketKey, number> => ({
  current: 0,
  d1_30: 0,
  d31_60: 0,
  d61_90: 0,
  d90_plus: 0,
})

export function buildAging(
  invoices: readonly AgingInvoiceInput[],
  asOf: Date,
  debtorLimit = 300,
): AgingResult {
  const buckets = new Map<AgingBucketKey, ApiAgingBucket>(
    AGING_BUCKETS.map((b) => [b.key, { key: b.key, label: b.label, count: 0, amount: 0 }]),
  )
  const forms = new Map<string, ApiAgingFormRow>()
  const rows: ApiAgingDebtorRow[] = []

  let total = 0
  let overdue = 0
  let severe = 0

  for (const inv of invoices) {
    if (!(inv.balance > 0)) continue
    const daysOverdue = daysBetween(inv.dueDate, asOf)
    const key = bucketForDaysOverdue(daysOverdue)

    const bucket = buckets.get(key)
    if (bucket) {
      bucket.count += 1
      bucket.amount += inv.balance
    }
    total += inv.balance
    if (daysOverdue > 0) overdue += inv.balance
    if (daysOverdue > 60) severe += inv.balance

    const formKey = inv.form === null ? 'none' : String(inv.form)
    let formRow = forms.get(formKey)
    if (!formRow) {
      formRow = {
        form: inv.form,
        label: inv.form === null ? 'No class' : `Form ${inv.form}`,
        buckets: EMPTY_BUCKETS(),
        total: 0,
      }
      forms.set(formKey, formRow)
    }
    formRow.buckets[key] += inv.balance
    formRow.total += inv.balance

    rows.push({
      invoiceId: inv.invoiceId,
      invoiceNumber: inv.invoiceNumber,
      studentId: inv.studentId,
      studentName: inv.studentName,
      className: inv.className,
      form: inv.form,
      balance: round(inv.balance, 2),
      dueDate: inv.dueDate.toISOString(),
      daysOverdue,
      bucket: key,
    })
  }

  rows.sort((a, b) => b.balance - a.balance)

  const byForm = Array.from(forms.values())
    .map((f) => ({
      ...f,
      total: round(f.total, 2),
      buckets: Object.fromEntries(
        Object.entries(f.buckets).map(([k, v]) => [k, round(v, 2)]),
      ) as Record<AgingBucketKey, number>,
    }))
    .sort((a, b) => (a.form ?? 99) - (b.form ?? 99))

  return {
    totalOutstanding: round(total, 2),
    overdueAmount: round(overdue, 2),
    severeAmount: round(severe, 2),
    severeShare: ratioPct(severe, total),
    buckets: Array.from(buckets.values()).map((b) => ({ ...b, amount: round(b.amount, 2) })),
    byForm,
    debtors: rows.slice(0, debtorLimit),
    debtorsTruncated: rows.length > debtorLimit,
  }
}
