'use client'

/**
 * apps/web/src/components/settings/finance/FeatureRollout.tsx
 *
 * [CHANGE TYPE]: NEW FILE
 * [PLAN]: Finance Hardening Plan — P0-03, D-28 (Part 5 §4.1 "Feature rollout",
 *   Part 6 §7). Extracted from FinanceSettings.tsx as Part 5 §4.1 allows.
 * [PURPOSE]: Settings → Finance → Feature rollout. Shows, for each finance
 *   module, whether its v2 code path is ON or OFF, who last changed it and
 *   when, and any change waiting for approval.
 *     • Finance PROPOSES a change (with a reason).
 *     • High Rank APPROVES or REJECTS it — never the person who proposed it.
 *     • Admin sees the screen read-only.
 *   All state and rules live on the server (settingsService); this screen
 *   only reflects them and hides actions the signed-in role cannot use.
 * [API]: GET  /settings/finance/rollout
 *        POST /settings/finance/rollout/propose
 *        POST /settings/finance/rollout/:module/decision
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { useAuthStore } from '@/store/authStore'
import { StatusText } from '@/components/shared/StatusText'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import type { FinanceV2Module, FinanceV2Proposal } from '@shared/types/settings'

interface RolloutRow {
  module: FinanceV2Module
  enabled: boolean
  lastChangedAt: string | null
  lastChangedByUid: string | null
  lastChangedByName: string | null
  pending: (FinanceV2Proposal & { proposedByName: string | null }) | null
}

const QUERY_KEY = ['settings', 'finance', 'rollout'] as const

/** Plain-language name and scope of each module's v2 path (Part 4 §1.8). */
const MODULE_INFO: Record<FinanceV2Module, { label: string; scope: string }> = {
  ledgerEngine:     { label: 'Ledger engine',      scope: 'Transactional posting, the financial register, journal immutability.' },
  accountsRegistry: { label: 'Payment accounts',   scope: 'Payment Accounts registry, chart of accounts v2, posting map, periods.' },
  receivables:      { label: 'Receivables',        scope: 'Accrual invoicing, payments v2, credits, refunds, sponsors.' },
  expenses:         { label: 'Expenses',           scope: 'Expenses, budgets, procurement, supplier invoices, advances.' },
  payroll:          { label: 'Payroll',            scope: 'Payroll calculation, posting, disbursement, statutory remittances.' },
  loans:            { label: 'Staff loans',        scope: 'Loan model v2: disbursement and repayment records.' },
  fines:            { label: 'Library fines',      scope: 'Fine payments and waivers for students and staff.' },
  reconciliation:   { label: 'Cash control',       scope: 'Transfers, statement reconciliation, cashbook.' },
  reports:          { label: 'Reports',            scope: 'Ledger-based statements, period close, control centre.' },
  permissions:      { label: 'Finance permissions', scope: 'Permission matrix; Admin loses unrestricted finance write.' },
}

const inputCls = 'w-full border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25'
const btnPrimary = 'min-h-[44px] px-4 rounded-xl text-sm font-heading font-semibold bg-brand-deep text-white hover:brightness-110 transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2'
const btnQuiet = 'min-h-[44px] px-4 rounded-xl text-sm font-heading font-semibold border border-base text-body hover:bg-page transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2'

function when(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

export function FeatureRollout() {
  const qc = useQueryClient()
  const role = useAuthStore((s) => s.role)
  const superUser = useAuthStore((s) => s.superUser)
  const myUid = useAuthStore((s) => s.user?.uid ?? null)

  // The server enforces these; the screen only hides what would be refused.
  const canPropose = role === 'finance' || superUser
  const canDecide = role === 'high_rank' || superUser

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<{ modules: RolloutRow[] }>('/settings/finance/rollout'),
  })

  const [proposing, setProposing] = useState<FinanceV2Module | null>(null)
  const [reason, setReason] = useState('')
  const [approving, setApproving] = useState<RolloutRow | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const propose = useMutation({
    mutationFn: (v: { module: FinanceV2Module; enabled: boolean; reason: string }) =>
      apiFetch('/settings/finance/rollout/propose', { method: 'POST', body: JSON.stringify(v) }),
    onSuccess: () => {
      setProposing(null); setReason(''); setActionError(null)
      void qc.invalidateQueries({ queryKey: QUERY_KEY })
    },
    onError: (e) => setActionError(e instanceof Error ? e.message : 'Could not send the proposal.'),
  })

  const decide = useMutation({
    mutationFn: (v: { module: FinanceV2Module; decision: 'APPROVE' | 'REJECT' }) =>
      apiFetch(`/settings/finance/rollout/${v.module}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision: v.decision }),
      }),
    onSuccess: () => {
      setApproving(null); setActionError(null)
      void qc.invalidateQueries({ queryKey: QUERY_KEY })
    },
    onError: (e) => {
      setApproving(null)
      setActionError(e instanceof Error ? e.message : 'Could not record the decision.')
      void qc.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })

  if (isLoading) {
    return <div className="flex items-center gap-2 text-muted text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
  }
  if (error || !data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-tone-coral">{error instanceof Error ? error.message : 'Could not load the rollout state.'}</p>
        <button type="button" onClick={() => void refetch()} className={btnQuiet}>Try again</button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading font-bold text-lg text-brand-navy">Feature rollout</h2>
        <p className="text-sm text-muted mt-0.5 max-w-2xl">
          Each finance module keeps working the way it does today until its new version is switched on.
          Finance proposes a change with a reason; High Rank approves it. Nobody can approve a change they proposed.
        </p>
      </div>

      {actionError && <p className="text-sm text-tone-coral" role="alert">{actionError}</p>}

      <ul className="divide-y divide-[var(--border-base,theme(colors.gray.200))] border border-base rounded-xl">
        {data.modules.map((row) => {
          const info = MODULE_INFO[row.module]
          const isOwnProposal = !!row.pending && row.pending.proposedByUid === myUid
          return (
            <li key={row.module} className="p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <h3 className="font-heading font-semibold text-sm text-body">{info.label}</h3>
                    <StatusText tone={row.enabled ? 'success' : 'neutral'}>{row.enabled ? 'New version on' : 'Current version'}</StatusText>
                  </div>
                  <p className="text-xs text-muted mt-1 max-w-xl">{info.scope}</p>
                  <p className="text-xs text-muted mt-1">
                    {row.lastChangedAt
                      ? `Last changed ${when(row.lastChangedAt)}${row.lastChangedByName ? ` by ${row.lastChangedByName}` : ''}`
                      : 'Never changed'}
                  </p>
                </div>

                {canPropose && !row.pending && proposing !== row.module && (
                  <button
                    type="button"
                    className={btnQuiet}
                    onClick={() => { setProposing(row.module); setReason(''); setActionError(null) }}
                  >
                    {row.enabled ? 'Propose switching off' : 'Propose switching on'}
                  </button>
                )}
              </div>

              {row.pending && (
                <div className="border border-base rounded-xl p-3 space-y-2 bg-page">
                  <div className="flex items-center gap-3">
                    <StatusText tone="warning">Waiting for approval</StatusText>
                    <span className="text-sm text-body">
                      Switch {row.pending.enabled ? 'on' : 'off'}
                    </span>
                  </div>
                  <p className="text-xs text-muted">
                    Proposed {when(row.pending.proposedAt)}
                    {row.pending.proposedByName ? ` by ${row.pending.proposedByName}` : ''}. Reason: {row.pending.reason}
                  </p>
                  {canDecide && isOwnProposal && (
                    <p className="text-xs text-muted">You proposed this change, so another approver must decide it.</p>
                  )}
                  {canDecide && !isOwnProposal && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button type="button" className={btnPrimary} disabled={decide.isPending} onClick={() => setApproving(row)}>
                        Approve
                      </button>
                      <button
                        type="button"
                        className={btnQuiet}
                        disabled={decide.isPending}
                        onClick={() => decide.mutate({ module: row.module, decision: 'REJECT' })}
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              )}

              {canPropose && proposing === row.module && (
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    propose.mutate({ module: row.module, enabled: !row.enabled, reason: reason.trim() })
                  }}
                >
                  <label className="block text-xs font-heading font-semibold text-muted" htmlFor={`reason-${row.module}`}>
                    Why switch {row.enabled ? 'off' : 'on'} {info.label.toLowerCase()}?
                  </label>
                  <textarea
                    id={`reason-${row.module}`}
                    className={inputCls}
                    rows={2}
                    maxLength={500}
                    required
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" className={btnPrimary} disabled={propose.isPending || reason.trim().length === 0}>
                      {propose.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : 'Send for approval'}
                    </button>
                    <button type="button" className={btnQuiet} disabled={propose.isPending} onClick={() => setProposing(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </li>
          )
        })}
      </ul>

      <ConfirmDialog
        open={approving !== null}
        title={approving ? `Switch ${MODULE_INFO[approving.module].label.toLowerCase()} ${approving.pending?.enabled ? 'on' : 'off'}?` : ''}
        description={
          approving?.pending?.enabled
            ? 'This module will start using its new version straight away. Entries already created stay valid.'
            : 'This module will go back to its current version. Entries already created under the new version stay valid.'
        }
        confirmLabel="Approve"
        confirming={decide.isPending}
        onConfirm={() => approving && decide.mutate({ module: approving.module, decision: 'APPROVE' })}
        onCancel={() => setApproving(null)}
      />
    </div>
  )
}
