'use client'

/**
 * apps/web/src/components/settings/SchoolIdentitySettings.tsx
 *
 * [CHANGE TYPE]: NEW FILE (production fix, 2026-07-28)
 * [PURPOSE]: Admin/HR/High Rank editor for the school identity fields that
 *   power the public landing page — name, hero taglines, vision/mission/core
 *   values, contact details, and the leadership team listing. All of these
 *   were real, publicly-read SETTING_KEYS with sensible defaults, but no
 *   route or UI anywhere ever let anyone change them — GET/PATCH
 *   /settings/school (added alongside this file) is the missing write path.
 * [DEPENDS ON]: apps/web/src/server/routes/settings.ts's /school route
 */

import { useState, useEffect } from 'react'
import { Loader2, Save, Plus, X, Building2, ImagePlus } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { uploadFileDirectly } from '@/lib/directUpload'

interface LeadershipMember {
  name:  string
  title: string
  bio?:  string
  // [NEW] Appwrite file ID — FILE_PREFIX.LEADERSHIP_PHOTO. Set via the
  // upload picker below (POST /settings/leadership-photo), then carried in
  // the LeadershipMember record saved with the rest of /school's PATCH.
  photoKey?: string
  /** Resolved by GET /school for the editor preview only — never sent back
   *  on save (the Zod schema on the server strips it; photoKey is what's
   *  actually persisted). */
  photoUrl?: string | null
  order?: number
}

/** [NEW] One entry in SETTING_KEYS.SCHOOL_DISCOVER_CARDS — the preview
 *  photo behind one of the four fixed Discover-section cards on the public
 *  landing page. Same photoKey/photoUrl split as LeadershipMember above:
 *  photoKey is what's actually persisted, photoUrl is GET /school's
 *  resolved-for-preview-only convenience field. */
interface DiscoverCardEntry {
  cardKey:   'leadership' | 'academics' | 'student_life' | 'admissions'
  photoKey?: string
  photoUrl?: string | null
}

/** The four Discover cards are fixed (they mirror page.tsx's hardcoded
 *  title/desc/href for each) — only which preview photo belongs to which
 *  is editable, so this is a label lookup, not a user-managed list. */
const DISCOVER_CARD_DEFS: { cardKey: DiscoverCardEntry['cardKey']; label: string }[] = [
  { cardKey: 'leadership',   label: 'Leadership' },
  { cardKey: 'academics',    label: 'Academics' },
  { cardKey: 'student_life', label: 'Student Life' },
  { cardKey: 'admissions',   label: 'Admissions' },
]

interface SchoolIdentityData {
  school_name?: string
  school_slogan?: string
  school_system_tagline?: string
  school_hero_subtitle?: string
  school_vision?: string
  school_mission?: string
  school_address?: string
  school_phone?: string
  school_email?: string
  social_facebook_url?: string
  social_twitter_url?: string
  social_instagram_url?: string
  social_youtube_url?: string
  social_linkedin_url?: string
  coreValues: string[]
  leadershipTeam: LeadershipMember[]
  // [NEW] See DiscoverCardEntry above.
  discoverCards: DiscoverCardEntry[]
  foundedYear?: number
}

const inputCls =
  'w-full min-h-[44px] border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-teal/25'
const textareaCls = `${inputCls} resize-y min-h-[80px] py-2.5`
const label = 'block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5'

export function SchoolIdentitySettings() {
  const [data, setData]       = useState<SchoolIdentityData>({ coreValues: [], leadershipTeam: [], discoverCards: [] })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [newValue, setNewValue] = useState('')
  const [newLeader, setNewLeader] = useState({ name: '', title: '', bio: '', photoKey: '', photoPreview: '' })
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  // [NEW] Which Discover card's photo is currently uploading, if any —
  // separate from uploadingPhoto (leadership) since either can be in
  // flight independently of the other.
  const [uploadingDiscoverKey, setUploadingDiscoverKey] = useState<DiscoverCardEntry['cardKey'] | null>(null)

  useEffect(() => {
    apiFetch<SchoolIdentityData>('/settings/school')
      .then((d) => setData({
        ...d,
        coreValues: d.coreValues ?? [],
        leadershipTeam: d.leadershipTeam ?? [],
        discoverCards: d.discoverCards ?? [],
      }))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  function setField<K extends keyof SchoolIdentityData>(key: K, value: SchoolIdentityData[K]) {
    setData((prev) => ({ ...prev, [key]: value }))
  }

  function addCoreValue() {
    const v = newValue.trim()
    if (!v || data.coreValues.includes(v)) return
    setField('coreValues', [...data.coreValues, v])
    setNewValue('')
  }
  function removeCoreValue(v: string) {
    setField('coreValues', data.coreValues.filter((x) => x !== v))
  }

  function addLeader() {
    if (!newLeader.name.trim() || !newLeader.title.trim()) return
    setField('leadershipTeam', [
      ...data.leadershipTeam,
      {
        name: newLeader.name.trim(),
        title: newLeader.title.trim(),
        bio: newLeader.bio.trim() || undefined,
        photoKey: newLeader.photoKey || undefined,
        photoUrl: newLeader.photoPreview || null,
        order: data.leadershipTeam.length,
      },
    ])
    setNewLeader({ name: '', title: '', bio: '', photoKey: '', photoPreview: '' })
  }
  function removeLeader(i: number) {
    setField('leadershipTeam', data.leadershipTeam.filter((_, idx) => idx !== i))
  }

  /** [NEW] Uploads immediately on file pick (same "upload first, attach the
   *  returned fileId" pattern as AnnouncementForm's cover image) so the
   *  photo is ready to include the moment "Add to team" is pressed. */
  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Only image files are allowed for a leadership photo.')
      return
    }
    setUploadingPhoto(true)
    setError(null)
    try {
      const photoKey = await uploadFileDirectly('/settings/leadership-photo/upload-ticket', file)
      setNewLeader((p) => ({ ...p, photoKey, photoPreview: URL.createObjectURL(file) }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload photo.')
    } finally {
      setUploadingPhoto(false)
    }
  }

  /** [NEW] Same immediate-upload-on-pick pattern as handlePhotoChange above
   *  (leadership photos) — uploads via FILE_PREFIX.DISCOVER_PHOTO, then
   *  upserts (by cardKey) into data.discoverCards. Each of the four fixed
   *  cards has at most one photo, so this replaces any existing entry for
   *  that cardKey rather than appending a duplicate. */
  async function handleDiscoverPhotoChange(cardKey: DiscoverCardEntry['cardKey'], e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Only image files are allowed for a Discover card photo.')
      return
    }
    setUploadingDiscoverKey(cardKey)
    setError(null)
    try {
      const photoKey = await uploadFileDirectly('/settings/discover-photo/upload-ticket', file)
      const photoUrl = URL.createObjectURL(file)
      setField('discoverCards', [
        ...data.discoverCards.filter((c) => c.cardKey !== cardKey),
        { cardKey, photoKey, photoUrl },
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload photo.')
    } finally {
      setUploadingDiscoverKey(null)
    }
  }

  async function handleSave() {
    setSaving(true); setError(null); setSaved(false)
    try {
      await apiFetch('/settings/school', { method: 'PATCH', body: JSON.stringify(data) })
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-heading font-bold text-lg text-brand-navy">School Identity</h2>
        <p className="text-sm text-muted mt-0.5">
          Controls the school name, hero taglines, vision/mission, contact details, and leadership listing
          shown on the public landing page.
        </p>
      </div>

      {/* Name & taglines */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={label}>School Name</label>
          <input value={data.school_name ?? ''} onChange={(e) => setField('school_name', e.target.value)} className={inputCls} placeholder="SMS Malawi" />
        </div>
        <div>
          <label className={label}>Slogan</label>
          <input value={data.school_slogan ?? ''} onChange={(e) => setField('school_slogan', e.target.value)} className={inputCls} placeholder="Excellence in Education" />
        </div>
        <div>
          <label className={label}>Header Sub-label</label>
          <input value={data.school_system_tagline ?? ''} onChange={(e) => setField('school_system_tagline', e.target.value)} className={inputCls} placeholder="Secondary School Management System" />
        </div>
        <div>
          <label className={label}>Hero Subtitle</label>
          <input value={data.school_hero_subtitle ?? ''} onChange={(e) => setField('school_hero_subtitle', e.target.value)} className={inputCls} placeholder="Excellence in Education — from Form 1 through MSCE." />
        </div>
      </div>

      {/* Vision & Mission */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={label}>Mission</label>
          <textarea value={data.school_mission ?? ''} onChange={(e) => setField('school_mission', e.target.value)} className={textareaCls} placeholder="Our mission statement…" />
        </div>
        <div>
          <label className={label}>Vision</label>
          <textarea value={data.school_vision ?? ''} onChange={(e) => setField('school_vision', e.target.value)} className={textareaCls} placeholder="Our vision statement…" />
        </div>
      </div>

      {/* Core Values */}
      <div>
        <label className={label}>Core Values</label>
        <div className="flex flex-wrap gap-2 mb-3">
          {data.coreValues.length === 0 ? (
            <span className="text-xs text-muted">No core values yet.</span>
          ) : (
            data.coreValues.map((v) => (
              <span key={v} className="inline-flex items-center gap-1.5 bg-page border border-base rounded-full px-3 py-1 text-xs text-body">
                {v}
                <button type="button" onClick={() => removeCoreValue(v)} aria-label={`Remove ${v}`} className="text-muted hover:text-brand-coral">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))
          )}
        </div>
        <div className="flex gap-2 max-w-xs">
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCoreValue() } }}
            className={`${inputCls} min-h-9 text-xs`}
            placeholder="Add a core value…"
          />
          <button type="button" onClick={addCoreValue} disabled={!newValue.trim()} className="shrink-0 border border-base rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-page disabled:opacity-40">
            Add
          </button>
        </div>
      </div>

      {/* Contact */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div>
          <label className={label}>Address</label>
          <input value={data.school_address ?? ''} onChange={(e) => setField('school_address', e.target.value)} className={inputCls} placeholder="P.O. Box 123, Blantyre" />
        </div>
        <div>
          <label className={label}>Phone</label>
          <input value={data.school_phone ?? ''} onChange={(e) => setField('school_phone', e.target.value)} className={inputCls} placeholder="+265 999 123 456" />
        </div>
        <div>
          <label className={label}>Email</label>
          <input value={data.school_email ?? ''} onChange={(e) => setField('school_email', e.target.value)} className={inputCls} placeholder="info@school.edu.mw" />
        </div>
      </div>

      {/* [PRODUCTION FIX 2026-07-28] Founded Year — the landing page's
          "Years of excellence" stat is genuinely computed live from this,
          but until now there was nowhere to actually set it. */}
      <div className="max-w-xs">
        <label className={label}>Founded Year</label>
        <input
          type="number"
          value={data.foundedYear ?? ''}
          onChange={(e) => setField('foundedYear', e.target.value ? Number(e.target.value) : undefined)}
          className={inputCls}
          placeholder="1979"
        />
        <p className="text-xs text-muted mt-1.5">Drives the &quot;Years of excellence&quot; figure on the landing page.</p>
      </div>

      {/* [PRODUCTION FIX 2026-07-28] Social media — footer icons were
          decorative with no real links in both the old page and the
          redesign. Any left blank simply won't render as a link. */}
      <div>
        <label className={label}>Social Media Links</label>
        <div className="grid sm:grid-cols-2 gap-3">
          {([
            ['social_facebook_url', 'Facebook', 'https://facebook.com/yourschool'],
            ['social_twitter_url', 'Twitter / X', 'https://x.com/yourschool'],
            ['social_instagram_url', 'Instagram', 'https://instagram.com/yourschool'],
            ['social_youtube_url', 'YouTube', 'https://youtube.com/@yourschool'],
            ['social_linkedin_url', 'LinkedIn', 'https://linkedin.com/company/yourschool'],
          ] as const).map(([key, name, placeholder]) => (
            <div key={key}>
              <label htmlFor={key} className="text-xs text-muted mb-1 block">{name}</label>
              <input
                id={key}
                type="url"
                value={data[key] ?? ''}
                onChange={(e) => setField(key, e.target.value)}
                className={inputCls}
                placeholder={placeholder}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Leadership team */}
      <div>
        <label className={label}>Leadership Team (public listing)</label>
        <div className="space-y-2 mb-4">
          {data.leadershipTeam.length === 0 ? (
            <p className="text-xs text-muted">No leadership members added yet.</p>
          ) : (
            data.leadershipTeam.map((m, i) => (
              <div key={`${m.name}-${i}`} className="flex items-center justify-between border border-base rounded-xl p-3">
                <div className="flex items-center gap-3">
                  {m.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- Appwrite-hosted photo, not a local Next asset
                    <img src={m.photoUrl} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-brand-navy/10 flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4 text-brand-navy" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-heading font-semibold text-body">{m.name}</p>
                    <p className="text-xs text-muted">{m.title}</p>
                  </div>
                </div>
                <button type="button" onClick={() => removeLeader(i)} className="text-xs text-brand-coral hover:underline font-medium">
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
        <div className="border border-base rounded-xl p-4 space-y-2">
          <div className="grid sm:grid-cols-2 gap-2">
            <input value={newLeader.name} onChange={(e) => setNewLeader((p) => ({ ...p, name: e.target.value }))} placeholder="Full name" className={`${inputCls} min-h-9 text-xs`} />
            <input value={newLeader.title} onChange={(e) => setNewLeader((p) => ({ ...p, title: e.target.value }))} placeholder="Title (e.g. Head Teacher)" className={`${inputCls} min-h-9 text-xs`} />
          </div>
          <textarea value={newLeader.bio} onChange={(e) => setNewLeader((p) => ({ ...p, bio: e.target.value }))} placeholder="Short bio (optional)" className={`${inputCls} min-h-15 text-xs`} />
          {/* [NEW] Photo attach — displayed on the public Leadership page. */}
          <div className="flex items-center gap-3">
            {newLeader.photoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element -- local blob: preview, not a remote asset
              <img src={newLeader.photoPreview} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 border border-base" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-page border border-dashed border-base flex items-center justify-center shrink-0">
                <ImagePlus className="w-4 h-4 text-muted" aria-hidden />
              </div>
            )}
            <label className="inline-flex items-center gap-1.5 border border-base rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-page cursor-pointer">
              {uploadingPhoto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
              {newLeader.photoKey ? 'Change photo' : 'Add photo'}
              <input type="file" accept="image/*" onChange={handlePhotoChange} disabled={uploadingPhoto} className="hidden" />
            </label>
          </div>
          <button
            type="button"
            onClick={addLeader}
            disabled={!newLeader.name.trim() || !newLeader.title.trim() || uploadingPhoto}
            className="inline-flex items-center gap-1.5 border border-base rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-page disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" /> Add to team
          </button>
        </div>
      </div>

      {/* [NEW] Discover Cards — preview photo behind each of the four fixed
          Discover-section cards on the public landing page. Same
          upload-immediately-on-pick workflow as the Leadership Team photos
          above, just one fixed slot per card instead of an open list. */}
      <div>
        <label className={label}>Discover Cards — Preview Images</label>
        <p className="text-xs text-muted mb-3 -mt-1">
          Shown behind each card in the public landing page&apos;s Discover section, replacing its default colour once set.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {DISCOVER_CARD_DEFS.map(({ cardKey, label: cardLabel }) => {
            const entry = data.discoverCards.find((c) => c.cardKey === cardKey)
            const isUploading = uploadingDiscoverKey === cardKey
            return (
              <div key={cardKey} className="border border-base rounded-xl p-3 flex flex-col items-center gap-2 text-center">
                {entry?.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local blob: preview or Appwrite-hosted photo, not a local Next asset
                  <img src={entry.photoUrl} alt="" className="w-full aspect-video rounded-lg object-cover border border-base" />
                ) : (
                  <div className="w-full aspect-video rounded-lg bg-page border border-dashed border-base flex items-center justify-center">
                    <ImagePlus className="w-5 h-5 text-muted" aria-hidden />
                  </div>
                )}
                <p className="text-xs font-heading font-semibold text-body">{cardLabel}</p>
                <label className="inline-flex items-center gap-1.5 border border-base rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-page cursor-pointer">
                  {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                  {entry?.photoKey ? 'Change photo' : 'Add photo'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleDiscoverPhotoChange(cardKey, e)}
                    disabled={isUploading}
                    className="hidden"
                  />
                </label>
              </div>
            )
          })}
        </div>
      </div>

      {error && <p className="text-sm text-brand-coral">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="min-h-11 px-5 rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors disabled:opacity-60 flex items-center gap-2"
        >
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save Changes</>}
        </button>
        {saved && <span className="text-sm text-emerald-600 font-medium">Saved ✓</span>}
      </div>
    </div>
  )
}