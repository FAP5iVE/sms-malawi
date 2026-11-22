'use client'

/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/hr/StaffResponsibilities.tsx
 * [PURPOSE]: Posts of responsibility on the HR staff profile (Head of
 *   Department, house master, patron, guidance counsellor ...) with a start and
 *   optional end date. StaffResponsibility is the source of truth for who holds
 *   what; the free-text "Responsibility" payroll allowance type is untouched.
 *   Editing needs hr.editStaff (the server enforces it); `canEdit` only hides
 *   the buttons. A separate component because it owns its own list and modal.
 * [DEPENDS ON]: hooks/useHR responsibility hooks, shared StaffResponsibilitySchema
 */

import { useState, type FormEvent } from 'react'
import { Pencil, Plus, Trash2, Loader2 } from 'lucide-react'
import { Modal } from '@/components/shared/Modal'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { useAddResponsibility, useUpdateResponsibility, useDeleteResponsibility } from '@/hooks/useHR'
import { StaffResponsibilitySchema } from '@shared/schemas/hr'

type Responsibility = { id: string; title: string; startDate: string; endDate: string | null }

const fieldCls =
  'w-full min-h-[44px] border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-teal/25 focus:border-brand-teal'
const labelCls = 'block text-xs font-heading font-semibold text-muted mb-1.5'

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '-'
}

export function StaffResponsibilities({
  staffId,
  responsibilities,
  canEdit,
}: {
  staffId: string
  responsibilities: Responsibility[]
  canEdit: boolean
}) {
  const add = useAddResponsibility(staffId)
  const update = useUpdateResponsibility(staffId)
  const remove = useDeleteResponsibility(staffId)

  const [editing, setEditing] = useState<Responsibility | 'new' | null>(null)
  const [title, setTitle] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Responsibility | null>(null)
  const busy = add.isPending || update.isPending

  function open(r: Responsibility | 'new') {
    if (r === 'new') {
      setTitle(''); setStartDate(new Date().toISOString().slice(0, 10)); setEndDate('')
    } else {
      setTitle(r.title); setStartDate(r.startDate.slice(0, 10)); setEndDate(r.endDate ? r.endDate.slice(0, 10) : '')
    }
    setError(null)
    setEditing(r)
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const parsed = StaffResponsibilitySchema.safeParse({ title, startDate, endDate })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the details.')
      return
    }
    const onError = (err: unknown) => setError(err instanceof Error ? err.message : 'Could not save.')
    if (editing === 'new') {
      add.mutate(parsed.data, { onSuccess: () => setEditing(null), onError })
    } else if (editing) {
      update.mutate({ responsibilityId: editing.id, ...parsed.data }, { onSuccess: () => setEditing(null), onError })
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="font-heading font-semibold text-xs text-muted">Responsibilities</p>
        {canEdit && (
          <button
            type="button"
            onClick={() => open('new')}
            className="min-h-[36px] px-3 rounded-lg text-xs font-semibold text-brand-deep border border-base hover:bg-page flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        )}
      </div>

      {responsibilities.length === 0 ? (
        <p className="text-sm text-muted">None recorded.</p>
      ) : (
        <div className="space-y-2">
          {responsibilities.map((r) => (
            <div key={r.id} className="bg-page rounded-xl p-3 flex items-start justify-between gap-2">
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-body">{r.title}</p>
                <p className="text-xs text-muted">
                  {fmt(r.startDate)} – {r.endDate ? fmt(r.endDate) : 'present'}
                </p>
              </div>
              {canEdit && (
                <div className="flex gap-1 shrink-0">
                  <button type="button" onClick={() => open(r)} aria-label={`Edit ${r.title}`} className="p-2 rounded-lg hover:bg-surface text-muted">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => setDeleting(r)} aria-label={`Remove ${r.title}`} className="p-2 rounded-lg hover:bg-surface text-tone-coral">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Modal
          title={editing === 'new' ? 'Add responsibility' : 'Edit responsibility'}
          onClose={() => setEditing(null)}
          size="m"
          busy={busy}
          onSubmit={submit}
          bodyClassName="space-y-4"
          footer={
            <>
              <button type="button" disabled={busy} onClick={() => setEditing(null)} className="min-h-[44px] px-4 rounded-xl border border-base text-sm font-semibold">Cancel</button>
              <button type="submit" disabled={busy} className="min-h-[44px] px-4 rounded-xl bg-brand-deep text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-1.5">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save
              </button>
            </>
          }
        >
          <div>
            <label className={labelCls} htmlFor="resp-title">Title</label>
            <input id="resp-title" className={fieldCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Head of Department (Sciences)" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} htmlFor="resp-start">Start date</label>
              <input id="resp-start" type="date" className={fieldCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} htmlFor="resp-end">End date</label>
              <input id="resp-end" type="date" className={fieldCls} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-sm text-tone-coral" role="alert">{error}</p>}
        </Modal>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Remove responsibility?"
        description={deleting ? `"${deleting.title}" will be removed from this staff member's record.` : ''}
        confirmLabel="Remove"
        destructive
        confirming={remove.isPending}
        onConfirm={() => {
          if (!deleting) return
          remove.mutate(deleting.id, { onSuccess: () => setDeleting(null), onError: () => setDeleting(null) })
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
