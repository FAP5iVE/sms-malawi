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
import { useAnnouncements, usePendingAnnouncements } from '@/hooks/useAnnouncements'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { AnnouncementForm } from '@/components/announcements/AnnouncementForm'
import { useAuthStore } from '@/store/authStore'
import { usePermissions } from '@/hooks/usePermissions'
import { apiFetch, queryKeys } from '@/lib/api-client'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Bell, PlusCircle, Megaphone, Check, Loader2 } from 'lucide-react'

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
      {announcements.map((a) => (
        <div key={a.id} className="bg-surface border border-base rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-heading font-semibold text-body">{a.title}</h3>
              <p className="text-sm text-muted mt-1 leading-relaxed">{a.body}</p>
            </div>
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
          </div>
          {a.createdAt && (
            <p className="text-[10px] text-muted mt-3 font-sans">
              {new Date(a.createdAt.toDate?.() ?? a.createdAt).toLocaleDateString()}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

function PendingApprovalList() {
  const { pending, loading } = usePendingAnnouncements()
  const queryClient = useQueryClient()
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleApprove(id: string) {
    setApprovingId(id)
    setError(null)
    try {
      await apiFetch(`/announcements/${id}/approve`, { method: 'PATCH' })
      await queryClient.invalidateQueries({ queryKey: queryKeys.announcements.all() })
    } catch {
      setError('Failed to approve announcement. Please try again.')
    } finally {
      setApprovingId(null)
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
            <button
              onClick={() => handleApprove(a.id)}
              disabled={approvingId === a.id}
              className="shrink-0 flex items-center gap-1.5 bg-brand-teal text-white px-3 py-2 rounded-xl text-xs font-heading font-semibold hover:bg-brand-teal-light transition-colors disabled:opacity-60 min-h-[44px]"
            >
              {approvingId === a.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              Approve
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function AnnouncementsContent() {
  const { announcements, loading: isLoading, error: announcementsError } = useAnnouncements()
  const { role } = useAuthStore()
  const { can } = usePermissions()
  const [showForm, setShowForm] = useState(false)

  const canCreate = role !== 'admin'
  const canApprove = can('announcement.approvePublish')

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-brand-teal" aria-hidden="true" />
          <h1 className="font-heading font-bold text-xl text-brand-navy">Announcements</h1>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-brand-teal text-white px-4 py-2 rounded-xl text-sm font-heading font-semibold hover:bg-brand-teal-light transition-colors min-h-[44px]"
          >
            <PlusCircle className="w-4 h-4" aria-hidden="true" /> New Announcement
          </button>
        )}
      </div>

      {canApprove ? (
        <Tabs defaultValue="published">
          <TabsList>
            <TabsTrigger value="published">Published</TabsTrigger>
            <TabsTrigger value="pending">Pending Approval</TabsTrigger>
          </TabsList>
          <TabsContent value="published" className="mt-4">
            <PublishedList announcements={announcements} isLoading={isLoading} error={announcementsError} />
          </TabsContent>
          <TabsContent value="pending" className="mt-4">
            <PendingApprovalList />
          </TabsContent>
        </Tabs>
      ) : (
        <PublishedList announcements={announcements} isLoading={isLoading} error={announcementsError} />
      )}

      {/* Form modal */}
      {showForm && <AnnouncementForm onClose={() => setShowForm(false)} />}
    </div>
  )
}