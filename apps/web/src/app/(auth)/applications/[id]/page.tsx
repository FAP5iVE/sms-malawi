/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/app/(auth)/applications/[id]/page.tsx
 * [PURPOSE]: Applicant detail view — the destination for clicking a row/card
 *   in the applications list. Fetches a single application via useApplication()
 *   (GET /applications/:id, added the same change) and renders every field on
 *   the ApiApplication object in labelled sections. Structure, back-link,
 *   loading and not-found states mirror the existing student detail page
 *   (students/[id]/page.tsx) for visual consistency. RoleGuard roles match the
 *   applications list page exactly (['admin','high_rank','lower_rank']).
 * [DEPENDS ON]: apps/web/src/hooks/useApplications.ts (useApplication),
 *   @shared/types/api (ApiApplication)
 */
'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { useApplication } from '@/hooks/useApplications'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { usePermissions } from '@/hooks/usePermissions'
import { StatusText, type StatusTone } from '@/components/shared/StatusText'
import {
  ADMISSION_TYPE_LABELS,
  ORPHAN_STATUS_LABELS,
  SUPPORT_NEED_LABELS,
} from '@shared/constants/malawi'

export default function ApplicationDetailPage() {
  return (
    <RoleGuard allowed={['admin', 'high_rank', 'lower_rank']}>
      <ApplicationDetailContent />
    </RoleGuard>
  )
}

const STATUS_TONES: Record<string, StatusTone> = {
  PENDING:             'warning',
  APPROVED:            'success',
  DENIED:              'danger',
  AWAITING_ADMISSION:  'info',
  ADMITTED:            'success',
}

// Sentence case for the visible word (R4): "Awaiting admission", not "AWAITING ADMISSION".
function statusWord(s: string): string {
  const w = s.replace(/_/g, ' ').toLowerCase()
  return w.charAt(0).toUpperCase() + w.slice(1)
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-sm text-body break-words">{value || '—'}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="app-tint rounded-xl p-5">
      <h2 className="font-heading text-sm font-semibold text-brand-navy mb-4">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </div>
  )
}

function ApplicationDetailContent() {
  const { id } = useParams<{ id: string }>()
  const { data: app, isLoading, error } = useApplication(id)
  const { can } = usePermissions()

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-48 rounded-lg" />
        <div className="skeleton h-56 rounded-xl" />
      </div>
    )
  }

  if (error || !app) {
    return (
      <div className="space-y-4">
        <Link
          href="/applications"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-body"
        >
          <ArrowLeft className="w-4 h-4" /> Back to applications
        </Link>
        <p className="text-muted">Application not found.</p>
      </div>
    )
  }

  const statusTone: StatusTone = STATUS_TONES[app.status] ?? 'neutral'

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href="/applications"
          className="p-1.5 rounded-lg hover:bg-page"
          aria-label="Back to applications"
        >
          <ArrowLeft className="w-4 h-4 text-muted" />
        </Link>
        <h1 className="font-heading text-xl font-bold text-brand-navy">
          {app.firstName} {app.lastName}
        </h1>
        <StatusText tone={statusTone} size="md" className="ml-auto">
          {statusWord(app.status)}
        </StatusText>
      </div>

      {/* Applicant */}
      <Section title="Applicant">
        <Field label="First name" value={app.firstName} />
        <Field label="Last name" value={app.lastName} />
        <Field
          label="Date of birth"
          value={new Date(app.dateOfBirth).toLocaleDateString()}
        />
        <Field label="Sex" value={app.sex} />
        <Field label="Nationality" value={app.nationality} />
        <Field label="District" value={app.district} />
        <Field label="Traditional authority" value={app.traditionalAuthority} />
        <Field label="Village" value={app.village} />
        <Field label="NRB or birth certificate number" value={app.nrbNumber} />
        <Field label="Religion" value={app.religion} />
        <Field label="Home language" value={app.homeLanguage} />
        <Field label="Applying for" value={`Form ${app.applyingForForm}`} />
      </Section>

      {/* Home & Admission */}
      <Section title="Home & Admission">
        <Field label="Physical address" value={app.physicalAddress} />
        <Field label="Admission" value={app.admissionType ? ADMISSION_TYPE_LABELS[app.admissionType] : 'Chosen when admitting'} />
        <Field label="Previous school" value={app.previousSchool} />
        <Field label="Reason for transfer" value={app.reasonForTransfer} />
      </Section>

      {/* Welfare & health: sensitive. The API only sends these fields to roles with
          student.viewWelfare; the check here just avoids an empty, misleading section. */}
      {can('student.viewWelfare') && (
        <Section title="Welfare & Health">
          <Field label="Orphan status" value={ORPHAN_STATUS_LABELS[app.orphanStatus ?? 'UNKNOWN']} />
          <Field label="Vulnerable" value={app.isVulnerable ? 'Yes' : 'No'} />
          {app.vulnerabilityNote ? <Field label="Vulnerability note" value={app.vulnerabilityNote} /> : null}
          <Field label="Health or medical alert" value={app.medicalAlert ?? 'None recorded'} />
          <Field
            label="Special needs"
            value={
              app.supportNeeds && app.supportNeeds.length > 0
                ? app.supportNeeds
                    .map((n) => SUPPORT_NEED_LABELS[n.type] + (n.accommodation ? ` (${n.accommodation})` : ''))
                    .join(', ')
                : 'None recorded'
            }
          />
        </Section>
      )}

      {/* Guardian */}
      <Section title="Guardian">
        <Field label="Name" value={app.guardianName} />
        <Field label="Phone" value={app.guardianPhone} />
        <Field label="Relationship" value={app.guardianRelation} />
      </Section>

      {/* Application meta */}
      <Section title="Application">
        <Field label="Status" value={statusWord(app.status)} />
        <Field
          label="Submitted"
          value={new Date(app.createdAt).toLocaleString()}
        />
        {app.notes ? <Field label="Notes" value={app.notes} /> : null}
      </Section>
    </div>
  )
}
