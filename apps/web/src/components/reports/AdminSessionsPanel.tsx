'use client'

/**
 * apps/web/src/components/reports/AdminSessionsPanel.tsx
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Reports > Admin > Sessions tab — who's logged in, when they
 *   logged in, how long they've been active, a force-logout action, and
 *   (click a row) their full activity log for that session. Mirrors the
 *   existing AdminAuditPanel/AdminSecurityPanel tabs in reports/page.tsx
 *   for KPI-card and table styling, and AlertsPanel.tsx (components/
 *   monitoring/) for the DataTable + permission-gated-action shape.
 * [DEPENDS ON]: W/hooks/useSessions.ts, W/components/shared/{DataTable,
 *   ConfirmDialog}, W/hooks/usePermissions.ts
 */

import { useState } from 'react'
import { X, LogOut } from 'lucide-react'
import { DataTable } from '@/components/shared/DataTable'
import type { DataColumn } from '@/components/shared/DataTable'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { usePermissions } from '@/hooks/usePermissions'
import { useAuthStore } from '@/store/authStore'
import { useSessions, useSessionsSummary, useSessionActivity, useForceLogout } from '@/hooks/useSessions'
import type { ApiUserSession, ApiSessionWindow, ApiSessionAuditEntry } from '@shared/types/api'

// ─────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000))
  if (totalMinutes < 1) return '<1m'
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function displayLabel(s: ApiUserSession): string {
  return s.displayName || s.email || s.uid
}

function identifierLabel(s: ApiUserSession): string {
  return s.employeeNo ?? s.registrationNo ?? '—'
}

// ─────────────────────────────────────────────────────────
//  KPI STRIP (local — mirrors reports/page.tsx's own KpiCard styling;
//  not imported since that component isn't exported from that file)
// ─────────────────────────────────────────────────────────

function SessionKpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface border border-base rounded-2xl p-5 flex flex-col gap-1">
      <p className="text-xs font-medium text-muted uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold font-heading text-brand-navy">{value}</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
//  SESSION ACTIVITY LOG — inline drill-down, opened by clicking a row
// ─────────────────────────────────────────────────────────

const SEVERITY_STYLE: Record<ApiSessionAuditEntry['severity'], string> = {
  CRITICAL: 'bg-brand-coral/15 text-brand-coral',
  HIGH:     'bg-brand-amber/15 text-brand-amber',
  MEDIUM:   'bg-brand-teal/10 text-brand-teal',
  LOW:      'bg-page text-muted',
}

function SessionActivityLog({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const { data, isLoading } = useSessionActivity(sessionId)

  return (
    <div className="border border-base rounded-2xl bg-surface overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-base bg-page">
        <div>
          <p className="text-sm font-heading font-semibold text-brand-navy">
            Activity — {data ? displayLabel(data.session) : '…'}
          </p>
          {data && (
            <p className="text-xs text-muted mt-0.5">
              {new Date(data.session.loginAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
              {' → '}
              {data.session.loggedOutAt
                ? new Date(data.session.loggedOutAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })
                : 'now'}
              {' · '}{data.entries.length} action{data.entries.length === 1 ? '' : 's'}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close activity log"
          className="p-1.5 hover:bg-surface rounded-lg text-muted"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {isLoading ? (
        <div className="p-4 space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-8 w-full rounded" />)}
        </div>
      ) : !data || data.entries.length === 0 ? (
        <p className="text-center py-8 text-sm text-muted">No actions recorded during this session.</p>
      ) : (
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0">
              <tr className="bg-page border-b border-base">
                {['Time', 'Action', 'Entity', 'Entity ID', 'Severity'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-heading font-semibold text-muted uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-base">
              {data.entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-page transition-colors">
                  <td className="px-4 py-2.5 text-xs text-muted whitespace-nowrap">
                    {new Date(entry.createdAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-brand-teal whitespace-nowrap">{entry.action}</td>
                  <td className="px-4 py-2.5 text-xs">{entry.entityType}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted">{entry.entityId.slice(0, 12)}…</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg ${SEVERITY_STYLE[entry.severity]}`}>
                      {entry.severity}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
//  MAIN PANEL
// ─────────────────────────────────────────────────────────

const WINDOW_FILTERS: { label: string; value: ApiSessionWindow }[] = [
  { label: 'Active in last 10 min', value: '10m' },
  { label: 'Active in last 30 min', value: '30m' },
  { label: 'Active in last hour',   value: '1h'  },
  { label: 'All recent sessions',   value: 'all' },
]

export function AdminSessionsPanel() {
  const { can } = usePermissions()
  const canTerminate = can('userMgmt.terminateSession')
  const currentUid = useAuthStore((s) => s.user?.uid)

  const [sessionWindow, setSessionWindow] = useState<ApiSessionWindow>('all')
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [pendingForceLogout, setPendingForceLogout] = useState<ApiUserSession | null>(null)

  const { data, isLoading } = useSessions(sessionWindow)
  const { data: summary } = useSessionsSummary()
  const forceLogout = useForceLogout()

  const sessions = data?.sessions ?? []

  const columns: DataColumn<ApiUserSession>[] = [
    {
      key: 'displayName', label: 'User', priority: 'critical', sortable: true,
      render: (s) => (
        <div>
          <p className="font-medium text-body">{displayLabel(s)}</p>
          {s.email && <p className="text-xs text-muted">{s.email}</p>}
        </div>
      ),
    },
    {
      key: 'identifier', label: 'Employee / Reg. No.', priority: 'important',
      render: (s) => <span className="text-xs font-mono text-muted">{identifierLabel(s)}</span>,
    },
    {
      key: 'role', label: 'Role', priority: 'important',
      render: (s) => <span className="text-xs bg-page rounded-lg px-2 py-0.5">{s.role}</span>,
    },
    {
      key: 'loginAt', label: 'Logged In', priority: 'important', sortable: true,
      render: (s) => (
        <span className="text-xs text-muted whitespace-nowrap">
          {new Date(s.loginAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
        </span>
      ),
    },
    {
      key: 'durationMs', label: 'Active For', priority: 'critical', sortable: true,
      render: (s) => <span className="text-xs font-medium text-body">{formatDuration(s.durationMs)}</span>,
    },
    {
      key: 'isActiveNow', label: 'Status', priority: 'critical',
      render: (s) => (
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
          s.isActiveNow ? 'bg-brand-teal/15 text-brand-teal' : 'bg-page text-muted'
        }`}>
          {s.isActiveNow ? 'Active now' : s.endReason === 'forced' ? 'Force-logged out' : 'Ended'}
        </span>
      ),
    },
    {
      key: 'actions', label: 'Actions', priority: 'critical',
      render: (s) => {
        const isSelf = s.uid === currentUid
        return (
          <button
            type="button"
            disabled={!canTerminate || !s.isActiveNow || isSelf || forceLogout.isPending}
            onClick={(e) => { e.stopPropagation(); setPendingForceLogout(s) }}
            title={isSelf ? "Sign yourself out from the account menu instead" : s.isActiveNow ? 'Force logout' : 'Session already ended'}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-brand-coral hover:bg-brand-coral/10 disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden />
            Force Logout
          </button>
        )
      },
    },
  ]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SessionKpiCard label="Active Now" value={summary?.activeNow ?? '—'} />
        <SessionKpiCard label="Active — Last 10 min" value={summary?.last10m ?? '—'} />
        <SessionKpiCard label="Active — Last 30 min" value={summary?.last30m ?? '—'} />
        <SessionKpiCard label="Active — Last Hour" value={summary?.last1h ?? '—'} />
      </div>

      {!canTerminate && (
        <p className="text-xs text-muted">
          You can view sessions here; forcing a logout requires the userMgmt.terminateSession permission.
        </p>
      )}

      <DataTable<ApiUserSession>
        data={sessions}
        isLoading={isLoading}
        rowKey="id"
        columns={columns}
        quickFilters={WINDOW_FILTERS}
        activeQuickFilter={sessionWindow}
        onQuickFilter={(v) => setSessionWindow(v as ApiSessionWindow)}
        onRowClick={(s) => setSelectedSessionId(s.id)}
        emptyMessage="No sessions match this window."
        bordered={false}
      />

      {selectedSessionId && (
        <SessionActivityLog sessionId={selectedSessionId} onClose={() => setSelectedSessionId(null)} />
      )}

      <ConfirmDialog
        open={pendingForceLogout !== null}
        title={`Force logout ${pendingForceLogout ? displayLabel(pendingForceLogout) : 'this user'}?`}
        description="They will be signed out of every device on their next request. They can sign back in immediately with their existing password."
        confirmLabel="Force Logout"
        destructive
        confirming={forceLogout.isPending}
        confirmingLabel="Signing out…"
        onConfirm={() => {
          if (pendingForceLogout) forceLogout.mutate(pendingForceLogout.uid)
          setPendingForceLogout(null)
        }}
        onCancel={() => setPendingForceLogout(null)}
      />
    </div>
  )
}
