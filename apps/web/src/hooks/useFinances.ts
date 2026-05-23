import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAuth } from 'firebase/auth'
import type { ApiFinanceSummary, ApiInvoice, ApiExpense, ApiScholarship } from '@shared/types/api'
import type { RecordPaymentInput } from '@shared/schemas/finance'

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getAuth().currentUser?.getIdToken()
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(e.error ?? `API error ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const financeKeys = {
  all: () => ['finances'] as const,
  summary: (y: string, t: number) => ['finances', 'summary', y, t] as const,
  invoices: (f: object) => ['finances', 'invoices', f] as const,
  expenses: (f: object) => ['finances', 'expenses', f] as const,
  budget: (y: string) => ['finances', 'budget', y] as const,
  scholarships: () => ['finances', 'scholarships'] as const,
}

export function useFinanceSummary(academicYear: string, term: number) {
  return useQuery({
    queryKey: financeKeys.summary(academicYear, term),
    queryFn: () =>
      apiFetch<ApiFinanceSummary>(`/finances/summary?academicYear=${academicYear}&term=${term}`),
    refetchInterval: 30_000, // poll every 30s for live dashboard widget
  })
}

export function useInvoices(
  filters: { academicYear?: string; term?: number; status?: string; studentId?: string } = {}
) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined) params.set(k, String(v))
  })
  return useQuery({
    queryKey: financeKeys.invoices(filters),
    queryFn: () => apiFetch<ApiInvoice[]>(`/finances/invoices?${params}`),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.all() }),
  })
}

export function useExpenses(filters: { academicYear?: string; term?: number } = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined) params.set(k, String(v))
  })
  return useQuery({
    queryKey: financeKeys.expenses(filters),
    queryFn: () => apiFetch<ApiExpense[]>(`/finances/expenses?${params}`),
  })
}

export function useBudgetVsActual(academicYear: string) {
  return useQuery({
    queryKey: financeKeys.budget(academicYear),
    queryFn: () =>
      apiFetch<
        {
          department: string
          category: string
          allocated: number
          spent: number
          remaining: number
        }[]
      >(`/finances/budget?academicYear=${academicYear}`),
  })
}

export function useScholarships() {
  return useQuery({
    queryKey: financeKeys.scholarships(),
    queryFn: () => apiFetch<ApiScholarship[]>('/finances/scholarships'),
  })
}
