/**
 * [CHANGE TYPE]: NEW FILE (production fix, 2026-07-27)
 * [FILE]: apps/web/src/hooks/usePayroll.ts
 * [PURPOSE]: Staff self-service payroll hooks. GET /payroll/my-payslips and
 *   its queryKeys.finances.payroll.myPayslips() key already existed with
 *   zero callers — no hook, no UI ever consumed it. GET /payroll/my-salary
 *   is new (see payrollService.getMySalaryStructure). Together these back
 *   the "My Pay" tab on the HR page — the confirmed missing self-service
 *   surface for salary structure, deductions, and payslip history/download.
 * [DEPENDS ON]: W/lib/api-client.ts
 */
'use client'
import { useQuery } from '@tanstack/react-query'
import type { ApiPayslip, ApiSalaryStructure } from '@shared/types/api'
import { apiFetch, queryKeys } from '@/lib/api-client'

export function useMyPayslips() {
  return useQuery({
    queryKey: queryKeys.finances.payroll.myPayslips(),
    queryFn:  () => apiFetch<ApiPayslip[]>('/payroll/my-payslips'),
  })
}

export function useMySalaryStructure() {
  return useQuery({
    queryKey: queryKeys.hr.salaryStructure('me'),
    // Server scopes to req.user.uid regardless of the 'me' placeholder —
    // the placeholder only exists to give this query a stable, distinct
    // cache key from an eventual admin-facing per-staffUid lookup.
    queryFn:  () => apiFetch<ApiSalaryStructure | null>('/payroll/my-salary'),
  })
}

/**
 * Fetches a signed download URL for one of the caller's own payslips and
 * opens it in a new tab. Not a mutation — GET /payroll/payslips/:id/download
 * has no side effect, it just mints a signed URL, so a plain async function
 * (not useMutation) keeps this simple for a one-shot button click.
 */
export async function downloadPayslip(payslipId: string): Promise<void> {
  const { url } = await apiFetch<{ url: string }>(`/payroll/payslips/${payslipId}/download`)
  window.open(url, '_blank', 'noopener,noreferrer')
}