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

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { ArrowLeft, Lock, CheckCircle2, Loader2, Eye, EyeOff, AlertTriangle } from 'lucide-react'
import { AuthShell } from '@/components/shared/AuthShell'

// `useSearchParams()` requires a Suspense boundary or `next build` fails its
// static-generation bailout check, same convention as (public)/login/page.tsx
// and (auth)/library/page.tsx.
export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 w-full bg-page flex items-start justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl border border-base bg-surface p-8 space-y-4">
            <div className="mx-auto h-16 w-16 rounded-full bg-page animate-pulse" />
            <div className="h-7 w-40 mx-auto rounded-lg bg-page animate-pulse" />
            <div className="h-32 rounded-xl bg-page animate-pulse" />
          </div>
        </div>
      }
    >
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
        <div className="text-center py-8" role="status" aria-live="polite">
          <Loader2 className="w-8 h-8 text-brand-teal animate-spin mx-auto mb-4" aria-hidden />
          <p className="text-muted-foreground dark:text-foreground text-sm">Verifying your reset link…</p>
        </div>
      ) : invalidCode || missingCode ? (
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-brand-coral/15 flex items-center justify-center mx-auto mb-5">
            <AlertTriangle className="w-8 h-8 text-brand-coral" aria-hidden />
          </div>
          <h1 className="font-heading font-bold text-2xl text-body mb-2">Link expired</h1>
          <p className="text-muted-foreground dark:text-foreground text-sm font-sans leading-relaxed mb-8">
            This password reset link has expired or has already been used. Request a new one to continue.
          </p>
          <Link
            href="/forgot-password"
            className="inline-flex items-center gap-2 bg-brand-deep text-white px-6 py-3 rounded-xl font-heading font-semibold text-sm hover:brightness-125 transition-colors"
          >
            Request a new link
          </Link>
        </div>
      ) : done ? (
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-brand-teal/15 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-8 h-8 text-brand-teal" aria-hidden />
          </div>
          <h1 className="font-heading font-bold text-2xl text-body mb-2">Password updated</h1>
          <p className="text-muted-foreground dark:text-foreground text-sm font-sans leading-relaxed mb-8">
            Your password has been changed. You can now sign in with your new password.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 bg-brand-deep text-white px-6 py-3 rounded-xl font-heading font-semibold text-sm hover:brightness-125 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden /> Return to login
          </Link>
        </div>
      ) : (
        <>
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center gap-1.5 text-muted-foreground dark:text-foreground text-sm mb-3 hover:text-body transition-colors w-fit"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden /> Back to login
          </Link>

          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-brand-deep flex items-center justify-center mb-4 shadow-md">
              <Lock className="w-7 h-7 text-white" aria-hidden />
            </div>
            <h1 className="font-heading text-2xl sm:text-[26px] font-bold text-body tracking-tight">
              Set a new password
            </h1>
            <p className="text-muted-foreground dark:text-foreground text-sm font-sans mt-1">
              {email ? <>for <strong className="text-body">{email}</strong></> : 'Choose a new password for your account.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 text-left">
            <div>
              <label htmlFor="password" className="block text-xs sm:text-sm font-heading font-medium text-body mb-1.5">
                New password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full px-3.5 py-2.5 sm:py-3 pr-11 bg-page text-body placeholder:text-muted-foreground rounded-xl text-sm font-sans border border-base focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-foreground focus:outline-none cursor-pointer transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" aria-hidden /> : <Eye className="w-4 h-4" aria-hidden />}
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-brand-coral/10 border border-brand-coral/30 text-brand-coral text-xs"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-brand-deep hover:brightness-125 active:brightness-90 text-white font-heading font-semibold text-sm rounded-xl transition-all shadow-md mt-2 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 border border-transparent dark:border-white/10 dark:hover:border-brand-teal/40"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
              {loading ? 'Saving…' : 'Save New Password'}
            </button>
          </form>
        </>
      )}
    </AuthShell>
  )
}
