/** Response types for /reporting/hr/* (workforce, contracts, leave, loans, reviews, promotions). */

export interface ApiHrCountRow {
  label: string
  count: number
}

export interface ApiHrWorkforce {
  headcount: number
  byStatus: ApiHrCountRow[]
  byEmploymentType: ApiHrCountRow[]
  byRole: ApiHrCountRow[]
  byDepartment: ApiHrCountRow[]
  bySex: ApiHrCountRow[]
  /** Tenure bands from dateJoined. */
  byTenure: ApiHrCountRow[]
  /** Share of staff with sex recorded; low values mean the sex split is unreliable. */
  sexRecordedShare: number | null
}

export type ContractWindowKey = 'expired' | 'd30' | 'd60' | 'd90'

export interface ApiContractRow {
  staffId: string
  employeeNo: string
  name: string
  department: string
  jobTitle: string
  employmentType: string
  contractExpiry: string
  /** Negative when already past. */
  daysToExpiry: number
  window: ContractWindowKey
}

export interface ApiHrContracts {
  lookaheadDays: number
  /** Staff with no expiry recorded (permanent or not captured). */
  noExpiryRecorded: number
  windows: { key: ContractWindowKey; label: string; count: number }[]
  rows: ApiContractRow[]
}

export interface ApiHrLeave {
  year: number
  approvedDays: number
  approvedRequests: number
  pendingRequests: number
  pendingDays: number
  byType: { leaveType: string; days: number; requests: number }[]
  byDepartment: { department: string; days: number }[]
  /** Approved leave days distributed over calendar months of `year`. */
  byMonth: { month: number; label: string; days: number }[]
  onLeaveToday: { staffId: string; name: string; department: string; leaveType: string; endDate: string }[]
  /** Mean days from submission to decision; null when no decided requests. */
  avgDecisionDays: number | null
}

export interface ApiHrLoans {
  activeCount: number
  outstandingBalance: number
  monthlyDeductions: number
  pendingApprovals: number
  pendingAmount: number
  byStatus: { status: string; count: number; amount: number }[]
  rows: {
    loanId: string
    staffId: string
    name: string
    amount: number
    balance: number
    monthlyDeduction: number
    status: string
    repaidShare: number | null
  }[]
}

export interface ApiHrReviews {
  academicYear: string
  activeStaff: number
  reviewed: number
  /** Reviews SUBMITTED or ACKNOWLEDGED ÷ active staff; null with no staff. */
  completionRate: number | null
  byStatus: ApiHrCountRow[]
  averageScore: number | null
  /** Overall score bands on the 1–5 scale. */
  scoreBands: ApiHrCountRow[]
}

export interface ApiHrPromotions {
  pending: number
  approvedThisYear: number
  rejectedThisYear: number
  recent: {
    id: string
    name: string
    fromJobTitle: string
    toJobTitle: string
    effectiveDate: string
    status: string
  }[]
}
