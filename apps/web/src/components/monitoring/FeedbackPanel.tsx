/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/monitoring/FeedbackPanel.tsx
 * [PURPOSE]: User Feedback panel — a table of submitted feedback (via
 *   Sentry.captureFeedback under the hood) plus the same "Report a
 *   problem" form available to every role via monitoring.submitFeedback.
 * [DEPENDS ON]: @/hooks/useMonitoring, @/components/shared/DataTable
 */
'use client'

import { useState } from 'react'
import { Send } from 'lucide-react'
import { DataTable } from '@/components/shared/DataTable'
import type { DataColumn } from '@/components/shared/DataTable'
import { useMonitoringFeedback, useSubmitFeedback } from '@/hooks/useMonitoring'
import type { ApiMonitoringFeedback } from '@shared/types/monitoring'

export function FeedbackPanel() {
  const { data, isLoading } = useMonitoringFeedback()
  const submit = useSubmitFeedback()
  const [message, setMessage] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const feedback = data?.data ?? []

  const columns: DataColumn<ApiMonitoringFeedback>[] = [
    { key: 'message', label: 'Message', priority: 'critical' },
    { key: 'submittedByRole', label: 'Role', priority: 'important', render: (row) => row.submittedByRole ?? '\u2014' },
    { key: 'dateCreated', label: 'Date', priority: 'important', render: (row) => new Date(row.dateCreated).toLocaleString() },
  ]

  function handleSubmit() {
    if (!message.trim()) return
    submit.mutate({ message: message.trim() }, {
      onSuccess: () => { setMessage(''); setSubmitted(true); setTimeout(() => setSubmitted(false), 3000) },
    })
  }

  return (
    <div className="space-y-6">
      <div className="bg-surface border border-base rounded-xl p-4 space-y-3">
        <h2 className="font-heading font-semibold text-sm">Report a problem</h2>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What went wrong?"
          rows={3}
          className="w-full rounded-lg border border-base bg-page px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-teal/40"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!message.trim() || submit.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-navy text-white text-sm font-semibold disabled:opacity-50"
          >
            <Send className="w-4 h-4" aria-hidden />
            {submit.isPending ? 'Sending\u2026' : 'Submit'}
          </button>
          {submitted && <span className="text-xs text-brand-teal">Thanks \u2014 we have logged this.</span>}
        </div>
      </div>

      <DataTable<ApiMonitoringFeedback>
        data={feedback}
        isLoading={isLoading}
        rowKey="id"
        columns={columns}
        emptyMessage="No feedback submitted yet."
      />
    </div>
  )
}