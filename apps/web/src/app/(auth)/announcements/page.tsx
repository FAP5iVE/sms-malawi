/*
 * apps/web/src/app/(auth)/announcements/page.tsx
 *
 * [CHANGE TYPE]: MAJOR REWRITE (UI/layout only — no backend route,
 *   permission, or workflow changes; see [DEPENDS ON] for the one
 *   additive hook-signature change this required)
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]: Restructured this page from one flat Published/Pending
 *   Approval/Drafts block mixing all four postTypes together (with four
 *   "create" buttons stacked in the header) into four independent
 *   content-type sections — News / Academic Advertisements /
 *   Announcements / Events — navigated with the shared ModuleTabs
 *   component (the same tabbed-section pattern Finance/HR/Library/Exams
 *   already use), replacing this page's own one-off shadcn Tabs usage.
 *   Each content-type tab now owns its own single "create new" entry
 *   point and its own Published/Pending Approval/Drafts sub-navigation
 *   (ModuleTabs 'pill' variant, badge-counted), plus a search box that
 *   filters the active list by title/body. All four sections still read
 *   from the exact same three endpoints as before (GET /announcements,
 *   GET /announcements/pending, GET /announcements/drafts) and simply
 *   filter the already-fetched, already-permission-resolved results by
 *   postType client-side — nothing about who can see, create, approve,
 *   reject, publish, or delete what changed.
 *
 *   Public-facing visibility was already correct and untouched by this
 *   pass: GET /public/announcements (and /public/news,
 *   /public/academic-advertisements, /public/events) is a fully
 *   unauthenticated router filtered server-side on
 *   status === 'PUBLISHED' && publicWebsite === true, and the public site
 *   already surfaces it — the homepage's Announcements rail and the
 *   /notices archive + /notices/:id detail page (see that page's own
 *   [ROUTING NOTE] for why it isn't literally at /public/announcements —
 *   this (auth) page owns that URL). No gating existed to remove here.
 * [DEPENDS ON]: apps/web/src/hooks/useAnnouncements.ts
 *   (usePendingAnnouncements/useMyDrafts now accept an optional `enabled`
 *   flag, defaulting to true — the only other file this change touches),
 *   apps/web/src/lib/api-client.ts (apiFetch),
 *   apps/web/src/hooks/usePermissions.ts,
 *   apps/web/src/components/shared/ModuleTabs.tsx
 */
'use client'

import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAnnouncements, usePendingAnnouncements, useMyDrafts, type Announcement } from '@/hooks/useAnnouncements'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { AnnouncementForm } from '@/components/announcements/AnnouncementForm'
import { usePermissions } from '@/hooks/usePermissions'
import { useAuthStore } from '@/store/authStore'
import { apiFetch, queryKeys } from '@/lib/api-client'
import { ModuleTabs, type TabItem } from '@/components/shared/ModuleTabs'
import { Bell, PlusCircle, Megaphone, Check, Loader2, CalendarDays, X, Trash2, Newspaper, Landmark, FileEdit, PencilLine, Search } from 'lucide-react'

export const dynamic = 'force-dynamic'

type PostType = Announcement['postType']
type FormMode = 'announcement' | 'event' | 'news' | 'ads'
type StatusTab = 'published' | 'pending' | 'drafts'

/** [NEW] The four independent content-type tabs this page now navigates
 *  between, in the requested News / Ad / Announcement / Events order.
 *  Indexed by PostType (not an array) so every lookup — activeTypeMeta,
 *  the ModuleTabs list below — is statically known to resolve, matching
 *  this file's existing POST_TYPE_TO_FORM_MODE indexing convention rather
 *  than needing a fallback for a `noUncheckedIndexedAccess` array access. */
interface ContentTypeMeta {
  id: PostType
  label: string
  icon: React.ElementType
  formMode: FormMode
  createLabel: string
}

const CONTENT_TYPE_ORDER: PostType[] = ['NEWS', 'ADVERTISEMENT', 'ANNOUNCEMENT', 'EVENT']

const CONTENT_TYPE_META: Record<PostType, ContentTypeMeta> = {
  NEWS: { id: 'NEWS', label: 'News', icon: Newspaper, formMode: 'news', createLabel: 'Write News Article' },
  ADVERTISEMENT: { id: 'ADVERTISEMENT', label: 'Academic Advertisements', icon: Landmark, formMode: 'ads', createLabel: 'New Academic Advertisement' },
  ANNOUNCEMENT: { id: 'ANNOUNCEMENT', label: 'Announcements', icon: Megaphone, formMode: 'announcement', createLabel: 'New Announcement' },
  EVENT: { id: 'EVENT', label: 'Events', icon: CalendarDays, formMode: 'event', createLabel: 'New Event' },
}

/** Client-side only — filters whichever list (Published/Pending/Drafts)
 *  is currently on screen by title/body, against the already-fetched,
 *  already-permission-resolved result set. Never touches the network. */
function matchesSearch(item: { title: string; body: string }, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return item.title.toLowerCase().includes(q) || item.body.toLowerCase().includes(q)
}

/** Search box for the active content-type tab's list — same bordered
 *  icon+input shape as GlobalSearch.tsx, scoped to this page. */
function ContentSearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="flex items-center gap-2 border border-base rounded-xl px-3 min-h-[44px] bg-page w-full sm:w-72 shrink-0">
      <Search className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
      <label htmlFor="announcements-search" className="sr-only">{placeholder}</label>
      <input
        id="announcements-search"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-sm text-body placeholder:text-muted focus:outline-none min-w-0"
      />
    </div>
  )
}

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

/** [CHANGED] Now reads its data from props instead of calling
 *  usePendingAnnouncements() itself — the parent fetches once (so the
 *  same result set can also badge-count every content-type tab) and
 *  passes down the slice already filtered to the active postType/search.
 *  Internal approve/reject logic is otherwise untouched. */
function PendingApprovalList({ pending, isLoading: loading, error: feedError }: { pending: Announcement[]; isLoading: boolean; error?: string | null }) {
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

  if (pending.length === 0) {
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
      {pending.map((a) => (
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

const POST_TYPE_TO_FORM_MODE: Record<Announcement['postType'], FormMode> = {
  ANNOUNCEMENT: 'announcement',
  EVENT: 'event',
  NEWS: 'news',
  ADVERTISEMENT: 'ads',
}

/** [NEW] "Save the draft and continue writing later" — every draft the
 *  caller has saved, with a way to resume editing (opens AnnouncementForm
 *  pre-filled) or discard it.
 *  [CHANGED] Was self-fetching across all four post types with a per-item
 *  type badge (POST_TYPE_LABEL) to tell them apart in one combined list.
 *  Now reads its data from props — the parent fetches once and passes
 *  down the slice already scoped to the active content-type tab, so the
 *  per-item type badge is redundant (every draft on screen already shares
 *  the tab's type) and has been dropped. */
function DraftsList({ drafts, isLoading: loading, error, onContinue }: { drafts: Announcement[]; isLoading: boolean; error?: string | null; onContinue: (draft: Announcement) => void }) {
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

  if (drafts.length === 0) {
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
      {drafts.map((d) => (
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

function AnnouncementsContent() {
  const { announcements, loading: announcementsLoading, error: announcementsError } = useAnnouncements()
  const { can } = usePermissions()
  const queryClient = useQueryClient()
  const [formMode, setFormMode] = useState<FormMode | null>(null)
  // [NEW] Set when opening the form via DraftsList's "Continue" button —
  // pre-fills AnnouncementForm and switches its Publish action to
  // PATCH /:id/publish instead of creating a new document.
  const [editingDraft, setEditingDraft] = useState<Announcement | null>(null)

  const canCreate = can('announcement.create') || can('announcement.createWithApproval')
  const canApprove = can('announcement.approvePublish')

  // [CHANGED] Previously only fetched once PendingApprovalList/DraftsList
  // actually mounted (i.e. once the viewer clicked into that tab) — now
  // fetched once here so their counts can badge every content-type tab's
  // status pills up front, not just whichever one happens to be open.
  // `enabled` reproduces the same "don't fire the request unless the
  // viewer holds the permission the route requires" behavior the old
  // conditional-mount pattern gave for free.
  const { pending, loading: pendingLoading, error: pendingError } = usePendingAnnouncements(canApprove)
  const { drafts, loading: draftsLoading, error: draftsError } = useMyDrafts(canCreate)

  // [NEW] Which of the four content-type tabs (News/Ads/Announcements/
  // Events) is active, which of its Published/Pending/Drafts sub-tabs is
  // active, and the free-text filter for whichever list that resolves to.
  const [activeType, setActiveType] = useState<PostType>('ANNOUNCEMENT')
  const [statusTab, setStatusTab] = useState<StatusTab>('published')
  const [search, setSearch] = useState('')

  const activeTypeMeta = CONTENT_TYPE_META[activeType]
  const TypeIcon = activeTypeMeta.icon

  function changeType(id: PostType) {
    setActiveType(id)
    setStatusTab('published')
    setSearch('')
  }

  function openCreate(mode: FormMode) {
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

  // [NEW] Scope each already-fetched, already-permission-resolved result
  // set to the active content-type tab, then to the search box — purely
  // client-side, same three arrays GET /announcements, /announcements/
  // pending and /announcements/drafts already returned.
  const typeAnnouncements = useMemo(
    () => announcements.filter((a) => a.postType === activeType),
    [announcements, activeType],
  )
  const typePending = useMemo(
    () => pending.filter((a) => a.postType === activeType),
    [pending, activeType],
  )
  const typeDrafts = useMemo(
    () => drafts.filter((d) => d.postType === activeType),
    [drafts, activeType],
  )

  const filteredPublished = useMemo(
    () => typeAnnouncements.filter((a) => matchesSearch(a, search)),
    [typeAnnouncements, search],
  )
  const filteredPending = useMemo(
    () => typePending.filter((a) => matchesSearch(a, search)),
    [typePending, search],
  )
  const filteredDrafts = useMemo(
    () => typeDrafts.filter((d) => matchesSearch(d, search)),
    [typeDrafts, search],
  )

  const statusTabs: TabItem<StatusTab>[] = [
    { id: 'published' as const, label: 'Published', badge: typeAnnouncements.length },
    ...(canApprove ? [{ id: 'pending' as const, label: 'Pending Approval', badge: typePending.length }] : []),
    ...(canCreate ? [{ id: 'drafts' as const, label: 'Drafts', badge: typeDrafts.length }] : []),
  ]
  const showStatusTabs = canApprove || canCreate

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-brand-teal" aria-hidden="true" />
          <h1 className="font-heading font-bold text-xl text-brand-navy">Announcements</h1>
        </div>
        <p className="text-sm text-muted mt-0.5">News, announcements, academic advertisements and events — all in one place.</p>
      </div>

      {/* [NEW] Content-type navigation — News / Academic Advertisements /
          Announcements / Events, each an independent section with its own
          create entry point and its own Published/Pending/Drafts state,
          in place of the four buttons this header used to stack at once. */}
      <ModuleTabs<PostType>
        tabs={CONTENT_TYPE_ORDER.map((id) => ({ id, label: CONTENT_TYPE_META[id].label, icon: CONTENT_TYPE_META[id].icon }))}
        active={activeType}
        onChange={changeType}
        variant="underline"
        id="content-type-tabs"
      />

      <div className="mt-5">
        {/* Type header row — section label + its one create action */}
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div className="flex items-center gap-2">
            <TypeIcon className="w-5 h-5 text-muted" aria-hidden="true" />
            <h2 className="font-heading font-semibold text-base text-body">{activeTypeMeta.label}</h2>
          </div>
          {canCreate && (
            <button
              onClick={() => openCreate(activeTypeMeta.formMode)}
              className="flex items-center gap-2 bg-brand-teal text-white px-4 py-2 rounded-xl text-sm font-heading font-semibold hover:bg-brand-teal-light transition-colors min-h-[44px]"
            >
              {/* [PRESERVED] "New Announcement" kept its own distinct
                  PlusCircle icon (rather than reusing Megaphone) to match
                  the original per-button iconography. */}
              {activeType === 'ANNOUNCEMENT'
                ? <PlusCircle className="w-4 h-4" aria-hidden="true" />
                : <TypeIcon className="w-4 h-4" aria-hidden="true" />}
              {activeTypeMeta.createLabel}
            </button>
          )}
        </div>

        {showStatusTabs ? (
          <>
            {/* Published / Pending Approval / Drafts, badge-counted, plus
                the search box — same row, matching the reference layout. */}
            <div className="bg-surface border border-base rounded-2xl p-4 mb-4 flex items-center justify-between gap-3 flex-wrap">
              <ModuleTabs<StatusTab>
                tabs={statusTabs}
                active={statusTab}
                onChange={setStatusTab}
                variant="pill"
                id={`status-tabs-${activeType}`}
              />
              <ContentSearchBox
                value={search}
                onChange={setSearch}
                placeholder={`Search ${activeTypeMeta.label.toLowerCase()}…`}
              />
            </div>

            {statusTab === 'published' && (
              <PublishedList announcements={filteredPublished} isLoading={announcementsLoading} error={announcementsError} />
            )}
            {statusTab === 'pending' && canApprove && (
              <PendingApprovalList pending={filteredPending} isLoading={pendingLoading} error={pendingError} />
            )}
            {statusTab === 'drafts' && canCreate && (
              <DraftsList drafts={filteredDrafts} isLoading={draftsLoading} error={draftsError} onContinue={continueDraft} />
            )}
          </>
        ) : (
          <>
            <div className="flex justify-end mb-4">
              <ContentSearchBox
                value={search}
                onChange={setSearch}
                placeholder={`Search ${activeTypeMeta.label.toLowerCase()}…`}
              />
            </div>
            <PublishedList announcements={filteredPublished} isLoading={announcementsLoading} error={announcementsError} />
          </>
        )}
      </div>

      {/* Form modal */}
      {formMode && (
        <AnnouncementForm mode={formMode} draft={editingDraft ?? undefined} onClose={closeForm} />
      )}
    </div>
  )
}