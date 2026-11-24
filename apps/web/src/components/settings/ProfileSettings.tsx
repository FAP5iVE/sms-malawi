'use client'

/*
 * apps/web/src/components/settings/ProfileSettings.tsx — Phase D15
 * All roles: update display name, email notification address, and password reset.
 */

import { useState } from 'react'
import { StatusText } from '@/components/shared/StatusText'
import { updateProfile, getAuth } from 'firebase/auth'
import { requestPasswordResetEmail } from '@/lib/passwordResetRequest'
import { Loader2, Save, KeyRound } from 'lucide-react'
import { useAuthStore }        from '@/store/authStore'
import { usePermissions }     from '@/hooks/usePermissions'
import { useOwnStaffDetails, useUpdateOwnStaffDetails } from '@/hooks/useHR'
import { UpdateOwnDetailsSchema } from '@shared/schemas/hr'
import { SignatureSettings } from '@/components/settings/SignatureSettings'

/**
 * Own phone and next of kin (hr.editOwnLimitedFields). Renders nothing for an
 * account with no staff profile (the endpoint answers 404) or without the
 * permission. Date of birth, NRB and TPIN are deliberately NOT editable here.
 */
function OwnDetailsCard() {
  const { can } = usePermissions()
  const allowed = can('hr.editOwnLimitedFields')
  const { data, isError } = useOwnStaffDetails(allowed)
  const save = useUpdateOwnStaffDetails()
  const [form, setForm] = useState({ phone: '', nextOfKinName: '', nextOfKinRelation: '', nextOfKinPhone: '' })
  const [seeded, setSeeded] = useState<typeof data>(undefined)
  const [msg, setMsg] = useState<string | null>(null)

  // Re-seed whenever the loaded details change (render-time adjustment, same
  // pattern as the display-name field above).
  if (data && data !== seeded) {
    setSeeded(data)
    setForm({
      phone: data.phone ?? '',
      nextOfKinName: data.nextOfKinName ?? '',
      nextOfKinRelation: data.nextOfKinRelation ?? '',
      nextOfKinPhone: data.nextOfKinPhone ?? '',
    })
  }

  if (!allowed || isError || !data) return null

  const cls = 'w-full max-w-sm min-h-11 border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25'
  const lbl = 'block text-xs font-heading font-semibold text-muted mb-1.5'

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = UpdateOwnDetailsSchema.safeParse(form)
    if (!parsed.success) { setMsg(parsed.error.issues[0]?.message ?? 'Check the details.'); return }
    setMsg(null)
    save.mutate(parsed.data, { onError: (err) => setMsg(err instanceof Error ? err.message : 'Could not save.') })
  }

  return (
    <form onSubmit={submit} className="pt-4 border-t border-base space-y-4">
      <div>
        <h3 className="font-heading font-semibold text-sm text-body">Contact and next of kin</h3>
        <p className="text-xs text-muted mt-0.5">Keep these current. HR uses them in an emergency.</p>
      </div>
      <div><label className={lbl}>Phone</label><input className={cls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} type="tel" /></div>
      <div><label className={lbl}>Next of kin</label><input className={cls} value={form.nextOfKinName} onChange={(e) => setForm({ ...form, nextOfKinName: e.target.value })} /></div>
      <div><label className={lbl}>Relationship</label><input className={cls} value={form.nextOfKinRelation} onChange={(e) => setForm({ ...form, nextOfKinRelation: e.target.value })} /></div>
      <div><label className={lbl}>Next of kin phone</label><input className={cls} value={form.nextOfKinPhone} onChange={(e) => setForm({ ...form, nextOfKinPhone: e.target.value })} type="tel" /></div>
      {msg && <p className="text-sm text-tone-coral" role="alert">{msg}</p>}
      <button
        type="submit"
        disabled={save.isPending}
        className="min-h-11 px-5 rounded-xl text-sm font-heading font-semibold bg-brand-deep text-white hover:brightness-110 disabled:opacity-60 flex items-center gap-2"
      >
        {save.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save details</>}
      </button>
    </form>
  )
}

export function ProfileSettings() {
  const { user }            = useAuthStore()
  const [displayName, setDisplayName] = useState('')
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [resetSent,   setResetSent]   = useState(false)

  // R19 — render-time adjustment (matches AttendanceSheet.tsx and
  // MarksEntrySheet.tsx), replacing a useEffect that called setState
  // synchronously. `user` resolves asynchronously via useAuthStore(); this
  // re-seeds `displayName` whenever `user`'s reference changes, exactly
  // mirroring the effect's own `[user]` dependency, without ever calling
  // setState from inside an effect.
  const [prevUser, setPrevUser] = useState(user)
  if (user !== prevUser) {
    setPrevUser(user)
    if (user?.displayName) setDisplayName(user.displayName)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const currentUser = getAuth().currentUser
    if (!currentUser) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await updateProfile(currentUser, { displayName: displayName.trim() })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  async function handlePasswordReset() {
    if (!user?.email) return
    try {
      await requestPasswordResetEmail(user.email)
      setResetSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading font-bold text-lg text-brand-navy">Profile and account</h2>
        <p className="text-sm text-muted mt-0.5">Update your display name and password.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        <div>
          <label className="block text-xs font-heading font-semibold text-muted mb-1.5">
            Display name
          </label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full max-w-sm min-h-11 border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
            placeholder="Your full name"
          />
        </div>

        <div>
          <label className="block text-xs font-heading font-semibold text-muted mb-1.5">
            Email address
          </label>
          <input
            value={user?.email ?? ''}
            readOnly
            className="w-full max-w-sm min-h-11 border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-muted cursor-not-allowed"
          />
          <p className="text-xs text-muted mt-1">Email is managed by your administrator.</p>
        </div>

        {error && (
          <p className="text-sm text-tone-coral">{error}</p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="min-h-11 px-5 rounded-xl text-sm font-heading font-semibold bg-brand-deep text-white hover:brightness-110 transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              : <><Save className="w-4 h-4" /> Save Changes</>}
          </button>
          {saved && <StatusText tone="success" size="md">Saved</StatusText>}
        </div>
      </form>

      <OwnDetailsCard />

      <SignatureSettings />

      <div className="pt-4 border-t border-base">
        <h3 className="font-heading font-semibold text-sm text-body mb-1">Change password</h3>
        <p className="text-xs text-muted mb-3">
          A password reset link will be sent to {user?.email}.
        </p>
        {resetSent ? (
          <StatusText tone="success" size="md">Reset email sent</StatusText>
        ) : (
          <button
            type="button"
            onClick={handlePasswordReset}
            className="min-h-11 px-5 rounded-xl text-sm font-heading font-semibold border border-base text-muted hover:bg-page hover:text-body transition-colors flex items-center gap-2"
          >
            <KeyRound className="w-4 h-4" />
            Send password reset email
          </button>
        )}
      </div>
    </div>
  )
}