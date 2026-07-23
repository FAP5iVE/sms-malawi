/**
 * apps/web/src/app/(public)/login/page.tsx
 *
 * R2 — Auth Session & Login Flow Correctness.
 *
 * Fixes two confirmed defects from the audit:
 *  1. A manual session cookie write using a bogus literal "1" instead
 *     of the real Firebase UID, which also raced AuthProvider's own
 *     cookie-setting. Cookie writes belong exclusively to AuthProvider's
 *     onIdTokenChanged listener (see sms-erp-security Rule 1) — this page
 *     no longer touches `document.cookie` at all.
 *  2. `router.push('/dashboard')` fired immediately after sign-in, before the
 *     role cookie/claim had actually propagated, producing a visible
 *     redirect-loop-back-through-dashboard. The redirect now waits for the
 *     auth store's `role`/`initialized` fields (set by AuthProvider once the
 *     ID token's custom claims are read) before navigating, and honors the
 *     `?from=` deep-link param proxy.ts already attaches — validated to
 *     reject protocol-relative/external targets.
 */
'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useAuthStore } from '@/store/authStore'
import {
  Eye,
  EyeOff,
  ArrowLeft,
  Loader2,
  GraduationCap,
  BookOpen,
  Award,
  Home,
} from 'lucide-react'

/**
 * Only allow an internal, same-origin path as a post-login redirect target.
 * Rejects absolute URLs ("https://evil.example") and protocol-relative
 * targets ("//evil.example") — both of which would otherwise send an
 * authenticated user off the app's own origin.
 */
function sanitizeRedirectTarget(from: string | null): string | null {
  if (!from) return null
  if (!from.startsWith('/')) return null
  if (from.startsWith('//')) return null
  return from
}

// `useSearchParams()` requires a Suspense boundary or `next build` fails its
// static-generation bailout check ("should be wrapped in a suspense
// boundary"). The default export below supplies that boundary; all page
// logic lives in LoginForm.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // NOTE: bare store destructure, no selector. An object-returning selector
  // (`(s) => ({ role: s.role, initialized: s.initialized })`) allocates a new
  // object every render, so useSyncExternalStore's getSnapshot never compares
  // equal to the previous snapshot — React then re-renders forever
  // ("Maximum update depth exceeded"). Matches every other useAuthStore
  // consumer in this codebase.
  const { role, initialized } = useAuthStore()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const hasRedirected = useRef(false)

  const safeFrom = sanitizeRedirectTarget(searchParams.get('from'))

  // Once sign-in has been submitted and AuthProvider has resolved the
  // post-token role claim, redirect exactly once. Guarded by a ref so a
  // later, unrelated role change elsewhere in the app session can never
  // re-trigger this navigation.
  useEffect(() => {
    if (!submitted) return
    if (hasRedirected.current) return
    if (!initialized || !role) return
    hasRedirected.current = true
    router.replace(safeFrom ?? '/dashboard')
  }, [submitted, initialized, role, safeFrom, router])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!auth) return // auth is only null during SSR; never reached in browser
    setError(null)
    setLoading(true)

    try {
      await signInWithEmailAndPassword(auth, email, password)
      // Do not set cookies or navigate here — AuthProvider's onIdTokenChanged
      // listener owns both, and the useEffect above navigates once it has.
      setSubmitted(true)
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? ''
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        setError('Incorrect email or password. Please try again.')
      } else if (code === 'auth/too-many-requests') {
        setError('Too many attempts. Please wait a few minutes.')
      } else {
        setError('Something went wrong. Please try again.')
      }
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        @keyframes driftA {
          0%,100% { transform: translate(0,0) rotate(0deg); opacity:0.4; }
          50%      { transform: translate(12px,-16px) rotate(4deg); opacity:0.7; }
        }
        @keyframes driftB {
          0%,100% { transform: translate(0,0) rotate(0deg); opacity:0.25; }
          50%      { transform: translate(-10px,12px) rotate(-3deg); opacity:0.5; }
        }
        @keyframes driftC {
          0%,100% { transform: translate(0,0) scale(1); opacity:0.3; }
          50%      { transform: translate(8px,-8px) scale(1.05); opacity:0.6; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes spinBack {
          from { transform: rotate(0deg); }
          to   { transform: rotate(-360deg); }
        }
        @keyframes pulseGlow {
          0%,100% { opacity:0.15; }
          50%      { opacity:0.35; }
        }
        @keyframes fadeSlideUp {
          from { opacity:0; transform:translateY(12px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .login-glow-blob {
          background: radial-gradient(circle, rgba(14,138,106,0.25) 0%, transparent 65%);
          animation: pulseGlow 4s ease-in-out infinite;
        }
        .login-ring-cw  { animation: spin 30s linear infinite; }
        .login-ring-ccw { animation: spinBack 20s linear infinite; }
        .login-drift-a  { animation: driftA 4s ease-in-out infinite; }
        .login-drift-b  { animation: driftB 5s ease-in-out infinite; }
        .login-drift-c  { animation: driftC 3.5s ease-in-out infinite; }
        .login-diamond  { transform: rotate(45deg); }
      `}</style>

      <div className="min-h-screen grid lg:grid-cols-[1fr_1fr] font-sans">
        <div className="hidden lg:flex flex-col relative overflow-hidden bg-brand-navy">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full login-glow-blob" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] rounded-full border-2 border-dashed border-white/10 login-ring-cw" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full border border-brand-teal/20 login-ring-ccw" />

            <div className="absolute top-1/4 left-10 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 backdrop-blur-sm login-drift-a">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-brand-teal/30 flex items-center justify-center">
                  <GraduationCap className="w-3.5 h-3.5 text-brand-teal-light" />
                </div>
                <div>
                  <div className="text-white text-[10px] font-heading font-bold">1,247 Students</div>
                  <div className="text-white/40 text-[9px] font-sans">Enrolled 2025/2026</div>
                </div>
              </div>
            </div>

            <div className="absolute bottom-1/3 right-8 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 backdrop-blur-sm login-drift-b">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-brand-amber/30 flex items-center justify-center">
                  <Award className="w-3.5 h-3.5 text-brand-amber" />
                </div>
                <div>
                  <div className="text-white text-[10px] font-heading font-bold">89% Pass Rate</div>
                  <div className="text-white/40 text-[9px] font-sans">MSCE 2025</div>
                </div>
              </div>
            </div>

            <div className="absolute top-2/3 left-16 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 backdrop-blur-sm login-drift-c">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-brand-purple/30 flex items-center justify-center">
                  <BookOpen className="w-3.5 h-3.5 text-brand-purple" />
                </div>
                <div>
                  <div className="text-white text-[10px] font-heading font-bold">Digital Library</div>
                  <div className="text-white/40 text-[9px] font-sans">1,200+ Resources</div>
                </div>
              </div>
            </div>

            <div className="absolute top-12 right-12 w-8 h-8 border-2 border-white/10 rounded-lg rotate-12" />
            <div className="absolute bottom-20 left-8 w-5 h-5 border border-brand-teal/30 rounded-full" />
            <div className="absolute top-1/3 right-20 w-3 h-3 bg-brand-teal/40 rounded-full" />
            <div className="absolute bottom-1/4 right-16 w-6 h-6 border border-white/10 rounded login-diamond" />
          </div>

          <div className="relative z-10 flex flex-col h-full p-10">
            <Link href="/" className="inline-flex items-center gap-2 text-white/50 hover:text-white transition-colors text-sm w-fit">
              <Home className="w-4 h-4" />
              <span className="font-heading font-medium">Back to homepage</span>
            </Link>

            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 rounded-3xl bg-white/10 border border-white/15 flex items-center justify-center mb-6 shadow-xl overflow-hidden">
                <Image
                  src="/images/logo.png"
                  alt="School logo"
                  width={200}
                  height={200}
                  loading="eager"
                  className="object-contain w-auto h-auto"
                />
              </div>
              <h2 className="font-heading font-bold text-3xl text-white mb-2">SMS Malawi</h2>
              <p className="text-white/40 text-sm font-sans max-w-xs leading-relaxed mb-10">
                School Management System — empowering educators and students across Malawi.
              </p>
              <Image
                src="/images/login.svg"
                alt="Login illustration"
                width={224}
                height={176}
                loading="eager"
                className="object-contain w-72 h-56"
              />
            </div>

            <p className="text-white/25 text-xs font-sans text-center">
              © {new Date().getFullYear()} SMS Malawi. All rights reserved.
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-center px-6 sm:px-12 lg:px-16 py-12 bg-page min-h-screen lg:min-h-0">
          <Link href="/" className="flex items-center gap-1.5 text-muted text-sm mb-12 lg:hidden hover:text-body transition-colors w-fit">
            <ArrowLeft className="w-3.5 h-3.5" /> Home
          </Link>

          <div className="w-full max-w-sm mx-auto login-form-anim">
            <div className="mb-8">
              <h1 className="font-heading text-3xl font-bold text-brand-navy mb-2 tracking-tight">
                Welcome back
              </h1>
              <p className="text-muted text-sm">Sign in to your school account</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5 login-form-anim-delay">
              <div>
                <label htmlFor="email" className="block text-sm font-heading font-medium text-body mb-1.5">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@school.edu.mw"
                  className="w-full border border-base rounded-xl px-4 py-3 text-sm bg-surface text-body placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal transition-all"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="password" className="text-sm font-heading font-medium text-body">
                    Password
                  </label>
                  <Link href="/forgot-password" className="text-xs text-brand-teal hover:text-brand-teal-light transition-colors font-heading">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPass ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full border border-base rounded-xl px-4 py-3 pr-11 text-sm bg-surface text-body placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-body transition-colors"
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="text-sm text-brand-coral bg-brand-coral/8 border border-brand-coral/20 rounded-xl px-4 py-3 flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">⚠</span>
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand-navy text-white py-3 rounded-xl font-heading font-semibold text-sm hover:bg-brand-navy-mid transition-colors flex items-center justify-center gap-2 disabled:opacity-60 mt-2 shadow-sm"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            <div className="mt-8 pt-8 border-t border-base">
              <p className="text-xs text-muted text-center font-sans">
                This portal is for authorised students and staff only.
                <br />
                Contact your school administrator if you need access.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}