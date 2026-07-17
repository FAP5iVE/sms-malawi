/*
 * apps/web/src/components/announcements/AnnouncementForm.tsx
 *
 * [CHANGE TYPE]: TARGETED EDIT (two independent fixes)
 * [R-PHASE]: R13 — Announcements, Timetable & Calendar Domain
 * [PURPOSE]:
 *   1. Highest-priority single-character fix in this phase: the Firestore
 *      collection reference was the literal string 'ANNOUNCEMENTS'
 *      (uppercase) while every reader in the codebase
 *      (useAnnouncements.ts, announcementService.ts) queries the real,
 *      lowercase COLLECTIONS.ANNOUNCEMENTS ('announcements') — every
 *      announcement ever submitted through this form wrote into a
 *      collection nothing reads, with the submitter shown a false
 *      success state (onClose() fires unconditionally on a successful
 *      addDoc(), regardless of which collection it landed in).
 *   2. canPublishDirectly: was `role === 'admin' || role === 'high_rank'`.
 *      Checked against the real permission matrix
 *      (S/types/permissions.ts): admin holds none of
 *      announcement.create/createWithApproval/publishDirect — zero
 *      formal basis for direct publish. high_rank is the only role
 *      holding both announcement.create AND announcement.publishDirect
 *      together, so it is the only role that should skip the approval
 *      queue. (student — along with finance, library, lower_rank,
 *      academic, hr, exam_officer — holds announcement.createWithApproval
 *      only, so it correctly stays on the approval path here; the
 *      separate, currently-broken gate that excludes student from the
 *      create button entirely lives in announcements/page.tsx's
 *      canCreate, fixed in the same phase.)
 * [DEPENDS ON]: @shared/constants/malawi (COLLECTIONS.ANNOUNCEMENTS),
 *   @shared/schemas/announcement (AnnouncementSchema — relocated this
 *   phase from @shared/schemas/student)
 */
'use client'
import { useState } from 'react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuthStore } from '@/store/authStore'
import { AnnouncementSchema } from '@shared/schemas/announcement'
import { COLLECTIONS } from '@shared/constants/storage'
import { X, Loader2 } from 'lucide-react'
import { USER_ROLES } from '@shared/types/roles'

interface Props {
  onClose: () => void
}

export function AnnouncementForm({ onClose }: Props) {
  const { user, role } = useAuthStore()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [targetAll, setTargetAll] = useState(true)
  const [targetRoles, setTargetRoles] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Only high_rank holds both announcement.create AND announcement.publishDirect —
  // every other role that can submit at all holds announcement.createWithApproval
  // only, and must go through the approval queue.
  const canPublishDirectly = role === 'high_rank'
  const status = canPublishDirectly ? 'PUBLISHED' : 'PENDING_APPROVAL'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = AnnouncementSchema.safeParse({ title, body, targetAll, targetRoles, status })
    if (!parsed.success) return setError(parsed.error.errors[0]?.message ?? 'Validation error')
    setLoading(true)
    try {
      await addDoc(collection(db!, COLLECTIONS.ANNOUNCEMENTS), {
        ...parsed.data,
        createdByUid: user?.uid,
        createdAt: serverTimestamp(),
      })
      onClose()
    } catch {
      setError('Failed to post announcement. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-surface rounded-2xl w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-base">
          <h2 className="font-heading font-bold text-brand-navy">New Announcement</h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-page rounded-lg"
            aria-label="Close announcement form"
          >
            <X className="w-4 h-4 text-muted" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="announcement-title" className="block text-sm font-medium text-body mb-1.5">Title</label>
            <input
              id="announcement-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Announcement title"
              maxLength={200}
              className="w-full border border-base rounded-xl px-4 py-2.5 text-sm bg-page focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
            />
          </div>
          <div>
            <label htmlFor="announcement-body" className="block text-sm font-medium text-body mb-1.5">Message</label>
            <textarea
              id="announcement-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              rows={4}
              placeholder="Write your announcement here…"
              className="w-full border border-base rounded-xl px-4 py-2.5 text-sm bg-page resize-none focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
            />
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm mb-2">
              <input
                type="checkbox"
                checked={targetAll}
                onChange={(e) => setTargetAll(e.target.checked)}
                className="accent-brand-teal"
              />
              Send to everyone
            </label>
            {!targetAll && (
              <div className="flex flex-wrap gap-2">
                {USER_ROLES.map((r) => (
                  <label
                    key={r}
                    className="flex items-center gap-1.5 text-xs border border-base rounded-lg px-3 py-1.5 cursor-pointer hover:bg-page"
                  >
                    <input
                      type="checkbox"
                      value={r}
                      checked={targetRoles.includes(r)}
                      onChange={(e) =>
                        setTargetRoles((prev) =>
                          e.target.checked ? [...prev, r] : prev.filter((x) => x !== r)
                        )
                      }
                      className="accent-brand-teal"
                    />
                    {r.replace('_', ' ')}
                  </label>
                ))}
              </div>
            )}
          </div>
          {!canPublishDirectly && (
            <p className="text-xs text-muted bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Your announcement will be submitted for admin approval before publishing.
            </p>
          )}
          {error && (
            <p role="alert" className="text-xs text-brand-coral">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-sm border border-base rounded-xl hover:bg-page min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-sm bg-brand-navy text-white rounded-xl font-semibold flex items-center gap-2 disabled:opacity-60 min-h-[44px]"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {canPublishDirectly ? 'Publish' : 'Submit for Approval'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
