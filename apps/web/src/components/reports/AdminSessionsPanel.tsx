'use client'

/**
 * apps/web/src/components/reports/AdminSessionsPanel.tsx
 *
 * [CHANGE TYPE]: NEW FILE — TARGETED EDIT (Sessions paging + pop-up detail)
 * [PURPOSE]: Reports > Admin > Sessions tab — who's logged in, when they
 *   logged in, how long they've been active, a force-logout action, and
 *   (click a row) the full record of what they did in that session.
 *   Mirrors the existing AdminAuditPanel/AdminSecurityPanel tabs in
 *   reports/page.tsx for KPI-card and table styling, and AlertsPanel.tsx
 *   (components/monitoring/) for the DataTable + permission-gated-action shape.
 *
 *   Edits in this revision:
 *   - The session list is server-paginated (Prev / Next) instead of one
 *     endless scroll.
 *   - Clicking a session opens the shared <Modal> pop-up with the session's
 *     details and a paginated, expandable list of every action taken in it,
 *     instead of an inline panel that opened at the very bottom of the page.
 *   - Column sorting was removed from the list: with server paging a header
 *     sort could only reorder the 15 rows on screen, which reads as a
 *     (wrong) global sort. The list is always newest-activity first.
 * [DEPENDS ON]: W/hooks/useSessions.ts, W/components/shared/{DataTable,
 *   ConfirmDialog, Modal, CopyableId}, W/hooks/usePermissions.ts
 */

import { Fragment, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, LogOut } from 'lucide-react'
import { DataTable } from '@/components/shared/DataTable'
import type { DataColumn } from '@/components/shared/DataTable'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Modal, { MODAL_BTN_SECONDARY } from '@/components/shared/Modal'
import { CopyableId } from '@/components/shared/CopyableId'
import { usePermissions } from '@/hooks/usePermissions'
import { useAuthStore } from '@/store/authStore'
import {
  useSessions, useSessionsSummary, useSessionActivity, useForceLogout,
  SESSIONS_PAGE_SIZE, SESSION_ACTIVITY_PAGE_SIZE,
} from '@/hooks/useSessions'
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

function formatDateTime(iso: string, withSeconds = false): string {
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: withSeconds ? 'medium' : 'short' })
}

function statusLabel(s: ApiUserSession): string {
  if (s.isActiveNow) return 'Active now'
  if (s.endReason === 'forced') return 'Force-logged out'
  return 'Ended'
}

function endReasonLabel(s: ApiUserSession): string {
  if (s.isActiveNow) return 'Still signed in'
  switch (s.endReason) {
    case 'logout':    return 'Signed out by the user'
    case 'forced':    return 'Force-logged out by an administrator'
    case 'new_login': return 'Signed in again (new session started)'
    default:          return 'Went inactive without signing out'
  }
}

/** Compact page list: 1 … 4 5 [6] 7 8 … 20 (null = ellipsis). */
function pageWindow(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages = new Set<number>([1, total, current, current - 1, current + 1])
  if (current <= 3) { pages.add(2); pages.add(3); pages.add(4) }
  if (current >= total - 2) { pages.add(total - 1); pages.add(total - 2); pages.add(total - 3) }
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const out: (number | null)[] = []
  sorted.forEach((p, i) => {
    if (i > 0 && p - (sorted[i - 1] as number) > 1) out.push(null)
    out.push(p)
  })
  return out
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  const text = typeof v === 'string' ? v : JSON.stringify(v)
  return text.length > 200 ? `${text.slice(0, 200)}…` : text
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
//  SESSION DETAIL POP-UP — opened by clicking a row. Uses the shared Modal
//  so it is centred on desktop / a bottom sheet on phones, never trapped
//  under the page header, and only its body scrolls.
// ─────────────────────────────────────────────────────────

const SEVERITY_STYLE: Record<ApiSessionAuditEntry['severity'], string> = {
  CRITICAL: 'text-status-danger',
  HIGH:     'text-status-warning',
  MEDIUM:   'text-status-success',
  LOW:      'text-muted',
}

function DetailItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium text-muted uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-body mt-0.5 break-words">{children}</dd>
    </div>
  )
}

function Pager({
  page, pages, isFetching, onChange, label,
}: { page: number; pages: number; isFetching: boolean; onChange: (p: number) => void; label: string }) {
  if (pages <= 1) return null
  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-base">
      <p className="text-xs text-muted" aria-live="polite">
        Page {page} of {pages}{isFetching ? ' · loading…' : ''}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] rounded-lg border border-base text-sm hover:bg-page disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden /> Prev
        </button>
        {pageWindow(page, pages).map((p, i) =>
          p === null ? (
            <span key={`gap-${i}`} className="px-1 text-muted text-sm select-none">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              aria-current={p === page ? 'page' : undefined}
              className={`hidden sm:inline-block min-w-[36px] min-h-[36px] px-2 rounded-lg text-sm border ${
                p === page ? 'bg-brand-teal text-white border-brand-teal font-semibold' : 'border-base hover:bg-page'
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          type="button"
          onClick={() => onChange(Math.min(pages, page + 1))}
          disabled={page >= pages}
          className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] rounded-lg border border-base text-sm hover:bg-page disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next <ChevronRight className="w-4 h-4" aria-hidden />
        </button>
      </div>
    </nav>
  )
}

/** Everything the audit entry recorded beyond its headline: field changes, request context, raw before/after. */
function EntryDetails({ metadata }: { metadata: NonNullable<ApiSessionAuditEntry['metadata']> }) {
  const changes = metadata.changes ?? []
  const context = Object.entries(metadata.context ?? {}).filter(([, v]) => !(Array.isArray(v) && v.length === 0))
  const hasBefore = metadata.before && Object.keys(metadata.before).length > 0
  const hasAfter = metadata.after && Object.keys(metadata.after).length > 0

  return (
    <div className="space-y-3 text-xs">
      {changes.length > 0 && (
        <div>
          <p className="font-semibold text-muted uppercase tracking-wide text-[10px] mb-1">Changes</p>
          <ul className="space-y-0.5">
            {changes.map((c) => (
              <li key={c.field} className="break-words">
                <span className="font-mono text-brand-teal">{c.field}</span>
                {': '}<span className="text-muted line-through">{formatValue(c.oldValue)}</span>
                {' → '}<span className="text-body">{formatValue(c.newValue)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {context.length > 0 && (
        <div>
          <p className="font-semibold text-muted uppercase tracking-wide text-[10px] mb-1">Context</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            {context.map(([k, v]) => (
              <Fragment key={k}>
                <dt className="font-mono text-muted">{k}</dt>
                <dd className="break-words">{Array.isArray(v) ? v.join(', ') : formatValue(v)}</dd>
              </Fragment>
            ))}
          </dl>
        </div>
      )}
      {(hasBefore || hasAfter) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {hasBefore && (
            <div>
              <p className="font-semibold text-muted uppercase tracking-wide text-[10px] mb-1">Before</p>
              <pre className="max-h-40 overflow-auto rounded-lg bg-surface border border-base p-2 whitespace-pre-wrap break-words">{JSON.stringify(metadata.before, null, 2)}</pre>
            </div>
          )}
          {hasAfter && (
            <div>
              <p className="font-semibold text-muted uppercase tracking-wide text-[10px] mb-1">After</p>
              <pre className="max-h-40 overflow-auto rounded-lg bg-surface border border-base p-2 whitespace-pre-wrap break-words">{JSON.stringify(metadata.after, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function hasDetails(m: ApiSessionAuditEntry['metadata']): m is NonNullable<ApiSessionAuditEntry['metadata']> {
  if (!m) return false
  return Boolean(
    (m.changes && m.changes.length > 0) ||
    (m.context && Object.keys(m.context).length > 0) ||
    (m.before && Object.keys(m.before).length > 0) ||
    (m.after && Object.keys(m.after).length > 0)
  )
}

function SessionDetailModal({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const { data, isLoading, isFetching, isError } = useSessionActivity(sessionId, page, SESSION_ACTIVITY_PAGE_SIZE)

  const session = data?.session
  const total = data?.total ?? 0
  const firstShown = total === 0 ? 0 : ((data?.page ?? 1) - 1) * SESSION_ACTIVITY_PAGE_SIZE + 1
  const lastShown = Math.min((data?.page ?? 1) * SESSION_ACTIVITY_PAGE_SIZE, total)

  function changePage(p: number) {
    setExpandedId(null)
    setPage(p)
  }

  return (
    <Modal
      size="2xl"
      title={session ? `Session — ${displayLabel(session)}` : 'Session details'}
      description={
        session
          ? `${formatDateTime(session.loginAt)} → ${session.loggedOutAt ? formatDateTime(session.loggedOutAt) : session.isActiveNow ? 'now' : formatDateTime(session.lastSeenAt)}`
          : undefined
      }
      onClose={onClose}
      bodyClassName="space-y-5"
      footer={<button type="button" onClick={onClose} className={MODAL_BTN_SECONDARY}>Close</button>}
    >
      {isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-8 w-full rounded" />)}
        </div>
      ) : isError || !data || !session ? (
        <p className="text-center py-8 text-sm text-muted">Could not load this session. Close and try again.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3 rounded-2xl border border-base bg-page p-4">
            <DetailItem label="Status">
              <span className={`font-semibold ${session.isActiveNow ? 'text-brand-teal' : 'text-muted'}`}>{statusLabel(session)}</span>
            </DetailItem>
            <DetailItem label="Role">{session.role}</DetailItem>
            <DetailItem label="Employee / Reg. No.">
              <span className="font-mono text-xs">{identifierLabel(session)}</span>
            </DetailItem>
            <DetailItem label="Email">{session.email ?? '—'}</DetailItem>
            <DetailItem label="Signed in">{formatDateTime(session.loginAt, true)}</DetailItem>
            <DetailItem label="Last active">{formatDateTime(session.lastSeenAt, true)}</DetailItem>
            <DetailItem label="Signed out">{session.loggedOutAt ? formatDateTime(session.loggedOutAt, true) : '—'}</DetailItem>
            <DetailItem label="Active for">{formatDuration(session.durationMs)}</DetailItem>
            <DetailItem label="How it ended">{endReasonLabel(session)}</DetailItem>
          </dl>

          <section aria-label="Actions taken in this session">
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <h3 className="text-sm font-heading font-semibold text-brand-navy">
                Actions in this session
                <span className="ml-2 text-xs font-normal text-muted">{total} total</span>
              </h3>
              {total > 0 && (
                <p className="text-xs text-muted">Showing {firstShown}–{lastShown}</p>
              )}
            </div>

            {total === 0 ? (
              <p className="text-center py-8 text-sm text-muted rounded-2xl border border-base">
                No actions recorded during this session.
              </p>
            ) : (
              <div className={`overflow-x-auto rounded-2xl border border-base transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-page border-b border-base">
                      {['Time', 'Action', 'Record', 'Severity', ''].map((h, i) => (
                        <th key={`${h}-${i}`} className="px-3 py-2.5 text-left text-xs font-heading font-semibold text-muted uppercase whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-base">
                    {data.entries.map((entry) => {
                      const expandable = hasDetails(entry.metadata)
                      const open = expandedId === entry.id
                      return (
                        <Fragment key={entry.id}>
                          <tr className="hover:bg-page transition-colors">
                            <td className="px-3 py-2.5 text-xs text-muted whitespace-nowrap">{formatDateTime(entry.createdAt, true)}</td>
                            <td className="px-3 py-2.5 font-mono text-xs text-brand-teal break-all">{entry.action}</td>
                            <td className="px-3 py-2.5 text-xs">
                              <span className="block">{entry.entityType}</span>
                              <span className="font-mono text-[11px] text-muted">
                                <CopyableId value={entry.entityId} display={entry.entityId.length > 14 ? `${entry.entityId.slice(0, 12)}…` : entry.entityId} />
                              </span>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={`text-[10px] font-semibold ${SEVERITY_STYLE[entry.severity]}`}>{entry.severity}</span>
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {expandable && (
                                <button
                                  type="button"
                                  onClick={() => setExpandedId(open ? null : entry.id)}
                                  aria-expanded={open}
                                  aria-label={open ? 'Hide details' : 'Show details'}
                                  className="p-1.5 rounded-lg text-muted hover:bg-surface hover:text-body"
                                >
                                  <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
                                </button>
                              )}
                            </td>
                          </tr>
                          {open && expandable && entry.metadata != null && (
                            <tr className="bg-page">
                              <td colSpan={5} className="px-4 py-3">
                                <EntryDetails metadata={entry.metadata} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <Pager page={data.page} pages={data.pages} isFetching={isFetching} onChange={changePage} label="Session activity pagination" />
          </section>
        </>
      )}
    </Modal>
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
  const [page, setPage] = useState(1)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [pendingForceLogout, setPendingForceLogout] = useState<ApiUserSession | null>(null)

  const { data, isLoading, isFetching } = useSessions(sessionWindow, page, SESSIONS_PAGE_SIZE)
  const { data: summary } = useSessionsSummary()
  const forceLogout = useForceLogout()

  const sessions = data?.sessions ?? []
  const total = data?.total ?? 0
  // The server clamps a stale page number; follow it so Prev/Next stay accurate.
  const currentPage = data?.page ?? page
  const totalPages = Math.max(1, data?.pages ?? 1)
  const firstShown = total === 0 ? 0 : (currentPage - 1) * SESSIONS_PAGE_SIZE + 1
  const lastShown = Math.min(currentPage * SESSIONS_PAGE_SIZE, total)

  const columns: DataColumn<ApiUserSession>[] = [
    {
      key: 'displayName', label: 'User', priority: 'critical',
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
      render: (s) => <span className="text-xs">{s.role}</span>,
    },
    {
      key: 'loginAt', label: 'Logged In', priority: 'important',
      render: (s) => (
        <span className="text-xs text-muted whitespace-nowrap">
          {formatDateTime(s.loginAt)}
        </span>
      ),
    },
    {
      key: 'durationMs', label: 'Active For', priority: 'critical',
      render: (s) => <span className="text-xs font-medium text-body">{formatDuration(s.durationMs)}</span>,
    },
    {
      key: 'isActiveNow', label: 'Status', priority: 'critical',
      render: (s) => (
        <span className={`text-xs font-semibold ${s.isActiveNow ? 'text-brand-teal' : 'text-muted'}`}>
          {statusLabel(s)}
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

      {total > 0 && (
        <p className="text-sm text-muted" aria-live="polite">
          {total} session{total === 1 ? '' : 's'} · showing {firstShown}–{lastShown}
          {isFetching && !isLoading ? ' · updating…' : ''}
        </p>
      )}

      <DataTable<ApiUserSession>
        bordered={false}
        data={sessions}
        isLoading={isLoading}
        rowKey="id"
        columns={columns}
        quickFilters={WINDOW_FILTERS}
        activeQuickFilter={sessionWindow}
        onQuickFilter={(v) => { setSessionWindow(v as ApiSessionWindow); setPage(1) }}
        onRowClick={(s) => setSelectedSessionId(s.id)}
        pagination={{ page: currentPage, pages: totalPages, onPageChange: (p) => setPage(Math.max(1, Math.min(totalPages, p))) }}
        emptyMessage="No sessions match this window."
      />

      {selectedSessionId && (
        <SessionDetailModal key={selectedSessionId} sessionId={selectedSessionId} onClose={() => setSelectedSessionId(null)} />
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
