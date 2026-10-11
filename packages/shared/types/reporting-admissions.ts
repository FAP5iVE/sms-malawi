/** Response types for /reporting/admissions/* */

export interface ApiLabelCount {
  label: string
  count: number
}

export interface ApiApplicationStatusRow {
  status: string
  label: string
  count: number
  /** Share of all applications received in the window. */
  pct: number | null
}

export interface ApiAdmissionsPipeline {
  windowMonths: number
  received: number
  byStatus: ApiApplicationStatusRow[]
  /** Accepted (approved / awaiting admission / admitted) ÷ decided applications. */
  approvalRate: number | null
  /** Denied ÷ decided applications. */
  denialRate: number | null
  /** Admitted ÷ accepted applications. */
  admissionRate: number | null
  /** Admitted ÷ all received. */
  conversionRate: number | null
  /** Days from submission to first decision (approve / deny / awaiting admission). */
  avgReviewDays: number | null
  medianReviewDays: number | null
  /** Days from approval to admission (student record created). */
  avgApprovalToAdmissionDays: number | null
  /** Open queue, regardless of the window. */
  backlog: {
    pending: number
    awaitingAdmission: number
    pendingAging: ApiLabelCount[]
    oldestPendingDays: number | null
  }
  trend: { label: string; received: number; admitted: number }[]
  byForm: { form: number; label: string; received: number; admitted: number }[]
  byDistrict: ApiLabelCount[]
  bySex: ApiLabelCount[]
  topPreviousSchools: ApiLabelCount[]
}

export interface ApiEnrollmentFormRow {
  form: number
  label: string
  students: number
  male: number
  female: number
}

export interface ApiEnrollmentClassRow {
  classId: string
  className: string
  form: number
  students: number
}

export interface ApiEnrollment {
  academicYear: string
  /** Students in every status. */
  totalRecords: number
  active: number
  byStatus: { status: string; label: string; count: number }[]
  byForm: ApiEnrollmentFormRow[]
  byClass: ApiEnrollmentClassRow[]
  bySex: ApiLabelCount[]
  byDistrict: ApiLabelCount[]
  /** Active students first registered on/after the start of the academic year. */
  newThisYear: number
  returning: number
  registrationTrend: { label: string; registered: number }[]
  records: {
    activeWithoutClass: number
    missingGuardianPhone: number
    awaitingManeb: number
  }
}
