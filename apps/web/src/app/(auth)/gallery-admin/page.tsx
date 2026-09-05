/*
 * apps/web/src/app/(auth)/gallery-admin/page.tsx
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: [Issue #6] The public "Life at our school" gallery page and its
 *   full backend (server/routes/gallery.ts: upload/list/delete, Prisma
 *   GalleryPhoto model) already existed — but no admin-facing page ever
 *   called POST /gallery, so there was no "add photo" button anywhere in
 *   the app. This is that missing page.
 *
 *   No approval workflow here by design: admin, high_rank, and lower_rank
 *   can all upload/delete directly — unlike Announcements/News, gallery
 *   photos do not go through a pending-approval state. (Confirmed 2026-08 —
 *   see gallery.ts's requireRole lists, which already matched this before
 *   this page existed.)
 * [DEPENDS ON]: W/server/routes/gallery.ts (GET/POST/DELETE /gallery),
 *   W/lib/api-client.ts (apiFetch, queryKeys.gallery — added this phase),
 *   W/components/shared/RoleGuard.tsx
 */
'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { apiFetch, queryKeys } from '@/lib/api-client'
import { uploadFileDirectly } from '@/lib/directUpload'
import { Images, ImagePlus, Loader2, Trash2, X } from 'lucide-react'

interface GalleryPhoto {
  id: string
  fileKey: string
  url: string
  caption: string | null
  category: string | null
  uploadedByUid: string
  createdAt: string
}

export const dynamic = 'force-dynamic'

export default function GalleryPage() {
  return (
    <RoleGuard allowed={['admin', 'high_rank', 'lower_rank']}>
      <GalleryContent />
    </RoleGuard>
  )
}

function UploadForm({ onDone }: { onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setFile(f)
    setPreview(f ? URL.createObjectURL(f) : null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!file) {
      setError('Please choose a photo to upload.')
      return
    }
    setLoading(true)
    try {
      // Description is required at the product level even though the
      // backend field itself is optional — a gallery photo with no
      // caption at all isn't useful on the public page.
      if (!caption.trim()) {
        setError('Please add a short description for this photo.')
        setLoading(false)
        return
      }
      const fileId = await uploadFileDirectly('/gallery/upload-ticket', file)
      await apiFetch('/gallery', {
        method: 'POST',
        body: JSON.stringify({
          fileId,
          caption: caption.trim(),
          ...(category.trim() ? { category: category.trim() } : {}),
        }),
      })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload photo. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-surface rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-surface flex items-center justify-between px-6 py-4 border-b border-base">
          <h2 className="font-heading font-bold text-brand-navy">Add Photo</h2>
          <button onClick={onDone} className="p-1.5 hover:bg-page rounded-lg" aria-label="Close">
            <X className="w-4 h-4 text-muted" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-body mb-1.5">Photo</label>
            {preview ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob: preview */}
                <img src={preview} alt="Selected" className="w-full h-40 object-cover rounded-xl border border-base" />
                <button
                  type="button"
                  onClick={() => { setFile(null); setPreview(null) }}
                  className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-7 h-7 flex items-center justify-center"
                  aria-label="Remove photo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-base rounded-xl h-32 cursor-pointer hover:border-brand-teal transition-colors text-muted">
                <ImagePlus className="w-6 h-6" aria-hidden />
                <span className="text-xs">Choose a photo</span>
                <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
              </label>
            )}
          </div>
          <div>
            <label htmlFor="gallery-caption" className="block text-sm font-medium text-body mb-1.5">Description</label>
            <textarea
              id="gallery-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              required
              rows={2}
              placeholder="e.g. Form 3 students at Sports Day, August 2026"
              className="w-full border border-base rounded-xl px-4 py-2.5 text-sm bg-page resize-none focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
            />
          </div>
          <div>
            <label htmlFor="gallery-category" className="block text-sm font-medium text-body mb-1.5">
              Category <span className="text-muted font-normal">(optional)</span>
            </label>
            <input
              id="gallery-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Sports Day, Assembly, Graduation"
              className="w-full border border-base rounded-xl px-4 py-2.5 text-sm bg-page focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
            />
          </div>
          {error && (
            <p role="alert" className="text-xs text-brand-coral">{error}</p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onDone}
              className="px-5 py-2 text-sm border border-base rounded-xl hover:bg-page min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-sm bg-brand-teal text-white rounded-xl font-semibold flex items-center gap-2 disabled:opacity-60 min-h-[44px]"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Add to Gallery
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function GalleryContent() {
  const queryClient = useQueryClient()
  const [showUpload, setShowUpload] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const { data: photos = [], isLoading, error } = useQuery({
    queryKey: queryKeys.gallery.all(),
    queryFn: () => apiFetch<GalleryPhoto[]>('/gallery'),
  })

  function refresh() {
    setShowUpload(false)
    void queryClient.invalidateQueries({ queryKey: queryKeys.gallery.all() })
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    setDeleteError(null)
    try {
      await apiFetch(`/gallery/${id}`, { method: 'DELETE' })
      await queryClient.invalidateQueries({ queryKey: queryKeys.gallery.all() })
      setConfirmId(null)
    } catch {
      setDeleteError('Failed to delete photo. Please try again.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Images className="w-5 h-5 text-brand-teal" aria-hidden="true" />
          <h1 className="font-heading font-bold text-xl text-brand-navy">Gallery</h1>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 bg-brand-teal text-white px-4 py-2 rounded-xl text-sm font-heading font-semibold hover:bg-brand-teal-light transition-colors min-h-[44px]"
        >
          <ImagePlus className="w-4 h-4" aria-hidden="true" /> Add Photo
        </button>
      </div>

      {deleteError && (
        <p role="alert" className="text-xs text-brand-coral mb-4">{deleteError}</p>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="aspect-square rounded-xl bg-surface animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 text-brand-coral">
          <Images className="w-10 h-10 mb-3 opacity-40" aria-hidden="true" />
          <p className="text-sm">Failed to load gallery photos.</p>
        </div>
      ) : photos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted">
          <Images className="w-10 h-10 mb-3 opacity-30" aria-hidden="true" />
          <p className="text-sm">No photos yet — add the first one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {photos.map((p) => (
            <div key={p.id} className="group relative rounded-xl overflow-hidden border border-base bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element -- remote Appwrite view URL, not a local/optimizable asset */}
              <img src={p.url} alt={p.caption ?? 'Gallery photo'} className="w-full aspect-square object-cover" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                {p.category && (
                  <span className="inline-block text-[10px] font-heading font-bold text-white/90 bg-white/20 rounded-full px-2 py-0.5 mb-1">
                    {p.category}
                  </span>
                )}
                {p.caption && <p className="text-xs text-white line-clamp-2">{p.caption}</p>}
              </div>
              <button
                onClick={() => setConfirmId(confirmId === p.id ? null : p.id)}
                disabled={deletingId === p.id}
                aria-label="Delete photo"
                className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-8 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity disabled:opacity-60"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              {confirmId === p.id && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3 p-4">
                  <p className="text-xs text-white text-center">Delete this photo permanently?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmId(null)}
                      className="px-3 py-1.5 text-xs bg-white/20 text-white rounded-lg hover:bg-white/30"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      disabled={deletingId === p.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand-coral text-white rounded-lg disabled:opacity-60"
                    >
                      {deletingId === p.id && <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />}
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showUpload && <UploadForm onDone={refresh} />}
    </div>
  )
}