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
 *
 *   [PRODUCTION FIX, this phase]: added the 'ads' (Academic Advertisement)
 *   mode — a standalone public-only post type alongside News, plus real
 *   Save-Draft / continue-a-draft support for all four modes. Previously
 *   there was no way to save incomplete work: every submit had to be a
 *   complete, valid, ready-to-publish item in one sitting.
 * [DEPENDS ON]: W/server/routes/announcements.ts (POST /, POST /draft,
 *   PATCH /:id/draft, PATCH /:id/publish), W/hooks/usePermissions.ts,
 *   @shared/schemas/announcement (AnnouncementSchema, AnnouncementDraftSchema)
 */
'use client'
import { useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { usePermissions } from '@/hooks/usePermissions'
import { AnnouncementSchema, AnnouncementDraftSchema } from '@shared/schemas/announcement'
import { apiFetch } from '@/lib/api-client'
import { X, Loader2, ImagePlus, Save } from 'lucide-react'
import { USER_ROLES } from '@shared/types/roles'
import type { Announcement } from '@/hooks/useAnnouncements'

type FormMode = 'announcement' | 'event' | 'news' | 'ads'

interface Props {
  onClose: () => void
  /** 'event' collects an event date and posts postType: 'EVENT' — the
   *  explicit tag the public /events page (and nothing else) filters on.
   *
   *  'news' posts postType: 'NEWS' — public-website content only, forced
   *  publicWebsite=true and cleared internal targeting server-side (see
   *  announcementService.ts's PUBLIC_ONLY_POST_TYPES). Never appears in
   *  anyone's internal /announcements tab.
   *
   *  'ads' (Academic Advertisement) posts postType: 'ADVERTISEMENT' — for
   *  calls for applications, intake notices, examination circulars. A
   *  standalone module the same way News is: same create/approval
   *  permission, same public-only forcing, but its own postType, its own
   *  public section, and — like every mode here — never shown as a plain
   *  Announcement, News article, or Event.
   *
   *  Everything else — validation, the POST /announcements call, the
   *  approval workflow — is identical across all four modes. */
  mode?: FormMode
  /** [NEW] When present, the form opens pre-filled with an existing DRAFT
   *  document (see useMyDrafts()/GET /announcements/drafts) instead of a
   *  blank form — "continue writing later". Saving continues to PATCH the
   *  same draft id; Publish promotes it via PATCH /:id/publish instead of
   *  creating a new document. */
  draft?: Announcement
}

const POST_TYPE: Record<FormMode, 'ANNOUNCEMENT' | 'NEWS' | 'EVENT' | 'ADVERTISEMENT'> = {
  announcement: 'ANNOUNCEMENT',
  event: 'EVENT',
  news: 'NEWS',
  ads: 'ADVERTISEMENT',
}

const NOUN: Record<FormMode, string> = {
  announcement: 'announcement',
  event: 'event',
  news: 'news article',
  ads: 'academic advertisement',
}

function toDateInputValue(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

export function AnnouncementForm({ onClose, mode = 'announcement', draft }: Props) {
  const isEvent = mode === 'event'
  const isNews = mode === 'news'
  const isAds = mode === 'ads'
  // News and Academic Advertisements are both public-website-only content —
  // no internal audience concept, always publicWebsite=true server-side
  // (announcementService.ts's PUBLIC_ONLY_POST_TYPES). Events keep the
  // ANNOUNCEMENT-style internal-targeting option.
  const isPublicOnly = isNews || isAds
  const noun = NOUN[mode]
  const { user } = useAuthStore()
  const { can } = usePermissions()

  const [title, setTitle] = useState(draft?.title ?? '')
  const [body, setBody] = useState(draft?.body ?? '')
  const [targetAll, setTargetAll] = useState(draft ? (draft.targetAll ?? false) : !isPublicOnly)
  const [targetRoles, setTargetRoles] = useState<string[]>(draft?.targetRoles ?? [])
  // [PRODUCTION FIX 2026-07-28] publicWebsite is a separate opt-in from
  // targetAll — see announcementService.ts's CreateAnnouncementInput
  // comment for why these must not be conflated. Defaults on for event,
  // news, and ads mode since that's the whole point of creating any of them.
  const [publicWebsite, setPublicWebsite] = useState(
    draft ? (draft.publicWebsite ?? false) : (isEvent || isPublicOnly),
  )
  const [eventDate, setEventDate] = useState(toDateInputValue(draft?.eventDate))
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  // [NEW] The already-uploaded imageKey carried over from a draft being
  // continued — kept unless the user picks a new file (handleImageChange
  // clears it) or removes the image outright.
  const [persistedImageKey, setPersistedImageKey] = useState<string | null>(draft?.imageKey ?? null)
  const [loading, setLoading] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Display-only — the server independently re-derives this from the real
  // announcement.publishDirect permission (announcements.ts's POST /
  // and PATCH /:id/publish routes) and is the actual authority. This only
  // decides which message and button label to show before submitting.
  const canPublishDirectly = can('announcement.publishDirect')

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setImageFile(file)
    setImagePreview(file ? URL.createObjectURL(file) : null)
    if (file) setPersistedImageKey(null)
  }

  function removeImage() {
    setImageFile(null)
    setImagePreview(null)
    setPersistedImageKey(null)
  }

  /** Uploads a newly-picked image (if any) and returns whichever imageKey
   *  should be saved — the freshly uploaded one, the persisted one carried
   *  over from a draft, or undefined if there's no image at all. */
  async function resolveImageKey(): Promise<string | undefined> {
    if (imageFile) {
      const fd = new FormData()
      fd.append('file', imageFile)
      const uploaded = await apiFetch<{ imageKey: string }>('/announcements/image', {
        method: 'POST',
        body: fd,
      })
      return uploaded.imageKey
    }
    return persistedImageKey ?? undefined
  }

  /** [NEW] Save (or update) this as a DRAFT — deliberately lenient: only a
   *  non-empty title is required, everything else (including the whole
   *  body) may be left blank and finished later. Does not close the form
   *  unless the save succeeds, so the author can keep typing right after. */
  async function handleSaveDraft() {
    setError(null)
    if (!title.trim()) {
      setError('Give it at least a title before saving as a draft.')
      return
    }
    if (!user?.uid) {
      setError('You must be signed in to save a draft. Please refresh and try again.')
      return
    }
    const parsed = AnnouncementDraftSchema.safeParse({
      title,
      body,
      targetAll,
      targetRoles,
      publicWebsite,
      eventDate: isEvent && eventDate ? new Date(eventDate).toISOString() : undefined,
      postType: POST_TYPE[mode],
    })
    if (!parsed.success) return setError(parsed.error.errors[0]?.message ?? 'Validation error')
    setSavingDraft(true)
    try {
      const imageKey = await resolveImageKey()
      if (draft) {
        await apiFetch(`/announcements/${draft.id}/draft`, {
          method: 'PATCH',
          body: JSON.stringify({ ...parsed.data, imageKey }),
        })
      } else {
        await apiFetch('/announcements/draft', {
          method: 'POST',
          body: JSON.stringify({ ...parsed.data, imageKey }),
        })
      }
      onClose()
    } catch (err) {
      console.error(`Failed to save ${noun} draft:`, err)
      setError(err instanceof Error ? err.message : `Failed to save draft. Please try again.`)
    } finally {
      setSavingDraft(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!user?.uid) {
      setError(`You must be signed in to post ${isEvent ? 'an' : 'a'} ${noun}. Please refresh and try again.`)
      return
    }
    if (isEvent && !eventDate) {
      setError('Please choose the event date.')
      return
    }
    const parsed = AnnouncementSchema.safeParse({
      title,
      body,
      targetAll,
      targetRoles,
      publicWebsite,
      eventDate: isEvent && eventDate ? new Date(eventDate).toISOString() : undefined,
      postType: POST_TYPE[mode],
    })
    if (!parsed.success) return setError(parsed.error.errors[0]?.message ?? 'Validation error')
    setLoading(true)
    try {
      const imageKey = await resolveImageKey()
      const payload = {
        title: parsed.data.title,
        body: parsed.data.body,
        targetAll: parsed.data.targetAll,
        targetRoles: parsed.data.targetRoles,
        publicWebsite: parsed.data.publicWebsite,
        eventDate: parsed.data.eventDate,
        postType: parsed.data.postType,
        imageKey,
      }
      if (draft) {
        // Promote the existing DRAFT document rather than create a new one.
        await apiFetch<{ id: string; status: string }>(`/announcements/${draft.id}/publish`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
      } else {
        await apiFetch<{ id: string; status: string }>('/announcements', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
      }
      onClose()
    } catch (err) {
      console.error(`Failed to post ${noun}:`, err)
      setError(err instanceof Error ? err.message : `Failed to post ${noun}. Please try again.`)
    } finally {
      setLoading(false)
    }
  }

  const HEADING: Record<FormMode, string> = {
    announcement: draft ? 'Continue Draft — Announcement' : 'New Announcement',
    event: draft ? 'Continue Draft — Event' : 'New Event',
    news: draft ? 'Continue Draft — News Article' : 'Write News Article',
    ads: draft ? 'Continue Draft — Academic Advertisement' : 'New Academic Advertisement',
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
          <h2 className="font-heading font-bold text-brand-navy">{HEADING[mode]}</h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-page rounded-lg"
            aria-label={`Close ${noun} form`}
          >
            <X className="w-4 h-4 text-muted" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="announcement-title" className="block text-sm font-medium text-body mb-1.5">
              {isNews ? 'Headline' : isAds ? 'Advertisement title' : 'Title'}
            </label>
            <input
              id="announcement-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder={
                isEvent ? 'Event title'
                : isNews ? 'Article headline'
                : isAds ? 'e.g. Call for Applications — 2027 Intake'
                : 'Announcement title'
              }
              maxLength={200}
              className="w-full border border-base rounded-xl px-4 py-2.5 text-sm bg-page focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
            />
          </div>
          {isEvent && (
            <div>
              <label htmlFor="event-date" className="block text-sm font-medium text-body mb-1.5">Event date</label>
              <input
                id="event-date"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                required
                className="w-full border border-base rounded-xl px-4 py-2.5 text-sm bg-page focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
              />
            </div>
          )}
          <div>
            <label htmlFor="announcement-body" className="block text-sm font-medium text-body mb-1.5">
              {isEvent ? 'Details' : isNews ? 'Article' : isAds ? 'Notice details' : 'Message'}
            </label>
            <textarea
              id="announcement-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              rows={isNews ? 10 : isAds ? 8 : 4}
              placeholder={
                isEvent ? 'Describe the event…'
                : isNews ? 'Write the full article…'
                : isAds ? 'Intake dates, eligibility, how and where to apply…'
                : 'Write your announcement here…'
              }
              className="w-full border border-base rounded-xl px-4 py-2.5 text-sm bg-page resize-none focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
            />
          </div>
          {/* [PRODUCTION FIX] News and Academic Advertisements are
              public-site-only content by design — see the postType comment
              on the Props interface above. There is no internal targeting
              to configure and nothing to opt into, so this whole block (and
              the publicWebsite toggle right after it) is skipped entirely
              for both. */}
          {!isPublicOnly && (
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
          )}
          {/* [PRODUCTION FIX 2026-07-28] Public website opt-in — independent
              of "Send to everyone" above, which only controls internal
              visibility. News and Ads are always public, so the toggle
              itself is hidden for both (nothing to opt into), but the
              cover-image picker below still applies. */}
          <div className="border-t border-base pt-4">
            {!isPublicOnly && (
              <>
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
                  Shows on the public landing page, in its own section — never mixed with News,
                  Academic Advertisements, or each other. Separate from &quot;Send to everyone&quot;
                  above — that only controls who inside the school sees it.
                  {isEvent && ' Events are typically public — leave this checked unless this is an internal-only event.'}
                </p>
              </>
            )}
            {isPublicOnly && (
              <p className="text-xs text-muted mb-3">
                {isNews
                  ? 'News articles are public-website content only — this never appears in anyone\u2019s internal Announcements tab.'
                  : 'Academic Advertisements are a standalone, public-website-only section — this never appears in anyone\u2019s internal Announcements tab, and never as a News article or Event.'}
              </p>
            )}

            {publicWebsite && (
              <div>
                <label className="block text-sm font-medium text-body mb-1.5">
                  {isNews ? 'Photo' : 'Cover image'} <span className="text-muted font-normal">(optional)</span>
                </label>
                {imagePreview || persistedImageKey ? (
                  <div className="relative">
                    {imagePreview ? (
                      // eslint-disable-next-line @next/next/no-img-element -- local blob: preview, not a remote asset
                      <img src={imagePreview} alt="Selected cover" className="w-full h-32 object-cover rounded-xl border border-base" />
                    ) : (
                      <div className="w-full h-32 rounded-xl border border-base bg-page flex items-center justify-center text-xs text-muted">
                        Image attached from your draft
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={removeImage}
                      className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-7 h-7 flex items-center justify-center"
                      aria-label="Remove image"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-base rounded-xl h-24 cursor-pointer hover:border-brand-teal transition-colors text-muted">
                    <ImagePlus className="w-5 h-5" aria-hidden />
                    <span className="text-xs">{isNews ? 'Add a photo' : 'Add a cover image'}</span>
                    <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                  </label>
                )}
              </div>
            )}
          </div>
          {!canPublishDirectly && (
            <p className="text-xs text-muted bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Your {noun} will be submitted for approval before publishing.
            </p>
          )}
          {error && (
            <p role="alert" className="text-xs text-brand-coral">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-sm border border-base rounded-xl hover:bg-page min-h-[44px]"
            >
              Cancel
            </button>
            {/* [NEW] Save as draft — lenient validation, doesn't require the
                item to be complete. Lets an author keep several drafts of
                any of the four types going before committing to Publish. */}
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={savingDraft || loading}
              className="px-5 py-2 text-sm border border-brand-teal text-brand-teal rounded-xl font-semibold flex items-center gap-2 disabled:opacity-60 min-h-[44px] hover:bg-brand-teal/5"
            >
              {savingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" aria-hidden />}
              {draft ? 'Save Draft' : 'Save as Draft'}
            </button>
            <button
              type="submit"
              disabled={loading || savingDraft}
              className="px-5 py-2 text-sm bg-brand-navy text-white rounded-xl font-semibold flex items-center gap-2 disabled:opacity-60 min-h-[44px]"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {canPublishDirectly
                ? (isEvent ? 'Publish Event' : isNews ? 'Publish Article' : isAds ? 'Publish Advertisement' : 'Publish')
                : (isEvent ? 'Submit Event for Approval' : isNews ? 'Submit Article for Approval' : isAds ? 'Submit Advertisement for Approval' : 'Submit for Approval')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}