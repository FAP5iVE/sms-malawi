'use client'

/*
 * apps/web/src/components/settings/ProfileSettings.tsx — Phase D15
 * All roles: update display name, email notification address, and password reset.
 */

import { useState, useEffect } from 'react'
import { updateProfile }       from 'firebase/auth'
import { Loader2, Save, KeyRound } from 'lucide-react'
import { auth }                from '@/lib/firebase'
import { useAuthStore }        from '@/store/authStore'
import { sendPasswordResetEmail } from 'firebase/auth'

export function ProfileSettings() {
  const { user }            = useAuthStore()
  const [displayName, setDisplayName] = useState('')
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [resetSent,   setResetSent]   = useState(false)

  useEffect(() => {
    if (user?.displayName) setDisplayName(user.displayName)
  }, [user])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!auth.currentUser) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await updateProfile(auth.currentUser, { displayName: displayName.trim() })
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
      await sendPasswordResetEmail(auth, user.email)
      setResetSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading font-bold text-lg text-brand-navy">Profile & Account</h2>
        <p className="text-sm text-muted mt-0.5">Update your display name and password.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        <div>
          <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">
            Display Name
          </label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full max-w-sm min-h-[44px] border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
            placeholder="Your full name"
          />
        </div>

        <div>
          <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">
            Email Address
          </label>
          <input
            value={user?.email ?? ''}
            readOnly
            className="w-full max-w-sm min-h-[44px] border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-muted cursor-not-allowed"
          />
          <p className="text-xs text-muted mt-1">Email is managed by your administrator.</p>
        </div>

        {error && (
          <p className="text-sm text-brand-coral">{error}</p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="min-h-[44px] px-5 rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              : <><Save className="w-4 h-4" /> Save Changes</>}
          </button>
          {saved && <span className="text-sm text-emerald-600 font-medium">Saved ✓</span>}
        </div>
      </form>

      <div className="pt-4 border-t border-base">
        <h3 className="font-heading font-semibold text-sm text-body mb-1">Change Password</h3>
        <p className="text-xs text-muted mb-3">
          A password reset link will be sent to {user?.email}.
        </p>
        {resetSent ? (
          <p className="text-sm text-emerald-600 font-medium">Reset email sent ✓</p>
        ) : (
          <button
            type="button"
            onClick={handlePasswordReset}
            className="min-h-[44px] px-5 rounded-xl text-sm font-heading font-semibold border border-base text-muted hover:bg-page hover:text-body transition-colors flex items-center gap-2"
          >
            <KeyRound className="w-4 h-4" />
            Send Password Reset Email
          </button>
        )}
      </div>
    </div>
  )
}