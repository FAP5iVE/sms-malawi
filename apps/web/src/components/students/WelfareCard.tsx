'use client'

/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/students/WelfareCard.tsx
 * [PURPOSE]: Welfare card on the student profile: orphan status, vulnerability,
 *   medical alert and special / learning-support needs. SENSITIVE child data.
 *   The parent page mounts this only when the viewer holds student.viewWelfare
 *   (admin, headteacher, HR); `canEdit` is student.editWelfare (admin and the
 *   headteacher). The data comes from its own endpoint, never the student
 *   detail, so this card is a display convenience: the server is the boundary.
 *   Nothing here feeds the risk score.
 * [DEPENDS ON]: hooks/useStudents welfare hooks, shared welfare constants/schemas
 */

import { useState, type FormEvent } from 'react'
import { ShieldAlert, Pencil, Plus, Trash2, Loader2 } from 'lucide-react'
import { Modal } from '@/components/shared/Modal'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import {
  useStudentWelfare,
  useUpdateWelfare,
  useAddSupportNeed,
  useUpdateSupportNeed,
  useDeleteSupportNeed,
} from '@/hooks/useStudents'
import { UpdateWelfareSchema, SupportNeedInputSchema } from '@shared/schemas/student'
import {
  ORPHAN_STATUSES,
  ORPHAN_STATUS_LABELS,
  SUPPORT_NEED_TYPES,
  SUPPORT_NEED_LABELS,
} from '@shared/constants/malawi'
import type { ApiSupportNeed } from '@shared/types/api'

const fieldCls =
  'w-full min-h-[44px] border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body ' +
  'placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-teal/25 focus:border-brand-teal'
const labelCls = 'block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5'

const cancelBtn = 'min-h-[44px] px-4 rounded-xl border border-base text-sm font-semibold'
const saveBtn =
  'min-h-[44px] px-4 rounded-xl bg-brand-deep text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-1.5'

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

export function WelfareCard({ studentId, canEdit }: { studentId: string; canEdit: boolean }) {
  const { data: welfare, isLoading, isError } = useStudentWelfare(studentId, true)
  const updateWelfare = useUpdateWelfare(studentId)
  const addNeed = useAddSupportNeed(studentId)
  const updateNeed = useUpdateSupportNeed(studentId)
  const deleteNeed = useDeleteSupportNeed(studentId)

  // ── Welfare modal state ────────────────────────────────────────────────────
  const [editingWelfare, setEditingWelfare] = useState(false)
  const [orphanStatus, setOrphanStatus] = useState<string>('UNKNOWN')
  const [isVulnerable, setIsVulnerable] = useState(false)
  const [note, setNote] = useState('')
  const [medicalAlert, setMedicalAlert] = useState('')
  const [welfareError, setWelfareError] = useState<string | null>(null)

  // ── Support need modal state: null closed, 'new' adding, else editing ──────
  const [needEditing, setNeedEditing] = useState<ApiSupportNeed | 'new' | null>(null)
  const [needType, setNeedType] = useState<string>('')
  const [accommodation, setAccommodation] = useState('')
  const [device, setDevice] = useState('')
  const [identifiedAt, setIdentifiedAt] = useState('')
  const [needError, setNeedError] = useState<string | null>(null)
  const [needDeleting, setNeedDeleting] = useState<ApiSupportNeed | null>(null)

  function openWelfare() {
    if (!welfare) return
    setOrphanStatus(welfare.orphanStatus)
    setIsVulnerable(welfare.isVulnerable)
    setNote(welfare.vulnerabilityNote ?? '')
    setMedicalAlert(welfare.medicalAlert ?? '')
    setWelfareError(null)
    setEditingWelfare(true)
  }

  function submitWelfare(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const parsed = UpdateWelfareSchema.safeParse({
      orphanStatus,
      isVulnerable,
      vulnerabilityNote: note,
      medicalAlert,
    })
    if (!parsed.success) {
      setWelfareError(parsed.error.issues[0]?.message ?? 'Check the details.')
      return
    }
    updateWelfare.mutate(parsed.data, {
      onSuccess: () => setEditingWelfare(false),
      onError: (err) => setWelfareError(err instanceof Error ? err.message : 'Could not save.'),
    })
  }

  function openNeed(n: ApiSupportNeed | 'new') {
    if (n === 'new') {
      setNeedType(''); setAccommodation(''); setDevice(''); setIdentifiedAt('')
    } else {
      setNeedType(n.type); setAccommodation(n.accommodation ?? ''); setDevice(n.assistiveDevice ?? '')
      setIdentifiedAt(n.identifiedAt ? n.identifiedAt.slice(0, 10) : '')
    }
    setNeedError(null)
    setNeedEditing(n)
  }

  function submitNeed(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const parsed = SupportNeedInputSchema.safeParse({
      type: needType,
      accommodation,
      assistiveDevice: device,
      identifiedAt,
    })
    if (!parsed.success) {
      setNeedError(needType ? (parsed.error.issues[0]?.message ?? 'Check the details.') : 'Choose the type of need.')
      return
    }
    const onError = (err: unknown) => setNeedError(err instanceof Error ? err.message : 'Could not save.')
    if (needEditing === 'new') {
      addNeed.mutate(parsed.data, { onSuccess: () => setNeedEditing(null), onError })
    } else if (needEditing) {
      updateNeed.mutate({ needId: needEditing.id, ...parsed.data }, { onSuccess: () => setNeedEditing(null), onError })
    }
  }

  if (isLoading) return <div className="skeleton h-24 rounded-xl" />
  if (isError || !welfare) {
    return <p className="text-sm text-muted">Welfare details could not be loaded.</p>
  }

  const needBusy = addNeed.isPending || updateNeed.isPending

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-heading font-semibold text-xs uppercase tracking-wide text-muted flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5" /> Welfare
          </p>
          <p className="text-xs text-muted mt-0.5">
            Sensitive. Visible to the headteacher, administrators and HR only.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={openWelfare}
            className="min-h-[36px] px-3 rounded-lg text-xs font-semibold text-brand-deep border border-base hover:bg-page flex items-center gap-1 shrink-0"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
        )}
      </div>

      <div className="space-y-2.5">
        {[
          ['Orphan status', ORPHAN_STATUS_LABELS[welfare.orphanStatus]],
          ['Vulnerable', welfare.isVulnerable ? 'Yes' : 'No'],
          ...(welfare.isVulnerable || welfare.vulnerabilityNote
            ? [['Vulnerability note', welfare.vulnerabilityNote ?? '—'], ['Last reviewed', formatDate(welfare.vulnerabilityReviewedAt)]]
            : []),
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between text-sm gap-4">
            <span className="text-muted shrink-0">{label}</span>
            <span className="font-medium text-body text-right">{value}</span>
          </div>
        ))}
      </div>

      {welfare.medicalAlert && (
        <div className="rounded-xl bg-brand-coral/10 border border-brand-coral/30 p-3">
          <p className="text-xs font-heading font-semibold uppercase tracking-wide text-brand-coral mb-1">Medical alert</p>
          <p className="text-sm text-body whitespace-pre-line">{welfare.medicalAlert}</p>
        </div>
      )}

      {welfare.exitNote && (
        <div className="rounded-xl bg-page p-3">
          <p className="text-xs font-heading font-semibold uppercase tracking-wide text-muted mb-1">Exit note</p>
          <p className="text-sm text-body whitespace-pre-line">{welfare.exitNote}</p>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-heading font-semibold uppercase tracking-wide text-muted">Support needs</p>
          {canEdit && (
            <button
              type="button"
              onClick={() => openNeed('new')}
              className="min-h-[32px] px-2.5 rounded-lg text-xs font-semibold text-brand-deep border border-base hover:bg-page flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          )}
        </div>
        {welfare.supportNeeds.length === 0 ? (
          <p className="text-sm text-muted">None recorded.</p>
        ) : (
          <div className="space-y-2">
            {welfare.supportNeeds.map((n) => (
              <div key={n.id} className="bg-page rounded-xl p-3 flex items-start justify-between gap-2">
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-body">{SUPPORT_NEED_LABELS[n.type]}</p>
                  {n.accommodation && <p className="text-xs text-muted">Accommodation: {n.accommodation}</p>}
                  {n.assistiveDevice && <p className="text-xs text-muted">Device: {n.assistiveDevice}</p>}
                  {n.identifiedAt && <p className="text-xs text-muted">Identified {formatDate(n.identifiedAt)}</p>}
                </div>
                {canEdit && (
                  <div className="flex gap-1 shrink-0">
                    <button type="button" onClick={() => openNeed(n)} aria-label="Edit support need" className="p-2 rounded-lg hover:bg-surface text-muted">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => setNeedDeleting(n)} aria-label="Remove support need" className="p-2 rounded-lg hover:bg-surface text-brand-coral">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {editingWelfare && (
        <Modal
          title="Edit welfare details"
          description="Sensitive information about a child. Changes are recorded in the audit log."
          onClose={() => setEditingWelfare(false)}
          busy={updateWelfare.isPending}
          onSubmit={submitWelfare}
          bodyClassName="space-y-4"
          footer={
            <>
              <button type="button" className={cancelBtn} disabled={updateWelfare.isPending} onClick={() => setEditingWelfare(false)}>Cancel</button>
              <button type="submit" className={saveBtn} disabled={updateWelfare.isPending}>
                {updateWelfare.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Save
              </button>
            </>
          }
        >
          <div>
            <label className={labelCls} htmlFor="w-orphan">Orphan status</label>
            <select id="w-orphan" className={fieldCls} value={orphanStatus} onChange={(e) => setOrphanStatus(e.target.value)}>
              {ORPHAN_STATUSES.map((s) => <option key={s} value={s}>{ORPHAN_STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-body">
            <input type="checkbox" checked={isVulnerable} onChange={(e) => setIsVulnerable(e.target.checked)} />
            Needs extra support (vulnerable)
          </label>
          <div>
            <label className={labelCls} htmlFor="w-note">Vulnerability note</label>
            <textarea id="w-note" rows={3} className={fieldCls} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          </div>
          <div>
            <label className={labelCls} htmlFor="w-medical">Medical alert</label>
            <textarea
              id="w-medical"
              rows={2}
              className={fieldCls}
              value={medicalAlert}
              onChange={(e) => setMedicalAlert(e.target.value)}
              maxLength={500}
              placeholder="e.g. Asthma - inhaler kept at the school office"
            />
          </div>
          {welfareError && <p className="text-sm text-brand-coral" role="alert">{welfareError}</p>}
        </Modal>
      )}

      {needEditing && (
        <Modal
          title={needEditing === 'new' ? 'Add support need' : 'Edit support need'}
          onClose={() => setNeedEditing(null)}
          busy={needBusy}
          onSubmit={submitNeed}
          bodyClassName="space-y-4"
          footer={
            <>
              <button type="button" className={cancelBtn} disabled={needBusy} onClick={() => setNeedEditing(null)}>Cancel</button>
              <button type="submit" className={saveBtn} disabled={needBusy}>
                {needBusy && <Loader2 className="w-4 h-4 animate-spin" />} Save
              </button>
            </>
          }
        >
          <div>
            <label className={labelCls} htmlFor="n-type">Type of need</label>
            <select id="n-type" className={fieldCls} value={needType} onChange={(e) => setNeedType(e.target.value)}>
              <option value="">Select…</option>
              {SUPPORT_NEED_TYPES.map((t) => <option key={t} value={t}>{SUPPORT_NEED_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="n-acc">Accommodation</label>
            <input id="n-acc" className={fieldCls} value={accommodation} onChange={(e) => setAccommodation(e.target.value)} placeholder="e.g. Front-row seating, large print" />
          </div>
          <div>
            <label className={labelCls} htmlFor="n-dev">Assistive device</label>
            <input id="n-dev" className={fieldCls} value={device} onChange={(e) => setDevice(e.target.value)} />
          </div>
          <div>
            <label className={labelCls} htmlFor="n-date">Date identified</label>
            <input id="n-date" type="date" className={fieldCls} value={identifiedAt} onChange={(e) => setIdentifiedAt(e.target.value)} />
          </div>
          {needError && <p className="text-sm text-brand-coral" role="alert">{needError}</p>}
        </Modal>
      )}

      <ConfirmDialog
        open={needDeleting !== null}
        title="Remove support need?"
        description={needDeleting ? `${SUPPORT_NEED_LABELS[needDeleting.type]} will be removed from this student's record.` : ''}
        confirmLabel="Remove"
        destructive
        confirming={deleteNeed.isPending}
        onConfirm={() => {
          if (!needDeleting) return
          deleteNeed.mutate(needDeleting.id, { onSuccess: () => setNeedDeleting(null), onError: () => setNeedDeleting(null) })
        }}
        onCancel={() => setNeedDeleting(null)}
      />
    </div>
  )
}
