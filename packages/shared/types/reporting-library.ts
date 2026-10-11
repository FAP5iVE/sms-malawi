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
