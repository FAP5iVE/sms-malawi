/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/components/monitoring/FeedbackPanel.tsx
 * [PURPOSE]: Monitoring > Feedback — the list of every problem report sent
 *   from anywhere in the app (all roles), with WHO sent it: name / username,
 *   role, and employee or student number (flagged when the number does not
 *   match the sender's account). Reports are read from our own database, so a
 *   new report appears here immediately. The "Report a problem" form now
 *   lives in the shared ReportProblemModal (header menu / mobile More sheet,
 *   open to every role); the button below opens that same dialog.
 * [DEPENDS ON]: @/hooks/useMonitoring, @/components/shared/{DataTable,ReportProblemModal}
 */
'use client'

import { useState } from 'react'
import { MessageSquareWarning, AlertTriangle } from 'lucide-react'
import { DataTable } from '@/components/shared/DataTable'
import type { DataColumn } from '@/components/shared/DataTable'
import { ReportProblemModal } from '@/components/shared/ReportProblemModal'
import { useMonitoringFeedback } from '@/hooks/useMonitoring'
import { ROLE_LABELS, type UserRole } from '@shared/types/roles'
import type { ApiMonitoringFeedback } from '@shared/types/monitoring'

export function FeedbackPanel() {
  const { data, isLoading } = useMonitoringFeedback()
  const [reportOpen, setReportOpen] = useState(false)

  const feedback = data?.data ?? []

  const columns: DataColumn<ApiMonitoringFeedback>[] = [
    { key: 'message', label: 'Message', priority: 'critical' },
    {
      key: 'reporterName',
      label: 'Reported by',
      priority: 'critical',
      render: (row) => row.reporterName ?? '-',
    },
    {
      key: 'reporterIdNumber',
      label: 'Employee / student no.',
      priority: 'important',
      render: (row) =>
        row.reporterIdNumber ? (
          <span className="inline-flex items-center gap-1.5">
            {row.reporterIdNumber}
            {row.idMatchesAccount === false && (
              <span
                title="This number does not match the sender's account record"
                className="inline-flex items-center gap-1 text-xs font-heading font-bold text-status-warning"
              >
                <AlertTriangle className="w-3 h-3" aria-hidden />
                Mismatch
              </span>
            )}
          </span>
        ) : (
          '-'
        ),
    },
    {
      key: 'submittedByRole',
      label: 'Role',
      priority: 'important',
      render: (row) => (row.submittedByRole ? (ROLE_LABELS[row.submittedByRole as UserRole] ?? row.submittedByRole) : '-'),
    },
    { key: 'dateCreated', label: 'Date', priority: 'important', render: (row) => new Date(row.dateCreated).toLocaleString() },
  ]

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-base flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-heading font-semibold text-sm">Problem reports</h2>
          <p className="text-xs text-muted mt-0.5">
            Sent by any user via &ldquo;Report a problem&rdquo; in the profile menu.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setReportOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-deep text-white text-sm font-semibold"
        >
          <MessageSquareWarning className="w-4 h-4" aria-hidden />
          Report a problem
        </button>
      </div>

      <DataTable<ApiMonitoringFeedback>
        data={feedback}
        isLoading={isLoading}
        rowKey="id"
        columns={columns}
        emptyMessage="No problems reported yet."
        bordered={false}
      />

      {reportOpen && <ReportProblemModal onClose={() => setReportOpen(false)} />}
    </div>
  )
}
