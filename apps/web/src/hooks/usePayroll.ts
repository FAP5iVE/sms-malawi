/**
 * apps/web/src/hooks/usePayroll.ts
 *
 * [CHANGE TYPE]: MAJOR REWRITE
 * [PURPOSE]: Started as staff self-service payroll hooks (useMyPayslips/
 *   useMySalaryStructure/downloadPayslip — production fix, 2026-07-27).
 *   Extended for the Payroll Runs & Approvals / Salary Structure &
 *   Allowances / My Pay (Self-Service) redesign (user-requested):
 *     - useMyPayslips/useMySalaryStructure now take an optional staffUid —
 *       the "Viewing Employee" picker (hr.viewAnyPayslips) in My Pay.
 *     - useSalaryRoster: the staff picker backing GET /hr/salary-roster
 *       (see that route's own header comment for why it exists separately
 *       from useStaffDirectory).
 *     - usePayrollHistory/useRunWindowStatus/usePayrollRunDetail: thin
 *       query wrappers over GET /payroll, GET /payroll/run-window, and the
 *       new GET /payroll/:id drill-down.
 *     - useRunPayroll/useSubmitPayrollForApproval/useApprovePayrollRun/
 *       useLockPayrollRun/useRollbackPayrollRun: the five workflow actions,
 *       previously called via raw apiFetch + local component state in the
 *       unmounted PayrollApprovalPanel.tsx — rebuilt as TanStack Query
 *       mutations (this codebase's established convention everywhere else)
 *       so Payroll Runs & Approvals gets automatic loading/error state and
 *       cache invalidation for free instead of reimplementing both.
 * [DEPENDS ON]: W/lib/api-client.ts, S/types/api.ts
 */
'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type {
  ApiPayslip,
  ApiSalaryStructure,
  ApiPayrollRun,
  ApiPayrollRunWindow,
  ApiStaffProfile,
} from '@shared/types/api'
import { apiFetch, queryKeys, ApiError } from '@/lib/api-client'

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value))
  }
  const rendered = search.toString()
  return rendered ? `?${rendered}` : ''
}

// ─────────────────────────────────────────────────────────────────────────────
// SELF-SERVICE — My Pay (Self-Service)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param staffUid Omit to view the caller's own payslips. Passing another
 *   staff member's uid requires hr.viewAnyPayslips server-side (the
 *   "Viewing Employee" picker) — a caller without it gets a 403, not a
 *   silently-empty list.
 */
export function useMyPayslips(staffUid?: string) {
  return useQuery({
    queryKey: queryKeys.finances.payroll.myPayslips(staffUid),
    queryFn: () => apiFetch<ApiPayslip[]>(`/payroll/my-payslips${qs({ staffUid })}`),
  })
}

/** @param staffUid Same self-or-hr.viewAnyPayslips rule as useMyPayslips. */
export function useMySalaryStructure(staffUid?: string) {
  return useQuery({
    queryKey: queryKeys.finances.payroll.mySalary(staffUid),
    queryFn: () => apiFetch<ApiSalaryStructure | null>(`/payroll/my-salary${qs({ staffUid })}`),
  })
}

/**
 * Fetches a signed download URL for a payslip and opens it in a new tab.
 * Not a mutation — GET /payroll/payslips/:id/download has no side effect,
 * it just mints a signed URL, so a plain async function (not useMutation)
 * keeps this simple for a one-shot button click.
 */
/**
 * Fetches a signed download URL for a payslip and opens it in a new tab.
 * Not a mutation — GET /payroll/payslips/:id/download has no side effect,
 * it just mints a signed URL, so a plain async function (not useMutation)
 * keeps this simple for a one-shot button click.
 * [PRODUCTION FIX, user-requested] Every call site fired this with no
 * .catch() — a 403 (not yours to view) or 404 (PDF not generated, e.g. a
 * seeded/demo payslip with no real file behind it) rejected silently.
 * "View Payslip" looked like a dead button; it was actually failing with a
 * real, readable server message that just had nowhere to go. Now surfaces
 * that message via sonner's toast (mounted once in app/layout.tsx).
 */
export async function downloadPayslip(payslipId: string): Promise<void> {
  try {
    const { url } = await apiFetch<{ url: string }>(`/payroll/payslips/${payslipId}/download`)
    window.open(url, '_blank', 'noopener,noreferrer')
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Could not open this payslip.')
  }
}

/**
 * [BUGFIX — ERR-5 / ERR-6 / ERR-7, 2026-09-16] Mutation wrapper around
 * downloadPayslip(). The toast.error() above already surfaces a failure
 * (a prior fix), but the "View Payslip" buttons calling downloadPayslip()
 * directly (MyPayTab.tsx, PayrollRunsTab.tsx) had no pending/disabled
 * state at all — nothing visibly happens between the click and the toast
 * (or the new tab opening), so on a slow connection, or on a
 * seeded/demo payslip with no real file behind it (a permanent 404, so
 * every click fails the same way), users click it repeatedly. Sentry
 * recorded this as "Rage Click" on this exact button, twice, right
 * alongside the "Payslip PDF not ready" ApiError itself. useMutation's
 * isPending + variables (the payslipId just clicked) let a specific row's
 * button disable itself and show "Opening…" immediately on click, closing
 * the feedback gap that caused the rage-clicking rather than just
 * reacting to it after the fact.
 */
export function useDownloadPayslip() {
  return useMutation({
    mutationFn: (payslipId: string) => downloadPayslip(payslipId),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// SALARY STRUCTURE & ALLOWANCES — staff picker
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lightweight active-staff roster for the Salary Structure & Allowances
 * tab's picker — see GET /hr/salary-roster's own header comment for why
 * this exists separately from useStaffDirectory (finance holds
 * finance.manageSalaryStructure but isn't in the real staff directory's
 * REVIEWERS role list).
 */
export function useSalaryRoster() {
  return useQuery({
    queryKey: queryKeys.hr.salaryRoster(),
    queryFn: () => apiFetch<ApiStaffProfile[]>('/hr/salary-roster'),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYROLL RUNS & APPROVALS
// ─────────────────────────────────────────────────────────────────────────────

export function usePayrollHistory(year: number) {
  return useQuery({
    queryKey: queryKeys.finances.payroll.list({ year }),
    queryFn: () => apiFetch<ApiPayrollRun[]>(`/payroll${qs({ year })}`),
    enabled: !!year,
  })
}

/** Defaults to the current calendar month/year server-side when omitted —
 *  matching what Run Payroll itself always targets. */
export function useRunWindowStatus(month?: number, year?: number) {
  const now = new Date()
  const m = month ?? now.getMonth() + 1
  const y = year ?? now.getFullYear()
  return useQuery({
    queryKey: queryKeys.finances.payroll.runWindow(m, y),
    queryFn: () => apiFetch<ApiPayrollRunWindow>(`/payroll/run-window${qs({ month: m, year: y })}`),
    // Short-lived — window/already-run state can change as soon as someone
    // else on the Finance team runs or advances this month's payroll.
    staleTime: 30_000,
  })
}

/** "Deep Inspection" / "Inspect Payslips" drill-down for one run. */
export function usePayrollRunDetail(runId: string | null) {
  return useQuery({
    queryKey: queryKeys.finances.payroll.detail(runId ?? ''),
    queryFn: () => apiFetch<ApiPayrollRun>(`/payroll/${runId}`),
    enabled: !!runId,
  })
}

/** Invalidates every cached payroll query (list/detail/run-window/self-
 *  service) after a workflow action changes a run's status — simpler and
 *  safer than hand-picking which of the many nested keys a given action
 *  could affect. */
function useInvalidateAllPayroll() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: queryKeys.finances.payroll.all() })
}

export function useRunPayroll() {
  const invalidate = useInvalidateAllPayroll()
  return useMutation({
    mutationFn: (data: { month: number; year: number }) =>
      apiFetch<{ runId: string; status: string }>('/payroll/run', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: invalidate,
  })
}

export function useSubmitPayrollForApproval() {
  const invalidate = useInvalidateAllPayroll()
  return useMutation({
    mutationFn: (runId: string) =>
      apiFetch<ApiPayrollRun>(`/payroll/runs/${runId}/submit-for-approval`, { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: invalidate,
  })
}

export function useApprovePayrollRun() {
  const invalidate = useInvalidateAllPayroll()
  return useMutation({
    mutationFn: (runId: string) =>
      apiFetch<ApiPayrollRun>(`/payroll/runs/${runId}/approve`, { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: invalidate,
  })
}

export function useLockPayrollRun() {
  const invalidate = useInvalidateAllPayroll()
  return useMutation({
    mutationFn: (runId: string) =>
      apiFetch<ApiPayrollRun>(`/payroll/runs/${runId}/lock`, { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: invalidate,
  })
}

export function useRollbackPayrollRun() {
  const invalidate = useInvalidateAllPayroll()
  return useMutation({
    mutationFn: ({ runId, reason }: { runId: string; reason: string }) =>
      apiFetch<ApiPayrollRun>(`/payroll/runs/${runId}/rollback`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: invalidate,
  })
}

/** [NEW, user-requested] Clears a run stuck in PROCESSING so Finance can
 *  retry — see payrollService.discardStuckRun()'s header comment for why
 *  this needed to exist. apiFetch returns void here since the route
 *  responds 204 No Content, not a run body — there's nothing left to
 *  return once the run is deleted. */
export function useDiscardStuckRun() {
  const invalidate = useInvalidateAllPayroll()
  return useMutation({
    mutationFn: (runId: string) =>
      apiFetch<{ discarded: boolean }>(`/payroll/runs/${runId}/discard`, { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: invalidate,
  })
}