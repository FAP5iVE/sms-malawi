'use client'
import { useState } from 'react'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { useAuthStore } from '@/store/authStore'
import {
  useStaffDirectory,
  useLeaveRequests,
  useContractAlerts,
  useReviewLeave,
} from '@/hooks/useHR'
import { Users, Calendar, CreditCard, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import type { ApiStaffProfile, ApiLeaveRequest, ApiContractAlert } from '@shared/types/api'

type Tab = 'directory' | 'leave' | 'loans' | 'alerts'

export default function HRPage() {
  return (
    <RoleGuard
      allowed={[
        'admin',
        'hr',
        'high_rank',
        'finance',
        'academic',
        'library',
        'lower_rank',
        'exam_officer',
      ]}
    >
      <HRContent />
    </RoleGuard>
  )
}

function HRContent() {
  const { role } = useAuthStore()
  const [tab, setTab] = useState<Tab>('directory')
  const [search, setSearch] = useState('')
  const isHR = ['admin', 'hr', 'high_rank'].includes(role ?? '')

  const { data: staff = [], isLoading: staffLoading } = useStaffDirectory({ search })
  const { data: leaveRequests = [] } = useLeaveRequests({ status: 'PENDING' })
  const { data: contracts = [] } = useContractAlerts(60)
  const reviewLeave = useReviewLeave()

  const TABS = [
    { id: 'directory' as const, label: 'Staff Directory', icon: Users },
    {
      id: 'leave' as const,
      label: 'Leave Requests',
      icon: Calendar,
      badge: (leaveRequests as ApiLeaveRequest[]).length,
    },
    { id: 'loans' as const, label: 'Loans', icon: CreditCard },
    {
      id: 'alerts' as const,
      label: 'Contract Alerts',
      icon: AlertTriangle,
      badge: (contracts as ApiContractAlert[]).length,
    },
  ].filter((t) => t.id === 'directory' || isHR)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-bold text-brand-navy">HR Management</h1>
        <p className="text-sm text-muted mt-0.5">
          Staff directory, leave, loans and contract management
        </p>
      </div>

      <div className="flex gap-1 border-b border-base">
        {TABS.map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors relative ${tab === id ? 'border-brand-teal text-brand-teal' : 'border-transparent text-muted hover:text-body'}`}
          >
            <Icon className="w-4 h-4" /> {label}
            {badge ? (
              <span className="ml-1 bg-brand-coral text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                {badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'directory' && (
        <div className="space-y-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or employee number…"
            className="w-full max-w-sm border border-base rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
          />
          {staffLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-surface animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(staff as ApiStaffProfile[]).map((s) => (
                <div
                  key={s.id}
                  className="bg-surface border border-base rounded-xl p-4 flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-full bg-brand-navy/10 flex items-center justify-center text-brand-navy font-semibold text-sm shrink-0">
                    {s.firstName[0]}
                    {s.lastName[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-body truncate">
                      {s.firstName} {s.lastName}
                    </p>
                    <p className="text-xs text-muted truncate">
                      {s.jobTitle} · {s.department}
                    </p>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${s.status === 'ACTIVE' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}
                    >
                      {s.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'leave' && isHR && (
        <div className="space-y-3">
          {(leaveRequests as ApiLeaveRequest[]).length === 0 && (
            <div className="text-center py-16 text-muted text-sm border border-base rounded-xl">
              No pending leave requests.
            </div>
          )}
          {(leaveRequests as ApiLeaveRequest[]).map((req) => (
            <div
              key={req.id}
              className="bg-surface border border-base rounded-xl p-5 flex items-center justify-between gap-4 flex-wrap"
            >
              <div>
                <p className="font-semibold text-body">
                  {req.staff?.firstName} {req.staff?.lastName}
                </p>
                <p className="text-sm text-muted">
                  {req.leaveType} · {req.days} day(s) ·{' '}
                  {new Date(req.startDate).toLocaleDateString()} –{' '}
                  {new Date(req.endDate).toLocaleDateString()}
                </p>
                <p className="text-xs text-muted mt-1">{req.reason}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => reviewLeave.mutate({ id: req.id, data: { status: 'APPROVED' } })}
                  className="flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-100"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                </button>
                <button
                  onClick={() => reviewLeave.mutate({ id: req.id, data: { status: 'REJECTED' } })}
                  className="flex items-center gap-1 text-xs bg-brand-coral/10 text-brand-coral border border-brand-coral/20 px-3 py-1.5 rounded-lg hover:bg-brand-coral/20"
                >
                  <XCircle className="w-3.5 h-3.5" /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'alerts' && isHR && (
        <div className="space-y-3">
          {(contracts as ApiContractAlert[]).length === 0 && (
            <div className="text-center py-16 text-muted text-sm border border-base rounded-xl">
              No contracts expiring in the next 60 days.
            </div>
          )}
          {(contracts as ApiContractAlert[]).map((s) => (
            <div
              key={s.id}
              className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3"
            >
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <div>
                <p className="font-semibold text-amber-900">
                  {s.firstName} {s.lastName} — {s.department}
                </p>
                <p className="text-sm text-amber-700">
                  Contract expires: {new Date(s.contractExpiry).toLocaleDateString('en-MW')}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
