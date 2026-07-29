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
import { apiFetch } from '@/lib/api-client'
import { X, Loader2, ImagePlus } from 'lucide-react'
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
  // [PRODUCTION FIX 2026-07-28] publicWebsite is a separate opt-in from
  // targetAll — see announcementService.ts's CreateAnnouncementInput
  // comment for why these must not be conflated.
  const [publicWebsite, setPublicWebsite] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Only high_rank holds both announcement.create AND announcement.publishDirect —
  // every other role that can submit at all holds announcement.createWithApproval
  // only, and must go through the approval queue.
  const canPublishDirectly = role === 'high_rank'
  const status = canPublishDirectly ? 'PUBLISHED' : 'PENDING_APPROVAL'

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setImageFile(file)
    setImagePreview(file ? URL.createObjectURL(file) : null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    // [PRODUCTION FIX 2026-07-28] createdByUid: user?.uid silently became
    // `undefined` if the auth store hadn't finished hydrating `user` yet
    // (role can populate slightly ahead of user in some timing cases) —
    // and Firestore's addDoc() throws on ANY field whose value is
    // `undefined`. Combined with the bare `catch {}` below (which discarded
    // the real error entirely), this produced exactly the reported symptom:
    // a generic failure with no way to tell what actually went wrong.
    // Guarding here turns that into a clear, specific message instead of a
    // Firestore SDK exception.
    if (!user?.uid) {
      setError('You must be signed in to post an announcement. Please refresh and try again.')
      return
    }
    const parsed = AnnouncementSchema.safeParse({ title, body, targetAll, targetRoles, status, publicWebsite })
    if (!parsed.success) return setError(parsed.error.errors[0]?.message ?? 'Validation error')
    setLoading(true)
    try {
      // Upload the cover image first (if any) — AnnouncementForm writes
      // straight to Firestore below, not through POST /announcements, so
      // the image has to go through its own small endpoint (POST
      // /announcements/image) to reach Appwrite and get a fileId back.
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
      await addDoc(collection(db!, COLLECTIONS.ANNOUNCEMENTS), {
        ...parsed.data,
        imageKey: imageKey ?? null,
        createdByUid: user.uid,
        createdAt: serverTimestamp(),
      })
      onClose()
    } catch (err) {
      // Was a bare `catch {}` that discarded the real error completely —
      // logged now so it's visible in devtools, and the message itself is
      // shown when it's an Error (rather than always the same generic
      // string regardless of cause).
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