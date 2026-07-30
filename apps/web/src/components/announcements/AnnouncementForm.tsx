/*
 * apps/web/src/components/announcements/AnnouncementForm.tsx
 *
 * [CHANGE TYPE]: MAJOR REWRITE
 * [PURPOSE]: [FE-005/BE-003] This form wrote the announcement document
 *   directly to Firestore from the client (addDoc) — exactly the bug this
 *   file's own prior header comment described as already fixed by the real
 *   POST /announcements route (announcementService.createAnnouncement(),
 *   fully built, permission-checked server-side), except the form was never
 *   actually migrated to call it. The direct client write is why every
 *   submit failed with "Missing or insufficient permissions": Firestore's
 *   security rules require status 'APPROVED' to create/read an
 *   announcement, but this form (and every other layer of the app —
 *   announcementService.ts, public.ts, calendar.ts, useAnnouncements.ts)
 *   uses 'PUBLISHED'/'SCHEDULED'/'PENDING_APPROVAL' — firestore.rules was
 *   the sole, stale outlier never updated to match. Posting through the
 *   backend sidesteps that mismatch entirely (Admin SDK writes are not
 *   subject to Firestore security rules) and fixes a real authorization
 *   gap too: publish-vs-approval was decided client-side from a hardcoded
 *   role === 'high_rank' check instead of the real
 *   announcement.publishDirect permission, which the server now enforces.
 *   The image upload already correctly went through the backend and is
 *   unchanged.
 * [DEPENDS ON]: W/server/routes/announcements.ts (POST /), W/hooks/
 *   usePermissions.ts, @shared/constants/malawi (COLLECTIONS.ANNOUNCEMENTS
 *   — no longer used here, kept for reference in useAnnouncements.ts),
 *   @shared/schemas/announcement (AnnouncementSchema — relocated this
 *   phase from @shared/schemas/student)
 */
'use client'
import { useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { usePermissions } from '@/hooks/usePermissions'
import { AnnouncementSchema } from '@shared/schemas/announcement'
import { apiFetch } from '@/lib/api-client'
import { X, Loader2, ImagePlus } from 'lucide-react'
import { USER_ROLES } from '@shared/types/roles'

interface Props {
  onClose: () => void
}

export function AnnouncementForm({ onClose }: Props) {
  const { user } = useAuthStore()
  const { can } = usePermissions()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [targetAll, setTargetAll] = useState(true)
  const [targetRoles, setTargetRoles] = useState<string[]>([])
  // [PRODUCTION FIX 2026-07-28] publicWebsite is a separate opt-in from
  // targetAll — see announcementService.ts's CreateAnnouncementInput
  // comment for why these must not be conflated.
  const [publicWebsite, setPublicWebsite] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Display-only — the server independently re-derives this from the real
  // announcement.publishDirect permission (announcements.ts's POST /
  // route) and is the actual authority. This only decides which message
  // and button label to show before submitting.
  const canPublishDirectly = can('announcement.publishDirect')

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setImageFile(file)
    setImagePreview(file ? URL.createObjectURL(file) : null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!user?.uid) {
      setError('You must be signed in to post an announcement. Please refresh and try again.')
      return
    }
    const parsed = AnnouncementSchema.safeParse({ title, body, targetAll, targetRoles, publicWebsite })
    if (!parsed.success) return setError(parsed.error.errors[0]?.message ?? 'Validation error')
    setLoading(true)
    try {
      // Upload the cover image first (if any) to get back a fileId to
      // include in the announcement create call below.
      let imageKey: string | undefined
      if (imageFile) {
        const fd = new FormData()
        fd.append('file', imageFile)
        const uploaded = await apiFetch<{ imageKey: string }>('/announcements/image', {
          method: 'POST',
          body: fd,
        })
        imageKey = uploaded.imageKey
      }
      await apiFetch<{ id: string; status: string }>('/announcements', {
        method: 'POST',
        body: JSON.stringify({
          title: parsed.data.title,
          body: parsed.data.body,
          targetAll: parsed.data.targetAll,
          targetRoles: parsed.data.targetRoles,
          publicWebsite: parsed.data.publicWebsite,
          imageKey,
        }),
      })
      onClose()
    } catch (err) {
      console.error('Failed to post announcement:', err)
      setError(err instanceof Error ? err.message : 'Failed to post announcement. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      {/* [PRODUCTION FIX 2026-07-28] Had no height cap and no scroll — once
          the image preview pushed content taller than the viewport, the
          submit button (and even the close button, since both live inside
          this same unconstrained container) went off-screen with no way to
          reach them. Capped height + scrollable body; header is sticky so
          the close button stays reachable no matter how far you've scrolled. */}
      <div className="bg-surface rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-surface flex items-center justify-between px-6 py-4 border-b border-base">
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
          {/* [PRODUCTION FIX 2026-07-28] Public website opt-in — independent
              of "Send to everyone" above, which only controls internal
              visibility. */}
          <div className="border-t border-base pt-4">
            <label className="flex items-center gap-2 text-sm mb-1">
              <input
                type="checkbox"
                checked={publicWebsite}
                onChange={(e) => setPublicWebsite(e.target.checked)}
                className="accent-brand-teal"
              />
              Publish to public website
            </label>
            <p className="text-xs text-muted mb-3">
              Shows on the public landing page (News, Events, or Academic Advertisements). Separate from
              &quot;Send to everyone&quot; above — that only controls who inside the school sees it.
            </p>

            {publicWebsite && (
              <div>
                <label className="block text-sm font-medium text-body mb-1.5">
                  Cover image <span className="text-muted font-normal">(optional)</span>
                </label>
                {imagePreview ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local blob: preview, not a remote asset */}
                    <img src={imagePreview} alt="Selected cover" className="w-full h-32 object-cover rounded-xl border border-base" />
                    <button
                      type="button"
                      onClick={() => { setImageFile(null); setImagePreview(null) }}
                      className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-7 h-7 flex items-center justify-center"
                      aria-label="Remove image"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-base rounded-xl h-24 cursor-pointer hover:border-brand-teal transition-colors text-muted">
                    <ImagePlus className="w-5 h-5" aria-hidden />
                    <span className="text-xs">Add a cover image</span>
                    <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                  </label>
                )}
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