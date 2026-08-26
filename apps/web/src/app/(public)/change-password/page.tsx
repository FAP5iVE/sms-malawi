/**
 * apps/web/src/app/(public)/change-password/page.tsx
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R2 — Auth Session & Login Flow Correctness
 * [PURPOSE]: The previous flow called updatePassword() then
 *   user.getIdToken(true), with a comment claiming the force-refresh
 *   "clears the requiresPasswordChange claim." It does not — getIdToken(true)
 *   only re-fetches a token reflecting whatever custom claims already exist
 *   server-side; nothing in that sequence ever called the Admin SDK to
 *   change them, so every new account was permanently locked out after its
 *   first password change. This now calls the new
 *   POST /users/me/clear-password-change-flag endpoint (server-side clears
 *   the claim via userManagementService.clearPasswordChangeRequirement)
 *   between updatePassword() and getIdToken(true), so the force-refresh
 *   that follows actually reflects the cleared claim.
 * [DEPENDS ON]: R1 (apiFetch singleton) — this file's new API call is
 *   written against the R1-consolidated client.
 */
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updatePassword, getAuth } from 'firebase/auth'
import { Loader2 } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { PublicAmbientBackground } from '@/components/shared/PublicAmbientBackground'

export default function ChangePasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm) return setError('Passwords do not match.')
    setLoading(true)
    try {
      const user = getAuth().currentUser
      if (!user) throw new Error('Not authenticated')
      await updatePassword(user, password)
      // Clear the requiresPasswordChange claim server-side — this is the
      // step the previous flow was missing. Must happen before the
      // force-refresh below, or the refreshed token would still carry the
      // stale (true) claim.
      await apiFetch('/users/me/clear-password-change-flag', { method: 'POST' })
      // Now this force-refresh actually reflects the server-side change
      // made by the call above.
      await user.getIdToken(true)
      router.replace('/dashboard')
    } catch {
      setError('Failed to update password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-page px-4">
      <PublicAmbientBackground />
      <div className="relative z-10 w-full max-w-sm">
        <h1 className="font-heading text-2xl font-bold text-brand-navy mb-2">Set your password</h1>
        <p className="text-muted text-sm mb-8">
          This is your first login. Please create a new password before continuing.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="new-password" className="block text-sm font-medium text-body mb-1.5">New password</label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              minLength={8}
              required
              className="w-full border border-base rounded-xl px-4 py-3 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand-teal/30"
            />
          </div>
          <div>
            <label htmlFor="confirm-password" className="block text-sm font-medium text-body mb-1.5">Confirm password</label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm password"
              required
              className="w-full border border-base rounded-xl px-4 py-3 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand-teal/30"
            />
          </div>
          {error && <p role="alert" className="text-sm text-brand-coral">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-navy text-white py-3 rounded-xl font-heading font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Saving…' : 'Set Password & Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}