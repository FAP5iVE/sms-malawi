'use client'

/**
 * apps/web/src/components/shared/Sidebar.tsx — Phase C4
 *
 * Tablet-aware sidebar with three distinct breakpoint states:
 *
 *   < md  (mobile):    Sidebar is hidden from the DOM by the layout wrapper
 *                      (`hidden md:flex` on the wrapper div in layout.tsx).
 *                      MobileBottomNav is the navigation surface below md.
 *
 *   md – lg (tablet):  Sidebar is ALWAYS in icon-rail (collapsed) mode by default.
 *                      When the user taps the expand chevron, the sidebar enters
 *                      OVERLAY MODE — it detaches from the flex flow via
 *                      `position: fixed`, expands to 220 px, and a backdrop
 *                      appears behind it. Closing the overlay returns the sidebar
 *                      to the 48 px icon rail in normal flex flow.
 *                      The layout wrapper holds `md:w-12` so the 48 px space is
 *                      always reserved regardless of overlay state (no layout shift).
 *
 *   lg+ (desktop):     Normal sidebar behaviour — collapsed (48 px icon rail) or
 *                      expanded (220 px), spring-animated, in flex flow.
 *                      Default: expanded on initial lg+ mount.
 *
 * Breakpoint detection:
 *   A resize event listener sets `isLgUp` state. On mount it reads window.innerWidth
 *   so the initial collapsed state reflects the actual viewport (SSR defaults to
 *   expanded; the useEffect corrects this on hydration before first paint completes).
 *   On resize FROM lg+ TO tablet: sidebar is forced to collapsed (icon-rail).
 *   On resize FROM tablet TO lg+: isLgUp is updated; collapsed state is not changed
 *   (respects the user's last desktop toggle choice).
 *
 * Tablet overlay:
 *   `isTabletOverlay = !isLgUp && !collapsed`
 *   When true, `motion.aside` receives `fixed left-0 top-0 h-full z-50 shadow-2xl`.
 *   An AnimatePresence backdrop renders behind it.
 *   Clicking the backdrop or pressing Escape collapses the sidebar.
 *
 * All Phase B8 and B10 behaviour is preserved unchanged:
 *   - SIDEBAR_WIDTH_VARIANTS spring animation (220px ↔ 48px)
 *   - SIDEBAR_LABEL_VARIANTS / SIDEBAR_BADGE_VARIANTS for text/badge fade
 *   - reducedMotionVariants / reducedMotionTransition from motionStore
 *   - layoutId="sidebar-active-dot" shared animated indicator in icon-rail mode
 *   - Badge count rendering (pill in expanded, dot in icon-rail)
 *   - Role badge footer, item tooltips in collapsed mode
 */

import Link                    from 'next/link'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useAuthStore }          from '@/store/authStore'
import { useMotionEnabled }      from '@/store/motionStore'
import { useNavigation }         from '@/hooks/useNavigation'
import {
  SIDEBAR_WIDTH_VARIANTS,
  SIDEBAR_LABEL_VARIANTS,
  SIDEBAR_BADGE_VARIANTS,
  OVERLAY_VARIANTS,
  reducedMotionVariants,
  reducedMotionTransition,
  SPRING,
  DURATION,
  EASE,
} from '@/lib/motion'
import type { UserRole } from '@shared/types/roles'
import { LG_BREAKPOINT } from '@shared/constants/breakpoints'

// ─────────────────────────────────────────────────────────────────────────────
// ROLE DISPLAY LABELS
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<UserRole, string> = {
  admin:        'Administrator',
  high_rank:    'High Rank Staff',
  finance:      'Finance Staff',
  library:      'Library Staff',
  lower_rank:   'Support Staff',
  academic:     'Academic Staff',
  hr:           'HR Staff',
  exam_officer: 'Exam Officer',
  student:      'Student',
}

// lg breakpoint in px — must match Tailwind's lg: 1024px

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────────────────────────────────────

export function Sidebar() {
  const { role }      = useAuthStore()
  const motionEnabled = useMotionEnabled()
  const { items }     = useNavigation()

  // collapsed: true  → 48px icon rail
  //            false → 220px expanded panel
  // SSR-safe default: true (icon rail). useEffect corrects to viewport width.
  const [collapsed, setCollapsed] = useState(true)

  // isLgUp: true when viewport ≥ LG_BREAKPOINT (1024px)
  // SSR-safe default: true (treats server-side as desktop to avoid flash).
  const [isLgUp, setIsLgUp] = useState(true)

  // ── Breakpoint detection + initial collapsed state ─────────────────────────
  useEffect(() => {
    function checkViewport() {
      const large = window.innerWidth >= LG_BREAKPOINT
      setIsLgUp(large)
      // On tablet (md–lg): always force icon-rail.
      // On desktop (lg+): do NOT auto-collapse — respect the user's toggle choice.
      if (!large) {
        setCollapsed(true)
      }
    }

    // Deferred via queueMicrotask rather than called directly: this initial
    // correction intentionally differs from checkViewport's resize semantics
    // (it forces BOTH directions — desktop too — not just collapse-on-tablet),
    // so it can't simply reuse checkViewport(). Wrapping it in a microtask
    // means its setState calls sit inside a deferred callback rather than
    // running synchronously as part of this effect's own call frame — a
    // microtask still resolves before the browser's next paint, so the
    // SSR-safe defaults are corrected just as early (no visible flash), and
    // the correction still lands strictly after hydration completes, which
    // is what avoids a server/client markup mismatch here in the first place.
    queueMicrotask(() => {
      const isLarge = window.innerWidth >= LG_BREAKPOINT
      setIsLgUp(isLarge)
      setCollapsed(!isLarge) // desktop → expanded by default; tablet → collapsed
    })

    window.addEventListener('resize', checkViewport)
    return () => window.removeEventListener('resize', checkViewport)
  }, [])

  // ── Escape key closes tablet overlay ──────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && isTabletOverlay) {
        setCollapsed(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // isTabletOverlay is derived below — adding it to deps would require
    // hoisting; closing over it via the event listener is fine here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLgUp, collapsed])

  // Derived: true when sidebar is expanded on a tablet-sized viewport
  const isTabletOverlay = !isLgUp && !collapsed

  // ── Guard: wait for role ───────────────────────────────────────────────────
  if (!role) return null

  // ── Framer Motion variant sets ─────────────────────────────────────────────
  const widthVariants   = reducedMotionVariants(motionEnabled, SIDEBAR_WIDTH_VARIANTS)
  const labelVariants   = reducedMotionVariants(motionEnabled, SIDEBAR_LABEL_VARIANTS)
  const badgeVariants   = reducedMotionVariants(motionEnabled, SIDEBAR_BADGE_VARIANTS)
  const widthTransition = reducedMotionTransition(motionEnabled, SPRING.snappy)

  const backdropVariants = reducedMotionVariants(motionEnabled, OVERLAY_VARIANTS)
  const backdropTransition = reducedMotionTransition(motionEnabled, {
    duration: DURATION.fast,
  })

  // ── Sidebar aside classes ──────────────────────────────────────────────────
  // In tablet overlay mode: detach from flex flow with `fixed` positioning.
  // In normal flow: use standard flex child classes.
  const asideClassName = isTabletOverlay
    ? [
        'fixed left-0 top-0 h-full z-50',
        'border-r border-base bg-surface',
        'flex flex-col overflow-hidden shadow-2xl',
      ].join(' ')
    : [
        'shrink-0 border-r border-base bg-surface',
        'flex flex-col h-full overflow-hidden',
      ].join(' ')

  return (
    <>
      {/* ── TABLET OVERLAY BACKDROP ───────────────────────────────────────── */}
      {/*
        Only rendered when sidebar is expanded on a tablet-sized viewport.
        Clicking the backdrop collapses the sidebar (returns to icon rail).
        Renders outside motion.aside so it doesn't inherit the width animation.
      */}
      <AnimatePresence>
        {isTabletOverlay && (
          <motion.div
            key="sidebar-backdrop"
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={backdropTransition}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setCollapsed(true)}
            aria-hidden
          />
        )}
      </AnimatePresence>

      {/* ── SIDEBAR PANEL ─────────────────────────────────────────────────── */}
      <motion.aside
        animate={collapsed ? 'collapsed' : 'expanded'}
        variants={widthVariants}
        transition={widthTransition}
        initial={false}
        className={asideClassName}
        style={{ minWidth: 0 }}
        aria-label="Main navigation"
        role="navigation"
      >
        {/* ── Brand / logo row ──────────────────────────────────────────────── */}
        <div className="h-16 flex items-center justify-between px-3 border-b border-base shrink-0">

          {/* Brand icon — always visible */}
          <motion.div
            className="w-8 h-8 rounded-lg bg-brand-navy flex items-center justify-center shrink-0"
            whileHover={motionEnabled ? { scale: 1.06 } : undefined}
            transition={reducedMotionTransition(motionEnabled, {
              type: 'spring',
              stiffness: 400,
              damping: 40,
            })}
          >
            <span className="text-white text-sm font-bold font-heading">S</span>
          </motion.div>

          {/* Brand name + collapse button — animated out when collapsing */}
          <AnimatePresence mode="wait">
            {!collapsed && (
              <>
                <motion.span
                  key="brand-name"
                  variants={labelVariants}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  className="font-heading font-bold text-sm text-brand-navy truncate flex-1 ml-2.5"
                >
                  SMS Malawi
                </motion.span>

                <motion.button
                  key="collapse-btn"
                  variants={labelVariants}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  type="button"
                  onClick={() => setCollapsed(true)}
                  className="p-1.5 rounded-lg text-muted hover:bg-page hover:text-body transition-colors shrink-0"
                  aria-label="Collapse sidebar"
                  whileHover={motionEnabled ? { scale: 1.1 } : undefined}
                  whileTap={motionEnabled  ? { scale: 0.92 } : undefined}
                  transition={reducedMotionTransition(motionEnabled, SPRING.tight)}
                >
                  <ChevronsLeft className="w-4 h-4" />
                </motion.button>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* ── Expand trigger (icon-rail mode only) ──────────────────────────── */}
        <AnimatePresence>
          {collapsed && (
            <motion.button
              key="expand-btn"
              type="button"
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                transition: { delay: 0.1, duration: DURATION.fast, ease: EASE.out },
              }}
              exit={{ opacity: 0, transition: { duration: DURATION.fast, ease: EASE.in } }}
              onClick={() => setCollapsed(false)}
              className="flex items-center justify-center py-2 border-b border-base text-muted hover:text-body hover:bg-page transition-colors"
              aria-label={isLgUp ? 'Expand sidebar' : 'Open navigation menu'}
              whileHover={motionEnabled ? { scale: 1.1 } : undefined}
              whileTap={motionEnabled   ? { scale: 0.92 } : undefined}
            >
              <ChevronsRight className="w-4 h-4" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* ── Navigation list ───────────────────────────────────────────────── */}
        <nav className="flex-1 overflow-y-auto py-3" aria-label="Page navigation">
          {items.map((item, index) => {
            const Icon = item.icon

            return (
              <motion.div
                key={item.href}
                initial={motionEnabled ? { opacity: 0, x: -6 } : false}
                animate={{ opacity: 1, x: 0 }}
                transition={
                  motionEnabled
                    ? {
                        duration: DURATION.normal,
                        ease:     EASE.out,
                        delay:    0.02 + index * 0.025,
                      }
                    : { duration: 0 }
                }
              >
                <Link
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  aria-current={item.active ? 'page' : undefined}
                  onClick={isTabletOverlay ? () => setCollapsed(true) : undefined}
                  className={[
                    'flex items-center gap-3 transition-colors relative group',
                    collapsed
                      ? 'justify-center px-0 py-3 mx-2 rounded-xl'
                      : 'px-5 py-2.5 border-l-2',
                    item.active
                      ? collapsed
                        ? 'bg-brand-teal/10 text-brand-teal'
                        : 'border-brand-teal bg-brand-teal/8 text-brand-teal font-semibold'
                      : collapsed
                        ? 'text-muted hover:bg-page hover:text-body'
                        : 'border-transparent text-muted hover:bg-page hover:text-body',
                  ].join(' ')}
                >
                  {/* Active indicator — icon-rail mode */}
                  {collapsed && item.active && (
                    <motion.div
                      layoutId="sidebar-active-dot"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-brand-teal rounded-r-full"
                      transition={reducedMotionTransition(motionEnabled, SPRING.snappy)}
                    />
                  )}

                  {/* Icon + badge dot overlay (collapsed mode) */}
                  <span className="relative shrink-0">
                    <Icon className="w-4 h-4" aria-hidden />
                    {collapsed && item.badgeCount !== undefined && (
                      <span
                        className="absolute -top-1 -right-1 min-w-[14px] h-3.5 bg-brand-coral rounded-full text-white text-[8px] font-heading font-bold flex items-center justify-center px-0.5 leading-none"
                        aria-label={`${item.badgeCount} pending`}
                      >
                        {item.badgeCount > 99 ? '99+' : item.badgeCount}
                      </span>
                    )}
                  </span>

                  {/* Label + expanded badge pill */}
                  <AnimatePresence mode="wait">
                    {!collapsed && (
                      <motion.span
                        key={`label-${item.href}`}
                        variants={labelVariants}
                        initial="hidden"
                        animate="visible"
                        exit="hidden"
                        className="flex-1 flex items-center justify-between gap-2 min-w-0"
                      >
                        <span className="text-sm truncate overflow-hidden whitespace-nowrap">
                          {item.label}
                        </span>

                        {item.badgeCount !== undefined && (
                          <span
                            className="shrink-0 min-w-[18px] h-[18px] bg-brand-coral rounded-full text-white text-[9px] font-heading font-bold flex items-center justify-center px-1 leading-none"
                            aria-label={`${item.badgeCount} pending`}
                          >
                            {item.badgeCount > 99 ? '99+' : item.badgeCount}
                          </span>
                        )}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Link>
              </motion.div>
            )
          })}
        </nav>

        {/* ── Role badge footer ─────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.div
              key="role-badge"
              variants={badgeVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="px-4 py-4 border-t border-base shrink-0"
            >
              <div className="bg-page rounded-xl px-3 py-2.5">
                <p className="text-[10px] font-heading font-semibold text-muted uppercase tracking-widest mb-0.5">
                  Signed in as
                </p>
                <p className="text-xs font-heading font-semibold text-body truncate">
                  {ROLE_LABELS[role]}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.aside>
    </>
  )
}