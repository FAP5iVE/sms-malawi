/** Response types for /reporting/library/* (circulation and fines). */

export interface ApiLibraryCountRow {
  label: string
  count: number
}

export interface ApiOverdueRow {
  borrowingId: string
  bookTitle: string
  borrower: string
  borrowerType: 'STUDENT' | 'STAFF'
  className: string | null
  dueDate: string
  daysOverdue: number
}

export interface ApiLibraryCirculation {
  windowDays: number
  loans: number
  returned: number
  /** Returned on or before the due date ÷ all returned in the window; null if none returned. */
  onTimeRate: number | null
  /** Mean days kept for returned loans; null if none. */
  avgLoanDays: number | null
  byCategory: ApiLibraryCountRow[]
  byBorrowerType: ApiLibraryCountRow[]
  /** Student loans by the borrower's form. */
  byForm: ApiLibraryCountRow[]
  /** Open loans past due, grouped by how late. */
  overdueAging: ApiLibraryCountRow[]
  overdue: ApiOverdueRow[]
}

export interface ApiLibraryFines {
  pendingCount: number
  pendingAmount: number
  paidAmount: number
  waivedAmount: number
  /** Share of assessed fines (paid + waived + pending, by amount) already collected; null if none. */
  collectionRate: number | null
  monthly: { label: string; assessed: number; collected: number }[]
}

// ─── Digital library (/reporting/library/digital) ───────────────────────────

export interface ApiDigitalGroupRow {
  key: string
  label: string
  resources: number
  approved: number
  pending: number
  rejected: number
  /** Recorded views in the window. */
  views: number
  /** Resources in the group viewed at least once in the window. */
  resourcesViewed: number
}

export interface ApiDigitalUsageRow {
  id: string
  title: string
  type: string
  subject: string | null
  form: number | null
  views: number
  uniqueViewers: number
  lastViewedAt: string | null
  approvedAt: string | null
}

export interface ApiDigitalPendingRow {
  id: string
  title: string
  type: string
  subject: string | null
  form: number | null
  submittedAt: string
  ageDays: number
}

/** A measure the application does not record, so the report does not show it. */
export interface ApiNotRecorded {
  key: string
  label: string
  reason: string
}

export interface ApiLibraryDigital {
  generatedAt: string
  from: string
  to: string
  filters: { type: string | null; subject: string | null; form: number | null; status: 'approved' | 'pending' | 'rejected' | null }
  /** Earliest recorded view event ever; null if none. Views before this date were never recorded. */
  trackingSince: string | null
  catalogue: { total: number; approved: number; pending: number; rejected: number; oldestPendingDays: number | null }
  usage: {
    views: number
    uniqueViewers: number
    resourcesViewed: number
    /** Approved resources viewed at least once ÷ approved resources; null when none are approved. */
    usageRate: number | null
    approvedNotViewed: number
  }
  byType: ApiDigitalGroupRow[]
  bySubject: ApiDigitalGroupRow[]
  byForm: ApiDigitalGroupRow[]
  trend: { key: string; label: string; views: number }[]
  trendUnit: 'day' | 'week'
  mostUsed: ApiDigitalUsageRow[]
  leastUsed: ApiDigitalUsageRow[]
  pending: ApiDigitalPendingRow[]
  /** The view table was larger than one pass reads, so usage figures cover only the latest events. */
  viewsCapped: boolean
  notRecorded: ApiNotRecorded[]
}

// ─── Physical stock (/reporting/library/stock) ──────────────────────────────

export interface ApiLibraryStockCategoryRow {
  category: string
  titles: number
  copies: number
  available: number
  onLoan: number
  /** Copies neither on the shelf nor on loan — damaged or otherwise withdrawn. */
  offShelf: number
  availabilityRate: number | null
}

export interface ApiLibraryUnavailableRow {
  bookId: string
  title: string
  author: string
  category: string
  copies: number
  onLoan: number
  overdue: number
}

export interface ApiLibraryStock {
  generatedAt: string
  windowDays: number
  category: string | null
  titles: number
  copies: number
  available: number
  onLoan: number
  offShelf: number
  availabilityRate: number | null
  /** Open loans past their due date (within the category filter, if one is set). */
  overdueLoans: number
  byCategory: ApiLibraryStockCategoryRow[]
  /** Titles with copies owned but none available. */
  unavailable: ApiLibraryUnavailableRow[]
  condition: {
    /** Copies marked damaged from the catalogue. Repairs are not recorded, so this is a running total. */
    shelfDamagedCopies: number
    /** Copies written off as lost from the catalogue. */
    shelfLostCopies: number
    /** Loans whose copy was never returned. */
    loansLost: number
    /** Loans returned damaged within the window. */
    returnedDamaged: number
  }
  /**
   * Renewals, from the count stored on each loan. Only the latest renewal date is kept per loan, so a loan counts
   * once in the window it was last renewed in. Renewals made before the count was stored were never recorded.
   */
  renewals: {
    /** Loans whose latest renewal falls in the window. */
    loansRenewed: number
    /** Renewals recorded in total on those loans (a loan renewed twice adds two). */
    renewalCount: number
    /** Earliest renewal date recorded; null if no renewal has been recorded yet. */
    trackingSince: string | null
  }
  notRecorded: ApiNotRecorded[]
}
