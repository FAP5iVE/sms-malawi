'use client'

/*
 * apps/web/src/components/shared/PageHeader.tsx — Phase C2
 *
 * Responsive page header with distinct mobile and desktop variants.
 *
 * Mobile layout (< md, h-14):
 *   [BookOpen logo] — [Current page title — animated] — [Search icon | Bell icon]
 *   • Page title derived from pathname matched against all role-visible nav items.
 *   • Search icon → full-width slide-down overlay with auto-focused input.
 *   • Bell icon → fixed notification panel anchored below header.
 *   • Theme toggle and user menu moved to MobileBottomNav "More" sheet (C1).
 *
 * Desktop layout (md+, h-16):
 *   [Academic term badge] — — — [Search bar | Bell dropdown | ModeToggle | User menu]
 *   • Internal theme state and localStorage logic removed.
 *   • ModeToggle (B7) is the single source of truth for theme control on desktop.
 *   • User dropdown preserved: profile, settings, sign out.
 *   • Notification dropdown: AnimatePresence-driven, click-outside dismissed.
 *
 * Animation: all dropdowns use FADE_DOWN_VARIANTS. Page title uses
 * AnimatePresence mode="wait" for cross-fade on route change.
 * All animations respect motionEnabled from motionStore.
 *
 * [CHANGE TYPE]: MAJOR REWRITE (notification-display + search-overlay
 *   portions — the overall header layout/navigation structure is
 *   unaffected); earlier TARGETED EDIT (R2) to handleSignOut retained.
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]:
 *   (1) MOCK_NOTIFICATIONS (3 hardcoded fake entries) and the permanently
 *       hardcoded unreadCount = 2 are replaced by useNotificationFeed() —
 *       the real, role-filtered, real-time announcement feed the R11–R13
 *       notification pipelines publish into, with a per-device last-seen
 *       watermark driving the unread badge. Opening either notification
 *       panel marks the feed seen (badge clears). "View all notifications"
 *       now navigates to /announcements — the real destination — instead
 *       of merely closing the panel.
 *   (2) The hardcoded CURRENT_TERM = 'Term 1 — 2025/2026' badge now reads
 *       SETTING_KEYS.CURRENT_ACADEMIC_YEAR / CURRENT_TERM via
 *       useCurrentAcademicPeriod() (W/hooks/useSettings.ts, same phase).
 *   (3) MobileSearchOverlay's reduced-motion bug is fixed — it passed
 *       reducedMotionVariants / reducedMotionTransition as bare function
 *       references where Framer Motion expects resolved objects, silently
 *       breaking the reduced-motion path entirely; it now uses the
 *       resolved variant/transition objects it was already computing (and
 *       then ignoring). Its dead `query` state (set and reset, never read)
 *       is removed.
 *   (4) The fourth independent ROLE_LABELS map declaration is replaced
 *       with the shared import from @shared/types/roles.
 *   (5) The nearly-identical panelVariants/backdropVariants/
 *       panelTransition/backdropTransition blocks previously declared
 *       twice (MobileSearchOverlay + MobileNotificationPanel) are
 *       de-duplicated into one useHeaderPanelMotion() helper.
 *   (6) The user menu's Profile item pointed at /profile — a route that
 *       has never existed (guaranteed 404, the same dead-link defect class
 *       this phase fixes across the dashboards). It now points at
 *       /settings?section=profile, the real home of ProfileSettings
 *       (settings/page.tsx gains ?section= initialisation in this phase).
 * [DEPENDS ON]: W/hooks/useNotificationFeed.ts (same phase),
 *   W/hooks/useSettings.ts (useCurrentAcademicPeriod, same phase),
 *   @shared/types/roles (ROLE_LABELS)
 */

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter }       from 'next/navigation'
import { AnimatePresence, motion }       from 'framer-motion'
import {
  Bell,
  BookOpen,
  ChevronDown,
  LogOut,
  Search,
  Settings,
  User,
  X,
} from 'lucide-react'
import { logout }                from '@/components/providers/AuthProvider'
import { useAuthStore }          from '@/store/authStore'
import { useNavigation }         from '@/hooks/useNavigation'
import { useMotionEnabled }      from '@/store/motionStore'
import { useNotificationFeed }   from '@/hooks/useNotificationFeed'
import type { FeedNotification } from '@/hooks/useNotificationFeed'
import { useCurrentAcademicPeriod } from '@/hooks/useSettings'
import { ModeToggle }            from '@/components/shared/ModeToggle'
import {
  FADE_DOWN_VARIANTS,
  OVERLAY_VARIANTS,
  reducedMotionVariants,
  reducedMotionTransition,
  DURATION,
  EASE,
} from '@/lib/motion'
import { ROLE_LABELS }   from '@shared/types/roles'
import { GlobalSearch }  from '@/components/shared/GlobalSearch'

// ─────────────────────────────────────────────────────────────────────────────
// SHARED PANEL MOTION (R15 — de-duplicates the identical variant/transition
// blocks previously declared separately inside MobileSearchOverlay and
// MobileNotificationPanel)
// ─────────────────────────────────────────────────────────────────────────────

function useHeaderPanelMotion(motionEnabled: boolean) {
  const panelVariants = reducedMotionVariants(motionEnabled, {
    hidden:  { opacity: 0, y: -6 },
    visible: { opacity: 1, y: 0 },
    exit:    { opacity: 0, y: -6 },
  })
  const panelTransition = reducedMotionTransition(motionEnabled, {
    duration: DURATION.fast,
    ease: EASE.out,
  })
  const backdropVariants   = reducedMotionVariants(motionEnabled, OVERLAY_VARIANTS)
  const backdropTransition = reducedMotionTransition(motionEnabled, {
    duration: DURATION.fast,
  })

  return { panelVariants, panelTransition, backdropVariants, backdropTransition }
}

// ─────────────────────────────────────────────────────────────────────────────
// usePageTitle
// Derives a human-readable page title by matching the current pathname against
// the user's role-filtered navigation items from useNavigation().
// ─────────────────────────────────────────────────────────────────────────────

function usePageTitle(): string {
  const pathname             = usePathname()
  const { items }            = useNavigation()

  // 1. Exact match
  const exact = items.find((item) => item.href === pathname)
  if (exact) return exact.label

  // 2. Prefix match (e.g. /students/STU-001 → "Students")
  const prefix = items
    .filter((item) => item.href !== '/')
    .find(
      (item) =>
        pathname.startsWith(`${item.href}/`) ||
        pathname.startsWith(item.href),
    )
  if (prefix) return prefix.label

  // 3. Fallback: capitalise last non-empty path segment, replace hyphens
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return 'Dashboard'
  const last = segments[segments.length - 1]!
  return last.charAt(0).toUpperCase() + last.slice(1).replace(/-/g, ' ')
}

// ─────────────────────────────────────────────────────────────────────────────
// NotificationList — shared between mobile panel and desktop dropdown.
// Renders the real feed (useNotificationFeed) — loading skeleton, considered
// empty state, and the item list, with "View all" navigating to the real
// /announcements page.
// ─────────────────────────────────────────────────────────────────────────────

interface NotificationListProps {
  notifications: FeedNotification[]
  isLoading: boolean
  onClose: () => void
  onViewAll: () => void
}

function NotificationList({
  notifications,
  isLoading,
  onClose,
  onViewAll,
}: NotificationListProps) {
  return (
    <>
      <div className="max-h-72 overflow-y-auto divide-y divide-base">
        {isLoading ? (
          <div
            className="px-4 py-3 space-y-3"
            role="status"
            aria-label="Loading notifications"
          >
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-1.5" aria-hidden>
                <div className="h-3 w-3/5 rounded bg-page animate-pulse" />
                <div className="h-3 w-4/5 rounded bg-page animate-pulse" />
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Bell className="w-6 h-6 text-muted mx-auto mb-2" aria-hidden />
            <p className="text-xs font-heading font-semibold text-body">
              You&rsquo;re all caught up
            </p>
            <p className="text-xs text-muted mt-1">
              New announcements will appear here.
            </p>
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={[
                'flex items-start gap-2.5 px-4 py-3',
                'hover:bg-page transition-colors',
                n.unread ? 'bg-brand-teal/5' : '',
              ].join(' ')}
            >
              {/* Unread indicator dot */}
              <div className="mt-1.5 shrink-0 w-1.5">
                {n.unread && (
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-teal" aria-hidden />
                )}
              </div>

              <div className="min-w-0">
                <p className="text-xs font-heading font-semibold text-body leading-snug">
                  {n.title}
                </p>
                <p className="text-xs text-muted font-sans mt-0.5 leading-relaxed line-clamp-2">
                  {n.body}
                </p>
                {n.time && (
                  <p className="text-[10px] text-muted mt-1 font-sans">{n.time}</p>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="px-4 py-2.5 border-t border-base">
        <button
          type="button"
          onClick={() => {
            onClose()
            onViewAll()
          }}
          className="text-xs text-brand-teal font-heading font-semibold hover:underline"
        >
          View all announcements
        </button>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MobileSearchOverlay
// Slide-down search panel for mobile. Renders at z-50, anchored below the
// h-14 header. GlobalSearch autofocuses its own input.
// R15: the reduced-motion path is fixed — the previous version passed the
// reducedMotionVariants / reducedMotionTransition *functions* as variants/
// transition props (silently breaking reduced motion) while computing, and
// then ignoring, the correct resolved objects. The dead `query` state (set
// and reset, never read) is removed.
// ─────────────────────────────────────────────────────────────────────────────

interface MobileSearchOverlayProps {
  open: boolean
  onClose: () => void
  motionEnabled: boolean
}

function MobileSearchOverlay({
  open,
  onClose,
  motionEnabled,
}: MobileSearchOverlayProps) {
  const { panelVariants, panelTransition, backdropVariants, backdropTransition } =
    useHeaderPanelMotion(motionEnabled)

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="search-backdrop"
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={backdropTransition}
            className="fixed inset-0 bg-black/20 z-40 md:hidden"
            onPointerDown={onClose}
            aria-hidden
          />
          <motion.div
            key="search-panel"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={panelTransition}
            className="fixed left-0 right-0 top-14 z-50 bg-surface border-b border-base px-4 py-3 shadow-lg md:hidden"
            role="search"
          >
            <GlobalSearch variant="compact" placeholder="Search students, staff, books…" />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MobileNotificationPanel
// Fixed panel anchored directly below the h-14 header on mobile.
// Stretches to fill the remaining viewport above the bottom nav.
// ─────────────────────────────────────────────────────────────────────────────

interface MobileNotificationPanelProps {
  open: boolean
  onClose: () => void
  onViewAll: () => void
  motionEnabled: boolean
  notifications: FeedNotification[]
  isLoading: boolean
}

function MobileNotificationPanel({
  open,
  onClose,
  onViewAll,
  motionEnabled,
  notifications,
  isLoading,
}: MobileNotificationPanelProps) {
  const { panelVariants, panelTransition, backdropVariants, backdropTransition } =
    useHeaderPanelMotion(motionEnabled)

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="notif-backdrop"
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={backdropTransition}
            className="fixed inset-0 z-40 bg-black/25 md:hidden"
            onClick={onClose}
            aria-hidden
          />

          <motion.div
            key="notif-panel"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={panelTransition}
            className="
              fixed inset-x-0 top-14 z-50
              bg-surface border-b border-base shadow-lg
              md:hidden
              flex flex-col overflow-hidden
              max-h-[calc(100dvh-3.5rem-60px-env(safe-area-inset-bottom,0px))]
            "
            role="region"
            aria-label="Notifications"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-base shrink-0">
              <h3 className="font-heading font-semibold text-sm text-body">
                Notifications
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded text-muted hover:text-body transition-colors"
                aria-label="Close notifications"
              >
                <X className="w-3.5 h-3.5" aria-hidden />
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              <NotificationList
                notifications={notifications}
                isLoading={isLoading}
                onClose={onClose}
                onViewAll={onViewAll}
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE TITLE ANIMATE — mobile centered title with cross-fade on route change
// ─────────────────────────────────────────────────────────────────────────────

interface PageTitleProps {
  title: string
  motionEnabled: boolean
}

function PageTitle({ title, motionEnabled }: PageTitleProps) {
  const titleVariants = reducedMotionVariants(motionEnabled, {
    hidden:  { opacity: 0, y: 4 },
    visible: { opacity: 1, y: 0 },
    exit:    { opacity: 0, y: -4 },
  })
  const titleTransition = reducedMotionTransition(motionEnabled, {
    duration: DURATION.fast,
    ease: EASE.out,
  })

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={title}
        variants={titleVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={titleTransition}
        className="text-sm font-heading font-bold text-body truncate"
      >
        {title}
      </motion.span>
    </AnimatePresence>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE HEADER
// ─────────────────────────────────────────────────────────────────────────────

export function PageHeader() {
  const router            = useRouter()
  const { user, role, subtitle } = useAuthStore()
  const motionEnabled     = useMotionEnabled()
  const pageTitle         = usePageTitle()

  // Real notification feed (R15 — replaces MOCK_NOTIFICATIONS and the
  // hardcoded unreadCount = 2)
  const {
    notifications,
    unreadCount,
    markAllSeen,
    isLoading: notifLoading,
  } = useNotificationFeed()

  // Real academic-term badge source (R15 — replaces the hardcoded
  // 'Term 1 — 2025/2026' literal)
  const { academicYear, term, isLoading: periodLoading } = useCurrentAcademicPeriod()

  const displayName = user?.displayName ?? user?.email?.split('@')[0] ?? 'User'
  const initials    = displayName.slice(0, 2).toUpperCase()

  // Desktop dropdown open states
  const [bellOpen,  setBellOpen]  = useState(false)
  const [userOpen,  setUserOpen]  = useState(false)

  // Mobile overlay states
  const [searchOpen,     setSearchOpen]     = useState(false)
  const [mobileBellOpen, setMobileBellOpen] = useState(false)

  // Click-outside refs for desktop dropdowns
  const bellRef = useRef<HTMLDivElement>(null)
  const userRef = useRef<HTMLDivElement>(null)

  // ── Click-outside handler ──────────────────────────────────────────────────
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false)
      }
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setUserOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Keyboard: Escape closes any open panel ─────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      setBellOpen(false)
      setUserOpen(false)
      setSearchOpen(false)
      setMobileBellOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Opening either notification surface marks the feed seen — the badge
  // clears once the user has actually looked at the list.
  function openDesktopBell() {
    const next = !bellOpen
    setBellOpen(next)
    setUserOpen(false)
    if (next) markAllSeen()
  }

  function openMobileBell() {
    const next = !mobileBellOpen
    setMobileBellOpen(next)
    setSearchOpen(false)
    if (next) markAllSeen()
  }

  function goToAnnouncements() {
    router.push('/announcements')
  }

  async function handleSignOut() {
    setBellOpen(false)
    setUserOpen(false)
    // R2: delegate to AuthProvider's shared logout() — sequences the FCM
    // unregister call ahead of signOut(auth) and lets onIdTokenChanged's
    // signed-out branch clear cookies/store exactly once, rather than this
    // handler hand-writing its own cookie-clear line. Destination changed
    // from '/' to '/login' to match every other sign-out call site.
    await logout()
    router.push('/login')
  }

  // Dropdown animation config
  const dropVariants   = reducedMotionVariants(motionEnabled, FADE_DOWN_VARIANTS)
  const dropTransition = reducedMotionTransition(motionEnabled, {
    duration: DURATION.fast,
    ease: EASE.out,
  })

  const bellAriaLabel =
    unreadCount > 0 ? `Notifications — ${unreadCount} unread` : 'Notifications'

  return (
    <>
      {/* ── HEADER ELEMENT ─────────────────────────────────────────────────── */}
      <header data-page-header="" className="border-b border-base bg-surface shrink-0 relative z-30">
        {/* ════════════════════════════════════════════════════════════════════
            MOBILE LAYOUT (below md, h-14)
            Three-zone: [Logo left] [Title center] [Actions right]
            ════════════════════════════════════════════════════════════════════ */}
        <div className="flex items-center h-14 px-4 gap-2 md:hidden">

          {/* Left: Logo icon — taps navigate to dashboard */}
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="
              shrink-0 w-8 h-8 rounded-xl
              bg-brand-teal/10
              flex items-center justify-center
              transition-colors hover:bg-brand-teal/20
            "
            aria-label="Go to Dashboard"
          >
            <BookOpen className="w-4 h-4 text-brand-teal" aria-hidden />
          </button>

          {/* Center: Animated page title — fills remaining space */}
          <div className="flex-1 flex items-center justify-center min-w-0 px-2">
            <PageTitle title={pageTitle} motionEnabled={motionEnabled} />
          </div>

          {/* Right: Search + Bell */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setSearchOpen(true)
                setMobileBellOpen(false)
              }}
              className="p-2 rounded-lg text-muted hover:text-body hover:bg-page transition-colors"
              aria-label="Open search"
              aria-expanded={searchOpen}
            >
              <Search className="w-[18px] h-[18px]" aria-hidden />
            </button>

            <button
              type="button"
              onClick={openMobileBell}
              className="relative p-2 rounded-lg text-muted hover:text-body hover:bg-page transition-colors"
              aria-label={bellAriaLabel}
              aria-expanded={mobileBellOpen}
            >
              <Bell className="w-[18px] h-[18px]" aria-hidden />
              {unreadCount > 0 && (
                <span
                  className="
                    absolute top-1 right-1
                    min-w-[14px] h-3.5
                    bg-brand-coral rounded-full
                    text-white text-[8px] font-heading font-bold
                    flex items-center justify-center px-0.5 leading-none
                  "
                  aria-hidden
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════════
            DESKTOP LAYOUT (md+, h-16)
            Two-zone: [Term badge left] [Actions right]
            ════════════════════════════════════════════════════════════════════ */}
        <div className="hidden md:flex items-center justify-between h-16 px-6">

          {/* Left: Academic term badge — real SETTING_KEYS values (R15).
              A quiet skeleton pill while the two settings resolve; nothing
              is shown at all if they fail, rather than a fake year. */}
          {periodLoading ? (
            <span
              className="h-4 w-32 rounded bg-page animate-pulse"
              role="status"
              aria-label="Loading academic term"
            />
          ) : academicYear && term ? (
            <span className="text-sm font-semibold font-heading text-body">
              Term {term} — {academicYear}
            </span>
          ) : (
            <span aria-hidden />
          )}

          {/* Right: Search + Bell + ModeToggle + User */}
          <div className="flex items-center gap-1.5">

            {/* Inline search bar */}
            <div className="hidden md:flex w-64 lg:w-80">
              <GlobalSearch variant="expanded" />
            </div>

            {/* ── Notification bell — desktop dropdown ───────────────────── */}
            <div ref={bellRef} className="relative">
              <button
                type="button"
                onClick={openDesktopBell}
                className="relative p-2 rounded-lg text-muted hover:text-body hover:bg-page transition-colors"
                aria-label={bellAriaLabel}
                aria-expanded={bellOpen}
                aria-haspopup="true"
              >
                <Bell className="w-5 h-5" aria-hidden />
                {unreadCount > 0 && (
                  <span
                    className="
                      absolute top-1 right-1
                      min-w-[16px] h-4
                      bg-brand-coral rounded-full
                      text-white text-[9px] font-heading font-bold
                      flex items-center justify-center px-1 leading-none
                    "
                    aria-hidden
                  >
                    {unreadCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {bellOpen && (
                  <motion.div
                    key="bell-dropdown"
                    variants={dropVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    transition={dropTransition}
                    className="
                      absolute right-0 top-full mt-2
                      w-80 bg-surface border border-base rounded-2xl
                      shadow-lg overflow-hidden origin-top-right
                    "
                    role="region"
                    aria-label="Notifications"
                  >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-base">
                      <h3 className="font-heading font-semibold text-sm text-body">
                        Notifications
                      </h3>
                      <button
                        type="button"
                        onClick={() => setBellOpen(false)}
                        className="p-1 rounded text-muted hover:text-body transition-colors"
                        aria-label="Close notifications"
                      >
                        <X className="w-3.5 h-3.5" aria-hidden />
                      </button>
                    </div>
                    <NotificationList
                      notifications={notifications}
                      isLoading={notifLoading}
                      onClose={() => setBellOpen(false)}
                      onViewAll={goToAnnouncements}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── Theme toggle (B7 ModeToggle) ───────────────────────────── */}
            <ModeToggle />

            {/* ── User menu — desktop dropdown ───────────────────────────── */}
            <div ref={userRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setUserOpen(!userOpen)
                  setBellOpen(false)
                }}
                className="flex items-center gap-2.5 hover:bg-page rounded-xl px-2.5 py-1.5 transition-colors"
                aria-expanded={userOpen}
                aria-haspopup="true"
                aria-label={`User menu — ${displayName}`}
              >
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-brand-navy flex items-center justify-center shrink-0">
                  <span className="text-white text-xs font-bold font-heading">
                    {initials}
                  </span>
                </div>

                {/* Name + role label — visible xl+ */}
                <div className="text-left hidden xl:block">
                  <p className="text-sm font-semibold font-heading text-body leading-none">
                    {displayName}
                  </p>
                  <p className="text-xs text-muted mt-0.5">
                    {subtitle ?? (role ? ROLE_LABELS[role] : '')}
                  </p>
                </div>

                <ChevronDown
                  className={[
                    'w-3.5 h-3.5 text-muted hidden xl:block',
                    'transition-transform duration-200',
                    userOpen ? 'rotate-180' : '',
                  ].join(' ')}
                  aria-hidden
                />
              </button>

              <AnimatePresence>
                {userOpen && (
                  <motion.div
                    key="user-dropdown"
                    variants={dropVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    transition={dropTransition}
                    className="
                      absolute right-0 top-full mt-2
                      w-56 bg-surface border border-base rounded-2xl
                      shadow-lg overflow-hidden origin-top-right
                    "
                    role="menu"
                    aria-label="User options"
                  >
                    {/* User info */}
                    <div className="px-4 py-3 border-b border-base">
                      <p className="text-sm font-heading font-semibold text-body">
                        {displayName}
                      </p>
                      <p className="text-xs text-muted font-sans truncate mt-0.5">
                        {user?.email}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="py-1.5">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setUserOpen(false)
                          // R15: /profile has never existed as a route (404);
                          // ProfileSettings lives inside the settings page.
                          router.push('/settings?section=profile')
                        }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-muted hover:text-body hover:bg-page transition-colors"
                      >
                        <User className="w-4 h-4 shrink-0" aria-hidden />
                        Profile
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setUserOpen(false)
                          router.push('/settings')
                        }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-muted hover:text-body hover:bg-page transition-colors"
                      >
                        <Settings className="w-4 h-4 shrink-0" aria-hidden />
                        Settings
                      </button>
                    </div>

                    {/* Sign out */}
                    <div className="py-1.5 border-t border-base">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleSignOut}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-brand-coral hover:bg-brand-coral/5 transition-colors"
                      >
                        <LogOut className="w-4 h-4 shrink-0" aria-hidden />
                        Sign out
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>

      {/* ── MOBILE OVERLAYS (outside <header> for correct z-stacking) ──────── */}
      <MobileSearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        motionEnabled={motionEnabled}
      />

      <MobileNotificationPanel
        open={mobileBellOpen}
        onClose={() => setMobileBellOpen(false)}
        onViewAll={goToAnnouncements}
        motionEnabled={motionEnabled}
        notifications={notifications}
        isLoading={notifLoading}
      />
    </>
  )
}