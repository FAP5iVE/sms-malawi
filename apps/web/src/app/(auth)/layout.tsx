'use client'

/**
 * apps/web/src/app/(auth)/layout.tsx — Phase C1 (updated from Phase B8)
 *
 * Authenticated shell layout with full mobile-first responsive architecture.
 *
 * Breakpoint strategy:
 *   < md (768px): Mobile shell — PageHeader (top) + scrollable main + MobileBottomNav (fixed bottom)
 *   md+  (768px): Desktop shell — Sidebar (left, collapsed rail md–lg, full width lg+) + PageHeader + scrollable main
 *
 * Implementation approach (single React tree, CSS-controlled visibility):
 *   • One set of children — rendered once in a single <main>.
 *   • Sidebar is wrapped in `hidden md:flex shrink-0` → hidden on mobile, flex from md up.
 *   • MobileBottomNav is `fixed` and carries its own `md:hidden` on its root <nav>.
 *     When its <nav> ancestor has `display: none` (via md:hidden), the fixed element
 *     is also hidden — standard CSS behaviour for `display: none` parent → all
 *     descendants are removed from the rendered tree including fixed children.
 *   • Main content reserves dynamic bottom clearance on mobile — see the `<main>`
 *     padding comment below (Rule FE-001 fix) — clearing MobileBottomNav's real,
 *     safe-area-inclusive height rather than a flat px value. On desktop, `md:pb-6`
 *     resets to 24px since no fixed bottom bar exists at that breakpoint.
 *
 * Phase B8 AnimatePresence page transitions are fully preserved.
 *
 * PageHeader note (C2):
 *   PageHeader will receive its mobile variant redesign in Phase C2. For now,
 *   the existing desktop-oriented PageHeader renders in both breakpoints.
 *   The layout is already structured to receive the C2 mobile PageHeader variant.
 */

import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Sidebar } from '@/components/shared/Sidebar'
import { PageHeader } from '@/components/shared/PageHeader'
import { MobileBottomNav } from '@/components/shared/MobileBottomNav'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { PublicAmbientBackground } from '@/components/shared/PublicAmbientBackground'
import { useInactivityTimer } from '@/hooks/useInactivityTimer'
import { useMotionEnabled } from '@/store/motionStore'
import { PAGE_VARIANTS } from '@/lib/motion'
import { useCallback } from 'react'
import { logout } from '@/components/providers/AuthProvider'
import { InactivityWarningDialog } from '@/components/shared/InactivityWarningDialog'

// ─────────────────────────────────────────────────────────────────────────────
// INACTIVITY WATCHER
// Side-effect only — starts the inactivity logout timer after auth resolves.
// Produces no DOM output. Phase C9 will extend this with the warning dialog.
// ─────────────────────────────────────────────────────────────────────────────

function InactivityManager() {
  const router = useRouter()
  const { showWarning, keepAlive } = useInactivityTimer()

  const handleLogout = useCallback(async () => {
    // R2: delegate to AuthProvider's shared logout() — it sequences the FCM
    // unregister call ahead of signOut(auth) and lets onIdTokenChanged's
    // signed-out branch clear cookies/store exactly once, rather than this
    // handler hand-writing its own (bogus) cookie-clear line.
    await logout()
    router.replace('/login')
  }, [router])

  if (!showWarning) return null

  return <InactivityWarningDialog onKeepAlive={keepAlive} onLogout={handleLogout} />
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE TRANSITION WRAPPER (Phase B8 — preserved unchanged)
//
// AnimatePresence with mode="wait":
//   - The exiting page completes its animation before the entering page mounts.
//   - Prevents two pages from occupying the same scroll container simultaneously.
//   - The key is the current pathname — each route change triggers exit + enter.
//
// When motionEnabled = false (prefers-reduced-motion or user preference):
//   - AnimatePresence is bypassed entirely (no unmount-remount between routes).
//   - Important for form pages with controlled inputs — prevents the flash of
//     unmounted form fields during the exit phase.
// ─────────────────────────────────────────────────────────────────────────────

function PageTransitionWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const motionEnabled = useMotionEnabled()

  if (!motionEnabled) {
    return <>{children}</>
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        variants={PAGE_VARIANTS}
        initial="initial"
        animate="animate"
        exit="exit"
        // [FE-004] `min-h-full`, NOT `h-full` — DO NOT change back.
        // `h-full` (height: 100%) locks this div to exactly <main>'s content-box
        // height (main's own height minus its pt-4/main-scroll-pad padding).
        // Since this div has no overflow set (defaults to visible), taller page
        // content doesn't get clipped OR grow this box — it just paints past this
        // div's artificially short boundary, right through where main's bottom
        // padding was reserved. Net effect: the padding never actually appears
        // after the real end of the content, so the last item on tall pages
        // renders almost flush to the screen edge, behind MobileBottomNav —
        // confirmed via getBoundingClientRect showing ~60px of real overlap even
        // though main's computed padding-bottom was correctly 76px. `min-h-full`
        // keeps short pages filling the available space (e.g. for centered empty
        // states) while letting this div grow to its real content height on long
        // pages, so main's padding-bottom lands after the actual last pixel of
        // content instead of after an artificial cutoff.
        className="min-h-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH LAYOUT
// ─────────────────────────────────────────────────────────────────────────────

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    // AuthProvider is no longer wrapped here — it is mounted once in the
    // root layout (apps/web/src/app/layout.tsx) so that it also covers the
    // (public) route group, whose /login page depends on its
    // onIdTokenChanged listener to observe sign-in. Wrapping again here
    // would mount a SECOND listener inside the authenticated tree,
    // double-firing setUser() and the FCM token registration.
    <>
      {/* Side-effect: starts inactivity logout timer after auth init */}
      <InactivityManager />

      {/*
        Outer shell — full viewport height using `h-dvh` (dynamic viewport height).
        `dvh` accounts for the collapsible browser chrome on mobile (iOS Safari,
        Chrome for Android), unlike `vh` which causes content to be cut off when
        the address bar is visible. Falls back to `vh` in older browsers via Tailwind.

        The flex row contains:
          1. Sidebar wrapper — `hidden md:flex` collapses it on mobile
          2. Main column  — always fills remaining width
      */}
      <div className="flex h-dvh overflow-hidden bg-page">
        {/* Same shared backdrop every public page uses — set once here so
            every authenticated page inherits it with no per-page changes.
            `fixed inset-0` + `pointer-events-none` means it costs nothing
            in this flex layout and never intercepts clicks/touches. */}
        <PublicAmbientBackground />

        {/* ── Sidebar wrapper ─────────────────────────────────────────────
          `hidden`    → display:none below md (Sidebar not rendered visually)
          `md:flex`   → flex container from md up (Sidebar is a flex child;
                        collapsed rail md–lg via `md:w-12`, full width `lg:w-auto`)
          `shrink-0`  → prevents the sidebar from shrinking on resize edge cases
          `relative z-10` → stacks above the fixed ambient background layer.

          Since Sidebar uses motion.aside with its own width management, the
          wrapper only provides the breakpoint-controlled `display` toggle.
          Sidebar's internal spring-animated width still works correctly.
        ────────────────────────────────────────────────────────────────── */}
        <div className="hidden md:flex md:w-12 lg:w-auto shrink-0 relative z-10">
          <Sidebar />
        </div>

        {/* ── Main content column ─────────────────────────────────────────
          `flex-1` → fills remaining horizontal space after the sidebar.
          `min-w-0` → prevents flex child from overflowing on very wide content.
          `relative z-10` → stacks above the fixed ambient background layer.
          The column is itself a flex column: PageHeader (fixed height) + main (flex-1).
        ────────────────────────────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative z-10">
          {/*
            PageHeader — Phase C2 will add a mobile variant.
            For C1 the existing PageHeader renders across all breakpoints.
          */}
          <PageHeader />

          {/*
            Scrollable page content area.

            Padding strategy:
              Mobile (< md):
                pt-4 px-4        → 1rem top/sides only. Deliberately NOT `p-4`.
                                   `p-4` also sets padding-bottom: 1rem, which is
                                   a second, competing declaration for the same
                                   property main-scroll-pad is trying to own.
                                   [FE-002] Even though main-scroll-pad currently
                                   wins that fight (it's unlayered plain CSS in
                                   globals.css, and Tailwind v4 ships its own
                                   utilities inside a named `@layer utilities` —
                                   unlayered CSS always beats layered CSS
                                   regardless of source order, per the CSS
                                   Cascade Layers spec), leaving `p-4` in place
                                   meant the real bottom padding depended on that
                                   layering fact holding forever. Any future
                                   change that wraps main-scroll-pad in
                                   `@layer utilities` (the pattern this codebase
                                   already uses for its other custom classes —
                                   see globals.css "CUSTOM UTILITIES") would
                                   silently reintroduce the bug by putting both
                                   declarations in the same layer, where plain
                                   source order decides the winner. Splitting the
                                   shorthand removes the competing declaration
                                   entirely so there is nothing left to win.
                main-scroll-pad  → clears MobileBottomNav's real height via a
                                   plain CSS class in globals.css (env()/calc(),
                                   no inline style, no Tailwind arbitrary value —
                                   the earlier inline-custom-property version
                                   broke the authenticated shell at runtime and
                                   was reverted). [FE-001] Now also `!important`
                                   (see globals.css) as a second, independent
                                   safeguard against the layering issue above.

              Desktop (md+):
                md:p-6           → 1.5rem on all sides (standard dashboard spacing)
                                   main-scroll-pad's own media query resets its
                                   bottom padding to 1.5rem here — no fixed bottom
                                   bar exists at this breakpoint.

            `overflow-y-auto` — scrolling is on this container, not the body.
            `relative`        — establishes stacking context for PageTransitionWrapper.
            `h-dvh` fallback  — the parent already constrains height via overflow-hidden.

            [FE-003] `min-h-0` — DO NOT REMOVE. This is a flex column child
            (this <main> sits below <PageHeader> inside a `flex flex-col`
            parent) with `flex-1` + `overflow-y-auto`. Flex items default to
            `min-height: auto`, which means the browser refuses to shrink
            this element below the height its own content wants — so instead
            of `<main>` locking to the remaining column space and scrolling
            *internally* (where main-scroll-pad's bottom padding actually
            does something), it just kept growing to fit all of its content,
            pushing the real bottom of the page past the device viewport.
            That's the ACTUAL cause of content (e.g. the last dashboard
            card) rendering behind MobileBottomNav on mobile — confirmed by
            DevTools: main-scroll-pad's computed padding-bottom was already
            correct (76px), but the highlighted box for <main> didn't cover
            all of its own visible content, the textbook symptom of a
            flex item overflowing instead of scrolling. `min-h-0` overrides
            the default `min-height: auto` so `flex-1` can actually shrink
            this element to its allotted space and `overflow-y-auto` takes
            over as intended.
          */}
          <main className="flex-1 min-h-0 overflow-y-auto pt-4 px-4 main-scroll-pad md:p-6 relative">
            <ErrorBoundary>
              <PageTransitionWrapper>{children}</PageTransitionWrapper>
            </ErrorBoundary>
          </main>
        </div>
      </div>

      {/*
        MobileBottomNav — rendered outside the flex shell so that its fixed
        positioning is relative to the viewport, not constrained by a flex container.

        MobileBottomNav carries its own `md:hidden` class on its root <nav> element.
        On desktop (md+), the <nav> has `display: none` which — per CSS spec —
        removes all descendants from the render tree including fixed-position children.
        The "More" sheet overlay (also inside MobileBottomNav) uses AnimatePresence
        and won't render at all until the user opens it, so there's zero desktop cost.

        Why outside the flex shell div:
          If MobileBottomNav were inside the flex shell, its `position: fixed`
          would still work correctly (fixed elements always position relative to the
          viewport). However, placing it outside the shell is semantically cleaner —
          it is not part of the flex layout and should not participate in it.
      */}
      <MobileBottomNav />
    </>
  )
}