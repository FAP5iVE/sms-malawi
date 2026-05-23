'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updatePassword, getAuth } from 'firebase/auth'
import { Loader2 } from 'lucide-react'

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
      // Force token refresh so requiresPasswordChange claim is cleared
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
      <div className="w-full max-w-sm">
        <h1 className="font-heading text-2xl font-bold text-brand-navy mb-2">Set your password</h1>
        <p className="text-muted text-sm mb-8">
          This is your first login. Please create a new password before continuing.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            minLength={8}
            required
            className="w-full border border-base rounded-xl px-4 py-3 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand-teal/30"
          />
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm password"
            required
            className="w-full border border-base rounded-xl px-4 py-3 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand-teal/30"
          />
          {error && <p className="text-sm text-brand-coral">{error}</p>}
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
