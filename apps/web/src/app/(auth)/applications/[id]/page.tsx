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

export default function ApplicationDetailPage() {
  return (
    <RoleGuard allowed={['admin', 'high_rank', 'lower_rank']}>
      <ApplicationDetailContent />
    </RoleGuard>
  )
}

const STATUS_STYLES: Record<string, string> = {
  PENDING:             'bg-brand-gold/15 text-brand-gold border-brand-gold/30',
  APPROVED:            'bg-brand-teal/15 text-brand-teal border-brand-teal/30',
  DENIED:              'bg-brand-coral/15 text-brand-coral border-brand-coral/30',
  AWAITING_ADMISSION:  'bg-brand-navy/10 text-brand-navy border-brand-navy/25',
  ADMITTED:            'bg-brand-teal/15 text-brand-teal border-brand-teal/30',
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wider text-muted">{label}</span>
      <span className="text-sm text-body break-words">{value || '—'}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-base rounded-xl p-5">
      <h2 className="font-heading text-sm font-semibold text-brand-navy mb-4">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </div>
  )
}

function ApplicationDetailContent() {
  const { id } = useParams<{ id: string }>()
  const { data: app, isLoading, error } = useApplication(id)

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

  const statusClass =
    STATUS_STYLES[app.status] ?? 'bg-page text-muted border-base'

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href="/applications"
          className="p-1.5 rounded-lg hover:bg-page border border-base"
          aria-label="Back to applications"
        >
          <ArrowLeft className="w-4 h-4 text-muted" />
        </Link>
        <h1 className="font-heading text-xl font-bold text-brand-navy">
          {app.firstName} {app.lastName}
        </h1>
        <span
          className={`ml-auto text-xs px-2.5 py-1 rounded-full border font-medium ${statusClass}`}
        >
          {app.status.replace(/_/g, ' ')}
        </span>
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
        <Field label="Applying for" value={`Form ${app.applyingForForm}`} />
      </Section>

      {/* Guardian */}
      <Section title="Guardian">
        <Field label="Name" value={app.guardianName} />
        <Field label="Phone" value={app.guardianPhone} />
        <Field label="Relationship" value={app.guardianRelation} />
      </Section>

      {/* Application meta */}
      <Section title="Application">
        <Field label="Status" value={app.status.replace(/_/g, ' ')} />
        <Field
          label="Submitted"
          value={new Date(app.createdAt).toLocaleString()}
        />
        {app.notes ? <Field label="Notes" value={app.notes} /> : null}
      </Section>
    </div>
  )
}
