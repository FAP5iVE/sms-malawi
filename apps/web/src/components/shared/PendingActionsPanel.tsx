'use client'

import { useState, useCallback } from 'react'
import { formatDistanceToNow, format } from 'date-fns'
import {
  usePendingActions,
  usePendingActionCounts,
  useApprovePendingAction,
  useRejectPendingAction,
  useCancelPendingAction,
  type PendingActionRow,
} from '@/hooks/usePendingActions'
import { usePermissions }            from '@/hooks/usePermissions'
import { useAuthStore }              from '@/store/authStore'
import { Button }                    from '@/components/ui/button'
import { Badge }                     from '@/components/ui/badge'
import { Skeleton }                  from '@/components/ui/skeleton'
import { Textarea }                  from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  ShieldOff,
  FileText,
} from 'lucide-react'
import type { PendingActionStatus } from '@prisma/client'
import { PENDING_ACTION_LABELS, PENDING_ACTION_STATUS_CONFIG, type PendingActionIconName } from '@shared/constants/pendingActions'

const STATUS_ICONS: Record<PendingActionIconName, React.ElementType> = {
  clock: Clock,
  check: CheckCircle2,
  x: XCircle,
  alert: AlertTriangle,
}

// ─────────────────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────────────────



// ─────────────────────────────────────────────────────────
//  REVIEW DIALOG
// ─────────────────────────────────────────────────────────

interface ReviewDialogProps {
  action:    PendingActionRow | null
  mode:      'approve' | 'reject' | null
  onClose:   () => void
  onConfirm: (notes: string) => void
  isPending: boolean
}

function ReviewDialog({ action, mode, onClose, onConfirm, isPending }: ReviewDialogProps) {
  const [notes, setNotes] = useState('')

  if (!action || !mode) return null

  const isApprove    = mode === 'approve'
  const actionLabel  = PENDING_ACTION_LABELS[action.action] ?? action.action
  const title        = isApprove ? 'Approve Action' : 'Reject Action'
  const description  = isApprove
    ? `Confirm you want to approve "${actionLabel}" for ${action.entityType} ${action.entityId}. This will immediately apply the requested change.`
    : `Confirm you want to reject "${actionLabel}". The change will not be applied and the requester will be notified.`

  return (
    <Dialog open={Boolean(action && mode)} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isApprove
              ? <CheckCircle2 className="w-5 h-5 text-green-600" />
              : <XCircle      className="w-5 h-5 text-red-600"   />
            }
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="rounded-md bg-muted/40 border p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Action</span>
              <span className="font-medium">{actionLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Entity</span>
              <span className="font-medium font-mono text-xs">{action.entityType} / {action.entityId.slice(0, 12)}…</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Requested by</span>
              <span className="font-medium font-mono text-xs">{action.requestedByRole}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              {isApprove ? 'Notes (optional)' : 'Reason for rejection'}
              {!isApprove && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isApprove ? 'Add approval notes…' : 'Explain why this action is being rejected…'}
              rows={3}
              className="resize-none text-sm"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant={isApprove ? 'default' : 'destructive'}
            onClick={() => onConfirm(notes)}
            disabled={isPending || (!isApprove && !notes.trim())}
            className={isApprove ? 'bg-green-600 hover:bg-green-700 text-white' : ''}
          >
            {isPending
              ? (isApprove ? 'Approving…' : 'Rejecting…')
              : (isApprove ? 'Approve'    : 'Reject')
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────
//  TARGET STATE VIEWER
// ─────────────────────────────────────────────────────────

function TargetStateViewer({ targetState }: { targetState: Record<string, unknown> | null }) {
  const [open, setOpen] = useState(false)

  if (!targetState || Object.keys(targetState).length === 0) return null

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <FileText className="w-3 h-3" />
        View change payload
      </button>
      {open && (
        <pre className="mt-2 text-xs bg-muted/40 rounded p-2.5 overflow-x-auto max-h-36 leading-relaxed">
          {JSON.stringify(targetState, null, 2)}
        </pre>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
//  SINGLE ACTION CARD
// ─────────────────────────────────────────────────────────

interface ActionCardProps {
  action:     PendingActionRow
  isReviewer: boolean
  currentUid: string
  onApprove:  (action: PendingActionRow) => void
  onReject:   (action: PendingActionRow) => void
  onCancel:   (id: string)              => void
  isCancelling: boolean
}

function ActionCard({
  action,
  isReviewer,
  currentUid,
  onApprove,
  onReject,
  onCancel,
  isCancelling,
}: ActionCardProps) {
  const cfg         = PENDING_ACTION_STATUS_CONFIG[action.status]
  const StatusIcon  = STATUS_ICONS[cfg.icon]
  const actionLabel = PENDING_ACTION_LABELS[action.action] ?? action.action
  const isOwn       = action.requestedByUid === currentUid
  const isPending   = action.status === 'PENDING'
  const isExpired   = action.status === 'EXPIRED'

  return (
    <div className={`rounded-lg border bg-card transition-colors ${
      isPending
        ? 'border-amber-200 dark:border-amber-800/50'
        : isExpired
          ? 'opacity-60 border-dashed'
          : 'opacity-80'
    }`}>
      {/* ── Header */}
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="flex items-start gap-3 min-w-0">
          <StatusIcon className={`w-4 h-4 mt-0.5 shrink-0 ${
            action.status === 'PENDING'
              ? 'text-amber-500'
              : action.status === 'APPROVED'
                ? 'text-green-500'
                : action.status === 'REJECTED'
                  ? 'text-red-500'
                  : 'text-muted-foreground'
          }`} />

          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground leading-snug truncate">
              {actionLabel}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {action.description}
            </p>
          </div>
        </div>

        <Badge variant="outline" className={`text-[10px] font-semibold shrink-0 ${cfg.badgeClass}`}>
          {cfg.label}
        </Badge>
      </div>

      {/* ── Meta */}
      <div className="px-4 pb-3 space-y-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            <span className="font-medium">Entity:</span>{' '}
            <span className="font-mono">{action.entityType} / {action.entityId.slice(0, 10)}…</span>
          </span>
          <span>
            <span className="font-medium">By:</span>{' '}
            <Badge variant="secondary" className="text-[10px] font-normal py-0">
              {action.requestedByRole}
            </Badge>
          </span>
          <span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-default underline decoration-dotted">
                  {formatDistanceToNow(new Date(action.createdAt), { addSuffix: true })}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {format(new Date(action.createdAt), 'dd MMM yyyy, HH:mm:ss')}
              </TooltipContent>
            </Tooltip>
          </span>
          {action.expiresAt && isPending && (
            <span className="text-amber-600 font-medium">
              Expires {formatDistanceToNow(new Date(action.expiresAt), { addSuffix: true })}
            </span>
          )}
        </div>

        {/* Target state diff */}
        <TargetStateViewer targetState={action.targetState} />

        {/* Review notes */}
        {action.reviewNotes && (
          <div className="text-xs text-muted-foreground italic bg-muted/30 rounded px-3 py-1.5">
            {action.status === 'REJECTED' ? '❌ ' : '✓ '}
            {action.reviewNotes}
          </div>
        )}

        {/* ── Action buttons */}
        {isPending && (
          <div className="flex items-center gap-2 pt-1">
            {isReviewer && (
              <>
                <Button
                  size="sm"
                  className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white gap-1"
                  onClick={() => onApprove(action)}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 text-xs gap-1"
                  onClick={() => onReject(action)}
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Reject
                </Button>
              </>
            )}
            {(isOwn || isReviewer) && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onCancel(action.id)}
                disabled={isCancelling}
              >
                Cancel
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
//  SKELETON
// ─────────────────────────────────────────────────────────

function PendingActionsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-lg" />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
//  EMPTY STATE
// ─────────────────────────────────────────────────────────

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-36 border rounded-lg bg-muted/20 text-muted-foreground gap-2">
      <CheckCircle2 className="w-8 h-8 opacity-30" />
      <p className="text-sm">{label}</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
//  MAIN COMPONENT
// ─────────────────────────────────────────────────────────

interface PendingActionsPanelProps {
  /**
   * When true, shows a compact panel suitable for the dashboard.
   * Only PENDING actions are shown, no tabs.
   */
  compact?: boolean
  /** Optional entity type filter — locks the panel to a specific domain. */
  entityType?: string
  /** Title override */
  title?: string
  /** Maximum actions to show in compact mode. Default: 5 */
  compactLimit?: number
}

export function PendingActionsPanel({
  compact      = false,
  entityType,
  title        = 'Pending Approvals',
  compactLimit = 5,
}: PendingActionsPanelProps) {
  const { user, role, initialized } = useAuthStore()
  const { can }                     = usePermissions()

  const canReview  = can('student.approvePendingAction') || can('class.approvePendingAction')
  const canAccess  = canReview || role === 'lower_rank' || role === 'academic'

  const [activeTab,     setActiveTab]     = useState<'pending' | 'all'>('pending')
  const [reviewTarget,  setReviewTarget]  = useState<PendingActionRow | null>(null)
  const [reviewMode,    setReviewMode]    = useState<'approve' | 'reject' | null>(null)
  const [page,          setPage]          = useState(1)

  const statusFilter = compact
    ? 'PENDING'
    : activeTab === 'pending'
      ? 'PENDING'
      : 'ALL'

  const { data, isLoading, isError, refetch, isFetching } = usePendingActions({
    status:     statusFilter as 'PENDING' | 'ALL',
    entityType: entityType,
    page,
    pageSize:   compact ? compactLimit : 25,
  })

  const { data: counts } = usePendingActionCounts()

  const approveAction  = useApprovePendingAction()
  const rejectAction   = useRejectPendingAction()
  const cancelAction   = useCancelPendingAction()

  const openApprove = useCallback((action: PendingActionRow) => {
    setReviewTarget(action)
    setReviewMode('approve')
  }, [])

  const openReject  = useCallback((action: PendingActionRow) => {
    setReviewTarget(action)
    setReviewMode('reject')
  }, [])

  const closeReview = useCallback(() => {
    setReviewTarget(null)
    setReviewMode(null)
  }, [])

  const handleConfirmReview = useCallback(
    (notes: string) => {
      if (!reviewTarget || !reviewMode) return

      const mutate = reviewMode === 'approve'
        ? approveAction.mutate
        : rejectAction.mutate

      mutate(
        { id: reviewTarget.id, notes: notes || undefined },
        { onSuccess: closeReview, onError: closeReview }
      )
    },
    [reviewTarget, reviewMode, approveAction, rejectAction, closeReview]
  )

  // ── Access denied
  if (initialized && !canAccess) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
        <ShieldOff className="w-8 h-8 opacity-30" />
        <p className="text-sm">You do not have access to pending actions.</p>
      </div>
    )
  }

  const actions        = data?.actions ?? []
  const pendingCount   = counts?.pending ?? data?.pendingCount ?? 0
  const isReviewerUser = canReview
  const currentUid     = user?.uid ?? ''

  // ─────────────────────────────────────────────────────
  //  COMPACT MODE
  // ─────────────────────────────────────────────────────

  if (compact) {
    return (
      <>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="font-heading text-sm font-semibold text-foreground">{title}</h3>
              {pendingCount > 0 && (
                <Badge variant="outline" className="text-[10px] font-bold bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400">
                  {pendingCount}
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : isError ? (
            <div className="text-xs text-muted-foreground text-center py-4">
              Failed to load. <button onClick={() => void refetch()} className="underline">Retry</button>
            </div>
          ) : actions.length === 0 ? (
            <div className="flex items-center justify-center h-20 border rounded-lg bg-muted/20 text-muted-foreground">
              <p className="text-xs">No pending approvals</p>
            </div>
          ) : (
            <div className="space-y-2">
              {actions.map((action) => (
                <ActionCard
                  key={action.id}
                  action={action}
                  isReviewer={isReviewerUser}
                  currentUid={currentUid}
                  onApprove={openApprove}
                  onReject={openReject}
                  onCancel={(id) => cancelAction.mutate(id)}
                  isCancelling={cancelAction.isPending}
                />
              ))}
              {pendingCount > compactLimit && (
                <p className="text-xs text-muted-foreground text-center py-1">
                  +{pendingCount - compactLimit} more pending — view all in{' '}
                  <a href="/user-management" className="underline hover:text-foreground">User Management</a>
                </p>
              )}
            </div>
          )}
        </div>

        <ReviewDialog
          action={reviewTarget}
          mode={reviewMode}
          onClose={closeReview}
          onConfirm={handleConfirmReview}
          isPending={approveAction.isPending || rejectAction.isPending}
        />
      </>
    )
  }

  // ─────────────────────────────────────────────────────
  //  FULL MODE
  // ─────────────────────────────────────────────────────

  return (
    <>
      <div className="space-y-4">

        {/* ── Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h2 className="font-heading text-lg font-semibold text-foreground">{title}</h2>
            {pendingCount > 0 && (
              <Badge variant="outline" className="font-bold bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400">
                {pendingCount} pending
              </Badge>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* ── Status summary */}
        {counts && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {(
              [
                { key: 'pending',   label: 'Pending',   color: 'text-amber-600' },
                { key: 'approved',  label: 'Approved',  color: 'text-green-600' },
                { key: 'rejected',  label: 'Rejected',  color: 'text-red-600'   },
                { key: 'cancelled', label: 'Cancelled', color: 'text-muted-foreground' },
                { key: 'expired',   label: 'Expired',   color: 'text-muted-foreground' },
              ] as const
            ).map(({ key, label, color }) => (
              <div key={key} className="bg-muted/30 rounded-lg p-3 text-center border">
                <p className={`text-lg font-bold tabular-nums ${color}`}>{counts[key]}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as 'pending' | 'all'); setPage(1) }}>
          <TabsList className="h-9">
            <TabsTrigger value="pending" className="text-xs gap-1.5">
              Pending
              {pendingCount > 0 && (
                <Badge variant="secondary" className="h-4 text-[10px] px-1.5">{pendingCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="all" className="text-xs">All Actions</TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-4">
            {isLoading ? (
              <PendingActionsSkeleton />
            ) : isError ? (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
                <p className="text-sm">Failed to load pending actions.</p>
                <Button size="sm" variant="outline" onClick={() => void refetch()}>Retry</Button>
              </div>
            ) : actions.length === 0 ? (
              <EmptyState label="No pending actions — everything is up to date." />
            ) : (
              <div className="space-y-3">
                {actions.map((action) => (
                  <ActionCard
                    key={action.id}
                    action={action}
                    isReviewer={isReviewerUser}
                    currentUid={currentUid}
                    onApprove={openApprove}
                    onReject={openReject}
                    onCancel={(id) => cancelAction.mutate(id)}
                    isCancelling={cancelAction.isPending}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="all" className="mt-4">
            {isLoading ? (
              <PendingActionsSkeleton />
            ) : isError ? (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
                <p className="text-sm">Failed to load actions.</p>
                <Button size="sm" variant="outline" onClick={() => void refetch()}>Retry</Button>
              </div>
            ) : actions.length === 0 ? (
              <EmptyState label="No actions found." />
            ) : (
              <>
                <div className="space-y-3">
                  {actions.map((action) => (
                    <ActionCard
                      key={action.id}
                      action={action}
                      isReviewer={isReviewerUser}
                      currentUid={currentUid}
                      onApprove={openApprove}
                      onReject={openReject}
                      onCancel={(id) => cancelAction.mutate(id)}
                      isCancelling={cancelAction.isPending}
                    />
                  ))}
                </div>

                {data && data.pages > 1 && (
                  <div className="flex items-center justify-between pt-4 text-sm">
                    <p className="text-muted-foreground">
                      Page {data.page} of {data.pages} &bull; {data.total.toLocaleString()} total
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline" size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={data.page <= 1 || isFetching}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline" size="sm"
                        onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                        disabled={data.page >= data.pages || isFetching}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <ReviewDialog
        action={reviewTarget}
        mode={reviewMode}
        onClose={closeReview}
        onConfirm={handleConfirmReview}
        isPending={approveAction.isPending || rejectAction.isPending}
      />
    </>
  )
}