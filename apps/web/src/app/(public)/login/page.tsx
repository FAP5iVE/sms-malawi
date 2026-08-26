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
 *
 * [CHANGE TYPE]: VISUAL REDESIGN ONLY (login-page-redesign.zip is the source
 *   of truth for layout/visuals) — swapped the old two-column marketing-panel
 *   layout for a single centred "frosted glass" card on an ambient brand-navy
 *   backdrop. Nothing about auth, redirects, or state was touched:
 *   sanitizeRedirectTarget, the Suspense boundary, signInWithEmailAndPassword,
 *   the useAuthStore/useRouter/useSearchParams wiring, the noRoleAssigned/
 *   isBusy derivations, and the log-login-success/failed fire-and-forget
 *   calls are byte-for-byte the same logic as before this change, just
 *   re-wrapped in new markup.
 *   - Every colour comes from the project's existing design tokens
 *     (brand-navy/-mid/-light, brand-teal/-light, brand-coral, brand-amber,
 *     bg-page, bg-surface, text-body, text-muted, border-base, font-sans,
 *     font-heading) plus Tailwind's neutral white/black opacity scale for
 *     the decorative glass layers — no colours were invented and nothing in
 *     globals.css was touched. dark: variants throughout mean every surface
 *     (including the SVG background art) has both a light- and dark-mode
 *     rendering instead of assuming one theme.
 *   - Added a theme toggle, reusing the exact cycleTheme/themeIcons pattern
 *     already shipped in apps/web/src/app/(public)/page.tsx (useTheme +
 *     useHasMounted, Sun/Moon/Monitor icons cycling light → dark → system).
 *   - Kept a "Back to homepage" affordance (this page already linked home
 *     before this change) alongside the toggle in a small top bar so it's
 *     reachable on every breakpoint instead of only appearing on mobile.
 *   - The logo now reads from /images/logo.png (the school's real emblem —
 *     already used lower in this file previously) with "SMS Malawi"
 *     printed beneath it, in place of the redesign mockup's generic
 *     placeholder mark.
 *   - The mockup's "Ready to apply?" footer now links to the app's real
 *     /apply route (apps/web/src/app/(public)/apply) rather than the
 *     mockup's inert onApply callback prop.
 */
'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTheme } from 'next-themes'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { apiFetch } from '@/lib/api-client'
import { auth } from '@/lib/firebase'
import { useAuthStore } from '@/store/authStore'
import { useHasMounted } from '@/hooks/useHasMounted'
import {
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Home,
  Sun,
  Moon,
  Monitor,
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
    <Suspense
      fallback={
        <div className="min-h-screen w-full bg-page flex items-center justify-center p-4">
          <div className="w-full max-w-[420px] rounded-[28px] border border-base bg-surface p-8 space-y-4">
            <div className="mx-auto h-16 w-16 rounded-full bg-page animate-pulse" />
            <div className="h-7 w-28 rounded-lg bg-page animate-pulse" />
            <div className="h-40 rounded-xl bg-page animate-pulse" />
          </div>
        </div>
      }
    >
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

  // Sign-in succeeded, AuthProvider finished initialising, but the account
  // carries no `role` custom claim — AuthProvider's bounded retry has already
  // given up and called setUser(user, null). Without this, the effect below
  // simply returned on `!role` and `loading` stayed true forever (it is only
  // cleared in handleLogin's catch block), so the button span indefinitely
  // with no explanation. Derived during render — not assigned from an effect —
  // so no setState-in-effect is introduced.
  const noRoleAssigned = submitted && initialized && !role
  const isBusy = loading && !noRoleAssigned

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
      // [PRODUCTION FIX 2026-07-28] The admin dashboard's login-trend graph
      // has always queried AuditLog for LOGIN_SUCCESS/LOGIN_FAILED rows —
      // nothing ever wrote them. Fire-and-forget: a logging hiccup must
      // never block or delay the actual login.
      apiFetch('/auth/log-login-success', { method: 'POST' }).catch(() => {})
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? ''
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        setError('Incorrect email or password. Please try again.')
      } else if (code === 'auth/too-many-requests') {
        setError('Too many attempts. Please wait a few minutes.')
      } else {
        setError('Something went wrong. Please try again.')
      }
      apiFetch('/auth/log-login-failed', { method: 'POST', body: JSON.stringify({ email }) }).catch(() => {})
      setLoading(false)
    }
  }

  // ── Theme toggle — reuses the exact cycleTheme/themeIcons pattern already
  // shipped on the public homepage (apps/web/src/app/(public)/page.tsx),
  // just wired up locally here since this page doesn't share that file's
  // header component.
  const { theme, setTheme } = useTheme()
  const mounted = useHasMounted()
  const themeIcons = {
    light: <Sun className="w-4 h-4" />,
    dark: <Moon className="w-4 h-4" />,
    system: <Monitor className="w-4 h-4" />,
  } as const
  function cycleTheme() {
    const order: Array<keyof typeof themeIcons> = ['light', 'dark', 'system']
    const current = (theme as keyof typeof themeIcons) ?? 'system'
    setTheme(order[(order.indexOf(current) + 1) % order.length] ?? 'system')
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-page flex flex-col font-sans">
      {/* ── Ambient background: soft brand glow + organic line art ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1300px] h-[850px] rounded-full bg-gradient-to-br from-brand-navy-light/10 via-transparent to-brand-navy/20 dark:from-brand-navy-mid/20 dark:via-brand-navy/50 dark:to-black/50 blur-3xl" />
        <div className="absolute top-1/4 left-1/4 w-64 h-64 sm:w-[420px] sm:h-[420px] rounded-full bg-brand-teal/10 dark:bg-brand-teal/20 blur-[100px] sm:blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 sm:w-[420px] sm:h-[420px] rounded-full bg-brand-coral/10 dark:bg-brand-coral/15 blur-[110px] sm:blur-[130px] animate-pulse" />
        <div className="absolute top-1/3 right-1/3 w-48 h-48 sm:w-[300px] sm:h-[300px] rounded-full bg-brand-navy-light/10 dark:bg-brand-navy-light/15 blur-[90px] sm:blur-[100px]" />

        <svg
          className="absolute w-full h-full min-w-[950px] min-h-[700px] opacity-[0.15] dark:opacity-70 transition-opacity"
          viewBox="0 0 1440 900"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="loginTubeTeal" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--color-brand-teal-light)" />
              <stop offset="100%" stopColor="var(--color-brand-teal)" />
            </linearGradient>
            <linearGradient id="loginTubeCoral" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--color-brand-coral)" stopOpacity="0.9" />
              <stop offset="100%" stopColor="var(--color-brand-navy)" stopOpacity="0.9" />
            </linearGradient>
            <linearGradient id="loginTubeNavy" x1="20%" y1="0%" x2="80%" y2="100%">
              <stop offset="0%" stopColor="var(--color-brand-navy-light)" />
              <stop offset="55%" stopColor="var(--color-brand-navy-mid)" />
              <stop offset="100%" stopColor="var(--color-brand-navy)" />
            </linearGradient>
            <filter id="loginSoftShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="18" stdDeviation="22" floodColor="#000000" floodOpacity="0.35" />
            </filter>
          </defs>

          {/* Top-centre ring */}
          <g filter="url(#loginSoftShadow)">
            <path
              d="M 590 130 C 590 85 640 50 695 50 C 750 50 790 90 790 145 C 790 200 745 240 690 240 C 640 240 600 200 600 155"
              stroke="url(#loginTubeTeal)"
              strokeWidth="54"
              strokeLinecap="round"
              fill="none"
            />
          </g>

          {/* Centre-left zigzag pill */}
          <g filter="url(#loginSoftShadow)" transform="translate(360, 310)">
            <path
              d="M 40 40 L 90 40 C 110 40 120 50 120 70 L 120 100 C 120 120 110 130 90 130 L 40 130 C 20 130 10 140 10 160 L 10 190 C 10 210 20 220 40 220 L 90 220"
              stroke="url(#loginTubeNavy)"
              strokeWidth="50"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </g>

          {/* Bottom-centre C-curve */}
          <g filter="url(#loginSoftShadow)" transform="translate(480, 560)">
            <path
              d="M 120 20 C 50 30 10 90 10 150 C 10 215 65 265 140 265 C 200 265 245 225 245 170"
              stroke="url(#loginTubeCoral)"
              strokeWidth="60"
              strokeLinecap="round"
              fill="none"
            />
          </g>

          {/* Right-side spiral ribbon */}
          <g filter="url(#loginSoftShadow)">
            <path
              d="M 940 180 C 1030 190 1090 250 1080 340 C 1070 430 980 480 910 470 C 840 460 820 380 850 310 C 880 240 960 210 1040 230 C 1120 250 1160 330 1150 420 C 1140 510 1070 600 1000 660 C 920 730 830 780 750 820"
              stroke="url(#loginTubeTeal)"
              strokeWidth="52"
              strokeLinecap="round"
              fill="none"
            />
          </g>

          {/* Bottom-right sausage pillow */}
          <g filter="url(#loginSoftShadow)" transform="translate(1080, 680)">
            <path
              d="M 30 50 C 90 10 180 30 250 90 C 310 140 330 200 280 230"
              stroke="url(#loginTubeNavy)"
              strokeWidth="70"
              strokeLinecap="round"
              fill="none"
            />
          </g>
        </svg>
      </div>

      {/* ── Top bar: home + theme toggle ── */}
      <header className="relative z-30 flex items-center justify-between p-4 sm:p-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-heading font-medium text-body/70 hover:text-body bg-black/[0.02] dark:bg-white/[0.06] border border-base backdrop-blur-md rounded-lg px-3 py-2 transition-colors"
        >
          <Home className="w-4 h-4" />
          <span className="hidden sm:inline">Back to homepage</span>
        </Link>

        <button
          type="button"
          onClick={cycleTheme}
          aria-label={mounted ? `Theme: ${theme}. Click to change.` : 'Toggle theme'}
          className="w-9 h-9 rounded-lg border border-base bg-black/[0.02] dark:bg-white/[0.06] backdrop-blur-md text-body/70 hover:text-body flex items-center justify-center transition-colors"
        >
          {mounted ? themeIcons[(theme as keyof typeof themeIcons) ?? 'system'] : <Monitor className="w-4 h-4" aria-hidden />}
        </button>
      </header>

      {/* ── Centred content ── */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 pb-8 sm:pb-12">
        {/* Wide frosted plate */}
        <div className="w-full max-w-md sm:max-w-lg rounded-[32px] sm:rounded-[36px] bg-black/[0.015] dark:bg-white/[0.03] border border-base dark:border-white/10 backdrop-blur-md p-3 sm:p-6 shadow-xl">
          {/* Login glass card */}
          <div className="w-full rounded-[26px] sm:rounded-[30px] bg-surface dark:bg-white/[0.07] border border-base dark:border-white/15 backdrop-blur-2xl p-6 sm:p-9 shadow-2xl flex flex-col">
            {/* Logo + system name */}
            <div className="flex flex-col items-center justify-center mb-6 text-center">
              <Link
                href="/"
                className="flex items-center justify-center p-1 transition-transform hover:scale-105"
                title="Home"
              >
                <Image
                  src="/images/logo.png"
                  alt="SMS Malawi logo"
                  width={96}
                  height={96}
                  loading="eager"
                  className="w-16 h-16 sm:w-20 sm:h-20 object-contain drop-shadow-lg"
                />
              </Link>
              <span className="mt-3 font-heading font-bold text-sm sm:text-base text-body tracking-tight">
                SMS Malawi
              </span>
            </div>

            {/* Form title */}
            <div className="mb-5 text-left">
              <h1 className="text-2xl sm:text-[26px] font-heading font-bold text-body tracking-tight">
                Welcome back
              </h1>
              <p className="text-muted text-sm mt-1">Sign in to your school account</p>
            </div>

            {/* Status alerts */}
            {error && (
              <div className="mb-4 p-3 rounded-xl bg-brand-coral/10 border border-brand-coral/30 text-brand-coral text-xs flex items-center gap-2 animate-fade-in">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {noRoleAssigned && !error && (
              <div
                role="alert"
                className="mb-4 p-3 rounded-xl bg-brand-amber/10 border border-brand-amber/30 text-brand-amber text-xs flex items-start gap-2 animate-fade-in"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Your sign-in worked, but this account has no role assigned yet, so
                  there is nothing it can open. An administrator needs to set the
                  account&rsquo;s role before you can continue.
                </span>
              </div>
            )}

            {/* Login form */}
            <form onSubmit={handleLogin} className="space-y-4 text-left">
              <div>
                <label htmlFor="email" className="block text-xs sm:text-sm font-heading font-medium text-body mb-1.5">
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
                  className="w-full px-3.5 py-2.5 sm:py-3 bg-page text-body placeholder:text-muted rounded-xl text-sm font-sans border border-base focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal transition-all"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="password" className="text-xs sm:text-sm font-heading font-medium text-body">
                    Password
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-brand-teal hover:text-brand-teal-light transition-colors font-heading"
                  >
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
                    className="w-full px-3.5 py-2.5 sm:py-3 pr-11 bg-page text-body placeholder:text-muted rounded-xl text-sm font-sans border border-base focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-body focus:outline-none cursor-pointer transition-colors"
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isBusy}
                className="w-full py-3 bg-brand-navy hover:bg-brand-navy-mid active:bg-brand-navy text-white font-heading font-semibold text-sm rounded-xl transition-all shadow-md mt-5 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 border border-transparent dark:border-white/10 dark:hover:border-brand-teal/40"
              >
                {isBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                {isBusy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            {/* Authorisation notice */}
            <div className="mt-6 p-3.5 rounded-2xl bg-black/[0.015] dark:bg-white/[0.04] border border-base backdrop-blur-md text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1 text-body/90">
                <ShieldCheck className="w-4 h-4 text-brand-teal" />
                <span className="text-[11px] font-heading font-semibold tracking-wide uppercase">
                  Authorised access
                </span>
              </div>
              <p className="text-xs leading-relaxed text-muted font-sans">
                This portal is for authorised students and staff only.
              </p>
              <p className="text-xs leading-relaxed text-muted/70 font-sans mt-0.5">
                Contact your school administrator if you need access.
              </p>
            </div>

            {/* Footer: apply link */}
            <div className="mt-6 text-center text-xs text-muted font-sans flex items-center justify-center gap-1.5">
              <span>Ready to apply?</span>
              <Link
                href="/apply"
                className="inline-flex items-center gap-1 font-bold text-brand-teal hover:text-brand-teal-light transition-all underline-offset-4 hover:underline"
              >
                <span>Apply</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}