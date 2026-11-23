/**
 * apps/web/src/app/(public)/login/page.tsx
 *
 * R2, Auth Session & Login Flow Correctness.
 *
 * Fixes two confirmed defects from the audit:
 *  1. A manual session cookie write using a bogus literal "1" instead
 *     of the real Firebase UID, which also raced AuthProvider's own
 *     cookie-setting. Cookie writes belong exclusively to AuthProvider's
 *     onIdTokenChanged listener (see sms-erp-security Rule 1), this page
 *     no longer touches `document.cookie` at all.
 *  2. `router.push('/dashboard')` fired immediately after sign-in, before the
 *     role cookie/claim had actually propagated, producing a visible
 *     redirect-loop-back-through-dashboard. The redirect now waits for the
 *     auth store's `role`/`initialized` fields (set by AuthProvider once the
 *     ID token's custom claims are read) before navigating, and honors the
 *     `?from=` deep-link param proxy.ts already attaches, validated to
 *     reject protocol-relative/external targets.
 *
 * [CHANGE TYPE]: VISUAL REDESIGN ONLY (login-page-redesign.zip is the source
 *   of truth for layout/visuals), a single centred "frosted glass" card on
 *   an ambient, colour-rich backdrop. Nothing about auth, redirects, or
 *   state was touched: sanitizeRedirectTarget, the Suspense boundary,
 *   signInWithEmailAndPassword, the useAuthStore/useRouter/useSearchParams
 *   wiring, the noRoleAssigned/isBusy derivations, and the
 *   log-login-success/failed fire-and-forget calls are byte-for-byte the
 *   same logic as before this change, just re-wrapped in new markup.
 *
 * [REVISION 2, visual fixes after review]:
 *   - The outer wrapper no longer carries `overflow-hidden`. It was clipping
 *     real card content (the "Ready to apply?" footer, part of the auth
 *     notice) on shorter viewports instead of letting the page scroll.
 *     `overflow-hidden` now lives ONLY on the small absolute decorative
 *     layer, where it belongs (containing blur bleed), never on a container
 *     that also holds real content.
 *   - Removed every opacity-modifier on the project's hand-rolled utility
 *     classes (`text-muted/70`, `text-body/70`, `text-body/90`). Those
 *     classes (bg-page, bg-surface, text-body, text-muted, border-base) are
 *     plain `@layer utilities` rules, not Tailwind `@theme` colour tokens,
 *     Tailwind's `/NN` opacity-modifier syntax only compiles for utilities
 *     registered via `@theme` (confirmed by compiling this file's classes
 *     through the Tailwind v4 CLI directly). A modifier on a non-token class
 *     silently produces no rule, which is exactly why the "Contact your
 *     school administrator" line was unreadable. Hierarchy is now expressed
 *     with the existing distinct tokens (text-body vs text-muted) instead.
 *   - The login card is genuinely translucent in BOTH themes now, dark
 *     mode keeps the frosted look, and light mode uses a soft white/blur
 *     glass (not a flat opaque `bg-surface`) with a visible border + shadow,
 *     so it reads as a distinct card instead of white-on-white.
 *   - Background art reworked to be denser, more varied in colour (teal,
 *     coral, amber, purple, navy, all existing brand-* tokens, referenced
 *     in the SVG via var(--color-brand-*) rather than invented hex), and
 *     rendered with `preserveAspectRatio="xMidYMid slice"` on a plain
 *     `inset-0 w-full h-full` box instead of arbitrary min-w/min-h, the
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
 * [REVISION 3, visual fixes after second review]:
 *   - Home/theme-toggle chips switched from translucent glass to a solid
 *     bg-brand-deep fill (white icon/text) so they read as buttons sitting
 *     directly on the background, not glass panels, matches the request
 *     to make them "a strong solid color" rather than another frosted card.
 *   - Muted secondary text (the subtitle, the two authorisation-notice
 *     lines, "Ready to apply?") now uses `text-muted-foreground
 *     dark:text-foreground`. In dark mode the plain muted-gray token was
 *     genuinely low-contrast against the colourful blurred backdrop
 *     bleeding through the glass card, so those specific lines bump to the
 *     full-contrast foreground colour in dark mode while keeping the softer
 *     muted tone in light mode (unaffected, per the original report).
 *   - The authorisation-notice box's dark-mode fill changed from
 *     `dark:bg-white/[0.04]` to `dark:bg-black/25`, a white-tinted overlay
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
 *     white-on-transparent (WVO) variant, generated from the supplied BVO
 *     artwork by remapping its black shape layer to white and leaving the
 *     orange unchanged, since a true WVO file wasn't provided, in dark
 *     mode, so the mark keeps contrast against the card behind it either
 *     way. Both files ship at apps/web/public/images/. Sized up
 *     (w-56/64/72 vs. the old w-14/16 icon-only mark) to match the
 *     requested larger footprint. "SMS Malawi" stays printed beneath it.
 *
 * [REVISION 4, shared public header + AuthShell]:
 *   - The page-level top bar (loose Home + theme chips) is gone. Every public
 *     page now gets the same header from (public)/layout.tsx
 *     (components/shared/PublicHeader.tsx), rendered here in its frosted
 *     "glass" look so it matches this page's cards. Its Home link and theme
 *     dropdown replace the two chips and the local cycleTheme() code.
 *   - The frame, glass card, logo and background moved into the shared
 *     <AuthShell> (components/shared/AuthShell.tsx) so /forgot-password,
 *     /change-password and /reset-password render at exactly the same size.
 *     On desktop the card is now a wide two-pane layout (brand + authorised
 *     access notice on the left, the form on the right); on phones it is a
 *     single compact column. The ambient artwork is the shared
 *     <PublicAmbientBackground vivid />, identical artwork, de-duplicated.
 *   - No change to any auth logic: sanitizeRedirectTarget, signInWith
 *     EmailAndPassword, the redirect effect, noRoleAssigned/isBusy and the
 *     login-log calls are untouched. The sign-in error box gained
 *     role="alert" and decorative icons gained aria-hidden.
 *
 * [REVISION 5, Chikangawa Hills theme, Phase 3: looks only]:
 *   - The form now sits on a surface in the right column of the new AuthShell
 *     (wide container; crest, time-aware headline and the authorised-access
 *     notice on the sky at left). Fields use the mockup's underlined style on
 *     the SAME inputs (id, type, autoComplete, required, labels unchanged), the
 *     button is the mockup's ink bar with an arrow, links are bold accent text.
 *   - The only non-class changes: `<AuthShell skeletonOnBusy>` (one look prop),
 *     the spinning Loader2 inside the button is gone (skeleton sweep in CSS
 *     instead, label unchanged), the button text sits in a <span>, and the
 *     Suspense fallback is the new <AuthShellSkeleton/>. isBusy, the redirect
 *     effect, handleLogin and every API call are untouched.
 */
'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { apiFetch } from '@/lib/api-client'
import { auth } from '@/lib/firebase'
import { useAuthStore } from '@/store/authStore'
import { postLoginPath } from '@shared/constants/pageAccess'
import { AuthShell } from '@/components/shared/AuthShell'
import { AuthShellSkeleton } from '@/components/shared/AuthShellSkeleton'
import { GuardianClaimForm } from '@/components/guardians/GuardianClaimForm'
import {
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react'

/**
 * Only allow an internal, same-origin path as a post-login redirect target.
 * Rejects absolute URLs ("https://evil.example") and protocol-relative
 * targets ("//evil.example"), both of which would otherwise send an
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
    <Suspense fallback={<AuthShellSkeleton />}>
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
  // equal to the previous snapshot, React then re-renders forever
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
  // carries no `role` custom claim, AuthProvider's bounded retry has already
  // given up and called setUser(user, null). Without this, the effect below
  // simply returned on `!role` and `loading` stayed true forever (it is only
  // cleared in handleLogin's catch block), so the button span indefinitely
  // with no explanation. Derived during render, not assigned from an effect,
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
    // Each role's own home (a parent lands on /parent, never /dashboard), and a
    // `from` target is honoured only if this role may open it.
    router.replace(postLoginPath(role, safeFrom))
  }, [submitted, initialized, role, safeFrom, router])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!auth) return // auth is only null during SSR; never reached in browser
    setError(null)
    setLoading(true)

    try {
      await signInWithEmailAndPassword(auth, email, password)
      // Do not set cookies or navigate here, AuthProvider's onIdTokenChanged
      // listener owns both, and the useEffect above navigates once it has.
      setSubmitted(true)
      // [PRODUCTION FIX 2026-07-28] The admin dashboard's login-trend graph
      // has always queried AuditLog for LOGIN_SUCCESS/LOGIN_FAILED rows,
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

  // The invitation e-mail links here with ?claim=1: an invited guardian turns their code into an
  // account. Placed after every hook above so the hook order is identical in both views.
  if (searchParams.get('claim') === '1') return <GuardianClaimForm />

  return (
    <AuthShell
      skeletonOnBusy
      footer={
        /* Authorisation notice (wording unchanged). Sits under the headline on
           desktop and after the form on smaller screens (AuthShell decides). */
        <>
          <ShieldCheck aria-hidden />
          <div>
            <p className="hills-auth__notice-title">Authorised access</p>
            <p>Sign in is for authorised students and staff only.</p>
            <p>Contact your school administrator if you need access.</p>
          </div>
        </>
      }
    >
      {/* Form title */}
      <div className="mb-6 text-left">
        <h1 className="hills-auth__title">Sign in</h1>
        <p className="hills-auth__lede">Use the email your school registered for you.</p>
      </div>

      {/* Status alerts */}
      {error && (
        <div role="alert" className="hills-alert hills-alert--danger animate-fade-in">
          <AlertCircle aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {noRoleAssigned && !error && (
        <div role="alert" className="hills-alert hills-alert--warn animate-fade-in">
          <AlertCircle aria-hidden />
          <span>
            Your sign-in worked, but this account has no role assigned yet, so
            there is nothing it can open. An administrator needs to set the
            account&rsquo;s role before you can continue.
          </span>
        </div>
      )}

      {/* Login form */}
      <form onSubmit={handleLogin} className="text-left">
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
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@school.edu.mw"
            />
          </div>
        </div>

        <div className="hills-field">
          <div className="hills-field__row">
            <label htmlFor="password" className="hills-label">
              Password
            </label>
            <Link href="/forgot-password" className="hills-link">
              Forgot password?
            </Link>
          </div>
          <div className="hills-input">
            <input
              id="password"
              type={showPass ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="hills-pw"
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className="hills-eye"
              aria-label={showPass ? 'Hide password' : 'Show password'}
            >
              {showPass ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
            </button>
          </div>
        </div>

        <button type="submit" disabled={isBusy} className="hills-go">
          <span>{isBusy ? 'Signing in…' : 'Sign in'}</span>
          <ArrowRight className="hills-go__arrow" aria-hidden />
        </button>
      </form>

      {/* Footer: apply link */}
      <p className="hills-alt">
        <span>Ready to apply?</span>
        <Link href="/apply" className="hills-link">
          Start your application
        </Link>
      </p>
    </AuthShell>
  )
}
