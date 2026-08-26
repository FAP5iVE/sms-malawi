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
 *   of truth for layout/visuals) — a single centred "frosted glass" card on
 *   an ambient, colour-rich backdrop. Nothing about auth, redirects, or
 *   state was touched: sanitizeRedirectTarget, the Suspense boundary,
 *   signInWithEmailAndPassword, the useAuthStore/useRouter/useSearchParams
 *   wiring, the noRoleAssigned/isBusy derivations, and the
 *   log-login-success/failed fire-and-forget calls are byte-for-byte the
 *   same logic as before this change, just re-wrapped in new markup.
 *
 * [REVISION 2 — visual fixes after review]:
 *   - The outer wrapper no longer carries `overflow-hidden`. It was clipping
 *     real card content (the "Ready to apply?" footer, part of the auth
 *     notice) on shorter viewports instead of letting the page scroll.
 *     `overflow-hidden` now lives ONLY on the small absolute decorative
 *     layer, where it belongs (containing blur bleed), never on a container
 *     that also holds real content.
 *   - Removed every opacity-modifier on the project's hand-rolled utility
 *     classes (`text-muted/70`, `text-body/70`, `text-body/90`). Those
 *     classes (bg-page, bg-surface, text-body, text-muted, border-base) are
 *     plain `@layer utilities` rules, not Tailwind `@theme` colour tokens —
 *     Tailwind's `/NN` opacity-modifier syntax only compiles for utilities
 *     registered via `@theme` (confirmed by compiling this file's classes
 *     through the Tailwind v4 CLI directly). A modifier on a non-token class
 *     silently produces no rule, which is exactly why the "Contact your
 *     school administrator" line was unreadable. Hierarchy is now expressed
 *     with the existing distinct tokens (text-body vs text-muted) instead.
 *   - The login card is genuinely translucent in BOTH themes now — dark
 *     mode keeps the frosted look, and light mode uses a soft white/blur
 *     glass (not a flat opaque `bg-surface`) with a visible border + shadow,
 *     so it reads as a distinct card instead of white-on-white.
 *   - Background art reworked to be denser, more varied in colour (teal,
 *     coral, amber, purple, navy — all existing brand-* tokens, referenced
 *     in the SVG via var(--color-brand-*) rather than invented hex), and
 *     rendered with `preserveAspectRatio="xMidYMid slice"` on a plain
 *     `inset-0 w-full h-full` box instead of arbitrary min-w/min-h — the
 *     previous sizing could scale unevenly depending on viewport aspect
 *     ratio, which is almost certainly why shapes rendered distorted.
 *   - Card widens further on desktop (lg:max-w-4xl outer / lg:max-w-2xl
 *     inner) so it reads as a substantial element rather than a small box
 *     lost in the middle of the screen, while mobile stays a single
 *     predefined max-w-sm card with no separate outer "frame" to distort.
 *   - Trimmed internal spacing/padding slightly throughout so the whole
 *     card comfortably fits inside a typical laptop viewport without
 *     needing to scroll to reach the sign-in button.
 *   - Added a theme toggle, reusing the exact cycleTheme/themeIcons pattern
 *     already shipped in apps/web/src/app/(public)/page.tsx (useTheme +
 *     useHasMounted, Sun/Moon/Monitor icons cycling light → dark → system).
 *   - The "Ready to apply?" footer links to the app's real /apply route
 *     rather than the mockup's inert onApply callback prop.
 *
 * [REVISION 3 — visual fixes after second review]:
 *   - Home/theme-toggle chips switched from translucent glass to a solid
 *     bg-brand-navy fill (white icon/text) so they read as buttons sitting
 *     directly on the background, not glass panels — matches the request
 *     to make them "a strong solid color" rather than another frosted card.
 *   - Muted secondary text (the subtitle, the two authorisation-notice
 *     lines, "Ready to apply?") now uses `text-muted-foreground
 *     dark:text-foreground`. In dark mode the plain muted-gray token was
 *     genuinely low-contrast against the colourful blurred backdrop
 *     bleeding through the glass card, so those specific lines bump to the
 *     full-contrast foreground colour in dark mode while keeping the softer
 *     muted tone in light mode (unaffected, per the original report).
 *   - The authorisation-notice box's dark-mode fill changed from
 *     `dark:bg-white/[0.04]` to `dark:bg-black/25` — a white-tinted overlay
 *     was brightening whatever colourful blur sat behind it (working
 *     against the light-gray text on top of it); a black-tinted scrim dims
 *     it instead, which is what that text actually needs to stay readable.
 *   - "Forgot password?" bumped to font-bold + brand-teal-light so it reads
 *     as a clear accent instead of blending into the muted palette.
 *   - The card moved from vertically-centered to top-aligned
 *     (`items-start` + minimal top padding) so its top edge sits close to
 *     the header instead of leaving a large empty gap above it, on both
 *     mobile and desktop.
 *   - Logo replaced with the 5iveStack Labs mark, switched by resolved
 *     theme: the black-on-transparent (BVO) variant in light mode, and a
 *     white-on-transparent (WVO) variant — generated from the supplied BVO
 *     artwork by remapping its black shape layer to white and leaving the
 *     orange unchanged, since a true WVO file wasn't provided — in dark
 *     mode, so the mark keeps contrast against the card behind it either
 *     way. Both files ship at apps/web/public/images/. Sized up
 *     (w-56/64/72 vs. the old w-14/16 icon-only mark) to match the
 *     requested larger footprint. "SMS Malawi" stays printed beneath it.
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
  const { theme, setTheme, resolvedTheme } = useTheme()
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
    <div className="relative min-h-screen w-full bg-page flex flex-col font-sans">
      {/* ── Ambient background: vignette + colourful glow + organic line art.
          overflow-hidden is scoped to THIS layer only, never to the page
          wrapper, so decorative blur can never clip real card content. */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Soft vignette plate for depth */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1600px] h-[1000px] max-w-[94vw] rounded-[80px] blur-3xl bg-gradient-to-br from-brand-teal-light/[0.07] via-transparent to-brand-coral/[0.06] dark:from-brand-navy-mid/25 dark:via-brand-navy/55 dark:to-black/60" />

        {/* Colourful glow orbs, spread and varied */}
        <div className="absolute top-[6%] left-[4%] w-64 h-64 sm:w-[420px] sm:h-[420px] rounded-full bg-brand-teal/15 dark:bg-brand-teal/25 blur-[100px] sm:blur-[130px]" />
        <div className="absolute bottom-[8%] right-[6%] w-64 h-64 sm:w-[420px] sm:h-[420px] rounded-full bg-brand-coral/15 dark:bg-brand-coral/22 blur-[110px] sm:blur-[140px]" />
        <div className="absolute top-[18%] right-[12%] w-52 h-52 sm:w-72 sm:h-72 rounded-full bg-brand-amber/12 dark:bg-brand-amber/20 blur-[90px] sm:blur-[110px]" />
        <div className="absolute bottom-[16%] left-[10%] w-52 h-52 sm:w-72 sm:h-72 rounded-full bg-brand-purple/12 dark:bg-brand-purple/20 blur-[90px] sm:blur-[110px]" />
        <div className="absolute top-[42%] left-[46%] w-56 h-56 sm:w-80 sm:h-80 rounded-full bg-brand-navy-light/10 dark:bg-brand-navy-light/18 blur-[90px] sm:blur-[110px]" />

        {/* Organic tube/ring line art in a full brand colour spread */}
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.18] dark:opacity-90 transition-opacity duration-300"
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="loginTeal" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--color-brand-teal-light)" />
              <stop offset="100%" stopColor="var(--color-brand-teal)" />
            </linearGradient>
            <linearGradient id="loginCoral" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--color-brand-coral)" />
              <stop offset="100%" stopColor="var(--color-brand-amber)" />
            </linearGradient>
            <linearGradient id="loginNavy" x1="20%" y1="0%" x2="80%" y2="100%">
              <stop offset="0%" stopColor="var(--color-brand-navy-light)" />
              <stop offset="55%" stopColor="var(--color-brand-navy-mid)" />
              <stop offset="100%" stopColor="var(--color-brand-navy)" />
            </linearGradient>
            <linearGradient id="loginPurple" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--color-brand-purple)" />
              <stop offset="100%" stopColor="var(--color-brand-navy-mid)" />
            </linearGradient>
            <linearGradient id="loginAmber" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--color-brand-amber)" />
              <stop offset="100%" stopColor="var(--color-brand-coral)" />
            </linearGradient>
            <filter id="loginSoftShadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="16" stdDeviation="20" floodColor="#000000" floodOpacity="0.32" />
            </filter>
          </defs>

          {/* Top-centre ring — teal */}
          <g filter="url(#loginSoftShadow)">
            <path
              d="M 590 130 C 590 85 640 50 695 50 C 750 50 790 90 790 145 C 790 200 745 240 690 240 C 640 240 600 200 600 155"
              stroke="url(#loginTeal)"
              strokeWidth="54"
              strokeLinecap="round"
              fill="none"
            />
          </g>

          {/* Centre-left zigzag pill — navy */}
          <g filter="url(#loginSoftShadow)" transform="translate(330, 300)">
            <path
              d="M 40 40 L 90 40 C 110 40 120 50 120 70 L 120 100 C 120 120 110 130 90 130 L 40 130 C 20 130 10 140 10 160 L 10 190 C 10 210 20 220 40 220 L 90 220"
              stroke="url(#loginNavy)"
              strokeWidth="48"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </g>

          {/* Bottom-centre C-curve — coral/amber */}
          <g filter="url(#loginSoftShadow)" transform="translate(470, 560)">
            <path
              d="M 120 20 C 50 30 10 90 10 150 C 10 215 65 265 140 265 C 200 265 245 225 245 170"
              stroke="url(#loginCoral)"
              strokeWidth="58"
              strokeLinecap="round"
              fill="none"
            />
          </g>

          {/* Right-side spiral ribbon — purple */}
          <g filter="url(#loginSoftShadow)">
            <path
              d="M 950 170 C 1040 180 1100 240 1090 330 C 1080 420 990 470 920 460 C 850 450 830 370 860 300 C 890 230 970 200 1050 220 C 1130 240 1170 320 1160 410 C 1150 500 1080 590 1010 650 C 930 720 840 770 760 810"
              stroke="url(#loginPurple)"
              strokeWidth="50"
              strokeLinecap="round"
              fill="none"
            />
          </g>

          {/* Bottom-right sausage pillow — amber */}
          <g filter="url(#loginSoftShadow)" transform="translate(1070, 660)">
            <path
              d="M 30 50 C 90 10 180 30 250 90 C 310 140 330 200 280 230"
              stroke="url(#loginAmber)"
              strokeWidth="66"
              strokeLinecap="round"
              fill="none"
            />
          </g>

          {/* Top-right accent ring — amber */}
          <g filter="url(#loginSoftShadow)">
            <circle cx="1250" cy="120" r="74" stroke="url(#loginAmber)" strokeWidth="42" fill="none" />
          </g>

          {/* Bottom-left arc — purple/navy */}
          <g filter="url(#loginSoftShadow)">
            <path
              d="M 40 830 A 170 170 0 0 1 380 850"
              stroke="url(#loginPurple)"
              strokeWidth="46"
              strokeLinecap="round"
              fill="none"
            />
          </g>

          {/* Small floating teal ring, upper-mid */}
          <g filter="url(#loginSoftShadow)">
            <circle cx="240" cy="120" r="46" stroke="url(#loginTeal)" strokeWidth="34" fill="none" />
          </g>
        </svg>
      </div>

      {/* ── Top bar: home + theme toggle ── */}
      <header className="relative z-30 flex items-center justify-between p-3 sm:p-4">
        <Link
          href="/"
          aria-label="Back to homepage"
          title="Back to homepage"
          className="w-9 h-9 rounded-lg bg-brand-navy hover:bg-brand-navy-mid text-white shadow-md flex items-center justify-center transition-colors"
        >
          <Home className="w-4 h-4" />
        </Link>

        <button
          type="button"
          onClick={cycleTheme}
          aria-label={mounted ? `Theme: ${theme}. Click to change.` : 'Toggle theme'}
          className="w-9 h-9 rounded-lg bg-brand-navy hover:bg-brand-navy-mid text-white shadow-md flex items-center justify-center transition-colors"
        >
          {mounted ? themeIcons[(theme as keyof typeof themeIcons) ?? 'system'] : <Monitor className="w-4 h-4" aria-hidden />}
        </button>
      </header>

      {/* ── Centred content ── */}
      <main className="relative z-10 flex-1 flex items-start justify-center px-4 pt-0 pb-6 sm:pb-8">
        {/* Wide frosted plate */}
        <div className="w-full max-w-sm sm:max-w-2xl lg:max-w-4xl rounded-[28px] sm:rounded-[36px] bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/10 backdrop-blur-md p-2.5 sm:p-5 shadow-xl">
          {/* Login glass card — translucent + blurred in BOTH themes */}
          <div className="w-full max-w-sm sm:max-w-lg lg:max-w-2xl mx-auto rounded-[24px] sm:rounded-[30px] bg-white/80 dark:bg-white/[0.07] border border-black/5 dark:border-white/15 backdrop-blur-2xl p-6 sm:p-8 shadow-2xl flex flex-col">
            {/* Logo + system name — BVO (dark-on-light) mark in light mode,
                WVO (light-on-dark) mark in dark mode, so the mark always
                has contrast against the card behind it. */}
            <div className="flex flex-col items-center justify-center mb-5 text-center">
              <Link
                href="/"
                className="flex items-center justify-center transition-transform hover:scale-105"
                title="Home"
              >
                <Image
                  src={
                    mounted && resolvedTheme === 'dark'
                      ? '/images/5ivestacks-labs-logo-wvo.svg'
                      : '/images/5ivestacks-labs-logo-bvo.svg'
                  }
                  alt="5iveStack Labs logo"
                  width={380}
                  height={150}
                  loading="eager"
                  className="w-56 sm:w-64 lg:w-72 h-auto object-contain drop-shadow-lg"
                />
              </Link>
              <span className="mt-2.5 font-heading font-bold text-sm sm:text-base text-body tracking-tight">
                SMS Malawi
              </span>
            </div>

            {/* Form title */}
            <div className="mb-4 text-left">
              <h1 className="text-2xl sm:text-[26px] font-heading font-bold text-body tracking-tight">
                Welcome back
              </h1>
              <p className="text-muted-foreground dark:text-foreground text-sm mt-1">Sign in to your school account</p>
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
                  className="w-full px-3.5 py-2.5 sm:py-3 bg-page text-body placeholder:text-muted-foreground rounded-xl text-sm font-sans border border-base focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal transition-all"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="password" className="text-xs sm:text-sm font-heading font-medium text-body">
                    Password
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-xs font-bold text-brand-teal-light hover:text-brand-teal transition-colors font-heading"
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
                    className="w-full px-3.5 py-2.5 sm:py-3 pr-11 bg-page text-body placeholder:text-muted-foreground rounded-xl text-sm font-sans border border-base focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-foreground focus:outline-none cursor-pointer transition-colors"
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isBusy}
                className="w-full py-3 bg-brand-navy hover:bg-brand-navy-mid active:bg-brand-navy text-white font-heading font-semibold text-sm rounded-xl transition-all shadow-md mt-4 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 border border-transparent dark:border-white/10 dark:hover:border-brand-teal/40"
              >
                {isBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                {isBusy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            {/* Authorisation notice */}
            <div className="mt-5 p-3 rounded-2xl bg-black/[0.02] dark:bg-black/25 border border-base backdrop-blur-md text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1 text-body">
                <ShieldCheck className="w-4 h-4 text-brand-teal" />
                <span className="text-[11px] font-heading font-semibold tracking-wide uppercase">
                  Authorised access
                </span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground dark:text-foreground font-sans">
                This portal is for authorised students and staff only.
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground dark:text-foreground font-sans mt-0.5">
                Contact your school administrator if you need access.
              </p>
            </div>

            {/* Footer: apply link */}
            <div className="mt-4 text-center text-xs text-muted-foreground dark:text-foreground font-sans flex items-center justify-center gap-1.5">
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