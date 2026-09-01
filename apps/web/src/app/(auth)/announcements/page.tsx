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

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAnnouncements, usePendingAnnouncements, useMyDrafts, type Announcement } from '@/hooks/useAnnouncements'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { AnnouncementForm } from '@/components/announcements/AnnouncementForm'
import { usePermissions } from '@/hooks/usePermissions'
import { useAuthStore } from '@/store/authStore'
import { apiFetch, queryKeys } from '@/lib/api-client'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Bell, PlusCircle, Megaphone, Check, Loader2, CalendarDays, X, Trash2, Newspaper, Landmark, FileEdit, PencilLine } from 'lucide-react'

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

function PendingApprovalList() {
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

const POST_TYPE_LABEL: Record<Announcement['postType'], string> = {
  ANNOUNCEMENT: 'Announcement',
  EVENT: 'Event',
  NEWS: 'News',
  ADVERTISEMENT: 'Academic Advertisement',
}
const POST_TYPE_TO_FORM_MODE: Record<Announcement['postType'], 'announcement' | 'event' | 'news' | 'ads'> = {
  ANNOUNCEMENT: 'announcement',
  EVENT: 'event',
  NEWS: 'news',
  ADVERTISEMENT: 'ads',
}

/** [NEW] "Save the draft and continue writing later" — every draft the
 *  caller has saved, across all four post types, with a way to resume
 *  editing (opens AnnouncementForm pre-filled) or discard it. */
function DraftsList({ onContinue }: { onContinue: (draft: Announcement) => void }) {
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
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-heading font-semibold text-body">{d.title || 'Untitled draft'}</h3>
                <span className="text-[10px] font-heading font-bold px-2.5 py-1 rounded-full bg-base text-muted">
                  {POST_TYPE_LABEL[d.postType]}
                </span>
              </div>
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
  const { announcements, loading: isLoading, error: announcementsError } = useAnnouncements()
  const { can } = usePermissions()
  const queryClient = useQueryClient()
  const [formMode, setFormMode] = useState<'announcement' | 'event' | 'news' | 'ads' | null>(null)
  // [NEW] Set when opening the form via DraftsList's "Continue" button —
  // pre-fills AnnouncementForm and switches its Publish action to
  // PATCH /:id/publish instead of creating a new document.
  const [editingDraft, setEditingDraft] = useState<Announcement | null>(null)

  const canCreate = can('announcement.create') || can('announcement.createWithApproval')
  const canApprove = can('announcement.approvePublish')

  function openCreate(mode: 'announcement' | 'event' | 'news' | 'ads') {
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

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-brand-teal" aria-hidden="true" />
          <h1 className="font-heading font-bold text-xl text-brand-navy">Announcements</h1>
        </div>
        {canCreate && (
          <div className="flex items-center gap-2 flex-wrap">
            {/* [PRODUCTION FIX] "Write News Article" — same create/approval
                permission as a regular announcement (postType: 'NEWS' is
                what makes this different, not who can press the button).
                Publishes public-website-only content; see AnnouncementForm's
                postType comment. */}
            <button
              onClick={() => openCreate('news')}
              className="flex items-center gap-2 border border-base text-body px-4 py-2 rounded-xl text-sm font-heading font-semibold hover:bg-page transition-colors min-h-[44px]"
            >
              <Newspaper className="w-4 h-4" aria-hidden="true" /> Write News Article
            </button>
            {/* [NEW] "New Academic Advertisement" — a standalone module,
                same create/approval permission cluster as the rest, but its
                own postType (ADVERTISEMENT), its own public section, and
                never shown as a plain Announcement/News/Event. */}
            <button
              onClick={() => openCreate('ads')}
              className="flex items-center gap-2 border border-base text-body px-4 py-2 rounded-xl text-sm font-heading font-semibold hover:bg-page transition-colors min-h-[44px]"
            >
              <Landmark className="w-4 h-4" aria-hidden="true" /> New Academic Advertisement
            </button>
            <button
              onClick={() => openCreate('event')}
              className="flex items-center gap-2 border border-base text-body px-4 py-2 rounded-xl text-sm font-heading font-semibold hover:bg-page transition-colors min-h-[44px]"
            >
              <CalendarDays className="w-4 h-4" aria-hidden="true" /> New Event
            </button>
            <button
              onClick={() => openCreate('announcement')}
              className="flex items-center gap-2 bg-brand-teal text-white px-4 py-2 rounded-xl text-sm font-heading font-semibold hover:bg-brand-teal-light transition-colors min-h-[44px]"
            >
              <PlusCircle className="w-4 h-4" aria-hidden="true" /> New Announcement
            </button>
          </div>
        )}
      </div>

      {canApprove || canCreate ? (
        <Tabs defaultValue="published">
          <TabsList>
            <TabsTrigger value="published">Published</TabsTrigger>
            {canApprove && <TabsTrigger value="pending">Pending Approval</TabsTrigger>}
            {/* [NEW] "Save the draft and continue writing later" — visible to
                anyone who can create content in the first place, same gate
                as the create buttons above. */}
            {canCreate && <TabsTrigger value="drafts">Drafts</TabsTrigger>}
          </TabsList>
          <TabsContent value="published" className="mt-4">
            <PublishedList announcements={announcements} isLoading={isLoading} error={announcementsError} />
          </TabsContent>
          {canApprove && (
            <TabsContent value="pending" className="mt-4">
              <PendingApprovalList />
            </TabsContent>
          )}
          {canCreate && (
            <TabsContent value="drafts" className="mt-4">
              <DraftsList onContinue={continueDraft} />
            </TabsContent>
          )}
        </Tabs>
      ) : (
        <PublishedList announcements={announcements} isLoading={isLoading} error={announcementsError} />
      )}

      {/* Form modal */}
      {formMode && (
        <AnnouncementForm mode={formMode} draft={editingDraft ?? undefined} onClose={closeForm} />
      )}
    </div>
  )
}