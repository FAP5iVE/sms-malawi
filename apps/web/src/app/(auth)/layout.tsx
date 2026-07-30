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
import { Sidebar }               from '@/components/shared/Sidebar'
import { PageHeader }            from '@/components/shared/PageHeader'
import { MobileBottomNav }       from '@/components/shared/MobileBottomNav'
import { useInactivityTimer }    from '@/hooks/useInactivityTimer'
import { useMotionEnabled }      from '@/store/motionStore'
import { PAGE_VARIANTS }         from '@/lib/motion'
import { useCallback }                           from 'react'
import { logout }                                from '@/components/providers/AuthProvider'
import { InactivityWarningDialog }               from '@/components/shared/InactivityWarningDialog'

// ─────────────────────────────────────────────────────────────────────────────
// INACTIVITY WATCHER
// Side-effect only — starts the inactivity logout timer after auth resolves.
// Produces no DOM output. Phase C9 will extend this with the warning dialog.
// ─────────────────────────────────────────────────────────────────────────────

function InactivityManager() {
  const router                         = useRouter()
  const { showWarning, keepAlive }     = useInactivityTimer()

  const handleLogout = useCallback(async () => {
    // R2: delegate to AuthProvider's shared logout() — it sequences the FCM
    // unregister call ahead of signOut(auth) and lets onIdTokenChanged's
    // signed-out branch clear cookies/store exactly once, rather than this
    // handler hand-writing its own (bogus) cookie-clear line.
    await logout()
    router.replace('/login')
  }, [router])

  if (!showWarning) return null

  return (
    <InactivityWarningDialog
      onKeepAlive={keepAlive}
      onLogout={handleLogout}
    />
  )
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
  const pathname      = usePathname()
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
        className="h-full"
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

        {/* ── Sidebar wrapper ─────────────────────────────────────────────
          `hidden`    → display:none below md (Sidebar not rendered visually)
          `md:flex`   → flex container from md up (Sidebar is a flex child;
                        collapsed rail md–lg via `md:w-12`, full width `lg:w-auto`)
          `shrink-0`  → prevents the sidebar from shrinking on resize edge cases

          Since Sidebar uses motion.aside with its own width management, the
          wrapper only provides the breakpoint-controlled `display` toggle.
          Sidebar's internal spring-animated width still works correctly.
        ────────────────────────────────────────────────────────────────── */}
        <div className="hidden md:flex md:w-12 lg:w-auto shrink-0">
          <Sidebar />
        </div>

        {/* ── Main content column ─────────────────────────────────────────
          `flex-1` → fills remaining horizontal space after the sidebar.
          `min-w-0` → prevents flex child from overflowing on very wide content.
          The column is itself a flex column: PageHeader (fixed height) + main (flex-1).
        ────────────────────────────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

          {/*
            PageHeader — Phase C2 will add a mobile variant.
            For C1 the existing PageHeader renders across all breakpoints.
          */}
          <PageHeader />

          {/*
            Scrollable page content area.

            Padding strategy:
              Mobile (< md):
                p-4          → 1rem on all sides (tighter on small screens)
                pb-[calc(5rem+var(--sab))] → 5rem (80px) base clearance for the
                               fixed MobileBottomNav's ~60px bar, PLUS the same
                               env(safe-area-inset-bottom) inset MobileBottomNav
                               itself pads with (--sab custom property, set below).
                               A flat 80px alone under-clears on any device whose
                               gesture-bar/home-indicator safe-area inset pushes the
                               real nav height past 80px (most current Android
                               phones and notch-less-home-button iPhones) — the
                               last scrollable content ends up hidden behind the
                               nav, unreachable by scrolling. [FE-001]

              Desktop (md+):
                md:p-6       → 1.5rem on all sides (standard dashboard spacing)
                md:pb-6      → overrides the mobile calc(), resetting bottom to
                               1.5rem — no fixed bottom bar exists at this
                               breakpoint (Sidebar replaces MobileBottomNav here).

            `overflow-y-auto` — scrolling is on this container, not the body.
            `relative`        — establishes stacking context for PageTransitionWrapper.
            `h-dvh` fallback  — the parent already constrains height via overflow-hidden.
          */}
          <main
            className="flex-1 overflow-y-auto p-4 pb-[calc(5rem+var(--sab))] md:p-6 md:pb-6 relative"
            style={{ '--sab': 'env(safe-area-inset-bottom, 0px)' } as React.CSSProperties}
          >
            <PageTransitionWrapper>
              {children}
            </PageTransitionWrapper>
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