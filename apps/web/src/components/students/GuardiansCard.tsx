'use client'

/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/students/GuardiansCard.tsx
 * [PURPOSE]: Guardians card on the student profile - lists every guardian with
 *   primary / fee-payer / emergency-contact badges, and lets admin and the
 *   headteacher add, edit and remove them. The student form still captures the
 *   primary guardian (name, phone, relationship); this card manages the rest.
 *   Server rules (studentService): exactly one primary guardian and at least one
 *   emergency contact per student, so a rejected change shows the server message.
 *   A separate component because the profile page is already long and this has
 *   its own form state and modal.
 * [DEPENDS ON]: hooks/useStudents (guardian hooks), shared GuardianInputSchema
 */

import { useState, type FormEvent } from 'react'
import { Pencil, Plus, Trash2, Phone, Mail, MapPin, Loader2 } from 'lucide-react'
import { Modal } from '@/components/shared/Modal'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import {
  useStudentGuardians,
  useAddGuardian,
  useUpdateGuardian,
  useDeleteGuardian,
} from '@/hooks/useStudents'
import { GuardianInputSchema } from '@shared/schemas/student'
import { GUARDIAN_RELATIONSHIPS } from '@shared/constants/admissions'
import type { ApiStudentGuardian } from '@shared/types/api'

const fieldCls =
  'w-full min-h-[44px] border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body ' +
  'placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-teal/25 focus:border-brand-teal'
const labelCls = 'block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5'

interface FormState {
  fullName: string
  relation: string
  phone: string
  altPhone: string
  email: string
  address: string
  nrbNumber: string
  isPrimary: boolean
  isFeePayer: boolean
  isEmergencyContact: boolean
  livesWithStudent: '' | 'yes' | 'no'
}

const EMPTY: FormState = {
  fullName: '', relation: '', phone: '', altPhone: '', email: '', address: '', nrbNumber: '',
  isPrimary: false, isFeePayer: false, isEmergencyContact: false, livesWithStudent: '',
}

function toForm(g: ApiStudentGuardian): FormState {
  return {
    fullName: g.fullName,
    relation: g.relation,
    phone: g.phone,
    altPhone: g.altPhone ?? '',
    email: g.email ?? '',
    address: g.address ?? '',
    nrbNumber: g.nrbNumber ?? '',
    isPrimary: g.isPrimary,
    isFeePayer: g.isFeePayer,
    isEmergencyContact: g.isEmergencyContact,
    livesWithStudent: g.livesWithStudent == null ? '' : g.livesWithStudent ? 'yes' : 'no',
  }
}

function Badge({ children, tone }: { children: string; tone: 'teal' | 'amber' | 'coral' }) {
  const cls =
    tone === 'teal' ? 'bg-brand-teal/10 text-brand-teal'
    : tone === 'amber' ? 'bg-brand-amber/10 text-brand-amber'
    : 'bg-brand-coral/10 text-brand-coral'
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{children}</span>
}

export function GuardiansCard({ studentId, canEdit }: { studentId: string; canEdit: boolean }) {
  const { data: guardians, isLoading } = useStudentGuardians(studentId)
  const add = useAddGuardian(studentId)
  const update = useUpdateGuardian(studentId)
  const remove = useDeleteGuardian(studentId)

  // `editing`: null = closed, 'new' = adding, otherwise the guardian being edited.
  const [editing, setEditing] = useState<ApiStudentGuardian | 'new' | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<ApiStudentGuardian | null>(null)

  const busy = add.isPending || update.isPending

  function openNew() {
    setForm(EMPTY)
    setError(null)
    setEditing('new')
  }
  function openEdit(g: ApiStudentGuardian) {
    setForm(toForm(g))
    setError(null)
    setEditing(g)
  }
  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const payload = {
      fullName: form.fullName,
      relation: form.relation,
      phone: form.phone,
      altPhone: form.altPhone,
      email: form.email,
      address: form.address,
      nrbNumber: form.nrbNumber,
      isPrimary: form.isPrimary,
      isFeePayer: form.isFeePayer,
      isEmergencyContact: form.isEmergencyContact,
      livesWithStudent: form.livesWithStudent === '' ? null : form.livesWithStudent === 'yes',
    }
    const parsed = GuardianInputSchema.safeParse(payload)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the guardian details.')
      return
    }
    setError(null)
    const onError = (err: unknown) => setError(err instanceof Error ? err.message : 'Could not save guardian.')
    if (editing === 'new') {
      add.mutate(parsed.data, { onSuccess: () => setEditing(null), onError })
    } else if (editing) {
      update.mutate({ guardianId: editing.id, ...parsed.data }, { onSuccess: () => setEditing(null), onError })
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="font-heading font-semibold text-xs uppercase tracking-wide text-muted">Guardians</p>
        {canEdit && (
          <button
            type="button"
            onClick={openNew}
            className="min-h-[36px] px-3 rounded-lg text-xs font-semibold text-brand-deep border border-base hover:bg-page flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Add guardian
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="skeleton h-16 rounded-xl" />
      ) : !guardians || guardians.length === 0 ? (
        <p className="text-sm text-muted">No guardians recorded.</p>
      ) : (
        <div className="space-y-3">
          {guardians.map((g) => (
            <div key={g.id} className="bg-page rounded-xl p-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-body truncate">{g.fullName}</p>
                  <p className="text-xs text-muted">{g.relation}</p>
                </div>
                {canEdit && (
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEdit(g)}
                      aria-label={`Edit ${g.fullName}`}
                      className="p-2 rounded-lg hover:bg-surface text-muted"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {!g.isPrimary && (
                      <button
                        type="button"
                        onClick={() => setDeleting(g)}
                        aria-label={`Remove ${g.fullName}`}
                        className="p-2 rounded-lg hover:bg-surface text-brand-coral"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {g.isPrimary && <Badge tone="teal">Primary</Badge>}
                {g.isFeePayer && <Badge tone="amber">Pays fees</Badge>}
                {g.isEmergencyContact && <Badge tone="coral">Emergency contact</Badge>}
                {g.livesWithStudent === true && <Badge tone="teal">Lives with student</Badge>}
              </div>
              <div className="text-xs text-body space-y-0.5">
                <p className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-muted" />{g.phone}{g.altPhone ? ` · ${g.altPhone}` : ''}</p>
                {g.email && <p className="flex items-center gap-1.5 break-all"><Mail className="w-3 h-3 text-muted" />{g.email}</p>}
                {g.address && <p className="flex items-center gap-1.5"><MapPin className="w-3 h-3 text-muted" />{g.address}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Modal
          title={editing === 'new' ? 'Add guardian' : 'Edit guardian'}
          description="A student has one primary guardian and at least one emergency contact."
          onClose={() => setEditing(null)}
          size="md"
          busy={busy}
          onSubmit={handleSubmit}
          bodyClassName="space-y-4"
          footer={
            <>
              <button
                type="button"
                onClick={() => setEditing(null)}
                disabled={busy}
                className="min-h-[44px] px-4 rounded-xl border border-base text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="min-h-[44px] px-4 rounded-xl bg-brand-deep text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save
              </button>
            </>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="g-name">Full name</label>
              <input id="g-name" className={fieldCls} value={form.fullName} onChange={(e) => set('fullName', e.target.value)} />
            </div>
            <div>
              <label className={labelCls} htmlFor="g-relation">Relationship</label>
              <select id="g-relation" className={fieldCls} value={form.relation} onChange={(e) => set('relation', e.target.value)}>
                <option value="">Select…</option>
                {GUARDIAN_RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
                {form.relation && !(GUARDIAN_RELATIONSHIPS as readonly string[]).includes(form.relation) && (
                  <option value={form.relation}>{form.relation}</option>
                )}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="g-phone">Phone</label>
              <input id="g-phone" type="tel" className={fieldCls} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+265…" />
            </div>
            <div>
              <label className={labelCls} htmlFor="g-alt">Alternative phone</label>
              <input id="g-alt" type="tel" className={fieldCls} value={form.altPhone} onChange={(e) => set('altPhone', e.target.value)} />
            </div>
            <div>
              <label className={labelCls} htmlFor="g-email">Email</label>
              <input id="g-email" type="email" className={fieldCls} value={form.email} onChange={(e) => set('email', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="g-address">Address</label>
              <input id="g-address" className={fieldCls} value={form.address} onChange={(e) => set('address', e.target.value)} />
            </div>
            <div>
              <label className={labelCls} htmlFor="g-nrb">NRB national ID no.</label>
              <input id="g-nrb" className={fieldCls} value={form.nrbNumber} onChange={(e) => set('nrbNumber', e.target.value)} autoComplete="off" />
            </div>
            <div>
              <label className={labelCls} htmlFor="g-lives">Lives with the student?</label>
              <select id="g-lives" className={fieldCls} value={form.livesWithStudent} onChange={(e) => set('livesWithStudent', e.target.value as FormState['livesWithStudent'])}>
                <option value="">Not recorded</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <label className="flex items-center gap-2 text-sm text-body">
              <input type="checkbox" checked={form.isPrimary} onChange={(e) => set('isPrimary', e.target.checked)}
                disabled={editing !== 'new' && editing.isPrimary} />
              Primary guardian
              {editing !== 'new' && editing.isPrimary && <span className="text-xs text-muted">(make another guardian primary to change)</span>}
            </label>
            <label className="flex items-center gap-2 text-sm text-body">
              <input type="checkbox" checked={form.isFeePayer} onChange={(e) => set('isFeePayer', e.target.checked)} />
              Pays the school fees
            </label>
            <label className="flex items-center gap-2 text-sm text-body">
              <input type="checkbox" checked={form.isEmergencyContact} onChange={(e) => set('isEmergencyContact', e.target.checked)} />
              Emergency contact
            </label>
          </div>

          {error && <p className="text-sm text-brand-coral" role="alert">{error}</p>}
        </Modal>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Remove guardian?"
        description={deleting ? `${deleting.fullName} will be removed from this student's guardians.` : ''}
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
