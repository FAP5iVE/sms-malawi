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
 */
export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? ''
  const url = `${base}/api${path}`

  async function buildHeaders(forceRefresh = false): Promise<HeadersInit> {
    const user = getAuth().currentUser
    const token = user ? await user.getIdToken(forceRefresh) : undefined

    return {
      'Content-Type': 'application/json',
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
  if (res.status === 401) {
    const user = getAuth().currentUser
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
    attendance: (id: string, term?: number) =>
      ['students', id, 'attendance', term] as const,
    feeStatus: (id: string) => ['students', id, 'fee-status'] as const,
    libraryStatus: (id: string) => ['students', id, 'library-status'] as const,
    riskFlags: (id: string) => ['students', id, 'risk'] as const,
    transcript: (id: string) => ['students', id, 'transcript'] as const,
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
    libraryFines: (filters?: Record<string, unknown>) =>
      ['finances', 'library-fines', filters ?? {}] as const,
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
    detail: (id: string) => ['announcements', 'detail', id] as const,
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

  // ── Reports
  reports: {
    all: () => ['reports'] as const,
    finance: (filters: Record<string, unknown>) =>
      ['reports', 'finance', filters] as const,
    academic: (filters: Record<string, unknown>) =>
      ['reports', 'academic', filters] as const,
    library: (filters?: Record<string, unknown>) =>
      ['reports', 'library', filters ?? {}] as const,
    hr: (filters?: Record<string, unknown>) =>
      ['reports', 'hr', filters ?? {}] as const,
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
    events: (start: string, end: string) =>
      ['calendar', 'events', start, end] as const,
  },

  // ── Settings
  settings: {
    all: () => ['settings'] as const,
    system: () => ['settings', 'system'] as const,
    notifPrefs: () => ['settings', 'notif-prefs'] as const,
  },
} as const