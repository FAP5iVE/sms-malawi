/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/hooks/useFinances.ts
 * [R-PHASE]: R1 — API Client & Query-Key Singleton Consolidation; R9 —
 *   Finance I adds useStudentBalance() below; R15 — UI/UX Polish gates
 *   useFinanceSummary() on both arguments resolving, since callers now
 *   source year/term from useCurrentAcademicPeriod() (SETTING_KEYS)
 *   instead of hardcoding them.
 * [PURPOSE]: Finance summary/invoices/expenses/budget/scholarship hooks — repointed at the canonical apiFetch/queryKeys singleton.
 * [DEPENDS ON]: W/lib/api-client.ts
 */
'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiFinanceSummary, ApiInvoice, ApiExpense, ApiScholarship } from '@shared/types/api'
import type { RecordPaymentInput, CreateExpenseInput } from '@shared/schemas/finance'
import { apiFetch, queryKeys } from '@/lib/api-client'

export function useFinanceSummary(academicYear: string, term: number) {
  return useQuery({
    queryKey: queryKeys.finances.summary(academicYear, term),
    queryFn: () =>
      apiFetch<ApiFinanceSummary>(`/finances/summary?academicYear=${academicYear}&term=${term}`),
    refetchInterval: 30_000,
    // R15 — callers now source year/term from useCurrentAcademicPeriod()
    // (SETTING_KEYS) instead of hardcoding them; don't fire until both
    // settings have resolved.
    enabled: !!academicYear && !!term,
  })
}

export function useInvoices(
  filters: { academicYear?: string; term?: number; status?: string; studentId?: string } = {},
  enabled = true
) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined) params.set(k, String(v))
  })
  return useQuery({
    queryKey: queryKeys.finances.invoices(filters),
    queryFn: () => apiFetch<ApiInvoice[]>(`/finances/invoices?${params}`),
    enabled,
  })
}

/**
 * [R-PHASE]: R9 — Finance I: Invoicing, Fees & the Accounting Ledger
 *   Reconnection
 * Student self-service balance view — GET /finances/balance/:studentId is
 * ownership-checked server-side and reachable by the `student` role,
 * unlike GET /finances/invoices whose role list excludes `student`
 * entirely. `studentId` is only meaningful for staff callers viewing a
 * specific student; a student-role caller's own Firebase UID is resolved
 * to their real Prisma Student.id server-side regardless of what is
 * passed here (see finances.ts's GET /balance/:studentId).
 */
export function useStudentBalance(studentId: string, academicYear: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.finances.balance(studentId, academicYear),
    queryFn: () =>
      apiFetch<{ invoices: ApiInvoice[]; totalBalance: number }>(
        `/finances/balance/${studentId}?academicYear=${academicYear}`
      ),
    enabled: enabled && !!studentId,
  })
}

export function useRecordPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: RecordPaymentInput) =>
      apiFetch<{ payment: unknown; invoice: ApiInvoice }>('/finances/payments', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.finances.all() }),
  })
}

export function useExpenses(filters: { academicYear?: string; term?: number } = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined) params.set(k, String(v))
  })
  return useQuery({
    queryKey: queryKeys.finances.expenses(filters),
    queryFn: () => apiFetch<ApiExpense[]>(`/finances/expenses?${params}`),
  })
}

/**
 * [R-PHASE]: R9 — Finance I: Invoicing, Fees & the Accounting Ledger
 *   Reconnection
 * Expense workflow hooks — Create, Approve, Reject, and receipt
 * upload/view. ExpensesTab.tsx was previously a read-only list; these
 * back the new three-state workflow view.
 */
export function useCreateExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateExpenseInput) =>
      apiFetch<ApiExpense>('/finances/expenses', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.finances.all() }),
  })
}

export function useUploadExpenseReceipt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ expenseId, file }: { expenseId: string; file: File }) => {
      const formData = new FormData()
      formData.append('file', file)
      return apiFetch<{ receiptKey: string }>(`/finances/expenses/${expenseId}/receipt`, {
        method: 'POST',
        body: formData,
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.finances.all() }),
  })
}

export function useViewExpenseReceipt() {
  return useMutation({
    mutationFn: (expenseId: string) =>
      apiFetch<{ url: string }>(`/finances/expenses/${expenseId}/receipt`),
    onSuccess: (data) => {
      window.open(data.url, '_blank', 'noopener,noreferrer')
    },
  })
}

export function useApproveExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (expenseId: string) =>
      apiFetch<ApiExpense>(`/finances/expenses/${expenseId}/approve`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.finances.all() }),
  })
}

export function useRejectExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (expenseId: string) =>
      apiFetch<ApiExpense>(`/finances/expenses/${expenseId}/reject`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.finances.all() }),
  })
}

// Budget vs Actual — returns array of {department, category, allocated, spent, remaining}
export function useBudgetVsActual(academicYear: string) {
  return useQuery({
    queryKey: queryKeys.finances.budget(academicYear, undefined),
    queryFn: () =>
      apiFetch<Array<{
        department: string
        category: string
        allocated: number
        spent: number
        remaining: number
      }>>(`/finances/budget?academicYear=${academicYear}`),
  })
}

export function useScholarships() {
  return useQuery({
    queryKey: queryKeys.finances.scholarships(),
    queryFn: () => apiFetch<ApiScholarship[]>('/finances/scholarships'),
  })
}