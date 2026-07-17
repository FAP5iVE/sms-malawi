'use client'

/**
 * apps/web/src/components/shared/MobileBottomNav.tsx — Phase C1
 *
 * Mobile bottom navigation bar — replaces the Sidebar below the `lg` breakpoint.
 *
 * Shell layout on mobile:
 *   ┌──────────────────────────────────────────────┐
 *   │  PageHeader (top, h-14)                      │
 *   │  <main> (scrollable, flex-1)                 │
 *   │  ─────────────────────────────────────────── │
 *   │  Home  Students  Classes  Exams  ···More     │  ← 60px + safe-area
 *   └──────────────────────────────────────────────┘
 *
 * Architecture:
 *   • Fixed-position tab bar. Hidden on desktop via `lg:hidden` on the root nav.
 *   • 5 slots: 4 `primaryItems` from useNavigation() + hardcoded "More" slot.
 *   • "More" slot → spring-animated slide-up sheet with moreItems + user section.
 *   • Navigation items, role filtering, and badge resolution all delegated to
 *     useNavigation() — the single source of truth shared with Sidebar.tsx.
 *   • Framer Motion AnimatePresence drives the sheet and backdrop animations.
 *   • Fully respects motionEnabled from motionStore (reducedMotionVariants).
 *   • Safe-area insets via CSS env(safe-area-inset-bottom) for iOS home bar.
 *
 * "More" sheet contents (bottom → top of screen):
 *   • User avatar, display name, role label
 *   • ModeToggle (dark/light/system)
 *   • Sign out button
 *   • Overflow nav items (all items NOT in the primary 4 slots)
 *   • Drag handle + title bar + close button
 *
 * [CHANGE TYPE]: TARGETED EDIT (R2 addendum — Auth Session & Login Flow
 *   Correctness). This "More" sheet's Sign out button was a fourth sign-out
 *   call site calling Firebase signOut(auth) directly, bypassing
 *   AuthProvider's shared logout() and therefore skipping the FCM-token
 *   unregister-before-signout fix entirely for any user who signs out from
 *   the mobile nav. Now calls the shared logout() like every other sign-out
 *   call site.
 */

import Link               from 'next/link'
import { useRouter }       from 'next/navigation'
import { useState }        from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  MoreHorizontal,
  X,
  LogOut,
  ChevronRight,
} from 'lucide-react'
import { logout }              from '@/components/providers/AuthProvider'
import { useAuthStore }        from '@/store/authStore'
import { useNavigation }       from '@/hooks/useNavigation'
import { useMotionEnabled }    from '@/store/motionStore'
import { ModeToggle }          from '@/components/shared/ModeToggle'
import {
  reducedMotionVariants,
  reducedMotionTransition,
  SPRING,
  DURATION,
  EASE,
} from '@/lib/motion'
import type { UserRole } from '@shared/types/roles'

// ─────────────────────────────────────────────────────────────────────────────
// ROLE DISPLAY LABELS
// Same map as Sidebar.tsx — intentionally a UI-layer duplicate.
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

// ─────────────────────────────────────────────────────────────────────────────
// ANIMATION VARIANTS
// ─────────────────────────────────────────────────────────────────────────────

const SHEET_VARIANTS = {
  hidden: {
    y: '100%',
    opacity: 0,
  },
  visible: {
    y: 0,
    opacity: 1,
  },
  exit: {
    y: '100%',
    opacity: 0,
  },
} as const

const SHEET_SPRING = {
  type: 'spring',
  stiffness: 340,
  damping: 40,
  mass: 0.85,
}

const SHEET_EXIT_TRANSITION = {
  duration: DURATION.fast,
  ease: EASE.in,
}

const BACKDROP_VARIANTS = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1 },
  exit:    { opacity: 0 },
} as const

// ─────────────────────────────────────────────────────────────────────────────
// MOBILE BOTTOM NAV
// ─────────────────────────────────────────────────────────────────────────────

export function MobileBottomNav() {
  const router = useRouter()

  const { user, role }             = useAuthStore()
  const { primaryItems, moreItems, ready } = useNavigation()
  const motionEnabled              = useMotionEnabled()

  const [moreOpen, setMoreOpen]    = useState(false)

  // Wait for auth + navigation to resolve before rendering nav items
  if (!role || !ready) return null

  const displayName = user?.displayName ?? user?.email?.split('@')[0] ?? 'User'
  const initials    = displayName.slice(0, 2).toUpperCase()

  // ── Reduced-motion aware variant sets ─────────────────────────────────────

  const sheetVariants = reducedMotionVariants(motionEnabled, SHEET_VARIANTS)
  const sheetTransition = reducedMotionTransition(motionEnabled, SHEET_SPRING)
  const sheetExitTransition = reducedMotionTransition(motionEnabled, SHEET_EXIT_TRANSITION)

  const backdropVariants = reducedMotionVariants(motionEnabled, BACKDROP_VARIANTS)
  const backdropTransition = reducedMotionTransition(motionEnabled, {
    duration: DURATION.normal,
    ease: EASE.out,
  })

  // ── Actions ───────────────────────────────────────────────────────────────

  function closeMore() {
    setMoreOpen(false)
  }

  async function handleLogout() {
    closeMore()
    await logout()
    router.replace('/login')
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Tab Bar ─────────────────────────────────────────────────────── */}
      {/*
        Fixed to the viewport bottom. Hidden on lg+ via `lg:hidden`.
        Height = 60px content + env(safe-area-inset-bottom) for iOS home bar.
        z-40 sits below dialogs/modals (z-50) but above page content.
      */}
      <nav
        aria-label="Mobile navigation"
       data-mobile-nav=""
        className="
          fixed bottom-0 left-0 right-0 z-40
          flex items-stretch
          bg-surface border-t border-base
          md:hidden
        "
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Primary nav slots — Dashboard + first 3 role-filtered items */}
        {primaryItems.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              className={[
                'relative flex-1 flex flex-col items-center justify-center',
                'gap-0.5 pt-2 pb-1.5 min-h-[60px]',
                'transition-colors duration-150',
                item.active ? 'text-brand-teal' : 'text-muted hover:text-body',
              ].join(' ')}
            >
              {/* Active top indicator bar */}
              {item.active && (
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-brand-teal"
                  aria-hidden
                />
              )}

              {/* Icon with optional badge dot */}
              <span className="relative shrink-0">
                <Icon className="w-5 h-5" aria-hidden />

                {item.badgeCount !== undefined && (
                  <span
                    className="
                      absolute -top-1 -right-1.5
                      min-w-[14px] h-3.5
                      bg-brand-coral rounded-full
                      text-white text-[8px] font-heading font-bold
                      flex items-center justify-center px-0.5 leading-none
                    "
                    aria-label={`${item.badgeCount} pending`}
                  >
                    {item.badgeCount > 99 ? '99+' : item.badgeCount}
                  </span>
                )}
              </span>

              {/* Short mobile label */}
              <span className="text-[10px] font-medium leading-none truncate max-w-[56px] text-center">
                {item.mobileLabel}
              </span>
            </Link>
          )
        })}

        {/* More slot — always the 5th slot regardless of how many primary items exist */}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-label="More navigation options"
          aria-expanded={moreOpen}
          aria-controls="mobile-more-sheet"
          className={[
            'relative flex-1 flex flex-col items-center justify-center',
            'gap-0.5 pt-2 pb-1.5 min-h-[60px]',
            'transition-colors duration-150',
            moreOpen ? 'text-brand-teal' : 'text-muted hover:text-body',
          ].join(' ')}
        >
          {moreOpen && (
            <span
              className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-brand-teal"
              aria-hidden
            />
          )}
          <MoreHorizontal className="w-5 h-5 shrink-0" aria-hidden />
          <span className="text-[10px] font-medium leading-none">More</span>
        </button>
      </nav>

      {/* ── "More" Sheet Overlay ─────────────────────────────────────────── */}
      <AnimatePresence>
        {moreOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="mobile-more-backdrop"
              variants={backdropVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={{
                ...backdropTransition,
                exit: { duration: DURATION.fast },
              }}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] md:hidden"
              onClick={closeMore}
              aria-hidden
            />

            {/* Sheet panel */}
            <motion.div
              key="mobile-more-sheet"
              id="mobile-more-sheet"
              variants={sheetVariants}
              initial="hidden"
              animate="visible"
              exit={{
                ...SHEET_VARIANTS.exit,
                transition: sheetExitTransition,
              }}
              transition={sheetTransition}
              className="
                fixed inset-x-0 bottom-0 z-50
                flex flex-col
                bg-surface rounded-t-2xl shadow-2xl
                max-h-[88dvh]
                overflow-hidden
                md:hidden
              "
              style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
              role="dialog"
              aria-label="More navigation options"
              aria-modal="true"
            >
              {/* Drag handle */}
              <div className="flex items-center justify-center pt-3 pb-1 shrink-0" aria-hidden>
                <span className="w-10 h-1 rounded-full bg-muted/25" />
              </div>

              {/* Header: title + close button */}
              <div className="flex items-center justify-between px-5 py-2.5 border-b border-base shrink-0">
                <span className="font-heading font-bold text-base text-body">
                  Navigation
                </span>
                <button
                  type="button"
                  onClick={closeMore}
                  className="
                    p-1.5 rounded-lg
                    text-muted hover:text-body hover:bg-page
                    transition-colors
                  "
                  aria-label="Close navigation menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Overflow navigation items — scrollable */}
              {moreItems.length > 0 && (
                <div className="overflow-y-auto py-2 shrink min-h-0">
                  {moreItems.map((item) => {
                    const Icon = item.icon
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={closeMore}
                        aria-current={item.active ? 'page' : undefined}
                        className={[
                          'flex items-center gap-3.5 px-5 py-3',
                          'transition-colors duration-150',
                          item.active
                            ? 'bg-brand-teal/8 text-brand-teal'
                            : 'text-muted hover:bg-page hover:text-body',
                        ].join(' ')}
                      >
                        {/* Icon with optional badge */}
                        <span className="relative shrink-0">
                          <Icon className="w-5 h-5" aria-hidden />
                          {item.badgeCount !== undefined && (
                            <span
                              className="
                                absolute -top-1 -right-1.5
                                min-w-[14px] h-3.5
                                bg-brand-coral rounded-full
                                text-white text-[8px] font-heading font-bold
                                flex items-center justify-center px-0.5 leading-none
                              "
                              aria-label={`${item.badgeCount} pending`}
                            >
                              {item.badgeCount > 99 ? '99+' : item.badgeCount}
                            </span>
                          )}
                        </span>

                        {/* Full label */}
                        <span className="flex-1 text-sm font-medium truncate">
                          {item.label}
                        </span>

                        {/* Chevron indicator */}
                        <ChevronRight
                          className="w-4 h-4 shrink-0 opacity-35"
                          aria-hidden
                        />
                      </Link>
                    )
                  })}
                </div>
              )}

              {/* Separator */}
              <div className="shrink-0 border-t border-base" />

              {/* User section + theme + logout */}
              <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4">
                {/* Avatar + display name + role */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Avatar */}
                  <div className="
                    w-9 h-9 rounded-xl shrink-0
                    bg-brand-navy
                    flex items-center justify-center
                  ">
                    <span className="text-white text-xs font-bold font-heading">
                      {initials}
                    </span>
                  </div>

                  {/* Name + role */}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold font-heading text-body truncate leading-tight">
                      {displayName}
                    </p>
                    <p className="text-[11px] text-muted truncate leading-tight mt-0.5">
                      {ROLE_LABELS[role]}
                    </p>
                  </div>
                </div>

                {/* Theme toggle */}
                <div className="shrink-0">
                  <ModeToggle />
                </div>

                {/* Sign out */}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="
                    shrink-0 p-2 rounded-xl
                    text-muted
                    hover:bg-red-50 hover:text-red-500
                    dark:hover:bg-red-950/25 dark:hover:text-red-400
                    transition-colors duration-150
                  "
                  aria-label="Sign out"
                >
                  <LogOut className="w-[18px] h-[18px]" />
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}