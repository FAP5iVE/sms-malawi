'use client'

/*
 * apps/web/src/components/hr/LeaveConflictWarning.tsx — Phase D9
 *
 * Inline conflict warning panel rendered inside the leave approval flow.
 * Receives conflict data from the leave request review screen and displays:
 *   - BLOCKING conflicts with red alert (approval disabled until resolved)
 *   - WARNING conflicts with amber alert (approval can proceed with acknowledgement)
 *   - Team leave snapshot for the overlapping period
 */

import { AlertTriangle, XCircle, Info, Users } from 'lucide-react'
import type { ConflictCheckResult, TeamLeaveEntry } from '@/server/services/leaveConflictService'

// ─────────────────────────────────────────────────────────────────────────────
// CONFLICT ALERT
// ─────────────────────────────────────────────────────────────────────────────

function ConflictAlert({
  type,
  severity,
  message,
  detail,
}: {
  type:      string
  severity:  'BLOCKING' | 'WARNING'
  message:   string
  detail?:   string
}) {
  const isBlocking = severity === 'BLOCKING'
  const Icon       = isBlocking ? XCircle : AlertTriangle

  return (
    <div
      className={`
        flex items-start gap-3 rounded-xl p-4 border
        ${isBlocking
          ? 'bg-brand-coral/8 border-brand-coral/25'
          : 'bg-brand-amber/8 border-brand-amber/25'}
      `}
      role={isBlocking ? 'alert' : 'status'}
    >
      <Icon
        className={`w-4 h-4 mt-0.5 shrink-0 ${isBlocking ? 'text-brand-coral' : 'text-brand-amber'}`}
        aria-hidden
      />
      <div className="min-w-0">
        <p className={`text-sm font-heading font-semibold ${isBlocking ? 'text-brand-coral' : 'text-brand-amber'}`}>
          {isBlocking ? 'Blocking Conflict' : 'Warning'} — {type.replace(/_/g, ' ')}
        </p>
        <p className="text-sm text-body mt-0.5 leading-relaxed">{message}</p>
        {detail && (
          <p className="text-xs text-muted mt-1">{detail}</p>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TEAM SNAPSHOT
// ─────────────────────────────────────────────────────────────────────────────

function TeamSnapshot({ entries }: { entries: TeamLeaveEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="text-xs text-muted text-center py-4">
        No other team members on leave during this period.
      </div>
    )
  }

  const LEAVE_COLORS: Record<string, string> = {
    ANNUAL:           'bg-blue-100 text-blue-700',
    SICK:             'bg-brand-coral/10 text-brand-coral',
    MATERNITY:        'bg-purple-100 text-purple-700',
    PATERNITY:        'bg-purple-100 text-purple-700',
    STUDY:            'bg-emerald-100 text-emerald-700',
    EMERGENCY:        'bg-brand-amber/15 text-brand-amber',
    UNPAID:           'bg-base text-muted',
  }

  return (
    <div className="divide-y divide-base">
      {entries.map((e, i) => (
        <div key={i} className="flex items-center gap-3 py-2.5 px-1">
          <div className="w-8 h-8 rounded-full bg-brand-navy/10 flex items-center justify-center shrink-0 text-brand-navy text-xs font-bold">
            {e.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-body truncate">{e.fullName}</p>
            <p className="text-xs text-muted">
              {new Date(e.startDate).toLocaleDateString('en-GB')} –{' '}
              {new Date(e.endDate).toLocaleDateString('en-GB')} ({e.days} day{e.days !== 1 ? 's' : ''})
            </p>
          </div>
          <span
            className={`
              shrink-0 text-xs font-heading font-semibold px-2 py-1 rounded-full
              ${LEAVE_COLORS[e.leaveType] ?? 'bg-base text-muted'}
            `}
          >
            {e.leaveType}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LEAVE CONFLICT WARNING (main export)
// ─────────────────────────────────────────────────────────────────────────────

interface LeaveConflictWarningProps {
  result:          ConflictCheckResult
  teamSnapshot?:   TeamLeaveEntry[]
  onAcknowledge?:  () => void
  acknowledged?:   boolean
}

export function LeaveConflictWarning({
  result,
  teamSnapshot = [],
  onAcknowledge,
  acknowledged  = false,
}: LeaveConflictWarningProps) {
  if (!result.hasBlockingConflicts && !result.hasWarnings && teamSnapshot.length === 0) {
    return (
      <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-800/40 dark:text-emerald-400">
        <Info className="w-4 h-4 shrink-0" />
        No conflicts detected for the requested leave period.
      </div>
    )
  }

  return (
    <div className="space-y-4 border border-base rounded-2xl p-5 bg-surface">

      {/* Section header */}
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-brand-amber" aria-hidden />
        <h3 className="font-heading font-semibold text-sm text-body">
          Leave Conflict Analysis
        </h3>
      </div>

      {/* Conflict alerts */}
      {result.conflicts.length > 0 && (
        <div className="space-y-3">
          {result.conflicts.map((c, i) => (
            <ConflictAlert key={i} {...c} />
          ))}
        </div>
      )}

      {/* Team snapshot */}
      {teamSnapshot.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-3.5 h-3.5 text-muted" aria-hidden />
            <span className="text-xs font-heading font-semibold text-muted uppercase tracking-wider">
              Team Leave During This Period ({teamSnapshot.length})
            </span>
          </div>
          <div className="border border-base rounded-xl overflow-hidden">
            <TeamSnapshot entries={teamSnapshot} />
          </div>
        </div>
      )}

      {/* Warning acknowledgement checkbox */}
      {result.hasWarnings && !result.hasBlockingConflicts && onAcknowledge && (
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={onAcknowledge}
            className="mt-0.5 w-4 h-4 accent-brand-teal"
            aria-label="Acknowledge warnings and proceed"
          />
          <span className="text-sm text-body leading-relaxed">
            I have reviewed the warnings above and confirm that appropriate arrangements
            have been made to ensure continuity during the leave period.
          </span>
        </label>
      )}

      {/* Blocking message */}
      {result.hasBlockingConflicts && (
        <p className="text-xs text-brand-coral font-heading font-semibold">
          Approval is blocked until the conflict above is resolved.
        </p>
      )}
    </div>
  )
}