/**
 * apps/web/src/app/(public)/forgot-password/page.tsx
 *
 * [CHANGE TYPE]: VISUAL REDESIGN ONLY, no auth logic touched.
 *   sendPasswordResetEmail, the auth/user-not-found -> still show the
 *   generic "sent" state (never leak which emails exist), and every other
 *   error branch are byte-for-byte the same as before.
 *
 * [PURPOSE]: This page used to be its own thing, a two-column split
 *   (`grid lg:grid-cols-[1fr_1fr]`) with a solid navy hero panel on the
 *   left (desktop only) and the form on the right, using
 *   PublicAmbientBackground as a `fixed` layer but WITHOUT giving either
 *   grid column `relative`/a z-index. Per CSS stacking rules, a
 *   `position: fixed` element with no z-index paints *after*, i.e. on
 *   top of, plain in-flow non-positioned block content in the same
 *   stacking context, regardless of DOM order. Neither grid column here
 *   was positioned, so the ambient artwork (plus its readability scrim)
 *   was rendering ON TOP of the form and hero text instead of behind it,
 *   which is exactly why everything read as low-contrast/washed-out on
 *   both the desktop split and the mobile single-column fallback.
 *
 *   Rebuilt to reuse the login page's exact card recipe instead of
 *   inventing a second visual language for what is, functionally, a
 *   sibling auth screen: same ambient background, same top bar (Home +
 *   theme toggle), same nested "wide frosted plate -> inner glass card"
 *   structure, translucent in both themes, single responsive column that
 *   works identically on mobile and desktop (no more `hidden lg:flex`
 *   panel that only existed on wide screens). The real content wrapper is
 *   `relative z-10`, so it always paints above the fixed ambient layer.
 *
 * [REVISION 2, shared public header + AuthShell]: The page's own top bar is
 *   gone, (public)/layout.tsx now renders the shared header (Home, page
 *   title, theme toggle) for every public page. The card was too small next
 *   to login's, so the frame/card now come from the shared <AuthShell>,
 *   guaranteeing forgot-password is exactly the same size and glass treatment
 *   as /login (wide two-pane card on desktop, compact single column on
 *   phones). Auth logic unchanged.
 *
 * [REVISION 3, Hills theme Phase 7]: Class names and markup only. The page uses the sign-in card's
 *   own pieces (.hills-field, .hills-input, .hills-go, .hills-alert) plus .hills-back and
 *   .hills-status from globals.css "HILLS AUTH FAMILY". The icon tile, the inline loading
 *   spinner and the old field classes are gone (the button shows the same busy sweep as sign-in).
 *   Ids, types, autocomplete, labels, button text and links are unchanged.
 */
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { sendPasswordResetEmail, type ActionCodeSettings } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react'
import { AuthShell } from '@/components/shared/AuthShell'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!auth) return // auth is only null during SSR; never reached in browser
    setError(null)
    setLoading(true)
    try {
      const actionCodeSettings: ActionCodeSettings = {
        url: `${window.location.origin}/reset-password`,
        handleCodeInApp: true,
      }
      await sendPasswordResetEmail(auth, email, actionCodeSettings)
      setSent(true)
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? ''
      if (code === 'auth/user-not-found') {
        // Deliberately still show the "sent" state, never reveal whether
        // an email address is registered.
        setSent(true)
      } else if (code === 'auth/invalid-email') {
        setError('Please enter a valid email address.')
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <Link href="/login" className="hills-back">
        <ArrowLeft aria-hidden /> Back to login
      </Link>

      {sent ? (
        <div className="hills-status">
          <div className="hills-status__icon hills-status__icon--ok">
            <CheckCircle2 aria-hidden />
          </div>
          <h1 className="hills-auth__title">Check your email</h1>
          <p className="hills-auth__lede">
            If <strong>{email}</strong> is registered, you will receive a
            password reset link shortly. Check your spam folder if you don&apos;t see it.
          </p>
          <Link href="/login" className="hills-go hills-go--link">
            <ArrowLeft className="hills-go__arrow" aria-hidden /> Return to login
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-6 text-left">
            <h1 className="hills-auth__title">Forgot password?</h1>
            <p className="hills-auth__lede">Enter your school account email to receive a reset link.</p>
          </div>

          {error && (
            <div role="alert" className="hills-alert hills-alert--danger animate-fade-in">
              <AlertCircle aria-hidden />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="text-left">
            <div className="hills-field">
              <div className="hills-field__row">
                <label htmlFor="email" className="hills-label">
                  Email address
                </label>
              </div>
              <div className="hills-input">
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@school.edu.mw"
                />
              </div>
            </div>

            <button type="submit" disabled={loading} className="hills-go">
              <span>{loading ? 'Sending…' : 'Send Reset Link'}</span>
              <ArrowRight className="hills-go__arrow" aria-hidden />
            </button>
          </form>
        </>
      )}
    </AuthShell>
  )
}
