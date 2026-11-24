/**
 * apps/web/src/app/(public)/change-password/page.tsx
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R2, Auth Session & Login Flow Correctness
 * [PURPOSE]: The previous flow called updatePassword() then
 *   user.getIdToken(true), with a comment claiming the force-refresh
 *   "clears the requiresPasswordChange claim." It does not, getIdToken(true)
 *   only re-fetches a token reflecting whatever custom claims already exist
 *   server-side; nothing in that sequence ever called the Admin SDK to
 *   change them, so every new account was permanently locked out after its
 *   first password change. This now calls the new
 *   POST /users/me/clear-password-change-flag endpoint (server-side clears
 *   the claim via userManagementService.clearPasswordChangeRequirement)
 *   between updatePassword() and getIdToken(true), so the force-refresh
 *   that follows actually reflects the cleared claim.
 * [DEPENDS ON]: R1 (apiFetch singleton), this file's new API call is
 *   written against the R1-consolidated client.
 *
 * [CHANGE TYPE]: MAJOR REWRITE (2026-10-08): two flows on one route.
 * [WHY]: This route was built ONLY for the forced first-login change
 *   (AuthProvider sends a freshly created account here while it still carries
 *   the requiresPasswordChange claim), but the public footer's "Change
 *   Password" link points at it too. A visitor following that link isn't
 *   signed in, so they saw "This is your first login", typed a password, and
 *   got "Failed to update password" because there was no signed-in user to
 *   update. The page now looks at who is actually signed in and shows the
 *   right flow:
 *     1. FIRST LOGIN ("Set your password"), signed in AND still carrying
 *        requiresPasswordChange. Unchanged behaviour: they just proved their
 *        temporary password at /login, so only the new password is asked for.
 *     2. CHANGE PASSWORD, everyone else. Asks for email + CURRENT password
 *        (email is locked to the account if they are already signed in), then
 *        the new password. The current password is verified with Firebase
 *        (reauthenticateWithCredential if signed in, signInWithEmailAndPassword
 *        if not) before updatePassword() runs, which is also what Firebase
 *        itself requires for a sensitive operation like this. A visitor who
 *        wasn't signed in is signed back out afterwards (via logout(), so FCM
 *        and session cleanup still run) and sent to /login, changing a
 *        password from the public site must not leave a session behind.
 *   The mode is decided once, from the first auth state Firebase reports, and
 *   never re-evaluated, signing in during flow 2 fires AuthProvider's token
 *   listener, which would otherwise flip the page mid-submit.
 * [LAYOUT]: Renders through <AuthShell> so it matches /login's size and glass
 *   styling; the top bar comes from (public)/layout.tsx.
 *
 * [REVISION (2026-11-13), Hills theme Phase 7]: Class names and markup only. Fields, buttons,
 *   alerts and status screens use the sign-in card's pieces (.hills-field, .hills-input, .hills-go,
 *   .hills-alert, .hills-status, .hills-checking). The key icon tile and the inline spinner on the
 *   button are gone (same busy sweep as sign-in). Errors now show above the form, as on /login.
 *   Ids, types, autocomplete, minLength, readOnly, labels, button text, links and every auth call
 *   are unchanged.
 */
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  updatePassword,
} from 'firebase/auth'
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { auth } from '@/lib/firebase'
import { logout } from '@/components/providers/AuthProvider'
import { homePathForRole } from '@shared/constants/pageAccess'
import { AuthShell } from '@/components/shared/AuthShell'

type Mode = 'checking' | 'first-login' | 'change'

const MIN_LENGTH = 8

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  minLength,
  labelAside,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete: string
  placeholder: string
  minLength?: number
  labelAside?: React.ReactNode
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="hills-field">
      <div className="hills-field__row">
        <label htmlFor={id} className="hills-label">
          {label}
        </label>
        {labelAside}
      </div>
      <div className="hills-input">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          minLength={minLength}
          required
          className="hills-pw"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="hills-eye"
        >
          {show ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </button>
      </div>
    </div>
  )
}

export default function ChangePasswordPage() {
  const router = useRouter()

  const [mode, setMode] = useState<Mode>('checking')
  // Email of whoever is already signed in (flow 2 only). Null = signed out.
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Set when flow 2 finishes; `signedIn` says whether the visitor was already
  // signed in before they got here (decides which button the success state shows).
  const [done, setDone] = useState<{ signedIn: boolean; home: string } | null>(null)

  // Decide the flow ONCE from the first auth state Firebase reports.
  useEffect(() => {
    if (!auth) return
    let settled = false
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (settled) return
      settled = true
      unsubscribe()

      if (!user) {
        setMode('change')
        return
      }
      try {
        const { claims } = await user.getIdTokenResult()
        if (claims.requiresPasswordChange === true) {
          setMode('first-login')
          return
        }
      } catch {
        // Couldn't read claims, fall through to the normal change flow, which
        // re-verifies the current password anyway.
      }
      setSignedInEmail(user.email ?? null)
      setMode('change')
    })
    return () => {
      settled = true
      unsubscribe()
    }
  }, [])

  function validateNewPassword(): string | null {
    if (password.length < MIN_LENGTH) return `Password must be at least ${MIN_LENGTH} characters.`
    if (password !== confirm) return 'Passwords do not match.'
    return null
  }

  // ── Flow 1: first login, user is already signed in with their temporary password
  async function handleFirstLogin(e: React.FormEvent) {
    e.preventDefault()
    const problem = validateNewPassword()
    if (problem) return setError(problem)
    setError(null)
    setLoading(true)
    try {
      const user = auth?.currentUser
      if (!user) throw new Error('Not authenticated')
      await updatePassword(user, password)
      // Clear the requiresPasswordChange claim server-side, this is the
      // step the previous flow was missing. Must happen before the
      // force-refresh below, or the refreshed token would still carry the
      // stale (true) claim.
      await apiFetch('/users/me/clear-password-change-flag', { method: 'POST' })
      // Now this force-refresh actually reflects the server-side change
      // made by the call above.
      const refreshed = await user.getIdTokenResult(true)
      // Each role's own home: a parent has no /dashboard.
      // A new student goes on to the registration form before the dashboard.
      if (refreshed.claims.registrationPending === true) {
        router.replace('/complete-registration')
        return
      }
      router.replace(homePathForRole(typeof refreshed.claims.role === 'string' ? refreshed.claims.role : null))
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? ''
      setError(
        code === 'auth/weak-password'
          ? 'Please choose a stronger password.'
          : 'Failed to update password. Please try again.',
      )
    } finally {
      setLoading(false)
    }
  }

  // ── Flow 2: voluntary change, verify the current password first
  async function handleChange(e: React.FormEvent) {
    e.preventDefault()
    if (!auth) return
    const problem = validateNewPassword()
    if (problem) return setError(problem)
    if (password === currentPassword) {
      return setError('Your new password must be different from your current password.')
    }
    setError(null)
    setLoading(true)

    const wasSignedIn = signedInEmail !== null
    let signedInHere = false
    try {
      let user = auth.currentUser
      if (user && signedInEmail) {
        const credential = EmailAuthProvider.credential(signedInEmail, currentPassword)
        await reauthenticateWithCredential(user, credential)
      } else {
        const result = await signInWithEmailAndPassword(auth, email.trim(), currentPassword)
        user = result.user
        signedInHere = true
      }

      await updatePassword(user, password)

      // An account that still carried the first-login flag (someone who
      // chose this page over the login redirect) must have it cleared, or
      // the next sign-in would force them back here.
      const { claims } = await user.getIdTokenResult()
      if (claims.requiresPasswordChange === true) {
        await apiFetch('/users/me/clear-password-change-flag', { method: 'POST' })
        await user.getIdToken(true)
      }

      // Changing a password from the public site must not leave a session
      // behind for a visitor who wasn't signed in when they arrived.
      if (signedInHere) {
        await logout()
        signedInHere = false
      }
      setDone({
        signedIn: wasSignedIn,
        home: homePathForRole(typeof claims.role === 'string' ? claims.role : null),
      })
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? ''
      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        setError(wasSignedIn ? 'Your current password is incorrect.' : 'Incorrect email or current password.')
      } else if (code === 'auth/invalid-email') {
        setError('Please enter a valid email address.')
      } else if (code === 'auth/too-many-requests') {
        setError('Too many attempts. Please wait a few minutes.')
      } else if (code === 'auth/weak-password') {
        setError('Please choose a stronger password.')
      } else {
        setError('Failed to update password. Please try again.')
      }
      // We signed them in just to verify and the change didn't complete, so
      // don't leave that session open.
      if (signedInHere) await logout().catch(() => {})
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      {mode === 'checking' ? (
        <div className="hills-checking" role="status" aria-live="polite">
          <Loader2 aria-hidden />
          <p>Loading…</p>
        </div>
      ) : done ? (
        <div className="hills-status">
          <div className="hills-status__icon hills-status__icon--ok">
            <CheckCircle2 aria-hidden />
          </div>
          <h1 className="hills-auth__title">Password updated</h1>
          <p className="hills-auth__lede">
            {done.signedIn
              ? 'Your password has been changed.'
              : 'Your password has been changed. Sign in with your new password.'}
          </p>
          <Link href={done.signedIn ? done.home : '/login'} className="hills-go hills-go--link">
            {done.signedIn ? 'Go to dashboard' : 'Go to sign in'} <ArrowRight className="hills-go__arrow" aria-hidden />
          </Link>
        </div>
      ) : mode === 'first-login' ? (
        <>
          <div className="mb-6 text-left">
            <h1 className="hills-auth__title">Set your password</h1>
            <p className="hills-auth__lede">
              This is your first login. Please create a new password before continuing.
            </p>
          </div>
          {error && (
            <p role="alert" className="hills-alert hills-alert--danger">
              <AlertCircle aria-hidden />
              <span>{error}</span>
            </p>
          )}
          <form onSubmit={handleFirstLogin} className="text-left">
            <PasswordField
              id="new-password"
              label="New password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              placeholder="New password"
              minLength={MIN_LENGTH}
            />
            <PasswordField
              id="confirm-password"
              label="Confirm password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              placeholder="Confirm password"
            />
            <button type="submit" disabled={loading} className="hills-go">
              <span>{loading ? 'Saving…' : 'Set Password & Continue'}</span>
              <ArrowRight className="hills-go__arrow" aria-hidden />
            </button>
          </form>
        </>
      ) : (
        <>
          <div className="mb-6 text-left">
            <h1 className="hills-auth__title">Change your password</h1>
            <p className="hills-auth__lede">
              {signedInEmail
                ? 'Confirm your current password, then choose a new one.'
                : 'Enter your account email and current password, then choose a new one.'}
            </p>
          </div>

          {error && (
            <p role="alert" className="hills-alert hills-alert--danger">
              <AlertCircle aria-hidden />
              <span>{error}</span>
            </p>
          )}

          <form onSubmit={handleChange} className="text-left">
            <div className="hills-field">
              <div className="hills-field__row">
                <label htmlFor="account-email" className="hills-label">
                  Email address
                </label>
              </div>
              <div className="hills-input">
                <input
                  id="account-email"
                  type="email"
                  autoComplete="email"
                  required
                  readOnly={signedInEmail !== null}
                  value={signedInEmail ?? email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@school.edu.mw"
                />
              </div>
            </div>

            <PasswordField
              id="current-password"
              label="Current password"
              value={currentPassword}
              onChange={setCurrentPassword}
              autoComplete="current-password"
              placeholder="Current password"
              labelAside={
                <Link href="/forgot-password" className="hills-link">
                  Forgot password?
                </Link>
              }
            />
            <PasswordField
              id="new-password"
              label="New password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              placeholder={`At least ${MIN_LENGTH} characters`}
              minLength={MIN_LENGTH}
            />
            <PasswordField
              id="confirm-password"
              label="Confirm new password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              placeholder="Confirm new password"
            />

            <button type="submit" disabled={loading} className="hills-go">
              <span>{loading ? 'Updating…' : 'Update Password'}</span>
              <ArrowRight className="hills-go__arrow" aria-hidden />
            </button>
          </form>
        </>
      )}
    </AuthShell>
  )
}
