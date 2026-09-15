/*
 * [CHANGE TYPE]: UI REORGANIZATION ONLY (no route, permission, schema, or
 *   query-shape changes — see the R13 header below for the workflow this
 *   preserves untouched)
 * [PURPOSE]: Restructured the page from one flat Published/Pending
 *   Approval/Drafts tab strip (mixing all four post types together) into
 *   content-type tabs — Announcements / News / Events / Advertisements —
 *   each an independent view that owns its own "New …" create action and
 *   its own Published/Pending Approval/Drafts status tabs + search box,
 *   matching the shared ModuleTabs component already used for this exact
 *   underline-primary/pill-secondary tab pattern elsewhere (Finance, HR,
 *   Library, Monitoring). The four create buttons that used to sit in one
 *   row in the page header now live inside their matching type tab.
 *
 *   All data still comes from the same three hooks below, fetching the
 *   same routes with the same permission gates (GET /announcements, GET
 *   /announcements/pending behind announcement.approvePublish, GET
 *   /announcements/drafts behind announcement.create/createWithApproval) —
 *   splitting by content type and by the search box is done client-side
 *   over the data those hooks already return, exactly as
 *   PendingApprovalList/DraftsList already only mount when the caller
 *   holds the matching permission (unchanged from before this edit).
 * [DEPENDS ON]: apps/web/src/components/shared/ModuleTabs.tsx (unchanged)
 */
/*
 * apps/web/src/app/(auth)/announcements/page.tsx
 *
 * [CHANGE TYPE]: MAJOR REWRITE (canCreate gate and list-query scope; the
 *   page's overall layout is otherwise unaffected)
 * [R-PHASE]: R13 — Announcements, Timetable & Calendar Domain
 * [PURPOSE]:
 *   1. canCreate: was `role !== 'student'` (excluding student, who
 *      formally holds announcement.createWithApproval, while wrongly
 *      including admin, who holds none of announcement.create/
 *      createWithApproval/publishDirect). Now `role !== 'admin'`,
 *      matching the real permission matrix — every other role holds at
 *      least one of announcement.create/createWithApproval.
 *   2. Added a "Pending Approval" tab for admin/high_rank/academic (the
 *      three roles holding announcement.approvePublish) — previously no
 *      approver had any UI surface to discover what was awaiting their
 *      action, independent of and in addition to the collection-name bug
 *      AnnouncementForm.tsx's fix (same phase) addresses. Approve calls
 *      the new PATCH /announcements/:id/approve route (this phase) via
 *      the R1-consolidated apiFetch.
 * [DEPENDS ON]: apps/web/src/hooks/useAnnouncements.ts
 *   (usePendingAnnouncements — same phase), apps/web/src/lib/api-client.ts
 *   (apiFetch), apps/web/src/hooks/usePermissions.ts
 */
'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAnnouncements, usePendingAnnouncements, useMyDrafts, type Announcement } from '@/hooks/useAnnouncements'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { AnnouncementForm } from '@/components/announcements/AnnouncementForm'
import { usePermissions } from '@/hooks/usePermissions'
import { useAuthStore } from '@/store/authStore'
import { apiFetch, queryKeys } from '@/lib/api-client'
import { ModuleTabs } from '@/components/shared/ModuleTabs'
import type { TabItem } from '@/components/shared/ModuleTabs'
import { Bell, PlusCircle, Megaphone, Check, Loader2, CalendarDays, X, Trash2, Newspaper, Landmark, FileEdit, PencilLine, Search } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default function AnnouncementsPage() {
  return (
    <RoleGuard
      allowed={[
        'admin',
        'high_rank',
        'finance',
        'library',
        'lower_rank',
        'academic',
        'hr',
        'exam_officer',
        'student',
      ]}
    >
      <AnnouncementsContent />
    </RoleGuard>
  )
}

/** Simple client-side title/body substring match — the search box next to
 *  each type tab's status tabs. None of the three list routes take a
 *  `search` query param today, so this filters the already-fetched page
 *  data rather than adding one. */
function matchesSearch(item: { title: string; body: string }, search: string): boolean {
  const q = search.trim().toLowerCase()
  if (!q) return true
  return item.title.toLowerCase().includes(q) || item.body.toLowerCase().includes(q)
}

function PublishedList({ announcements, isLoading, error }: { announcements: ReturnType<typeof useAnnouncements>['announcements']; isLoading: boolean; error?: string | null }) {
  const { can } = usePermissions()
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const canDeleteAny = can('announcement.deleteAny')
  const canDeleteOwn = can('announcement.deleteOwn')

  function canDelete(authorUid: string): boolean {
    return canDeleteAny || (canDeleteOwn && authorUid === user?.uid)
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    setDeleteError(null)
    try {
      await apiFetch(`/announcements/${id}`, { method: 'DELETE' })
      await queryClient.invalidateQueries({ queryKey: queryKeys.announcements.all() })
      setConfirmId(null)
    } catch {
      setDeleteError('Failed to delete announcement. Please try again.')
    } finally {
      setDeletingId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-surface animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-brand-coral">
        <Bell className="w-10 h-10 mb-3 opacity-40" aria-hidden="true" />
        <p className="text-sm">{error}</p>
      </div>
    )
  }

  if (announcements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted">
        <Bell className="w-10 h-10 mb-3 opacity-30" aria-hidden="true" />
        <p className="text-sm">No announcements yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {deleteError && (
        <p role="alert" className="text-xs text-brand-coral">
          {deleteError}
        </p>
      )}
      {announcements.map((a) => (
        <div key={a.id} className="bg-surface border border-base rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-heading font-semibold text-body">{a.title}</h3>
                {a.eventDate && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-heading font-bold px-2 py-0.5 rounded-full bg-brand-navy/10 text-brand-navy">
                    <CalendarDays className="w-3 h-3" aria-hidden />
                    {new Date(a.eventDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted mt-1 leading-relaxed">{a.body}</p>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <span
                className={`text-[10px] font-heading font-bold px-2.5 py-1 rounded-full ${
                  a.status === 'PUBLISHED'
                    ? 'bg-brand-teal/15 text-brand-teal'
                    : a.status === 'PENDING_APPROVAL'
                      ? 'bg-brand-amber/15 text-brand-amber'
                      : 'bg-base text-muted'
                }`}
              >
                {a.status}
              </span>
              {canDelete(a.createdByUid) && (
                <button
                  onClick={() => setConfirmId(confirmId === a.id ? null : a.id)}
                  disabled={deletingId === a.id}
                  aria-label="Delete announcement"
                  className="p-2 rounded-lg text-muted hover:text-brand-coral hover:bg-brand-coral/8 transition-colors disabled:opacity-60 min-h-[40px] min-w-[40px] flex items-center justify-center"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
          {confirmId === a.id && (
            <div className="mt-4 border-t border-base pt-4 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-muted">Delete this announcement permanently?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmId(null)}
                  className="px-4 py-2 text-xs border border-base rounded-xl hover:bg-page min-h-[40px]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(a.id)}
                  disabled={deletingId === a.id}
                  className="flex items-center gap-1.5 bg-brand-coral text-white px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-60 min-h-[40px]"
                >
                  {deletingId === a.id && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                  Delete
                </button>
              </div>
            </div>
          )}
          {a.createdAt && (
            <p className="text-[10px] text-muted mt-3 font-sans">
              {new Date(a.createdAt).toLocaleDateString()}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

/** [UI REORG] Now scoped to the active type tab's postType and search box
 *  (both passed in — filtering happens here, over the same pending list
 *  usePendingAnnouncements() already fetched). `active` controls only the
 *  rendered output, not the hook/fetch, so switching status tabs within a
 *  type — or switching type tabs entirely — never re-triggers a fetch
 *  that's already cached, and the "Pending Approval" tab's badge count
 *  stays correct even while a different status tab is the one showing. */
function PendingApprovalList({
  postType,
  search,
  active,
  onCountChange,
}: {
  postType: Announcement['postType']
  search: string
  active: boolean
  onCountChange?: (count: number) => void
}) {
  const { pending, loading, error: feedError } = usePendingAnnouncements()
  const { can } = usePermissions()
  const queryClient = useQueryClient()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const canReject = can('announcement.reject')

  async function handleApprove(id: string) {
    setBusyId(id)
    setError(null)
    try {
      await apiFetch(`/announcements/${id}/approve`, { method: 'PATCH' })
      await queryClient.invalidateQueries({ queryKey: queryKeys.announcements.all() })
    } catch {
      setError('Failed to approve announcement. Please try again.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleReject(id: string) {
    setBusyId(id)
    setError(null)
    try {
      await apiFetch(`/announcements/${id}/reject`, {
        method: 'PATCH',
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      })
      await queryClient.invalidateQueries({ queryKey: queryKeys.announcements.all() })
      setRejectingId(null)
      setReason('')
    } catch {
      setError('Failed to reject announcement. Please try again.')
    } finally {
      setBusyId(null)
    }
  }

  // Scoped to the type tab currently open. The badge count reports the
  // type-scoped total (not narrowed by the free-text search) so the tab
  // label reads as a stable "how many total", same as the screenshot's
  // Pending Approval (3) — search only narrows what's listed below it.
  const forType = pending.filter((a) => a.postType === postType)
  const filtered = forType.filter((a) => matchesSearch(a, search))

  useEffect(() => {
    onCountChange?.(forType.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forType.length])

  if (!active) return null

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-surface animate-pulse" />
        ))}
      </div>
    )
  }

  // [FE-007] Previously fell through to the empty state below, masking a
  // real fetch/permission failure as "nothing to approve."
  if (feedError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-brand-coral">
        <Check className="w-10 h-10 mb-3 opacity-40" aria-hidden="true" />
        <p className="text-sm">{feedError}</p>
      </div>
    )
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted">
        <Check className="w-10 h-10 mb-3 opacity-30" aria-hidden="true" />
        <p className="text-sm">Nothing awaiting approval.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-xs text-brand-coral">
          {error}
        </p>
      )}
      {filtered.map((a) => (
        <div key={a.id} className="bg-surface border border-base rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="font-heading font-semibold text-body">{a.title}</h3>
              <p className="text-sm text-muted mt-1 leading-relaxed">{a.body}</p>
            </div>
            <div className="shrink-0 flex flex-col gap-2">
              <button
                onClick={() => handleApprove(a.id)}
                disabled={busyId === a.id}
                className="flex items-center justify-center gap-1.5 bg-brand-teal text-white px-3 py-2 rounded-xl text-xs font-heading font-semibold hover:bg-brand-teal-light transition-colors disabled:opacity-60 min-h-[44px]"
              >
                {busyId === a.id && rejectingId !== a.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                Approve
              </button>
              {canReject && (
                <button
                  onClick={() => { setRejectingId(rejectingId === a.id ? null : a.id); setReason('') }}
                  disabled={busyId === a.id}
                  className="flex items-center justify-center gap-1.5 border border-brand-coral/40 text-brand-coral px-3 py-2 rounded-xl text-xs font-heading font-semibold hover:bg-brand-coral/8 transition-colors disabled:opacity-60 min-h-[44px]"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                  Reject
                </button>
              )}
            </div>
          </div>
          {rejectingId === a.id && (
            <div className="mt-4 border-t border-base pt-4 space-y-2">
              <label htmlFor={`reason-${a.id}`} className="block text-xs font-medium text-body">
                Reason (optional — shared with the author)
              </label>
              <textarea
                id={`reason-${a.id}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="e.g. Please target only Form 4 classes and resubmit."
                className="w-full border border-base rounded-xl px-3 py-2 text-sm bg-page resize-none focus:outline-none focus:ring-2 focus:ring-brand-coral/25"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setRejectingId(null); setReason('') }}
                  className="px-4 py-2 text-xs border border-base rounded-xl hover:bg-page min-h-[40px]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleReject(a.id)}
                  disabled={busyId === a.id}
                  className="flex items-center gap-1.5 bg-brand-coral text-white px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-60 min-h-[40px]"
                >
                  {busyId === a.id && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                  Confirm Reject
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

const POST_TYPE_TO_FORM_MODE: Record<Announcement['postType'], 'announcement' | 'event' | 'news' | 'ads'> = {
  ANNOUNCEMENT: 'announcement',
  EVENT: 'event',
  NEWS: 'news',
  ADVERTISEMENT: 'ads',
}

/** "Save the draft and continue writing later" — the caller's own drafts,
 *  now scoped to the active type tab's postType and search box the same
 *  way PendingApprovalList is (see its comment above for why `active`
 *  gates only the render, not the fetch). Every card in this list is
 *  necessarily the same postType as the tab it's shown in, so the old
 *  per-card type chip is redundant here and has been dropped. */
function DraftsList({
  postType,
  search,
  active,
  onContinue,
  onCountChange,
}: {
  postType: Announcement['postType']
  search: string
  active: boolean
  onContinue: (draft: Announcement) => void
  onCountChange?: (count: number) => void
}) {
  const { drafts, loading, error } = useMyDrafts()
  const queryClient = useQueryClient()
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleDelete(id: string) {
    setDeletingId(id)
    setDeleteError(null)
    try {
      await apiFetch(`/announcements/${id}`, { method: 'DELETE' })
      await queryClient.invalidateQueries({ queryKey: queryKeys.announcements.drafts() })
      setConfirmId(null)
    } catch {
      setDeleteError('Failed to delete draft. Please try again.')
    } finally {
      setDeletingId(null)
    }
  }

  const forType = drafts.filter((d) => d.postType === postType)
  const filtered = forType.filter((d) => matchesSearch(d, search))

  useEffect(() => {
    onCountChange?.(forType.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forType.length])

  if (!active) return null

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-surface animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-brand-coral">
        <FileEdit className="w-10 h-10 mb-3 opacity-40" aria-hidden="true" />
        <p className="text-sm">{error}</p>
      </div>
    )
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted">
        <FileEdit className="w-10 h-10 mb-3 opacity-30" aria-hidden="true" />
        <p className="text-sm">No drafts yet. Start writing and save one for later.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {deleteError && (
        <p role="alert" className="text-xs text-brand-coral">
          {deleteError}
        </p>
      )}
      {filtered.map((d) => (
        <div key={d.id} className="bg-surface border border-base rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="font-heading font-semibold text-body">{d.title || 'Untitled draft'}</h3>
              {d.body && <p className="text-sm text-muted mt-1 leading-relaxed line-clamp-2">{d.body}</p>}
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <button
                onClick={() => onContinue(d)}
                className="flex items-center gap-1.5 bg-brand-teal text-white px-3 py-2 rounded-xl text-xs font-heading font-semibold hover:bg-brand-teal-light transition-colors min-h-[40px]"
              >
                <PencilLine className="w-3.5 h-3.5" aria-hidden="true" />
                Continue
              </button>
              <button
                onClick={() => setConfirmId(confirmId === d.id ? null : d.id)}
                disabled={deletingId === d.id}
                aria-label="Delete draft"
                className="p-2 rounded-lg text-muted hover:text-brand-coral hover:bg-brand-coral/8 transition-colors disabled:opacity-60 min-h-[40px] min-w-[40px] flex items-center justify-center"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          {confirmId === d.id && (
            <div className="mt-4 border-t border-base pt-4 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-muted">Discard this draft permanently?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmId(null)}
                  className="px-4 py-2 text-xs border border-base rounded-xl hover:bg-page min-h-[40px]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(d.id)}
                  disabled={deletingId === d.id}
                  className="flex items-center gap-1.5 bg-brand-coral text-white px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-60 min-h-[40px]"
                >
                  {deletingId === d.id && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

type ContentTypeTab = 'announcement' | 'news' | 'event' | 'ads'
type StatusTab = 'published' | 'pending' | 'drafts'

interface TypeTabConfig {
  id: ContentTypeTab
  label: string
  icon: React.ElementType
  postType: Announcement['postType']
  createLabel: string
  createIcon: React.ElementType
  searchNoun: string
}

// [UI REORG] One entry per content type — each carries exactly what its
// old header button used to (label/icon/postType), plus a search-box noun.
// Keyed by id (rather than a plain array + .find()) so looking up the
// active type's config is a checked Record access, not a possibly-
// undefined array search — TYPE_TAB_ORDER below controls display order.
const TYPE_TABS: Record<ContentTypeTab, TypeTabConfig> = {
  announcement: { id: 'announcement', label: 'Announcements', icon: Megaphone, postType: 'ANNOUNCEMENT', createLabel: 'New Announcement', createIcon: PlusCircle, searchNoun: 'announcements' },
  news: { id: 'news', label: 'News', icon: Newspaper, postType: 'NEWS', createLabel: 'Write News Article', createIcon: Newspaper, searchNoun: 'news articles' },
  event: { id: 'event', label: 'Events', icon: CalendarDays, postType: 'EVENT', createLabel: 'New Event', createIcon: CalendarDays, searchNoun: 'events' },
  ads: { id: 'ads', label: 'Advertisements', icon: Landmark, postType: 'ADVERTISEMENT', createLabel: 'New Academic Advertisement', createIcon: Landmark, searchNoun: 'academic advertisements' },
}

// Order mirrors the page's own name first, then the original button order
// (Write News Article, New Academic Advertisement, New Event) that used to
// run alongside "New Announcement".
const TYPE_TAB_ORDER: ContentTypeTab[] = ['announcement', 'news', 'event', 'ads']

function AnnouncementsContent() {
  const { announcements, loading: isLoading, error: announcementsError } = useAnnouncements()
  const { can } = usePermissions()
  const queryClient = useQueryClient()
  const [formMode, setFormMode] = useState<'announcement' | 'event' | 'news' | 'ads' | null>(null)
  // Set when opening the form via DraftsList's "Continue" button —
  // pre-fills AnnouncementForm and switches its Publish action to
  // PATCH /:id/publish instead of creating a new document.
  const [editingDraft, setEditingDraft] = useState<Announcement | null>(null)

  // [UI REORG] Content-type tab (Announcements/News/Events/Advertisements)
  // is the primary navigator now; status (Published/Pending Approval/
  // Drafts) is a secondary filter scoped to whichever type tab is open.
  // Search resets on a type switch (stale text from one type's list is
  // confusing on another); status is left as-is, since an approver
  // checking "what's pending" typically wants to flip through every type
  // without reselecting the Pending Approval tab each time.
  const [activeType, setActiveType] = useState<ContentTypeTab>('announcement')
  const [activeStatus, setActiveStatus] = useState<StatusTab>('published')
  const [search, setSearch] = useState('')
  const [pendingCount, setPendingCount] = useState(0)
  const [draftsCount, setDraftsCount] = useState(0)

  const canCreate = can('announcement.create') || can('announcement.createWithApproval')
  const canApprove = can('announcement.approvePublish')
  const hasStatusTabs = canApprove || canCreate

  const activeTypeConfig = TYPE_TABS[activeType]
  const CreateIcon = activeTypeConfig.createIcon

  const publishedForType = useMemo(
    () => announcements.filter((a) => a.postType === activeTypeConfig.postType),
    [announcements, activeTypeConfig.postType]
  )
  const publishedForTypeAndSearch = useMemo(
    () => publishedForType.filter((a) => matchesSearch(a, search)),
    [publishedForType, search]
  )

  // Published always shown; Pending Approval / Drafts only for callers who
  // hold the matching permission — conditional spread (rather than
  // building the full array then .filter()) keeps each `id` a checked
  // literal instead of being widened to `string`.
  const statusTabs: TabItem<StatusTab>[] = [
    { id: 'published', label: 'Published', badge: publishedForType.length },
    ...(canApprove ? [{ id: 'pending' as const, label: 'Pending Approval', badge: pendingCount }] : []),
    ...(canCreate ? [{ id: 'drafts' as const, label: 'Drafts', badge: draftsCount }] : []),
  ]

  function openCreate(mode: ContentTypeTab) {
    setEditingDraft(null)
    setFormMode(mode)
  }

  function continueDraft(draft: Announcement) {
    setEditingDraft(draft)
    setFormMode(POST_TYPE_TO_FORM_MODE[draft.postType])
  }

  function closeForm() {
    setFormMode(null)
    setEditingDraft(null)
    // A save (draft or publish) may have changed either list — the
    // published feed, the pending-approval feed, or the drafts list.
    // Invalidating both up front is simpler and cheaper than tracking
    // which one just changed.
    void queryClient.invalidateQueries({ queryKey: queryKeys.announcements.all() })
    void queryClient.invalidateQueries({ queryKey: queryKeys.announcements.drafts() })
  }

  function handleTypeChange(id: ContentTypeTab) {
    setActiveType(id)
    setSearch('')
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Megaphone className="w-5 h-5 text-brand-teal" aria-hidden="true" />
        <h1 className="font-heading font-bold text-xl text-brand-navy">Announcements</h1>
      </div>

      {/* Content-type tabs — each keeps its old "New …" create action and
          Published/Pending Approval/Drafts filters, now scoped to that
          type instead of one shared, mixed feed. */}
      <ModuleTabs<ContentTypeTab>
        id="announcements-type"
        tabs={TYPE_TAB_ORDER.map((id) => ({ id, label: TYPE_TABS[id].label, icon: TYPE_TABS[id].icon }))}
        active={activeType}
        onChange={handleTypeChange}
      />

      <div className="mt-5 space-y-4">
        {/* Action row — create button (same announcement.create /
            createWithApproval gate as before) + search, scoped to the
            active type tab. */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {canCreate && (
            <button
              onClick={() => openCreate(activeTypeConfig.id)}
              className="flex items-center gap-2 bg-brand-teal text-white px-4 py-2 rounded-xl text-sm font-heading font-semibold hover:bg-brand-teal-light transition-colors min-h-[44px]"
            >
              <CreateIcon className="w-4 h-4" aria-hidden="true" />
              {activeTypeConfig.createLabel}
            </button>
          )}
          <div className={`relative w-full sm:w-72 ${canCreate ? '' : 'sm:ml-auto'}`}>
            <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
            <label htmlFor="announcements-search" className="sr-only">
              Search {activeTypeConfig.searchNoun}
            </label>
            <input
              id="announcements-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${activeTypeConfig.searchNoun}…`}
              className="w-full min-h-[44px] border border-base rounded-xl pl-9 pr-4 py-2.5 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
            />
          </div>
        </div>

        {/* Status tabs — Published always shown; Pending Approval / Drafts
            only for callers who hold the matching permission, same gate
            as the old TabsTrigger conditionals. */}
        {hasStatusTabs && (
          <ModuleTabs<StatusTab>
            id={`announcements-status-${activeType}`}
            tabs={statusTabs}
            active={activeStatus}
            onChange={setActiveStatus}
            variant="pill"
          />
        )}

        {(!hasStatusTabs || activeStatus === 'published') && (
          <PublishedList announcements={publishedForTypeAndSearch} isLoading={isLoading} error={announcementsError} />
        )}
        {canApprove && (
          <PendingApprovalList
            postType={activeTypeConfig.postType}
            search={search}
            active={activeStatus === 'pending'}
            onCountChange={setPendingCount}
          />
        )}
        {canCreate && (
          <DraftsList
            postType={activeTypeConfig.postType}
            search={search}
            active={activeStatus === 'drafts'}
            onContinue={continueDraft}
            onCountChange={setDraftsCount}
          />
        )}
      </div>

      {/* Form modal */}
      {formMode && (
        <AnnouncementForm mode={formMode} draft={editingDraft ?? undefined} onClose={closeForm} />
      )}
    </div>
  )
}