'use client'

/**
 * apps/web/src/components/shared/Sidebar.tsx
 *
 * Authenticated shell left-side navigation panel.
 *
 * Phase B10 refactor — Sidebar is now a pure rendering component:
 *   • NAV_ITEMS array and NavItem type removed from this file.
 *   • All icon imports removed from this file.
 *   • Navigation data sourced exclusively from useNavigation() hook,
 *     which reads from config/navigation.ts.
 *
 * Behaviour unchanged from B8:
 *   • Framer Motion spring-based expand / collapse.
 *   • reducedMotionVariants respects motionStore.motionEnabled.
 *   • Staggered entrance animation on first render.
 *   • layoutId="sidebar-active-dot" shared animated indicator in icon-rail mode.
 *   • Bottom role badge animates in/out with the label panel.
 *
 * New in B10:
 *   • Badge count rendering on nav items (from NavItemResolved.badgeCount).
 *     – Expanded mode: small pill after the label.
 *     – Collapsed icon-rail: pulsing dot on the icon corner.
 *   • Item tooltip in collapsed mode via native `title` attribute.
 *   • ROLE_LABELS map remains here (display-only, Sidebar-specific concern).
 */

import Link           from 'next/link'
import { useState }   from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useAuthStore }    from '@/store/authStore'
import { useMotionEnabled } from '@/store/motionStore'
import { useNavigation }   from '@/hooks/useNavigation'
import {
  SIDEBAR_WIDTH_VARIANTS,
  SIDEBAR_LABEL_VARIANTS,
  SIDEBAR_BADGE_VARIANTS,
  reducedMotionVariants,
  reducedMotionTransition,
  SPRING,
  DURATION,
  EASE,
} from '@/lib/motion'
import type { UserRole } from '@shared/types/roles'

// ─────────────────────────────────────────────────────────────────────────────
// ROLE DISPLAY LABELS
// Sidebar-specific display strings — intentionally kept here rather than in
// the shared types package because they are a UI concern, not a domain concern.
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
// SIDEBAR COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function Sidebar() {
  const { role }      = useAuthStore()
  const motionEnabled = useMotionEnabled()
  const { items }     = useNavigation()
  const [collapsed, setCollapsed] = useState(false)

  // Do not render the sidebar until the auth state is resolved and role is known.
  // Prevents a flash of the full-nav panel before role-filtered items are ready.
  if (!role) return null

  // ── Framer Motion variant sets ────────────────────────────────────────────
  // reducedMotionVariants() returns instant (0-duration) variants when the
  // user has enabled reduced motion — fully bypassing all spring animations.
  const widthVariants = reducedMotionVariants(motionEnabled, SIDEBAR_WIDTH_VARIANTS)
  const labelVariants = reducedMotionVariants(motionEnabled, SIDEBAR_LABEL_VARIANTS)
  const badgeVariants = reducedMotionVariants(motionEnabled, SIDEBAR_BADGE_VARIANTS)
  const widthTransition = reducedMotionTransition(motionEnabled, SPRING.snappy)

  return (
    <motion.aside
      animate={collapsed ? 'collapsed' : 'expanded'}
      variants={widthVariants}
      transition={widthTransition}
      initial={false}
      className="shrink-0 border-r border-base bg-surface flex flex-col h-full overflow-hidden"
      style={{ minWidth: 0 }}
    >
      {/* ── Logo / brand row ──────────────────────────────────────────────── */}
      <div className="h-16 flex items-center justify-between px-3 border-b border-base shrink-0">

        {/* Brand icon — always visible regardless of collapse state */}
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
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              transition: { delay: 0.1, duration: DURATION.fast, ease: EASE.out },
            }}
            exit={{ opacity: 0, transition: { duration: DURATION.fast, ease: EASE.in } }}
            onClick={() => setCollapsed(false)}
            className="flex items-center justify-center py-2 border-b border-base text-muted hover:text-body hover:bg-page transition-colors"
            aria-label="Expand sidebar"
            whileHover={motionEnabled ? { scale: 1.1 } : undefined}
            whileTap={motionEnabled   ? { scale: 0.92 } : undefined}
          >
            <ChevronsRight className="w-4 h-4" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Navigation list ───────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-3" aria-label="Main navigation">
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
                {/* Animated active indicator — icon-rail mode */}
                {collapsed && item.active && (
                  <motion.div
                    layoutId="sidebar-active-dot"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-brand-teal rounded-r-full"
                    transition={reducedMotionTransition(motionEnabled, SPRING.snappy)}
                  />
                )}

                {/* Icon — with badge dot overlay in collapsed mode */}
                <span className="relative shrink-0">
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  {/* Collapsed badge dot — shown when badgeCount > 0 and rail is collapsed */}
                  {collapsed && item.badgeCount !== undefined && (
                    <span
                      className="absolute -top-1 -right-1 min-w-[14px] h-3.5 bg-brand-coral rounded-full text-white text-[8px] font-heading font-bold flex items-center justify-center px-0.5 leading-none"
                      aria-label={`${item.badgeCount} pending`}
                    >
                      {item.badgeCount > 99 ? '99+' : item.badgeCount}
                    </span>
                  )}
                </span>

                {/* Label + expanded badge pill — animated out when collapsing */}
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

                      {/* Expanded badge pill — shown when badgeCount > 0 */}
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

      {/* ── Role badge footer ────────────────────────────────────────────── */}
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
  )
}
