'use client'

import { useState } from 'react'
import {
  useApplications,
  useUpdateApplicationStatus,
  useConvertToStudent,
} from '@/hooks/useApplications'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { CheckCircle, XCircle, UserPlus, Loader2 } from 'lucide-react'

const STATUSES = ['PENDING', 'APPROVED', 'AWAITING_ADMISSION', 'DENIED', 'ADMITTED']

export default function ApplicationsPage() {
  return (
    <RoleGuard allowed={['admin', 'high_rank', 'lower_rank']}>
      <ApplicationsContent />
    </RoleGuard>
  )
}

function ApplicationsContent() {
  const [activeStatus, setActiveStatus] = useState('PENDING')
  const { data: apps = [], isLoading } = useApplications(activeStatus)
  const { mutate: updateStatus, isPending: updating } = useUpdateApplicationStatus()
  const { mutate: convert, isPending: converting } = useConvertToStudent()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-bold text-brand-navy">Applications</h1>
        <p className="text-sm text-muted mt-0.5">Student admission applications</p>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 flex-wrap">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setActiveStatus(s)}
            className={[
              'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
              activeStatus === s
                ? 'bg-brand-navy text-white border-brand-navy'
                : 'bg-surface border-base text-muted hover:border-brand-navy',
            ].join(' ')}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Applications table */}
      <div className="bg-surface border border-base rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-base bg-page">
              <th className="text-left px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wide text-muted">
                Applicant
              </th>
              <th className="text-left px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wide text-muted">
                DOB
              </th>
              <th className="text-left px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wide text-muted">
                Form
              </th>
              <th className="text-left px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wide text-muted">
                Guardian
              </th>
              <th className="px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wide text-muted text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-base">
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="skeleton h-4 rounded w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              : apps.map((app: unknown) => (
                  <tr key={app.id} className="border-b border-base hover:bg-page">
                    <td className="px-4 py-3 font-medium">
                      {app.firstName} {app.lastName}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {new Date(app.dateOfBirth).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-muted">Form {app.applyingForForm}</td>
                    <td className="px-4 py-3 text-muted">{app.guardianName}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {activeStatus === 'PENDING' && (
                          <>
                            <button
                              onClick={() => updateStatus({ id: app.id, status: 'APPROVED' })}
                              disabled={updating}
                              className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg hover:bg-emerald-100"
                              aria-label="Approve application"
                            >
                              <CheckCircle className="w-3.5 h-3.5" /> Approve
                            </button>
                            <button
                              onClick={() => updateStatus({ id: app.id, status: 'DENIED' })}
                              disabled={updating}
                              className="flex items-center gap-1 text-xs text-brand-coral bg-brand-coral/10 border border-brand-coral/20 px-2.5 py-1 rounded-lg hover:bg-brand-coral/20"
                              aria-label="Deny application"
                            >
                              <XCircle className="w-3.5 h-3.5" /> Deny
                            </button>
                          </>
                        )}
                        {(activeStatus === 'APPROVED' || activeStatus === 'AWAITING_ADMISSION') && (
                          <button
                            onClick={() => convert({ id: app.id })}
                            disabled={converting}
                            className="flex items-center gap-1 text-xs text-brand-teal bg-brand-teal/10 border border-brand-teal/20 px-2.5 py-1 rounded-lg hover:bg-brand-teal/20"
                            aria-label="Convert to student"
                          >
                            {converting ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <UserPlus className="w-3.5 h-3.5" />
                            )}
                            Admit as Student
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
