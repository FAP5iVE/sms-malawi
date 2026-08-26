/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/lib/api-client.ts
 * [R-PHASE]: R2 — Auth Session & Login Flow Correctness (previously R1);
 *   further edited in R5 — Academics I: Admissions & Student Records
 * [PURPOSE]: Canonical apiFetch/ApiError/queryKeys singleton. R1 added
 *   queryKeys.students.photo. R2 adds an optional `tokenOverride` parameter
 *   to apiFetch — the one narrow escape hatch AuthProvider's new logout()
 *   export needs to unregister its FCM token using a token captured from
 *   the CURRENT (not-yet-signed-out) user, rather than letting apiFetch
 *   resolve getAuth().currentUser internally (which is already null by the
 *   time the signed-out branch would otherwise call this). The 401-refresh-
 *   and-retry path is unchanged for every caller that omits tokenOverride.
 *   R5 adds queryKeys.public.* for the new unauthenticated landing-page
 *   hooks (usePublic.ts) — apiFetch itself needs no change, since it
 *   already omits the Authorization header gracefully when no Firebase
 *   user is signed in. R6 adds queryKeys.attendance.* for the new
 *   Postgres-backed attendance hooks (useAttendance.ts), and fixes
 *   apiFetch's buildHeaders() to skip forcing Content-Type: application/
 *   json when the request body is FormData — useSubmitAssignment() is the
 *   first caller that needs apiFetch itself to support a multipart file
 *   upload (previously the only file-upload call site, StudentForm.tsx's
 *   photo upload, worked around this by bypassing apiFetch entirely with
 *   a raw fetch() and manual token handling). R12 adds
 *   queryKeys.library.recommendations/.fineWaivers for the newly-wired
 *   resource-recommendation and fine-waiver-request workflows
 *   (useLibrary.ts, library.ts — same phase). R13 adds
 *   queryKeys.calendar.all() — the new calendar-event CRUD mutations
 *   (useCalendarEvents.ts) need a way to invalidate every cached
 *   start/end events range at once, which the existing events(start, end)
 *   key alone cannot express.
 *
 *   R14 adds the queryKeys.analytics.* namespace. useAnalytics.ts — 34 hooks
 *   consumed by the whole Reports & Analytics page — previously had no query
 *   keys here at all (the file's entire content was its own file path, not
 *   valid TypeScript), so every analytics cache entry it needs is new. Keys
 *   are grouped by the same domain sections analytics.ts's routes are, so a
 *   whole domain's analytics can be invalidated at once when its underlying
 *   data changes (e.g. queryKeys.analytics.finance() after a payment is
 *   recorded).
 * [DEPENDS ON]: none
 */
'use client'

import { getAuth } from 'firebase/auth'

// ─── CORE FETCH HELPER ────────────────────────────────────

/**
 * Authenticated fetch for all /api/* calls.
 *
 * Flow:
 *   1.  Get Firebase ID token for the current user (auto-refreshes if
 *       Firebase has a valid refresh token).
 *   2.  Call the API endpoint with Authorization header.
 *   3.  On 401 — force-refresh the ID token once and retry.
 *       This handles the case where the token expired mid-session or
 *       the user's custom claims were updated server-side.
 *   4.  On any other non-2xx — throw with the server's error message.
 *
 * @param tokenOverride - When provided, skips the internal
 *   getAuth().currentUser lookup and uses this token directly for both the
 *   first attempt and (if needed) the 401 retry. Exists solely for
 *   AuthProvider's logout(), which must unregister its FCM token using a
 *   token captured from the user BEFORE signOut(auth) runs — by the time a
 *   normal call would resolve getAuth().currentUser, it would already be
 *   null. Every other caller omits this and keeps today's behavior exactly.
 */
// ─── API BASE URL RESOLUTION ──────────────────────────────
//
// The API is served by this same Next.js app at /api/[[...slug]], so the
// correct value for NEXT_PUBLIC_API_URL in every environment is EMPTY —
// which yields a relative, same-origin URL. Both .env.local and .env.example
// ship it empty for exactly that reason.
//
// Production incident (post-R19): NEXT_PUBLIC_API_URL had been set in the
// Vercel dashboard to the production origin WITH a '/api' suffix. Because
// buildApiUrl() appends '/api' itself, every request went to
// '<origin>/api/api/public/...' — which matches no route — and, being an
// absolute URL pointing at the production domain, was also cross-origin
// whenever the app ran on a preview deployment, so the browser's preflight
// was rejected by api-app.ts's (correctly strict) CORS allowlist.
//
// resolveApiBase() defensively strips a trailing slash and a trailing '/api'
// so that misconfiguration can no longer produce a doubled path. Note this
// only cures the doubled segment — an absolute base still makes preview
// deployments cross-origin, so NEXT_PUBLIC_API_URL must be left unset.
function resolveApiBase(): string {
  const raw = (process.env.NEXT_PUBLIC_API_URL ?? '').trim()
  if (!raw) return ''
  return raw.replace(/\/+$/, '').replace(/\/api$/, '')
}

/**
 * Builds a fully-qualified API URL from a route-relative path ('/students/1').
 * The single place '/api' is prepended — used by apiFetch below and by the
 * few call sites that must bypass apiFetch and issue a raw fetch() (file
 * uploads / blob downloads), so no caller re-derives this string itself.
 */
export function buildApiUrl(path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${resolveApiBase()}/api${suffix}`
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
  tokenOverride?: string
): Promise<T> {
  const url = buildApiUrl(path)

  async function buildHeaders(forceRefresh = false): Promise<HeadersInit> {
    let token: string | undefined
    if (tokenOverride) {
      token = tokenOverride
    } else {
      const user = getAuth().currentUser
      token = user ? await user.getIdToken(forceRefresh) : undefined
    }

    // FormData bodies (file uploads) must NOT have Content-Type set here —
    // the browser needs to set its own 'multipart/form-data; boundary=...'
    // header, which it only does when Content-Type is left unset. Forcing
    // 'application/json' would corrupt the multipart request.
    const isFormData = typeof FormData !== 'undefined' && options?.body instanceof FormData

    return {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    }
  }

  // ── First attempt
  const res = await fetch(url, {
    ...options,
    headers: await buildHeaders(false),
  })

  // ── 401: force-refresh token and retry once
  // (tokenOverride callers cannot force-refresh — there is no live user
  // session to refresh against by the time logout() calls this — so the
  // retry path only applies to the normal, non-override path.)
  if (res.status === 401) {
    const user = tokenOverride ? null : getAuth().currentUser
    if (user) {
      try {
        const retryRes = await fetch(url, {
          ...options,
          headers: await buildHeaders(true),
        })

        if (!retryRes.ok) {
          const body = (await retryRes.json().catch(() => ({}))) as {
            error?: string
          }
          throw new ApiError(
            body.error ?? `API error ${retryRes.status}`,
            retryRes.status
          )
        }

        return retryRes.json() as Promise<T>
      } catch (err) {
        if (err instanceof ApiError) throw err
        throw new ApiError('Authentication failed. Please sign in again.', 401)
      }
    }
    throw new ApiError('You are not authenticated.', 401)
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new ApiError(body.error ?? `API error ${res.status}`, res.status)
  }

  return res.json() as Promise<T>
}

// ─── TYPED API ERROR ──────────────────────────────────────

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// ─── QUERY KEY FACTORIES ──────────────────────────────────
// All TanStack Query cache keys live here.
// Rules:
//   - Every key starts with a domain string literal for easy invalidation.
//   - Filters / IDs go at the end so broad invalidation works:
//     queryClient.invalidateQueries({ queryKey: queryKeys.students.all() })

export const queryKeys = {
  // ── Students
  students: {
    all: () => ['students'] as const,
    lists: () => ['students', 'list'] as const,
    list: (filters: Record<string, unknown>) =>
      ['students', 'list', filters] as const,
    detail: (id: string) => ['students', 'detail', id] as const,
    /** R15 — student-role self-lookup (GET /students/me, useStudentMe). */
    me: () => ['students', 'me'] as const,
    attendance: (id: string, term?: number) =>
      ['students', id, 'attendance', term] as const,
    feeStatus: (id: string) => ['students', id, 'fee-status'] as const,
    libraryStatus: (id: string) => ['students', id, 'library-status'] as const,
    riskFlags: (id: string) => ['students', id, 'risk'] as const,
    transcript: (id: string) => ['students', id, 'transcript'] as const,
    photo: (id: string) => ['students', id, 'photo'] as const,
  },

  // ── Classes
  classes: {
    all: () => ['classes'] as const,
    list: (filters?: Record<string, unknown>) =>
      ['classes', 'list', filters ?? {}] as const,
    detail: (id: string) => ['classes', 'detail', id] as const,
    timetable: (id: string, year?: string, term?: number) =>
      ['classes', id, 'timetable', year, term] as const,
    assignments: (id: string) => ['classes', id, 'assignments'] as const,
    subjectAssignmentsMine: (academicYear?: string) => ['classes', 'subject-assignments', 'mine', academicYear ?? null] as const,
    analytics: (id: string) => ['classes', id, 'analytics'] as const,
    labBookings: (id: string) => ['classes', id, 'lab-bookings'] as const,
  },

  // ── Finances
  finances: {
    all: () => ['finances'] as const,
    summary: (year: string, term: number) =>
      ['finances', 'summary', year, term] as const,
    feeStructures: (year: string) =>
      ['finances', 'fee-structures', year] as const,
    invoices: (filters: Record<string, unknown>) =>
      ['finances', 'invoices', filters] as const,
    invoice: (id: string) => ['finances', 'invoice', id] as const,
    balance: (studentId: string, academicYear: string) =>
      ['finances', 'balance', studentId, academicYear] as const,
    invoiceNotes: (invoiceId: string) =>
      ['finances', 'invoice', invoiceId, 'notes'] as const,
    expenses: (filters: Record<string, unknown>) =>
      ['finances', 'expenses', filters] as const,
    budget: (year: string, term?: number) =>
      ['finances', 'budget', year, term] as const,
    scholarships: (filters?: Record<string, unknown>) =>
      ['finances', 'scholarships', filters ?? {}] as const,
    installment: (invoiceId: string) =>
      ['finances', 'installment', invoiceId] as const,
    debts: () => ['finances', 'debts'] as const,
    libraryFines: (filters?: Record<string, unknown>) =>
      ['finances', 'library-fines', filters ?? {}] as const,
    forecast: (academicYear: string, forwardMonths: number) =>
      ['finances', 'forecast', academicYear, forwardMonths] as const,
    payroll: {
      all: () => ['finances', 'payroll'] as const,
      list: (filters?: Record<string, unknown>) =>
        ['finances', 'payroll', 'list', filters ?? {}] as const,
      detail: (id: string) => ['finances', 'payroll', id] as const,
      payslips: (payrollRunId: string) =>
        ['finances', 'payroll', payrollRunId, 'payslips'] as const,
      myPayslips: () => ['finances', 'payroll', 'my-payslips'] as const,
    },
    salaryStructure: (staffUid: string) =>
      ['finances', 'salary-structure', staffUid] as const,
  },

  // ── Exams
  exams: {
    all: () => ['exams'] as const,
    list: (filters: Record<string, unknown>) =>
      ['exams', 'list', filters] as const,
    detail: (id: string) => ['exams', 'detail', id] as const,
    marks: (examId: string) => ['exams', examId, 'marks'] as const,
    termResults: (filters: Record<string, unknown>) =>
      ['exams', 'term-results', filters] as const,
    annualResults: (filters: Record<string, unknown>) =>
      ['exams', 'annual-results', filters] as const,
    manebRecords: (filters?: Record<string, unknown>) =>
      ['exams', 'maneb', filters ?? {}] as const,
    analytics: {
      class: (classId: string, year: string, term: number) =>
        ['exams', 'analytics', 'class', classId, year, term] as const,
      school: (year: string, term?: number) =>
        ['exams', 'analytics', 'school', year, term] as const,
    },
  },

  // ── HR
  hr: {
    all: () => ['hr'] as const,
    staff: (filters?: Record<string, unknown>) =>
      ['hr', 'staff', filters ?? {}] as const,
    staffDetail: (id: string) => ['hr', 'staff', id] as const,
    leaveRequests: (filters?: Record<string, unknown>) =>
      ['hr', 'leave', 'requests', filters ?? {}] as const,
    leaveBalances: (staffId: string, year: number) =>
      ['hr', 'leave', 'balances', staffId, year] as const,
    loans: (filters?: Record<string, unknown>) =>
      ['hr', 'loans', filters ?? {}] as const,
    loanDetail: (id: string) => ['hr', 'loans', id] as const,
    performance: (staffId: string) => ['hr', 'performance', staffId] as const,
    salaryStructure: (staffUid: string) =>
      ['hr', 'salary-structure', staffUid] as const,
    contractAlerts: (days?: number) => ['hr', 'contract-alerts', days ?? 60] as const,
  },

  // ── Library
  library: {
    all: () => ['library'] as const,
    books: (filters?: Record<string, unknown>) =>
      ['library', 'books', filters ?? {}] as const,
    book: (id: string) => ['library', 'books', id] as const,
    borrowings: (filters?: Record<string, unknown>) =>
      ['library', 'borrowings', filters ?? {}] as const,
    myBorrowings: () => ['library', 'borrowings', 'mine'] as const,
    digitalResources: (filters?: Record<string, unknown>) =>
      ['library', 'digital-resources', filters ?? {}] as const,
    fines: (filters?: Record<string, unknown>) =>
      ['library', 'fines', filters ?? {}] as const,
    myFines: () => ['library', 'fines', 'mine'] as const,
    stats: () => ['library', 'stats'] as const,
    recommendations: (status?: string) =>
      ['library', 'recommendations', status ?? 'all'] as const,
    fineWaivers: (status?: string) =>
      ['library', 'fine-waivers', status ?? 'all'] as const,
  },

  // ── Applications
  applications: {
    all: () => ['applications'] as const,
    list: (filters?: Record<string, unknown>) =>
      ['applications', 'list', filters ?? {}] as const,
    detail: (id: string) => ['applications', 'detail', id] as const,
  },

  // ── Announcements
  announcements: {
    all: () => ['announcements'] as const,
    list: (filters?: Record<string, unknown>) =>
      ['announcements', 'list', filters ?? {}] as const,
    pending: () => ['announcements', 'pending'] as const,
    detail: (id: string) => ['announcements', 'detail', id] as const,
  },

  // ── Notification feed (N4)
  notifications: {
    feed: () => ['notifications', 'feed'] as const,
  },

  // ── Timetable
  timetable: {
    all: () => ['timetable'] as const,
    byClass: (classId: string, year: string, term: number) =>
      ['timetable', 'class', classId, year, term] as const,
    labBookings: (filters?: Record<string, unknown>) =>
      ['timetable', 'lab', filters ?? {}] as const,
    mySchedule: () => ['timetable', 'mine'] as const,
  },

  // ── Analytics (R14 — one entry per analytics.ts route)
  analytics: {
    all: () => ['analytics'] as const,

    admin: () => ['analytics', 'admin'] as const,
    adminLoginTrend: (days: number) => ['analytics', 'admin', 'login-trend', days] as const,
    adminActivityHeatmap: () => ['analytics', 'admin', 'activity-heatmap'] as const,
    adminEntityActivity: (days: number) => ['analytics', 'admin', 'entity-activity', days] as const,
    adminActionBreakdown: (days: number) => ['analytics', 'admin', 'action-breakdown', days] as const,
    adminAuditVolume: (days: number) => ['analytics', 'admin', 'audit-volume', days] as const,

    school: () => ['analytics', 'school'] as const,
    schoolPerformanceTrend: (years: readonly string[]) =>
      ['analytics', 'school', 'performance-trend', [...years].join(',')] as const,
    schoolClassComparison: (year: string, term: number) =>
      ['analytics', 'school', 'class-comparison', year, term] as const,
    schoolSubjectComparison: (year: string, term: number) =>
      ['analytics', 'school', 'subject-comparison', year, term] as const,
    schoolTeacherEffectiveness: (year: string, term: number) =>
      ['analytics', 'school', 'teacher-effectiveness', year, term] as const,
    schoolEnrollmentTrend: (months: number) =>
      ['analytics', 'school', 'enrollment-trend', months] as const,
    schoolFinancialSummary: (year: string) =>
      ['analytics', 'school', 'financial-summary', year] as const,
    schoolAttendanceSummary: (year: string, term: number) =>
      ['analytics', 'school', 'attendance-summary', year, term] as const,

    finance: () => ['analytics', 'finance'] as const,
    financeCollectionByDay: (days: number) =>
      ['analytics', 'finance', 'collection-by-day', days] as const,
    financeCollectionByMonth: (months: number) =>
      ['analytics', 'finance', 'collection-by-month', months] as const,
    financeOutstandingByClass: (year: string, term?: number) =>
      ['analytics', 'finance', 'outstanding-by-class', year, term ?? null] as const,
    financeExpenseBreakdown: (year: string, term?: number) =>
      ['analytics', 'finance', 'expense-breakdown', year, term ?? null] as const,
    financeBudgetVsActual: (year: string, term?: number) =>
      ['analytics', 'finance', 'budget-vs-actual', year, term ?? null] as const,
    financeCashFlow: (year: string) => ['analytics', 'finance', 'cash-flow', year] as const,
    financePayrollTrend: (months: number) =>
      ['analytics', 'finance', 'payroll-trend', months] as const,
    financeScholarshipSummary: (year: string) =>
      ['analytics', 'finance', 'scholarship-summary', year] as const,

    library: () => ['analytics', 'library'] as const,
    libraryBorrowingTrend: (weeks: number) =>
      ['analytics', 'library', 'borrowing-trend', weeks] as const,
    libraryInventoryHealth: () => ['analytics', 'library', 'inventory-health'] as const,
    libraryTopBorrowed: (limit: number) =>
      ['analytics', 'library', 'top-borrowed', limit] as const,
    libraryDigitalStats: () => ['analytics', 'library', 'digital-stats'] as const,

    admissions: () => ['analytics', 'admissions'] as const,
    applicationsFunnel: () => ['analytics', 'admissions', 'applications-funnel'] as const,
    applicationTrend: (months: number) =>
      ['analytics', 'admissions', 'application-trend', months] as const,
    enrollmentByForm: (year: string) =>
      ['analytics', 'admissions', 'enrollment-by-form', year] as const,

    academic: () => ['analytics', 'academic'] as const,
    academicSubjectPerformance: (year: string, term: number) =>
      ['analytics', 'academic', 'subject-performance', year, term] as const,
    academicAssignmentCompletion: (year: string) =>
      ['analytics', 'academic', 'assignment-completion', year] as const,
    academicMarksDistribution: (examId: string) =>
      ['analytics', 'academic', 'marks-distribution', examId] as const,

    student: () => ['analytics', 'student'] as const,
    studentPerformanceTrend: (studentId: string) =>
      ['analytics', 'student', 'performance-trend', studentId] as const,
    studentSubjectBreakdown: (studentId: string, year: string, term: number) =>
      ['analytics', 'student', 'subject-breakdown', studentId, year, term] as const,
    studentFeeStatement: (studentId: string) =>
      ['analytics', 'student', 'fee-statement', studentId] as const,
    studentAttendance: (studentId: string, year?: string, term?: number) =>
      ['analytics', 'student', 'attendance', studentId, year ?? null, term ?? null] as const,

    maneb: () => ['analytics', 'maneb'] as const,
    manebSchoolStats: (year: string) => ['analytics', 'maneb', 'school-stats', year] as const,
    manebCandidates: (year: string, examType?: string) =>
      ['analytics', 'maneb', 'candidates', year, examType ?? null] as const,

    hr: () => ['analytics', 'hr'] as const,
    hrStaffByDepartment: () => ['analytics', 'hr', 'staff-by-department'] as const,
    hrLeaveByType: (year: number) => ['analytics', 'hr', 'leave-by-type', year] as const,
    hrLeaveTrend: (months: number) => ['analytics', 'hr', 'leave-trend', months] as const,

    capabilities: () => ['analytics', 'capabilities'] as const,
  },

  // ── Reports
  reports: {
    all: () => ['reports'] as const,
    admin: () => ['reports', 'admin'] as const,
    school: (filters?: Record<string, unknown>) =>
      ['reports', 'school', filters ?? {}] as const,
    finance: (filters: Record<string, unknown>) =>
      ['reports', 'finance', filters] as const,
    academic: (filters: Record<string, unknown>) =>
      ['reports', 'academic', filters] as const,
    library: (filters?: Record<string, unknown>) =>
      ['reports', 'library', filters ?? {}] as const,
    hr: (filters?: Record<string, unknown>) =>
      ['reports', 'hr', filters ?? {}] as const,
    examOfficer: (filters?: Record<string, unknown>) =>
      ['reports', 'exam-officer', filters ?? {}] as const,
    student: (id: string) => ['reports', 'student', id] as const,
    system: () => ['reports', 'system'] as const,
    auditLogs: (filters: Record<string, unknown>) =>
      ['reports', 'audit-logs', filters] as const,
  },

  // ── User Management / Admin
  admin: {
    users: (filters?: Record<string, unknown>) =>
      ['admin', 'users', filters ?? {}] as const,
    userDetail: (uid: string) => ['admin', 'users', uid] as const,
    notifPrefs: () => ['admin', 'notif-prefs'] as const,
    systemHealth: () => ['admin', 'system-health'] as const,
    pendingActions: (filters?: Record<string, unknown>) =>
      ['admin', 'pending-actions', filters ?? {}] as const,
  },

  // ── Calendar
  calendar: {
    all: () => ['calendar'] as const,
    events: (start: string, end: string) =>
      ['calendar', 'events', start, end] as const,
  },

  // ── Settings
  settings: {
    all: () => ['settings'] as const,
    system: () => ['settings', 'system'] as const,
    notifPrefs: () => ['settings', 'notif-prefs'] as const,
    holidays: (year: number) => ['settings', 'holidays', year] as const,
  },

  // ── Public (unauthenticated landing page — /public/* routes)
  public: {
    schoolInfo: () => ['public', 'school-info'] as const,
    manebStats: (year?: string) => ['public', 'maneb-stats', year ?? null] as const,
    announcements: (limit?: number) => ['public', 'announcements', limit ?? null] as const,
    placementStats: (year?: string) => ['public', 'placement-stats', year ?? null] as const,
    placements: (year?: string) => ['public', 'placements', year ?? null] as const,
  },

  // ── Attendance (Postgres-backed, R6)
  attendance: {
    class: (classId: string, date: string) => ['attendance', 'class', classId, date] as const,
    student: (studentId: string) => ['attendance', 'student', studentId] as const,
  },

  // ── Placements (advisory university placement, R18)
  placements: {
    all: () => ['placements'] as const,
    me: () => ['placements', 'me'] as const,
    student: (studentId: string) => ['placements', 'student', studentId] as const,
    cohort: (status?: string) => ['placements', 'cohort', status ?? null] as const,
    catalogue: () => ['placements', 'catalogue'] as const,
    eligible: (academicYear: string) => ['placements', 'eligible', academicYear] as const,
    analytics: (academicYear?: string) => ['placements', 'analytics', academicYear ?? null] as const,
  },
  monitoring: {
    summary: () => ['monitoring', 'summary'] as const,
    issues: (status?: string, level?: string, uptimeOnly?: boolean) =>
      ['monitoring', 'issues', status ?? null, level ?? null, uptimeOnly ?? false] as const,
    alerts: () => ['monitoring', 'alerts'] as const,
    replays: (statsPeriod: string) => ['monitoring', 'replays', statsPeriod] as const,
    releases: (statsPeriod: string) => ['monitoring', 'releases', statsPeriod] as const,
    logs: (level?: string) => ['monitoring', 'logs', level ?? null] as const,
    feedback: () => ['monitoring', 'feedback'] as const,
  },
} as const