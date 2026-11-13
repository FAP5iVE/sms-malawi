/**
 * apps/web/src/app/(public)/reset-password/page.tsx
 *
 * [CHANGE TYPE]: NEW FILE (mobile UI audit fix).
 * [PURPOSE]: The password-reset email previously sent users to Firebase's
 *   own default-hosted action-handler page (*.firebaseapp.com), plain,
 *   unstyled, completely inconsistent with the rest of the app, because
 *   forgot-password/page.tsx called sendPasswordResetEmail() without an
 *   actionCodeSettings argument. That call now points the emailed link at
 *   this route instead. This page reads Firebase's oobCode query param,
 *   verifies it, and lets the user set a new password inside the app's own
 *   branded shell, same two-column layout, same copy conventions, same
 *   Tailwind design tokens as forgot-password/page.tsx, so the whole
 *   request → email → reset journey feels like one continuous experience.
 * [DEPENDS ON]: W/lib/firebase.ts (auth), firebase/auth
 *   (verifyPasswordResetCode, confirmPasswordReset). Suspense-wraps its
 *   useSearchParams() call, same convention (auth)/library/page.tsx and
 *   (public)/login/page.tsx already use ("`next build` fails its
 *   static-generation bailout check" without it).
 */
'use client'

/*
 * [CHANGE (2026-10-08)]: Restyled to the shared <AuthShell> glass frame, same
 * size and look as /login, /forgot-password and /change-password, and gets the
 * shared header from (public)/layout.tsx. Previously this page was its own
 * split layout (solid navy panel + plain form) with no header and no ambient
 * background. Reset logic (verifyPasswordResetCode / confirmPasswordReset and
 * every error branch) is unchanged.
 */

/*
 * [CHANGE (2026-11-13), Hills theme Phase 7]: Class names and markup only. Uses the sign-in card's
 * own pieces (.hills-field, .hills-input, .hills-go, .hills-alert) plus .hills-back, .hills-status and
 * .hills-checking (globals.css "HILLS AUTH FAMILY"). The Suspense fallback is now the sign-in page's
 * <AuthShellSkeleton/> (it was a small grey card). The icon tile and the inline spinner on the button
 * are gone (same busy sweep as sign-in). Ids, types, autocomplete, labels, button text, links and the
 * verify/confirm calls are unchanged.
 */

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { AlertCircle, AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react'
import { AuthShell } from '@/components/shared/AuthShell'
import { AuthShellSkeleton } from '@/components/shared/AuthShellSkeleton'

// `useSearchParams()` requires a Suspense boundary or `next build` fails its
// static-generation bailout check, same convention as (public)/login/page.tsx
// and (auth)/library/page.tsx.
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthShellSkeleton />}>
      <ResetPasswordForm />
    </Suspense>
  )
}

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const oobCode = searchParams.get('oobCode') ?? ''
  // Knowable synchronously from the URL, no need to round-trip this
  // through an effect + state just to render the "link expired" case.
  const missingCode = !oobCode

  const [email, setEmail] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(true)
  const [invalidCode, setInvalidCode] = useState(false)

  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // missingCode is handled directly in the render below; nothing to do
    // here in that case (and no setState, a bare early return is fine).
    if (!auth || missingCode) return
    verifyPasswordResetCode(auth, oobCode)
      .then((resolvedEmail) => setEmail(resolvedEmail))
      .catch(() => setInvalidCode(true))
      .finally(() => setVerifying(false))
  }, [oobCode, missingCode])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!auth) return // auth is only null during SSR; never reached in browser
    setError(null)
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    setLoading(true)
    try {
      await confirmPasswordReset(auth, oobCode, password)
      setDone(true)
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? ''
      if (code === 'auth/expired-action-code' || code === 'auth/invalid-action-code') {
        setInvalidCode(true)
      } else if (code === 'auth/weak-password') {
        setError('Please choose a stronger password.')
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      {verifying && !missingCode ? (
        <div className="hills-checking" role="status" aria-live="polite">
          <Loader2 aria-hidden />
          <p>Verifying your reset link…</p>
        </div>
      ) : invalidCode || missingCode ? (
        <div className="hills-status">
          <div className="hills-status__icon hills-status__icon--danger">
            <AlertTriangle aria-hidden />
          </div>
          <h1 className="hills-auth__title">Link expired</h1>
          <p className="hills-auth__lede">
            This password reset link has expired or has already been used. Request a new one to continue.
          </p>
          <Link href="/forgot-password" className="hills-go hills-go--link">
            Request a new link
          </Link>
        </div>
      ) : done ? (
        <div className="hills-status">
          <div className="hills-status__icon hills-status__icon--ok">
            <CheckCircle2 aria-hidden />
          </div>
          <h1 className="hills-auth__title">Password updated</h1>
          <p className="hills-auth__lede">
            Your password has been changed. You can now sign in with your new password.
          </p>
          <Link href="/login" className="hills-go hills-go--link">
            <ArrowLeft className="hills-go__arrow" aria-hidden /> Return to login
          </Link>
        </div>
      ) : (
        <>
          <Link href="/login" className="hills-back">
            <ArrowLeft aria-hidden /> Back to login
          </Link>

          <div className="mb-6 text-left">
            <h1 className="hills-auth__title">Set a new password</h1>
            <p className="hills-auth__lede">
              {email ? <>for <strong>{email}</strong></> : 'Choose a new password for your account.'}
            </p>
          </div>

          {error && (
            <div role="alert" className="hills-alert hills-alert--danger">
              <AlertCircle aria-hidden />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="text-left">
            <div className="hills-field">
              <div className="hills-field__row">
                <label htmlFor="password" className="hills-label">
                  New password
                </label>
              </div>
              <div className="hills-input">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="hills-pw"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="hills-eye"
                >
                  {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="hills-go">
              <span>{loading ? 'Saving…' : 'Save New Password'}</span>
              <ArrowRight className="hills-go__arrow" aria-hidden />
            </button>
          </form>
        </>
      )}
    </AuthShell>
  )
}
