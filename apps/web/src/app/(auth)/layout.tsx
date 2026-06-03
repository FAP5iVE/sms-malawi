'use client'

/**
 * (auth)/layout.tsx — Phase B8: AnimatePresence page transition wrapper
 *
 * Adds route-level animation to the authenticated shell:
 *   - Pages slide up + fade in on enter
 *   - Pages fade out + micro-slide down on exit
 *   - Sidebar has spring-based collapse/expand (handled in Sidebar.tsx)
 *   - Fully respects motionEnabled — reverts to instant state when disabled
 *
 * Architecture note: AnimatePresence with mode="wait" is used so the
 * exiting page completes its animation before the entering page mounts.
 * The key is the current pathname — each route change triggers exit+enter.
 */

import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { AuthProvider } from '@/components/providers/AuthProvider'
import { Sidebar } from '@/components/shared/Sidebar'
import { PageHeader } from '@/components/shared/PageHeader'
import { useInactivityTimer } from '@/hooks/useInactivityTimer'
import { useMotionEnabled } from '@/store/motionStore'
import { PAGE_VARIANTS } from '@/lib/motion'

// ─────────────────────────────────────────────────────────────────────────────
// INACTIVITY WATCHER — side-effect only, no render output
// ─────────────────────────────────────────────────────────────────────────────

function InactivityWatcher() {
  useInactivityTimer()
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE TRANSITION WRAPPER
// Reads the current pathname as the AnimatePresence key.
// When motionEnabled = false, renders children directly without animation.
// ─────────────────────────────────────────────────────────────────────────────

function PageTransitionWrapper({ children }: { children: React.ReactNode }) {
  const pathname      = usePathname()
  const motionEnabled = useMotionEnabled()

  // When reduced motion is active, bypass AnimatePresence entirely.
  // This avoids any frame where children are briefly unmounted between
  // the exit and enter phases — important for form pages with controlled inputs.
  if (!motionEnabled) {
    return <>{children}</>
  }

  return (
    // AnimatePresence mode="wait": exit completes before enter begins.
    // This prevents two pages from occupying the same scroll container
    // simultaneously, which causes layout jumps on longer pages.
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        variants={PAGE_VARIANTS}
        initial="initial"
        animate="animate"
        exit="exit"
        // Full height so the page fill is consistent with the non-animated state
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
    <AuthProvider>
      <InactivityWatcher />

      <div className="flex h-screen overflow-hidden bg-page">
        {/* Left sidebar — animated expand/collapse with Framer Motion spring */}
        <Sidebar />

        {/* Right: fixed header + scrollable animated page content */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <PageHeader />

          {/*
            overflow-y-auto on the main scroll container.
            PageTransitionWrapper is position-relative to contain the
            motion.div's absolute/transform positioning during animation.
          */}
          <main className="flex-1 overflow-y-auto p-6 relative">
            <PageTransitionWrapper>
              {children}
            </PageTransitionWrapper>
          </main>
        </div>
      </div>
    </AuthProvider>
  )
}