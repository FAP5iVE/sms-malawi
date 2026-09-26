'use client'

/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/approvals/ApprovalsCenter.tsx
 * [PURPOSE]: The body of the /approvals page. One inbox for every request
 *   that needs — or needed — a decision, across all modules.
 *
 *   Layout matches the other module pages: status tabs (Pending / Approved /
 *   Rejected / Cancelled / Expired, with counts) inside a ModuleSurface, then
 *   a compact toolbar (scope, search, module, dates, sort), then the list.
 *
 *   Two views of the same data, chosen with the scope switch:
 *     • Needs my review — requests in modules the viewer can decide on
 *     • My requests     — what the viewer has submitted, and where it stands
 *   (Everything = both.) Reviewers can act inline, in bulk, or from the
 *   detail dialog; requesters can track status and withdraw where supported.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Inbox, Loader2, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react'
import { toast } from 'sonner'
import { ModuleSurface } from '@/components/shared/ModuleSurface'
import { ModuleTabs } from '@/components/shared/ModuleTabs'
import {
  useApprovalDecision, useApprovalList, useApprovalSummary, useBulkApprovalDecision,
} from '@/hooks/useApprovals'
import {
  APPROVAL_MODULES,
  APPROVAL_MODULE_LABELS,
  APPROVAL_STATUSES,
  APPROVAL_STATUS_CONFIG,
  type ApprovalAction,
  type ApprovalItem,
  type ApprovalModule,
  type ApprovalScope,
  type ApprovalSort,
  type ApprovalStatus,
} from '@shared/constants/approvals'
import { ApprovalCard } from './ApprovalCard'
import { ApprovalDecisionDialog, type DecisionTarget } from './ApprovalDecisionDialog'
import { ApprovalDetailDialog } from './ApprovalDetailDialog'
import { ACTION_BUTTON_CLASS } from './approvalDisplay'

const PAGE_SIZE = 15

interface Filters {
  scope: ApprovalScope
  status: ApprovalStatus
  module: ApprovalModule | ''
  search: string
  from: string
  to: string
  sort: ApprovalSort
  page: number
}

const INITIAL: Filters = {
  scope: 'all', status: 'PENDING', module: '', search: '', from: '', to: '', sort: 'newest', page: 1,
}

const DONE_TEXT: Record<ApprovalAction, string> = {
  approve: 'Approved',
  reject: 'Rejected',
  return: 'Returned to the requester',
  cancel: 'Request withdrawn',
}

const FIELD = 'min-h-[44px] rounded-xl border border-base bg-page px-3 text-sm text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25'

function isActionable(item: ApprovalItem): boolean {
  const c = item.capabilities
  return item.status === 'PENDING' && (c.canApprove || c.canReject || c.canReturn)
}

export function ApprovalsCenter() {
  const [filters, setFilters] = useState<Filters>(INITIAL)
  const [searchInput, setSearchInput] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [target, setTarget] = useState<DecisionTarget | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [detail, setDetail] = useState<ApprovalItem | null>(null)
  const [report, setReport] = useState<{ succeeded: number; failures: { title: string; error: string }[] } | null>(null)

  const update = useCallback((patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, page: 1, ...patch }))
    setSelected(new Set())
  }, [])

  // Debounce the search box so we don't query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.search === searchInput.trim() ? f : { ...f, search: searchInput.trim(), page: 1 }))
      setSelected(new Set())
    }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  const summaryQuery = useApprovalSummary(filters.scope)
  const listQuery = useApprovalList({
    scope: filters.scope,
    status: filters.status,
    ...(filters.module ? { module: filters.module } : {}),
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
    sort: filters.sort,
    page: filters.page,
    pageSize: PAGE_SIZE,
  })
  const decision = useApprovalDecision()
  const bulk = useBulkApprovalDecision()

  const summary = summaryQuery.data
  const items = listQuery.data?.items ?? []
  const warnings = [...(listQuery.data?.warnings ?? []), ...(summary?.warnings ?? [])]
  const uniqueWarnings = Array.from(new Set(warnings))
  const busy = decision.isPending || bulk.isPending

  const tabs = useMemo(
    () =>
      APPROVAL_STATUSES.map((s) => {
        const n = summary?.byStatus[s] ?? 0
        const base = APPROVAL_STATUS_CONFIG[s].label
        return {
          id: s,
          label: s !== 'PENDING' && n > 0 ? `${base} (${n})` : base,
          ...(s === 'PENDING' && n > 0 ? { badge: n } : {}),
        }
      }),
    [summary],
  )

  const selectableKeys = items.filter(isActionable).map((i) => i.key)
  const allSelected = selectableKeys.length > 0 && selectableKeys.every((k) => selected.has(k))
  const selectedItems = items.filter((i) => selected.has(i.key))
  const filtersActive = Boolean(filters.module || filters.search || filters.from || filters.to)
  const advancedActive = Boolean(filters.from || filters.to || filters.sort !== 'newest')

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const openDecision = (list: ApprovalItem[], action: ApprovalAction) => {
    if (list.length === 0) return
    setDialogError(null)
    setTarget({ items: list, action })
  }

  const runBulk = (action: 'approve' | 'reject') => {
    const eligible = selectedItems.filter((i) => (action === 'approve' ? i.capabilities.canApprove : i.capabilities.canReject))
    if (eligible.length === 0) {
      toast.error(`None of the selected requests can be ${action === 'approve' ? 'approved' : 'rejected'} by you.`)
      return
    }
    if (eligible.length < selectedItems.length) {
      toast.info(`${selectedItems.length - eligible.length} selected request(s) will be skipped — you can't ${action} them.`)
    }
    openDecision(eligible, action)
  }

  const confirm = async ({ notes, paidImmediately }: { notes: string; paidImmediately: boolean }) => {
    if (!target) return
    setDialogError(null)
    const { items: list, action } = target
    const first = list[0]
    const withExpense = action === 'approve' && list.some((i) => i.source === 'expense')
    try {
      if (list.length === 1 && first) {
        await decision.mutateAsync({
          source: first.source,
          sourceId: first.sourceId,
          action,
          ...(notes ? { notes } : {}),
          ...(withExpense ? { paidImmediately } : {}),
        })
        toast.success(DONE_TEXT[action])
      } else if (action !== 'cancel') {
        const result = await bulk.mutateAsync({
          action,
          items: list.map((i) => ({ source: i.source, sourceId: i.sourceId })),
          ...(notes ? { notes } : {}),
          ...(withExpense ? { paidImmediately } : {}),
        })
        const titleByKey = new Map(list.map((i) => [i.key, i.title]))
        const failures = result.results
          .filter((r) => !r.ok)
          .map((r) => ({ title: titleByKey.get(r.key) ?? r.key, error: r.error ?? 'Could not complete this request.' }))
        setReport({ succeeded: result.succeeded, failures })
        if (result.succeeded > 0) toast.success(`${result.succeeded} request${result.succeeded === 1 ? '' : 's'} ${action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'returned'}`)
        if (result.failed > 0) toast.error(`${result.failed} could not be completed`)
      }
      setTarget(null)
      setDetail(null)
      setSelected(new Set())
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  }

  const refresh = () => {
    void listQuery.refetch()
    void summaryQuery.refetch()
  }

  const emptyMessage = (() => {
    if (filtersActive) return 'No requests match these filters.'
    if (filters.status === 'PENDING') {
      if (filters.scope === 'review') return 'Nothing is waiting for your review. New requests will appear here.'
      if (filters.scope === 'mine') return 'You have no requests waiting for a decision.'
      return 'No pending approvals — everything is up to date.'
    }
    return `No ${APPROVAL_STATUS_CONFIG[filters.status].label.toLowerCase()} requests yet.`
  })()

  const scopes: { id: ApprovalScope; label: string }[] = [
    { id: 'all', label: 'Everything' },
    { id: 'review', label: 'Needs my review' },
    { id: 'mine', label: 'My requests' },
  ]

  return (
    <ModuleSurface>
      <ModuleTabs
        id="approvals-status-tabs"
        variant="underline"
        tabs={tabs}
        active={filters.status}
        onChange={(status) => update({ status })}
      />

      {/* ── Toolbar ─────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          {summary?.canReview ? (
            <div role="group" aria-label="Which requests to show" className="flex flex-col gap-1">
              {scopes.map((s) => {
                const active = filters.scope === s.id
                return (
                  <label
                    key={s.id}
                    className={`flex min-h-[36px] cursor-pointer items-center gap-2 text-sm transition-colors ${
                      active ? 'font-semibold text-brand-teal' : 'text-muted hover:text-body'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => update({ scope: s.id })}
                      aria-label={s.label}
                      className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--brand-teal,#0d9488)]"
                    />
                    <span>{s.label}</span>
                  </label>
                )
              })}
            </div>
          ) : null}

          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center lg:justify-end">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <label htmlFor="approvals-search" className="sr-only">Search requests</label>
              <input
                id="approvals-search"
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search requests…"
                className={`${FIELD} w-full pl-9 pr-3 placeholder:text-muted`}
              />
            </div>

            <label htmlFor="approvals-module" className="sr-only">Module</label>
            <select
              id="approvals-module"
              value={filters.module}
              onChange={(e) => update({ module: e.target.value as ApprovalModule | '' })}
              className={`${FIELD} w-full sm:w-48`}
            >
              <option value="">All modules</option>
              {APPROVAL_MODULES.map((m) => {
                const n = summary?.pendingByModule[m] ?? 0
                return (
                  <option key={m} value={m}>
                    {APPROVAL_MODULE_LABELS[m]}{n > 0 ? ` (${n} pending)` : ''}
                  </option>
                )
              })}
            </select>

            <button
              type="button"
              aria-expanded={showFilters}
              onClick={() => setShowFilters((v) => !v)}
              className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-3.5 text-sm font-semibold ${
                advancedActive ? 'border-brand-teal text-brand-teal' : 'border-base text-muted hover:text-body'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Filters
            </button>

            <button
              type="button"
              onClick={refresh}
              disabled={listQuery.isFetching}
              aria-label="Refresh"
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-base px-3.5 text-sm font-semibold text-body hover:bg-page disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${listQuery.isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {showFilters ? (
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-base bg-page p-3 sm:grid-cols-3">
            <div>
              <label htmlFor="approvals-from" className="mb-1 block text-xs font-semibold text-muted">Submitted from</label>
              <input id="approvals-from" type="date" value={filters.from} max={filters.to || undefined}
                onChange={(e) => update({ from: e.target.value })} className={`${FIELD} w-full`} />
            </div>
            <div>
              <label htmlFor="approvals-to" className="mb-1 block text-xs font-semibold text-muted">Submitted to</label>
              <input id="approvals-to" type="date" value={filters.to} min={filters.from || undefined}
                onChange={(e) => update({ to: e.target.value })} className={`${FIELD} w-full`} />
            </div>
            <div>
              <label htmlFor="approvals-sort" className="mb-1 block text-xs font-semibold text-muted">Order</label>
              <select id="approvals-sort" value={filters.sort}
                onChange={(e) => update({ sort: e.target.value as ApprovalSort })} className={`${FIELD} w-full`}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first (longest waiting)</option>
              </select>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Notices ─────────────────────────────────────── */}
      {uniqueWarnings.length > 0 ? (
        <p role="status" className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Some requests couldn’t be loaded right now ({uniqueWarnings.join(', ')}). Everything else is shown — try Refresh in a moment.
        </p>
      ) : null}

      {report && report.failures.length > 0 ? (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold">
              {report.succeeded} done, {report.failures.length} could not be completed:
            </p>
            <button type="button" onClick={() => setReport(null)} aria-label="Dismiss" className="shrink-0 rounded p-1 hover:bg-red-500/10">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {report.failures.map((f) => (
              <li key={`${f.title}-${f.error}`}><span className="font-medium">{f.title}</span> — {f.error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ── Bulk bar ────────────────────────────────────── */}
      {selectableKeys.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-base bg-page px-3 py-2">
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm font-medium text-body">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => setSelected(allSelected ? new Set() : new Set(selectableKeys))}
              className="h-5 w-5 accent-[var(--brand-teal,#0d9488)]"
            />
            {selected.size > 0 ? `${selected.size} selected` : 'Select all on this page'}
          </label>
          {selected.size > 0 ? (
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => runBulk('approve')}
                className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold ${ACTION_BUTTON_CLASS.approve}`}>
                <Check className="h-4 w-4" aria-hidden="true" /> Approve selected
              </button>
              <button type="button" onClick={() => runBulk('reject')}
                className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold ${ACTION_BUTTON_CLASS.reject}`}>
                <X className="h-4 w-4" aria-hidden="true" /> Reject selected
              </button>
              <button type="button" onClick={() => setSelected(new Set())}
                className="min-h-[44px] rounded-xl px-3 text-sm font-semibold text-muted hover:text-body">
                Clear
              </button>
            </span>
          ) : null}
        </div>
      ) : null}

      {/* ── List ────────────────────────────────────────── */}
      {listQuery.isLoading ? (
        <div className="space-y-3" role="status" aria-label="Loading requests">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-28 w-full rounded-xl" />)}
        </div>
      ) : listQuery.isError ? (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-10 text-center">
          <AlertTriangle className="h-8 w-8 text-red-500" aria-hidden="true" />
          <p className="font-semibold text-body">We couldn’t load your approvals.</p>
          <p className="text-sm text-muted">{listQuery.error instanceof Error ? listQuery.error.message : 'Please try again.'}</p>
          <button type="button" onClick={refresh}
            className="inline-flex min-h-[44px] items-center rounded-xl bg-brand-teal px-4 text-sm font-semibold text-white">
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-base px-4 py-14 text-center">
          <Inbox className="h-9 w-9 text-muted opacity-60" aria-hidden="true" />
          <p className="text-sm text-muted">{emptyMessage}</p>
        </div>
      ) : (
        <div className={`space-y-3 transition-opacity ${listQuery.isFetching ? 'opacity-70' : ''}`}>
          {items.map((item) => (
            <ApprovalCard
              key={item.key}
              item={item}
              selectable={isActionable(item)}
              selected={selected.has(item.key)}
              onToggleSelect={toggle}
              onOpen={setDetail}
              onAction={(it, action) => openDecision([it], action)}
            />
          ))}
        </div>
      )}

      {/* ── Pagination ──────────────────────────────────── */}
      {(filters.page > 1 || listQuery.data?.hasMore) ? (
        <div className="flex items-center justify-between gap-3 pt-1">
          <button type="button" disabled={filters.page <= 1 || listQuery.isFetching}
            onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-base px-3.5 text-sm font-semibold text-body hover:bg-page disabled:opacity-40">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
          </button>
          <span className="flex items-center gap-2 text-sm text-muted">
            {listQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Page {filters.page}
          </span>
          <button type="button" disabled={!listQuery.data?.hasMore || listQuery.isFetching}
            onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-base px-3.5 text-sm font-semibold text-body hover:bg-page disabled:opacity-40">
            Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <ApprovalDetailDialog
        item={detail}
        onClose={() => setDetail(null)}
        onAction={(it, action) => openDecision([it], action)}
      />

      <ApprovalDecisionDialog
        key={target ? `${target.action}:${target.items.map((i) => i.key).join(',')}` : 'closed'}
        target={target}
        busy={busy}
        error={dialogError}
        onClose={() => setTarget(null)}
        onConfirm={(v) => void confirm(v)}
      />
    </ModuleSurface>
  )
}