/**
 * apps/web/src/app/(public)/forgot-password/page.tsx
 *
 * [CHANGE TYPE]: VISUAL REDESIGN ONLY — no auth logic touched.
 *   sendPasswordResetEmail, the auth/user-not-found -> still show the
 *   generic "sent" state (never leak which emails exist), and every other
 *   error branch are byte-for-byte the same as before.
 *
 * [PURPOSE]: This page used to be its own thing — a two-column split
 *   (`grid lg:grid-cols-[1fr_1fr]`) with a solid navy hero panel on the
 *   left (desktop only) and the form on the right, using
 *   PublicAmbientBackground as a `fixed` layer but WITHOUT giving either
 *   grid column `relative`/a z-index. Per CSS stacking rules, a
 *   `position: fixed` element with no z-index paints *after* — i.e. on
 *   top of — plain in-flow non-positioned block content in the same
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
 */
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { ArrowLeft, Mail, CheckCircle2, Loader2, Home } from 'lucide-react'
import { PublicAmbientBackground } from '@/components/shared/PublicAmbientBackground'
import { PublicThemeToggle } from '@/components/shared/PublicThemeToggle'

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
      await sendPasswordResetEmail(auth, email)
      setSent(true)
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? ''
      if (code === 'auth/user-not-found') {
        // Deliberately still show the "sent" state — never reveal whether
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
    <div className="relative min-h-screen w-full bg-page flex flex-col font-sans">
      <PublicAmbientBackground />

      {/* ── Top bar: home + theme toggle — same chips as the login page ── */}
      <header className="relative z-30 flex items-center justify-between p-3 sm:p-4">
        <Link
          href="/"
          aria-label="Back to homepage"
          title="Back to homepage"
          className="w-9 h-9 rounded-lg bg-brand-navy hover:bg-brand-navy-mid text-white shadow-md flex items-center justify-center transition-colors"
        >
          <Home className="w-4 h-4" />
        </Link>

        <PublicThemeToggle />
      </header>

      {/* ── Centred content ── */}
      <main className="relative z-10 flex-1 flex items-start justify-center px-4 pt-0 pb-6 sm:pb-8">
        {/* Wide frosted plate */}
        <div className="w-full max-w-sm sm:max-w-xl rounded-[28px] sm:rounded-[36px] bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/10 backdrop-blur-md p-2.5 sm:p-5 shadow-xl">
          {/* Glass card — translucent + blurred in BOTH themes, same recipe as login */}
          <div className="w-full max-w-sm sm:max-w-md mx-auto rounded-[24px] sm:rounded-[30px] bg-white/80 dark:bg-white/[0.07] border border-black/5 dark:border-white/15 backdrop-blur-2xl p-6 sm:p-8 shadow-2xl flex flex-col">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-muted-foreground dark:text-foreground text-sm mb-6 hover:text-body transition-colors w-fit"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to login
            </Link>

            {sent ? (
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-brand-teal/15 flex items-center justify-center mx-auto mb-5">
                  <CheckCircle2 className="w-8 h-8 text-brand-teal" />
                </div>
                <h1 className="font-heading font-bold text-2xl text-primary mb-2">Check your email</h1>
                <p className="text-muted-foreground dark:text-foreground text-sm font-sans leading-relaxed mb-8">
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
              <>
                <div className="flex flex-col items-center text-center mb-6">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                    <Mail className="w-7 h-7 text-primary" />
                  </div>
                  <h1 className="font-heading text-2xl sm:text-[26px] font-bold text-primary tracking-tight">
                    Forgot password?
                  </h1>
                  <p className="text-muted-foreground dark:text-foreground text-sm font-sans mt-1">
                    Enter your school account email to receive a reset link.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 text-left">
                  <div>
                    <label htmlFor="email" className="block text-xs sm:text-sm font-heading font-medium text-body mb-1.5">
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
                      className="w-full px-3.5 py-2.5 sm:py-3 bg-page text-body placeholder:text-muted-foreground rounded-xl text-sm font-sans border border-base focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal transition-all"
                    />
                  </div>

                  {error && (
                    <div className="p-3 rounded-xl bg-brand-coral/10 border border-brand-coral/30 text-brand-coral text-xs flex items-center gap-2 animate-fade-in">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 bg-brand-navy hover:bg-brand-navy-mid active:bg-brand-navy text-white font-heading font-semibold text-sm rounded-xl transition-all shadow-md mt-2 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 border border-transparent dark:border-white/10 dark:hover:border-brand-teal/40"
                  >
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {loading ? 'Sending…' : 'Send Reset Link'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}