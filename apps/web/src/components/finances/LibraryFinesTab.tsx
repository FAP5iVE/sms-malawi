'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAuth } from 'firebase/auth'
import { formatMWK } from '@shared/constants/malawi'
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

interface LibraryFine {
  id: string
  studentId: string
  bookTitle: string
  amount: number
  reason: string
  status: 'PENDING' | 'PAID' | 'WAIVED'
  createdAt: string
  paidAt?: string
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = await getAuth().currentUser?.getIdToken()
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...opts?.headers,
    },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<T>
}

export function LibraryFinesTab() {
  const qc = useQueryClient()
  const { role } = useAuthStore()
  const isFinance = role === 'admin' || role === 'finance' || role === 'high_rank'

  const { data: fines = [], isLoading } = useQuery<LibraryFine[]>({
    queryKey: ['library-fines'],
    queryFn: () => apiFetch('/finances/library-fines'),
  })

  const markPaid = useMutation({
    mutationFn: (id: string) => apiFetch(`/finances/library-fines/${id}/pay`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library-fines'] }),
  })

  const waive = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/finances/library-fines/${id}/waive`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library-fines'] }),
  })

  if (isLoading) return <div className="p-6 text-center text-muted text-sm">Loading fines…</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="w-4 h-4 text-brand-amber" />
        <h3 className="font-heading font-semibold text-brand-navy">Library Fines</h3>
        <span className="text-xs text-muted ml-auto">
          {fines.filter((f) => f.status === 'PENDING').length} pending
        </span>
      </div>

      {fines.length === 0 ? (
        <p className="text-center text-muted text-sm py-8">No library fines recorded.</p>
      ) : (
        <div className="divide-y divide-base border border-base rounded-xl overflow-hidden bg-surface">
          {fines.map((fine) => (
            <div key={fine.id} className="flex items-center gap-4 px-5 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-body truncate">{fine.bookTitle}</p>
                <p className="text-xs text-muted">{fine.reason}</p>
              </div>
              <p className="text-sm font-heading font-bold text-brand-navy shrink-0">
                {formatMWK(fine.amount)}
              </p>
              <span
                className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
                  fine.status === 'PAID'
                    ? 'bg-brand-teal/15 text-brand-teal'
                    : fine.status === 'WAIVED'
                      ? 'bg-base text-muted'
                      : 'bg-brand-amber/15 text-brand-amber'
                }`}
              >
                {fine.status}
              </span>
              {isFinance && fine.status === 'PENDING' && (
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => markPaid.mutate(fine.id)}
                    className="p-1 text-brand-teal hover:text-brand-teal-light transition-colors"
                    aria-label="Mark as paid"
                    title="Mark paid"
                  >
                    <CheckCircle className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => waive.mutate(fine.id)}
                    className="p-1 text-muted hover:text-body transition-colors"
                    aria-label="Waive fine"
                    title="Waive fine"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
