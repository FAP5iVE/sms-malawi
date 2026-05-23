'use client'
import { useState } from 'react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuthStore } from '@/store/authStore'
import { AnnouncementSchema } from '@shared/schemas/student'
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

  // Determine if this role submits for approval or publishes directly
  const canPublishDirectly = role === 'admin' || role === 'high_rank'
  const status = canPublishDirectly ? 'PUBLISHED' : 'PENDING_APPROVAL'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = AnnouncementSchema.safeParse({ title, body, targetAll, targetRoles, status })
    if (!parsed.success) return setError(parsed.error.errors[0]?.message ?? 'Validation error')
    setLoading(true)
    try {
      await addDoc(collection(db, 'ANNOUNCEMENTS'), {
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
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="Announcement title"
            maxLength={200}
            className="w-full border border-base rounded-xl px-4 py-2.5 text-sm bg-page focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            rows={4}
            placeholder="Write your announcement here…"
            className="w-full border border-base rounded-xl px-4 py-2.5 text-sm bg-page resize-none focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
          />
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
          {error && <p className="text-xs text-brand-coral">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-sm border border-base rounded-xl hover:bg-page"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-sm bg-brand-navy text-white rounded-xl font-semibold flex items-center gap-2 disabled:opacity-60"
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
