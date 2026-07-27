/**
 * [CHANGE TYPE]: TARGETED EDIT (output in full — the list rendering is
 *   replaced end-to-end)
 * [FILE]: apps/web/src/app/(auth)/applications/page.tsx
 * [R-PHASE]: R5 — Academics I: Admissions & Student Records
 * [PURPOSE]: Replaces the local STATUSES array with a derivation from
 *   ApplicationStatusSchema (@shared/schemas/student), the bespoke raw
 *   <table> with the shared DataTable (mobile card view, column-priority
 *   responsiveness, and per-row mobileActions bottom sheet come for free),
 *   and the bespoke status-pill buttons with ModuleTabs — consistent with
 *   every other list view in the app (sms-erp-frontend Rule 2).
 * [DEPENDS ON]: @shared/schemas/student (ApplicationStatusSchema),
 *   apps/web/src/components/shared/DataTable.tsx,
 *   apps/web/src/components/shared/ModuleTabs.tsx
 */
/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]: Real pagination — useApplications() now returns the
 *   paginated { applications, total, page, pages } envelope (route/
 *   service paginated the same phase), wired to DataTable's existing
 *   pagination prop; switching status tabs resets to page 1. The empty
 *   state below predates this phase (R5) and already satisfies R15's
 *   considered-empty-state criterion.
 * [DEPENDS ON]: W/hooks/useApplications.ts (paginated, same phase)
 */
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ApiApplication } from '@shared/types/api'
import { ApplicationStatusSchema } from '@shared/schemas/student'
import {
  useApplications,
  useUpdateApplicationStatus,
  useConvertToStudent,
} from '@/hooks/useApplications'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { DataTable } from '@/components/shared/DataTable'
import type { DataColumn, MobileAction } from '@/components/shared/DataTable'
import { ModuleTabs } from '@/components/shared/ModuleTabs'
import type { TabItem } from '@/components/shared/ModuleTabs'
import { CheckCircle, XCircle, UserPlus, Loader2, Inbox } from 'lucide-react'

type ApplicationStatusValue = (typeof ApplicationStatusSchema.options)[number]

const STATUS_TABS: TabItem<ApplicationStatusValue>[] = ApplicationStatusSchema.options.map(
  (s) => ({ id: s, label: s.replace(/_/g, ' ') })
)

export default function ApplicationsPage() {
  return (
    <RoleGuard allowed={['admin', 'high_rank', 'lower_rank']}>
      <ApplicationsContent />
    </RoleGuard>
  )
}

function ApplicationsContent() {
  const router = useRouter()
  const [activeStatus, setActiveStatus] = useState<ApplicationStatusValue>('PENDING')
  const [page, setPage]                 = useState(1)
  const [actionError, setActionError]   = useState<string | null>(null)
  const { data, isLoading }             = useApplications(activeStatus, page)
  const apps                            = data?.applications ?? []
  const { mutate: updateStatus, isPending: updating } = useUpdateApplicationStatus()
  const { mutate: convert, isPending: converting }     = useConvertToStudent()

  function handleUpdateStatus(id: string, status: 'APPROVED' | 'DENIED') {
    setActionError(null)
    updateStatus(
      { id, status },
      {
        onError: (err) => setActionError(err instanceof Error ? err.message : 'Failed to update application status.'),
      }
    )
  }

  function handleConvert(id: string) {
    setActionError(null)
    // Universal credential flow: admitting an applicant provisions their login
    // from the email on their application — a generated password is emailed and
    // must be reset on first sign-in. If the applicant has no email on file the
    // backend returns a clear 400, surfaced below.
    convert(
      { id, createLoginAccount: true },
      {
        onError: (err) => setActionError(err instanceof Error ? err.message : 'Failed to admit applicant as student.'),
      }
    )
  }

  const columns: DataColumn<ApiApplication>[] = [
    {
      key:      'firstName',
      label:    'Applicant',
      sortable: true,
      priority: 'critical',
      render: (app) => (
        <span className="font-medium">
          {app.firstName} {app.lastName}
        </span>
      ),
    },
    {
      key:      'dateOfBirth',
      label:    'DOB',
      priority: 'important',
      render: (app) => new Date(app.dateOfBirth).toLocaleDateString(),
    },
    {
      key:      'applyingForForm',
      label:    'Form',
      priority: 'important',
      render: (app) => `Form ${app.applyingForForm}`,
    },
    {
      key:      'guardianName',
      label:    'Guardian',
      priority: 'optional',
    },
    {
      key:      'actions',
      label:    'Actions',
      priority: 'important',
      render: (app) => (
        <div className="flex items-center justify-end gap-2">
          {activeStatus === 'PENDING' && (
            <>
              <button
                onClick={() => handleUpdateStatus(app.id, 'APPROVED')}
                disabled={updating}
                className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg hover:bg-emerald-100 min-h-[44px] sm:min-h-0"
                aria-label={`Approve application from ${app.firstName} ${app.lastName}`}
              >
                <CheckCircle className="w-3.5 h-3.5" aria-hidden /> Approve
              </button>
              <button
                onClick={() => handleUpdateStatus(app.id, 'DENIED')}
                disabled={updating}
                className="flex items-center gap-1 text-xs text-brand-coral bg-brand-coral/10 border border-brand-coral/20 px-2.5 py-1 rounded-lg hover:bg-brand-coral/20 min-h-[44px] sm:min-h-0"
                aria-label={`Deny application from ${app.firstName} ${app.lastName}`}
              >
                <XCircle className="w-3.5 h-3.5" aria-hidden /> Deny
              </button>
            </>
          )}
          {(activeStatus === 'APPROVED' || activeStatus === 'AWAITING_ADMISSION') && (
            <button
              onClick={() => handleConvert(app.id)}
              disabled={converting}
              className="flex items-center gap-1 text-xs text-brand-teal bg-brand-teal/10 border border-brand-teal/20 px-2.5 py-1 rounded-lg hover:bg-brand-teal/20 min-h-[44px] sm:min-h-0"
              aria-label={`Admit ${app.firstName} ${app.lastName} as a student`}
            >
              {converting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
              ) : (
                <UserPlus className="w-3.5 h-3.5" aria-hidden />
              )}
              Admit as Student
            </button>
          )}
        </div>
      ),
    },
  ]

  const mobileActions: MobileAction<ApiApplication>[] = [
    ...(activeStatus === 'PENDING'
      ? [
          {
            label:   'Approve',
            icon:    CheckCircle,
            variant: 'default' as const,
            onClick: (row: ApiApplication) => handleUpdateStatus(row.id, 'APPROVED'),
          },
          {
            label:   'Deny',
            icon:    XCircle,
            variant: 'danger' as const,
            onClick: (row: ApiApplication) => handleUpdateStatus(row.id, 'DENIED'),
          },
        ]
      : []),
    ...(activeStatus === 'APPROVED' || activeStatus === 'AWAITING_ADMISSION'
      ? [
          {
            label:   'Admit as Student',
            icon:    UserPlus,
            variant: 'default' as const,
            onClick: (row: ApiApplication) => handleConvert(row.id),
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-bold text-brand-navy">Applications</h1>
        <p className="text-sm text-muted mt-0.5">Student admission applications</p>
      </div>

      <ModuleTabs<ApplicationStatusValue>
        id="applications-status"
        tabs={STATUS_TABS}
        active={activeStatus}
        onChange={(status) => {
          setActiveStatus(status)
          setPage(1)
        }}
        variant="pill"
      />

      {actionError && (
        <p
          role="alert"
          className="text-sm text-brand-coral bg-brand-coral/8 border border-brand-coral/20 rounded-xl px-4 py-3"
        >
          {actionError}
        </p>
      )}

      {apps.length === 0 && !isLoading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center bg-surface border border-base rounded-xl">
          <Inbox className="w-8 h-8 text-muted" aria-hidden />
          <div>
            <p className="font-heading font-semibold text-body">No applications found</p>
            <p className="text-sm text-muted mt-1">
              There are no applications with status &ldquo;{activeStatus.replace(/_/g, ' ')}&rdquo; right now.
            </p>
          </div>
        </div>
      ) : (
        <DataTable<ApiApplication>
          data={apps}
          isLoading={isLoading}
          columns={columns}
          rowKey="id"
          mobileActions={mobileActions}
          onRowClick={(row) => router.push(`/applications/${row.id}`)}
          pagination={{
            page,
            pages: data?.pages ?? 1,
            onPageChange: setPage,
          }}
          emptyMessage="No applications found for this status."
        />
      )}
    </div>
  )
}