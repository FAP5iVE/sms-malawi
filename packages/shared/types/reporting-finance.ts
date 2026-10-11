/**
 * Response types for /reporting/finance/* (receivables aging, payment mix,
 * overview and attention queue). KPI/insight shapes come from ./reporting.
 */
export type AgingBucketKey = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus'

export interface ApiAgingBucket {
  key: AgingBucketKey
  label: string
  count: number
  amount: number
}

export interface ApiAgingFormRow {
  /** Form number (1–4); null for students without a class. */
  form: number | null
  label: string
  buckets: Record<AgingBucketKey, number>
  total: number
}

export interface ApiAgingDebtorRow {
  invoiceId: string
  invoiceNumber: string
  studentId: string
  studentName: string
  className: string | null
  form: number | null
  balance: number
  dueDate: string
  /** Days past the due date; ≤ 0 means not yet due. */
  daysOverdue: number
  bucket: AgingBucketKey
}

export interface ApiFinanceAging {
  asOf: string
  academicYear: string
  term: number | null
  totalOutstanding: number
  /** Outstanding on invoices past their due date. */
  overdueAmount: number
  /** Outstanding more than 60 days past due. */
  severeAmount: number
  /** severeAmount ÷ totalOutstanding (percent); null when nothing is outstanding. */
  severeShare: number | null
  buckets: ApiAgingBucket[]
  byForm: ApiAgingFormRow[]
  /** Largest balances first; capped (see debtorsTruncated). */
  debtors: ApiAgingDebtorRow[]
  debtorsTruncated: boolean
}

export interface ApiPaymentMethodRow {
  method: string
  label: string
  count: number
  amount: number
  /** Share of total collected (percent). */
  share: number | null
}

export interface ApiPaymentWeekdayRow {
  /** 0 = Sunday … 6 = Saturday */
  dayOfWeek: number
  label: string
  count: number
  amount: number
}

export interface ApiPaymentMix {
  academicYear: string
  term: number | null
  totalCollected: number
  paymentCount: number
  averagePayment: number | null
  byMethod: ApiPaymentMethodRow[]
  byWeekday: ApiPaymentWeekdayRow[]
}
