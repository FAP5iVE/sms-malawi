'use client'

/**
 * FILE: apps/web/src/app/(public)/forgot-password/page.tsx
 * NEW FILE — Forgot password flow
 *
 * Referenced from login page: <Link href="/forgot-password">
 * Flow: Enter email → Firebase sendPasswordResetEmail → success state → back to login
 */

import { useState } from 'react'
import Link from 'next/link'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { ArrowLeft, Mail, CheckCircle2, Loader2 } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await sendPasswordResetEmail(auth, email)
      setSent(true)
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? ''
      if (code === 'auth/user-not-found') {
        // Don't reveal whether the email exists — security best practice
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
    <div className="min-h-screen grid lg:grid-cols-[1fr_1fr] font-sans">

      {/* Left decorative panel — matches login page style */}
      <div className="hidden lg:flex flex-col justify-between bg-brand-navy p-12">
        <Link href="/" className="flex items-center gap-2 text-white/50 hover:text-white transition-colors text-sm w-fit">
          <ArrowLeft className="w-4 h-4" />
          <span className="font-heading font-medium">Back to homepage</span>
        </Link>
        <div>
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mb-6">
            <Mail className="w-8 h-8 text-white/60" />
          </div>
          <h2 className="font-heading font-bold text-3xl text-white mb-3">Password Reset</h2>
          <p className="text-white/40 text-sm font-sans leading-relaxed max-w-xs">
            Enter your school account email and we&apos;ll send you a link to create a new password.
          </p>
        </div>
        <p className="text-white/25 text-xs font-sans">
          &copy; {new Date().getFullYear()} SMS Malawi. All rights reserved.
        </p>
      </div>

      {/* Right — form */}
      <div className="flex flex-col justify-center px-6 sm:px-12 lg:px-16 py-12 bg-page">

        <Link href="/login" className="flex items-center gap-1.5 text-muted text-sm mb-12 hover:text-body transition-colors w-fit">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to login
        </Link>

        <div className="w-full max-w-sm mx-auto">

          {sent ? (
            /* Success state */
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-brand-teal/15 flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-8 h-8 text-brand-teal" />
              </div>
              <h1 className="font-heading font-bold text-2xl text-brand-navy mb-2">Check your email</h1>
              <p className="text-muted text-sm font-sans leading-relaxed mb-8">
                If <strong className="text-body">{email}</strong> is registered, you will receive a
                password reset link shortly. Check your spam folder if you don&apos;t see it.
              </p>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 bg-brand-navy text-white px-6 py-3 rounded-xl font-heading font-semibold text-sm hover:bg-brand-navy-mid transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Return to login
              </Link>
            </div>
          ) : (
            /* Email entry form */
            <>
              <div className="mb-8">
                <h1 className="font-heading text-3xl font-bold text-brand-navy mb-2 tracking-tight">
                  Forgot password?
                </h1>
                <p className="text-muted text-sm font-sans">
                  Enter your school account email to receive a reset link.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="email" className="block text-sm font-heading font-medium text-body mb-1.5">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@school.edu.mw"
                    className="w-full border border-base rounded-xl px-4 py-3 text-sm bg-surface text-body placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal transition-all"
                  />
                </div>

                {error && (
                  <div className="text-sm text-brand-coral bg-brand-coral/8 border border-brand-coral/20 rounded-xl px-4 py-3">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-brand-navy text-white py-3 rounded-xl font-heading font-semibold text-sm hover:bg-brand-navy-mid transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? 'Sending…' : 'Send Reset Link'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
