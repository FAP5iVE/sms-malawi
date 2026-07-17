/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/app/(auth)/settings/_components/HolidaysManager.tsx
 * [R-PHASE]: R1 — API Client & Query-Key Singleton Consolidation; R15 —
 *   UI/UX Polish adds the shared ConfirmDialog to the delete action (a
 *   destructive, previously entirely unconfirmed one-tap delete) and a
 *   visible onError on the delete mutation, which previously discarded
 *   failures silently.
 * [DEPENDS ON]: W/lib/api-client.ts,
 *   W/components/shared/ConfirmDialog.tsx (R15)
 */
'use client'
import { useState }       from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Loader2, CalendarDays } from 'lucide-react'
import { format }         from 'date-fns'
import { apiFetch, queryKeys } from '@/lib/api-client'
import ConfirmDialog from '@/components/shared/ConfirmDialog'

interface Holiday { id: string; name: string; date: string; year: number; isRecurring: boolean }

async function fetchHolidays(year: number): Promise<Holiday[]> {
  return apiFetch<Holiday[]>(`/holidays?year=${year}`)
}

async function createHoliday(data: { name: string; date: string; isRecurring: boolean }): Promise<Holiday> {
  return apiFetch<Holiday>('/holidays', { method: 'POST', body: JSON.stringify(data) })
}

async function deleteHoliday(id: string): Promise<void> {
  await apiFetch<void>(`/holidays/${id}`, { method: 'DELETE' })
}

export function HolidaysManager() {
  const qc          = useQueryClient()
  const [year, setYear] = useState(new Date().getFullYear())
  const [form, setForm] = useState({ name: '', date: '', isRecurring: false })
  const [error, setError] = useState('')
  /** R15 — the holiday awaiting delete confirmation (null = dialog closed). */
  const [pendingDelete, setPendingDelete] = useState<Holiday | null>(null)

  const { data: holidays = [], isLoading } = useQuery({
    queryKey: queryKeys.settings.holidays(year),
    queryFn:  () => fetchHolidays(year),
  })

  const createMut = useMutation({
    mutationFn: createHoliday,
    onSuccess:  () => { void qc.invalidateQueries({ queryKey: queryKeys.settings.holidays(year) }); setForm({ name: '', date: '', isRecurring: false }); setError('') },
    onError:    (e: Error) => setError(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: deleteHoliday,
    onSuccess:  () => void qc.invalidateQueries({ queryKey: queryKeys.settings.holidays(year) }),
    onError:    (e: Error) => setError(e.message),
  })

  function handleAdd() {
    if (!form.name.trim() || !form.date) { setError('Name and date are required.'); return }
    createMut.mutate(form)
  }

  return (
    <div className="bg-surface border border-base rounded-2xl p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-brand-teal" />
          <h3 className="font-heading font-semibold text-brand-navy">Malawi Public Holidays</h3>
        </div>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="border border-base rounded-xl px-3 py-1.5 text-sm bg-surface focus:outline-none"
        >
          {[2025, 2026, 2027, 2028].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Add holiday form */}
      <div className="border border-base rounded-xl p-4 space-y-3">
        <p className="text-xs font-heading font-semibold text-muted uppercase">Add Holiday</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="Holiday name"
            className="border border-base rounded-xl px-3 py-2 text-sm bg-page focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
          />
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
            className="border border-base rounded-xl px-3 py-2 text-sm bg-page focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
          />
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={form.isRecurring}
                onChange={(e) => setForm((p) => ({ ...p, isRecurring: e.target.checked }))}
                className="w-4 h-4 accent-brand-teal"
              />
              Recurring yearly
            </label>
          </div>
        </div>
        {error && <p className="text-xs text-brand-coral">{error}</p>}
        <button
          onClick={handleAdd}
          disabled={createMut.isPending}
          className="flex items-center gap-2 bg-brand-navy text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 hover:bg-brand-navy/80 transition-colors"
        >
          {createMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Add Holiday
        </button>
      </div>

      {/* Holiday list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1,2,3].map((i) => <div key={i} className="h-10 bg-base rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="divide-y divide-base border border-base rounded-xl overflow-hidden">
          {holidays.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted text-center">No holidays for {year}. Add them above.</p>
          ) : (
            holidays.map((h) => (
              <div key={h.id} className="flex items-center justify-between px-4 py-3 hover:bg-page transition-colors">
                <div>
                  <p className="text-sm font-medium text-brand-navy">{h.name}</p>
                  <p className="text-xs text-muted">{format(new Date(h.date), 'EEEE, d MMMM yyyy')}{h.isRecurring ? ' · Recurring' : ''}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingDelete(h)}
                  disabled={deleteMut.isPending}
                  aria-label={`Delete ${h.name}`}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-brand-coral hover:bg-brand-coral/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* R15 — shared confirmation dialog before the destructive delete */}
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this holiday?"
        description={
          pendingDelete
            ? `"${pendingDelete.name}" will be removed from the ${year} public-holiday calendar${pendingDelete.isRecurring ? ' (it is marked as recurring yearly)' : ''}. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete Holiday"
        destructive
        onConfirm={() => {
          if (pendingDelete) deleteMut.mutate(pendingDelete.id)
          setPendingDelete(null)
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}