/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/hooks/useFinances.ts
 * [R-PHASE]: R1 — API Client & Query-Key Singleton Consolidation; R9 —
 *   Finance I adds useStudentBalance() below; R15 — UI/UX Polish gates
 *   useFinanceSummary() on both arguments resolving, since callers now
 *   source year/term from useCurrentAcademicPeriod() (SETTING_KEYS)
 *   instead of hardcoding them; 2026-09-05 — Invoice Entry & Allocation /
 *   Bulk Invoice Generator / Finance Fee Structure / Settings & Fee
 *   Catalog / Student Portal Statement redesign adds useUpdateFeeStructure,
 *   useFeeCommitments/useUpsertFeeCommitment/useUpdateFeeCommitmentStatus,
 *   useAddInvoiceLineItem, and useBulkGenerateInvoices below.
 * [PURPOSE]: Finance summary/invoices/expenses/budget/scholarship hooks — repointed at the canonical apiFetch/queryKeys singleton.
 * [DEPENDS ON]: W/lib/api-client.ts
 */
'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  ApiFinanceSummary, ApiInvoice, ApiExpense, ApiScholarship, ApiDebtsSummary,
  ApiStudentCredit, ApiFeeStructure, ApiStudentFeeCommitment, ApiBulkInvoiceResult,
} from '@shared/types/api'
import type {
  RecordPaymentInput, CreateExpenseInput, CreateBudgetInput,
  CreateFeeStructureInput, UpdateFeeStructureInput, GenerateInvoiceInput,
  AddInvoiceLineItemInput, CreateStudentFeeCommitmentInput,
  UpdateStudentFeeCommitmentInput, BulkGenerateInvoicesInput,
} from '@shared/schemas/finance'
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
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.finances.all() })
      qc.invalidateQueries({ queryKey: queryKeys.finances.invoice(variables.invoiceId) })
    },
  })
}

// [PRODUCTION FIX] The backend endpoint (POST /finances/invoices/generate)
// already existed and works — nothing in the UI ever called it.
// InvoicesTab.tsx (same phase) is this hook's only caller.
export function useGenerateInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: GenerateInvoiceInput) =>
      apiFetch<ApiInvoice>('/finances/invoices/generate', {
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

// [PRODUCTION FIX 2026-07-27] paidImmediately decides which ledger account
// the approval posts against — see finances.ts's approve route. Defaults to
// true (existing behaviour: approval = paid) when omitted.
export function useApproveExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ expenseId, paidImmediately = true }: { expenseId: string; paidImmediately?: boolean }) =>
      apiFetch<ApiExpense>(`/finances/expenses/${expenseId}/approve`, {
        method: 'PATCH',
        body:   JSON.stringify({ paidImmediately }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.finances.all() })
      qc.invalidateQueries({ queryKey: queryKeys.finances.debts() })
    },
  })
}

// Clears a vendor/company debt previously approved with paidImmediately=false.
export function useMarkExpensePaid() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (expenseId: string) =>
      apiFetch<ApiExpense>(`/finances/expenses/${expenseId}/mark-paid`, { method: 'PATCH' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.finances.all() })
      qc.invalidateQueries({ queryKey: queryKeys.finances.debts() })
    },
  })
}

export function useDebts() {
  return useQuery({
    queryKey: queryKeys.finances.debts(),
    queryFn:  () => apiFetch<ApiDebtsSummary>('/finances/debts'),
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

/** POST /finances/budget — the service function already existed and
 *  worked (budgetService.createBudget); there was no route calling it and
 *  no hook, so the Budget tab had no way to create a budget at all. */
export function useCreateBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateBudgetInput) =>
      apiFetch('/finances/budget', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.finances.all() }),
  })
}

/** GET /finances/fee-structures — [PRODUCTION FIX 2026-07-28] Both routes
 *  already existed and worked; there was no frontend hook or UI consuming
 *  either at all — confirmed zero callers anywhere. ApiFeeStructure itself
 *  [PRODUCTION FIX 2026-09-05] moved to @shared/types/api.ts, alongside
 *  every other finance Api* type, and extended with the fee-catalog fields
 *  (code/category/mandatory/schedule/description) — imported above instead
 *  of being declared here a second time. */
// [PRODUCTION FIX] Added studentId/term — the New Invoice fee-type picker
// needs the fee structures that actually apply to THIS student (their
// class) and THIS term, not every active fee structure in the school.
// [2026-09-05] Added includeArchived as a 4th, purely-additive parameter
// (every existing positional call site is unaffected) — the Settings &
// Fee Catalog screen fetches the full set (active + archived) once and
// filters/counts the Active/Archived/All tabs client-side, rather than a
// network round trip per tab switch.
export function useFeeStructures(
  academicYear: string,
  studentId?: string,
  term?: number,
  includeArchived?: boolean
) {
  const params = new URLSearchParams({ academicYear })
  if (studentId) params.set('studentId', studentId)
  if (term) params.set('term', String(term))
  if (includeArchived) params.set('includeArchived', 'true')
  return useQuery({
    queryKey: [...queryKeys.finances.feeStructures(academicYear, studentId, term), includeArchived ?? false] as const,
    queryFn: () => apiFetch<ApiFeeStructure[]>(`/finances/fee-structures?${params}`),
    enabled: !!academicYear,
  })
}

// [PRODUCTION FIX] A student's unapplied overpayment credit — see
// StudentCredit in schema.prisma. Read-only display; application happens
// automatically server-side at next invoice generation.
export function useStudentCredits(studentId: string, enabled = true) {
  return useQuery({
    queryKey: ['finances', 'credits', studentId] as const,
    queryFn: () => apiFetch<ApiStudentCredit[]>(`/finances/credits/${studentId}`),
    enabled: enabled && !!studentId,
  })
}
export function useCreateFeeStructure() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateFeeStructureInput) =>
      apiFetch('/finances/fee-structures', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finances', 'fee-structures'] }),
  })
}

export function useScholarships() {
  return useQuery({
    queryKey: queryKeys.finances.scholarships(),
    queryFn: () => apiFetch<ApiScholarship[]>('/finances/scholarships'),
  })
}
// [NEW] "Generate Receipt" / "View Receipt" — FinanceDashboard's own
// quick action linked here already but nothing in this tab ever called
// GET /finances/payments/:id/receipt; this closes that gap. Returns a
// signed, short-lived view URL for the receipt generated at payment time
// (see receiptService.generateReceipt()) — the caller opens it directly
// rather than this hook caching a URL that would go stale.
export function useFetchReceipt() {
  return useMutation({
    mutationFn: (paymentId: string) => apiFetch<{ url: string }>(`/finances/payments/${paymentId}/receipt`),
  })
}

// [NEW] Settings & Fee Catalog's edit / archive / restore action — see
// UpdateFeeStructureSchema in @shared/schemas/finance.
export function useUpdateFeeStructure() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateFeeStructureInput }) =>
      apiFetch<ApiFeeStructure>(`/finances/fee-structures/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.finances.all() }),
  })
}

// [NEW] Finance Fee Structure workstation's "Enrolled Add-ons" list — see
// StudentFeeCommitment in schema.prisma.
export function useFeeCommitments(studentId: string, academicYear: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.finances.feeCommitments(studentId, academicYear),
    queryFn: () =>
      apiFetch<ApiStudentFeeCommitment[]>(
        `/finances/fee-commitments?studentId=${studentId}&academicYear=${academicYear}`
      ),
    enabled: enabled && !!studentId && !!academicYear,
  })
}

// [NEW] "Edit Add-on Commitments" — enroll a student in an optional fee
// type (or reactivate a previously-waived one). See
// feeService.upsertStudentFeeCommitment().
export function useUpsertFeeCommitment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateStudentFeeCommitmentInput) =>
      apiFetch<ApiStudentFeeCommitment>('/finances/fee-commitments', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({
        queryKey: queryKeys.finances.feeCommitments(variables.studentId, variables.academicYear),
      })
      qc.invalidateQueries({ queryKey: queryKeys.finances.all() })
    },
  })
}

// [NEW] Waive (or restore) a single add-on commitment without deleting its
// row — see FeeCommitmentStatus in schema.prisma.
export function useUpdateFeeCommitmentStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateStudentFeeCommitmentInput }) =>
      apiFetch<ApiStudentFeeCommitment>(`/finances/fee-commitments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.finances.all() }),
  })
}

// [NEW] Invoice Entry & Allocation screen's "+ Add a line" affordance — see
// feeService.addInvoiceLineItem().
export function useAddInvoiceLineItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ invoiceId, feeStructureId }: AddInvoiceLineItemInput) =>
      apiFetch<ApiInvoice>(`/finances/invoices/${invoiceId}/line-items`, {
        method: 'POST',
        body: JSON.stringify({ feeStructureId }),
      }),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.finances.invoice(variables.invoiceId) })
      qc.invalidateQueries({ queryKey: queryKeys.finances.all() })
    },
  })
}

// [NEW] Bulk Invoice Generator's batch run — see
// bulkInvoiceService.bulkGenerateInvoices(). Call with `dryRun: true` for
// the "PRE-EXECUTION DRY RUN ROSTER" preview (nothing is created; the
// response is the same shape either way, so the roster table renders
// identically for a preview or a completed run), and `dryRun: false` to
// actually commit. Only invalidates finance queries on a real commit --
// a dry run reads current state but changes nothing, so there is nothing
// to invalidate.
export function useBulkGenerateInvoices() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: BulkGenerateInvoicesInput) =>
      apiFetch<ApiBulkInvoiceResult>('/finances/invoices/bulk-generate', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: (_result, variables) => {
      if (!variables.dryRun) {
        qc.invalidateQueries({ queryKey: queryKeys.finances.all() })
      }
    },
  })
}
