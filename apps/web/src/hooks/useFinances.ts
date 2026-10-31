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
import { toast } from 'sonner'
import { apiFetch, ApiError, newIdempotencyKey, queryKeys } from '@/lib/api-client'
import { openPdfPreview, PdfPreviewError } from '@/lib/pdfPreview'

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

// [ALGOLIA ROLLOUT — Tier 2 item 7, stopgap] GET /finances/invoices used to
// return an unbounded-by-consumer-expectation raw array capped at a
// hardcoded `take: 100` server-side — the same silent-truncation bug class
// as the original User Management item. The route now paginates properly
// (real total/page/pages), so this hook loops every page and concatenates,
// preserving its existing `ApiInvoice[]` contract for both callers
// (StudentFeeStructure.tsx, InvoicesTab.tsx) rather than pushing a
// pagination-envelope shape change out to them. Same stopgap-not-endgame
// note as useUsers() in useAdmin.ts: once InvoicesTab's search/filter/sort
// move to querying the `invoices` Algolia index directly, this should go
// back to fetching one page at a time and let Algolia own pagination.
interface ApiInvoicePage { invoices: ApiInvoice[]; total: number; page: number; pages: number }
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
    queryFn: async () => {
      const allInvoices: ApiInvoice[] = []
      let page = 1
      for (;;) {
        const query = new URLSearchParams(params)
        query.set('page', String(page))
        query.set('pageSize', '200')
        const result = await apiFetch<ApiInvoicePage>(`/finances/invoices?${query}`)
        allInvoices.push(...result.invoices)
        if (page >= result.pages) break
        page++
      }
      return allInvoices
    },
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
// [ADDRESSED 2026-09-05] GET /finances/invoices/:id has existed and
// worked since before this session -- confirmed secured (FINANCE_ROLES +
// student, own-record only) -- but had no matching hook, unlike every
// other single-resource GET in this app (useStudent(id) alongside
// useStudents(), useClass(id) alongside useClasses()). Adding this closes
// that one gap so the route is actually reachable from the client. None
// of the five redesigned finance screens need it themselves -- each
// looks an invoice up by (studentId, academicYear, term) via
// useInvoices(), not by a already-known id -- so this has no forced
// call site yet. It's the same kind of standing, reusable
// infrastructure useStudent()/useClass() already are.
export function useInvoiceDetail(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.finances.invoice(id),
    queryFn: () => apiFetch<ApiInvoice>(`/finances/invoices/${id}`),
    enabled: enabled && !!id,
  })
}

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
    meta: { successMessage: 'Payment recorded', failureTitle: 'Could not record payment', affectsRisk: true },   // refreshes student risk badges (see QueryProvider)
    mutationFn: (data: RecordPaymentInput) =>
      apiFetch<{ payment: unknown; invoice: ApiInvoice }>('/finances/payments', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    // [FIXED 2026-10-22] These invalidations used to be fire-and-forget, so
    // mutateAsync() resolved while the invoice refetch was still in flight and
    // Invoice Entry & Allocation rebuilt its ledger from the PRE-payment
    // invoice (red balance until a manual refresh -> invitation to record the
    // same payment twice). Returning the promise keeps the mutation pending --
    // and the form locked -- until the fresh balances have actually landed.
    onSuccess: async (_result, variables) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.finances.all() }),
        qc.invalidateQueries({ queryKey: queryKeys.finances.invoice(variables.invoiceId) }),
      ])
    },
  })
}

// [PRODUCTION FIX] The backend endpoint (POST /finances/invoices/generate)
// already existed and works — nothing in the UI ever called it.
// InvoicesTab.tsx (same phase) is this hook's only caller.
export function useGenerateInvoice() {
  const qc = useQueryClient()
  return useMutation({
    meta: { successMessage: 'Invoice generated', failureTitle: 'Could not generate invoice', affectsRisk: true },   // refreshes student risk badges (see QueryProvider)
    mutationFn: (data: GenerateInvoiceInput) =>
      apiFetch<ApiInvoice>('/finances/invoices/generate', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    // Awaited -- see useRecordPayment: the caller continues straight on to
    // record a payment against this invoice and must see it in the cache.
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.finances.all() })
    },
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
    meta: { successMessage: 'Expense created', failureTitle: 'Could not create expense' },
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
    meta: { successMessage: 'Expense receipt uploaded', failureTitle: 'Could not upload expense receipt' },
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

// [PDF PREVIEW] Receipt openers. The API returns the file's /api/files/<id>
// proxy URL; openPdfPreview() opens it in the browser's own PDF viewer (new
// tab) with the caller's ID token attached — a bare window.open(url) could not
// authenticate, so the proxy answered 401. The tab has to be opened inside the
// click, so the opening lives in the mutationFn (not onSuccess, which runs
// after the round-trip). Failures are toasted: before, they were silent.
function openReceiptPreview(path: string): Promise<void> {
  return openPdfPreview(async () => (await apiFetch<{ url: string }>(path)).url)
}

function receiptErrorMessage(err: unknown): string {
  return err instanceof ApiError || err instanceof PdfPreviewError
    ? err.message
    : 'Could not open this receipt.'
}

export function useViewExpenseReceipt() {
  return useMutation({
    meta: { feedback: 'manual' },
    mutationFn: (expenseId: string) => openReceiptPreview(`/finances/expenses/${expenseId}/receipt`),
    onError: (err) => toast.error(receiptErrorMessage(err)),
  })
}

// [PRODUCTION FIX 2026-07-27] paidImmediately decides which ledger account
// the approval posts against — see finances.ts's approve route. Defaults to
// true (existing behaviour: approval = paid) when omitted.
export function useApproveExpense() {
  const qc = useQueryClient()
  return useMutation({
    meta: { successMessage: 'Expense approved', failureTitle: 'Could not approve expense' },
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
    meta: { successMessage: 'Expense marked as paid', failureTitle: 'Could not mark the expense as paid' },
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
    meta: { successMessage: 'Expense rejected', failureTitle: 'Could not reject expense' },
    mutationFn: (expenseId: string) =>
      apiFetch<ApiExpense>(`/finances/expenses/${expenseId}/reject`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.finances.all() }),
  })
}

export interface BudgetLine {
  id: string
  department: string
  category: string
  /** null = a full-year budget, which applies to every term. */
  term: number | null
  budgetWindowId: string | null
  description: string | null
  allocated: number
  spent: number
  /** Promised to open requisitions/POs but not yet spent. */
  committed: number
  remaining: number
  /** allocated − committed − spent: what a new requisition can still draw on. */
  available: number
}

// Budget vs Actual for the viewing year/term. A term includes the full-year budgets too.
export function useBudgetVsActual(academicYear: string, term?: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.finances.budget(academicYear, term),
    queryFn: () =>
      apiFetch<BudgetLine[]>(
        `/finances/budget?academicYear=${encodeURIComponent(academicYear)}${term ? `&term=${term}` : ''}`,
      ),
    enabled: enabled && !!academicYear,
  })
}

/** POST /finances/budget — the service function already existed and
 *  worked (budgetService.createBudget); there was no route calling it and
 *  no hook, so the Budget tab had no way to create a budget at all. */
export function useCreateBudget() {
  const qc = useQueryClient()
  return useMutation({
    meta: { successMessage: 'Budget created', failureTitle: 'Could not create budget' },
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
    meta: { successMessage: 'Fee structure created', failureTitle: 'Could not create fee structure' },
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
// view URL for the receipt generated at payment time (see
// receiptService.generateReceipt()). [PDF PREVIEW] The hook now also opens it:
// the receipt PDF opens in the browser's own viewer (new tab) so the user can
// review it, then download or print from there. Callers just call
// .mutate(paymentId) from a click; nothing is cached, so no URL goes stale.
export function useFetchReceipt() {
  return useMutation({
    meta: { feedback: 'manual' },
    mutationFn: (paymentId: string) => openReceiptPreview(`/finances/payments/${paymentId}/receipt`),
    onError: (err) => toast.error(receiptErrorMessage(err)),
  })
}

// [NEW] Settings & Fee Catalog's edit / archive / restore action — see
// UpdateFeeStructureSchema in @shared/schemas/finance.
export function useUpdateFeeStructure() {
  const qc = useQueryClient()
  return useMutation({
    meta: { successMessage: 'Fee structure updated', failureTitle: 'Could not update fee structure' },
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
    meta: { successMessage: 'Fee commitment saved', failureTitle: 'Could not save the fee commitment' },
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
    meta: { successMessage: 'Fee commitment status updated', failureTitle: 'Could not update fee commitment status' },
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
    meta: { successMessage: 'Invoice line item added', failureTitle: 'Could not add invoice line item', affectsRisk: true },   // refreshes student risk badges (see QueryProvider)
    mutationFn: ({ invoiceId, feeStructureId }: AddInvoiceLineItemInput) =>
      apiFetch<ApiInvoice>(`/finances/invoices/${invoiceId}/line-items`, {
        method: 'POST',
        body: JSON.stringify({ feeStructureId }),
      }),
    // Awaited -- see useRecordPayment.
    onSuccess: async (_result, variables) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.finances.invoice(variables.invoiceId) }),
        qc.invalidateQueries({ queryKey: queryKeys.finances.all() }),
      ])
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
    meta: { feedback: 'manual', affectsRisk: true },   // refreshes student risk badges (see QueryProvider)
    mutationFn: (data: BulkGenerateInvoicesInput) =>
      apiFetch<ApiBulkInvoiceResult>('/finances/invoices/bulk-generate', {
        method: 'POST',
        // [Issue 6] One key per click: a retry of the same run replays the original result.
        headers: data.dryRun ? undefined : { 'Idempotency-Key': newIdempotencyKey() },
        body: JSON.stringify(data),
      }),
    onSuccess: (_result, variables) => {
      if (!variables.dryRun) {
        qc.invalidateQueries({ queryKey: queryKeys.finances.all() })
      }
    },
  })
}
