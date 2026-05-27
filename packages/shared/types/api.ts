// Lightweight API response types shared between frontend hooks and backend routes
// These do NOT need to match Prisma types exactly — just the fields the frontend uses

export interface ApiStudent {
  id: string
  registrationNo: string
  firstName: string
  lastName: string
  dateOfBirth: string
  sex: 'MALE' | 'FEMALE'
  nationality: string
  district: string
  village?: string
  phone?: string
  guardianName: string
  guardianPhone: string
  guardianRelation: string
  status: string
  classId?: string
  class?: { id: string; name: string; form: number }
}

export interface ApiStudentListResponse {
  students: ApiStudent[]
  total: number
  page: number
  pages: number
}

export interface ApiClass {
  id: string
  name: string
  form: number
  stream?: string
  room?: string
  teacherId?: string
  academicYear: string
  students?: ApiStudent[]
  _count?: { students: number }
}

export interface ApiTimetableSlot {
  id: string
  classId: string
  day: string
  periodStart: string
  periodEnd: string
  subject: string
  teacherUid: string
  room?: string
  type: string
}

export interface ApiApplication {
  id: string
  firstName: string
  lastName: string
  dateOfBirth: string
  sex: 'MALE' | 'FEMALE'
  nationality: string
  district: string
  guardianName: string
  guardianPhone: string
  guardianRelation: string
  applyingForForm: number
  status: string
  createdAt: string
  notes?: string
}

// ─── FINANCE API TYPES ────────────────────────────────────

export interface ApiInvoice {
  id: string
  studentId: string
  academicYear: string
  term: number
  subtotal: number
  discount: number
  latePenalty: number
  totalAmount: number
  paidAmount: number
  balance: number
  status: string
  dueDate: string
  payments?: ApiPayment[]
}

export interface ApiPayment {
  id: string
  invoiceId: string
  amount: number
  method: string
  reference?: string
  receiptKey?: string
  receiptUrl?: string // signed URL from R2 — generated on request
  paidAt: string
}

export interface ApiExpense {
  id: string
  category: string
  description: string
  amount: number
  academicYear: string
  term: number
  status: string
  incurredAt: string
}

export interface ApiPayrollRun {
  id: string
  month: number
  year: number
  status: string
  totalGross: number
  totalNet: number
  completedAt?: string
  payslips?: ApiPayslip[]
}

export interface ApiPayslip {
  id: string
  staffUid: string
  staffName: string
  grossSalary: number
  paye: number
  pension: number
  loanDeduction: number
  netSalary: number
  payslipUrl?: string // signed URL from R2
}

export interface ApiFinanceSummary {
  totalCollected: number
  totalOutstanding: number
  totalExpenses: number
  collectionTarget: number
  collectionPercent: number // 0–100
}

export interface ApiScholarship {
  id: string
  name: string
  studentId: string
  discountType: string
  value: number
  academicYear: string
  isActive: boolean
} // ─── FINANCE API TYPES ────────────────────────────────────

export interface ApiInvoice {
  id: string
  studentId: string
  academicYear: string
  term: number
  subtotal: number
  discount: number
  latePenalty: number
  totalAmount: number
  paidAmount: number
  balance: number
  status: string
  dueDate: string
  payments?: ApiPayment[]
}

export interface ApiPayment {
  id: string
  invoiceId: string
  amount: number
  method: string
  reference?: string
  receiptKey?: string
  receiptUrl?: string // signed URL from R2 — generated on request
  paidAt: string
}

export interface ApiExpense {
  id: string
  category: string
  description: string
  amount: number
  academicYear: string
  term: number
  status: string
  incurredAt: string
}

export interface ApiPayrollRun {
  id: string
  month: number
  year: number
  status: string
  totalGross: number
  totalNet: number
  completedAt?: string
  payslips?: ApiPayslip[]
}

export interface ApiPayslip {
  id: string
  staffUid: string
  staffName: string
  grossSalary: number
  paye: number
  pension: number
  loanDeduction: number
  netSalary: number
  payslipUrl?: string // signed URL from R2
}

export interface ApiFinanceSummary {
  totalCollected: number
  totalOutstanding: number
  totalExpenses: number
  collectionTarget: number
  collectionPercent: number // 0–100
}

export interface ApiScholarship {
  id: string
  name: string
  studentId: string
  discountType: string
  value: number
  academicYear: string
  isActive: boolean
} // ─── FINANCE API TYPES ────────────────────────────────────

export interface ApiInvoice {
  id: string
  studentId: string
  academicYear: string
  term: number
  subtotal: number
  discount: number
  latePenalty: number
  totalAmount: number
  paidAmount: number
  balance: number
  status: string
  dueDate: string
  payments?: ApiPayment[]
}

export interface ApiPayment {
  id: string
  invoiceId: string
  amount: number
  method: string
  reference?: string
  receiptKey?: string
  receiptUrl?: string // signed URL from R2 — generated on request
  paidAt: string
}

export interface ApiExpense {
  id: string
  category: string
  description: string
  amount: number
  academicYear: string
  term: number
  status: string
  incurredAt: string
}

export interface ApiPayrollRun {
  id: string
  month: number
  year: number
  status: string
  totalGross: number
  totalNet: number
  completedAt?: string
  payslips?: ApiPayslip[]
}

export interface ApiPayslip {
  id: string
  staffUid: string
  staffName: string
  grossSalary: number
  paye: number
  pension: number
  loanDeduction: number
  netSalary: number
  payslipUrl?: string // signed URL from R2
}

export interface ApiFinanceSummary {
  totalCollected: number
  totalOutstanding: number
  totalExpenses: number
  collectionTarget: number
  collectionPercent: number // 0–100
}

export interface ApiScholarship {
  id: string
  name: string
  studentId: string
  discountType: string
  value: number
  academicYear: string
  isActive: boolean
}

export interface ApiExam {
  id: string
  type: string
  subject: string
  classId: string
  title: string
  date: string
  timeStart: string
  timeEnd: string
  venue: string
  maxMark: number
  weightPercent: number
  academicYear: string
  term: number
  status: string
  createdByUid: string
  _count?: { marks: number }
}

export interface ApiTermResult {
  id: string
  studentId: string
  classId: string
  academicYear: string
  term: number
  totalMark: number
  average: number
  grade: string
  position: number | null
  passStatus: boolean
  subjectResults: Record<string, { average: number; grade: string; pass: boolean }>
  attendanceDays: number
  absentDays: number
  teacherComment: string | null
  headComment: string | null
  reportCardKey: string | null
  releasedAt: string | null
}

export interface ApiManebRecord {
  id: string
  studentId: string
  examType: 'JCE' | 'MSCE'
  candidateNo: string
  centerNo: string
  centerName: string
  academicYear: string
  subjectGrades: Record<string, string>
  overallGrade: string | null
  status: 'REGISTERED' | 'SITTING' | 'RESULTS_RECEIVED' | 'CERTIFIED'
}