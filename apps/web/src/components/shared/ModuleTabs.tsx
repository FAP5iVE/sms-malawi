'use client'

/**
 * apps/web/src/components/shared/ModuleTabs.tsx — Phase C7
 *
 * Mobile-first tab navigation used by all tabbed module pages:
 * Finance, HR, Library, and Exams.
 *
 * Mobile behaviour (below sm/640px):
 *   Horizontally scrollable tab strip. The container extends to viewport edges
 *   via `-mx-4 px-4` (negative margin trick) so tabs are touchable all the way
 *   to the screen edge. The scrollbar is hidden visually while remaining
 *   functionally scrollable. When the active tab changes, it auto-scrolls into
 *   view using scrollIntoView({ inline: 'nearest' }).
 *
 * Desktop behaviour (sm+):
 *   Standard flex tab strip — no scroll, full content width.
 *
 * Two visual variants:
 *   'underline' (default) — border-bottom indicator, used by Finance, HR, Library.
 *     Active indicator is a Framer Motion layoutId div that slides under tabs.
 *   'pill'               — filled background chip, used by Exams.
 *     Active background slides between tabs via Framer Motion layoutId.
 *
 * Props:
 *   tabs[]    TabItem<T> — id, label, optional icon, optional badge count.
 *             Pre-filter with .filter(t => t.show !== false) before passing.
 *   active    T          — currently active tab id.
 *   onChange  (id: T) => void
 *   variant   'underline' | 'pill'   (default: 'underline')
 *   id        string  — unique identifier for the layoutId namespace.
 *             Required when multiple ModuleTabs render on the same page to
 *             prevent Framer Motion layoutId collision. Defaults to 'tabs'.
 *
 * Animation:
 *   Uses Framer Motion layoutId for the active indicator in both variants.
 *   Respects motionEnabled from motionStore — when false, falls back to
 *   instant CSS class toggling with no sliding animation.
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]: Extracted the identical scroll-container markup previously
 *   duplicated verbatim between the underline and pill variant return
 *   blocks into one shared TabScrollContainer wrapper component, so the
 *   mobile full-bleed scroll treatment is defined exactly once.
 * [DEPENDS ON]: none
 */

import { useEffect, useRef }     from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useMotionEnabled }       from '@/store/motionStore'
import { reducedMotionTransition, SPRING } from '@/lib/motion'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface TabItem<T extends string = string> {
  id: T
  label: string
  /** Lucide icon component — optional */
  icon?: React.ElementType
  /** Number shown as a coral badge dot; omit or pass 0 to hide */
  badge?: number
}

interface ModuleTabsProps<T extends string> {
  tabs: TabItem<T>[]
  active: T
  onChange: (id: T) => void
  /** Visual style variant */
  variant?: 'underline' | 'pill'
  /**
   * Unique namespace for Framer Motion layoutId.
   * Change this when multiple ModuleTabs instances render in the same tree.
   */
  id?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// BADGE COUNT — small coral pill shown alongside tab label
// ─────────────────────────────────────────────────────────────────────────────

function BadgeCount({ count }: { count: number }) {
  if (!count) return null
  return (
    <span
      className="
        inline-flex items-center justify-center
        ml-1.5 min-w-[16px] h-4 px-1
        bg-brand-coral text-white
        text-[9px] font-heading font-bold
        rounded-full leading-none
      "
      aria-label={`${count} items`}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB SCROLL CONTAINER — shared between both visual variants (R15)
//
//   overflow-x-auto               — enables horizontal scroll
//   [scrollbar-width:none]        — hides scrollbar (Firefox)
//   [&::-webkit-scrollbar]:hidden — hides scrollbar (Chrome/Safari)
//   -mx-4 px-4                    — extends to viewport edge on mobile
//                                   (full-bleed scroll)
//   sm:mx-0 sm:px-0               — resets on desktop
// ─────────────────────────────────────────────────────────────────────────────

function TabScrollContainer({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="
        overflow-x-auto
        [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
        -mx-4 px-4 sm:mx-0 sm:px-0
      "
      role="tablist"
      aria-label="Module tabs"
    >
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE TABS
// ─────────────────────────────────────────────────────────────────────────────

export function ModuleTabs<T extends string>({
  tabs,
  active,
  onChange,
  variant = 'underline',
  id      = 'tabs',
}: ModuleTabsProps<T>) {
  const motionEnabled = useMotionEnabled()

  // Per-tab button refs for auto-scroll-into-view on active change
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  useEffect(() => {
    const el = buttonRefs.current[active]
    if (!el) return
    // Scroll the active tab into view within the scrollable container.
    // `inline: 'nearest'` avoids over-scrolling if already visible.
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [active])

  const indicatorTransition = reducedMotionTransition(motionEnabled, {
    type:      'spring',
    stiffness: 420,
    damping:   32,
    mass:      0.8,
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // UNDERLINE VARIANT
  // Finance, HR, Library: bottom border indicator that slides between tabs.
  // ═══════════════════════════════════════════════════════════════════════════

  if (variant === 'underline') {
    return (
      <TabScrollContainer>
        {/*
          Inner flex container:
            border-b border-base — the continuous bottom border rule
            min-w-max            — prevents wrapping; forces single-line scroll
        */}
        <div className="flex border-b border-base min-w-max gap-0">
          {tabs.map((tab) => {
            const Icon    = tab.icon
            const isActive = tab.id === active

            return (
              <button
                key={tab.id}
                ref={(el) => { buttonRefs.current[tab.id] = el }}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`tabpanel-${tab.id}`}
                onClick={() => onChange(tab.id)}
                className={[
                  'relative flex items-center gap-1.5',
                  'px-4 py-2.5 -mb-px',
                  'text-sm font-heading font-medium',
                  'whitespace-nowrap',
                  'transition-colors duration-150',
                  // Touch target: min-h-[44px] meets WCAG 2.5.5
                  'min-h-[44px]',
                  isActive ? 'text-brand-teal' : 'text-muted hover:text-body',
                ].join(' ')}
              >
                {Icon && (
                  <Icon className="w-4 h-4 shrink-0" aria-hidden />
                )}
                {tab.label}
                {!!tab.badge && <BadgeCount count={tab.badge} />}

                {/*
                  Animated active indicator — slides under the active tab.
                  layoutId scoped to this instance via the `id` prop so
                  multiple ModuleTabs on the same page don't share an indicator.
                  When motionEnabled = false, uses plain border-b-2 class instead.
                */}
                {isActive && motionEnabled && (
                  <motion.div
                    layoutId={`${id}-underline`}
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-teal rounded-full"
                    transition={indicatorTransition}
                  />
                )}
                {isActive && !motionEnabled && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-teal rounded-full" />
                )}
              </button>
            )
          })}
        </div>
      </TabScrollContainer>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PILL VARIANT
  // Exams: filled background chip that slides between tabs.
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <TabScrollContainer>
      <div
        className="
          inline-flex gap-1
          bg-surface border border-base rounded-xl p-1
          min-w-max
        "
      >
        {tabs.map((tab) => {
          const Icon     = tab.icon
          const isActive  = tab.id === active

          return (
            <button
              key={tab.id}
              ref={(el) => { buttonRefs.current[tab.id] = el }}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              onClick={() => onChange(tab.id)}
              className={[
                'relative flex items-center gap-2',
                'px-4 py-2 rounded-lg',
                'text-sm font-heading font-semibold',
                'whitespace-nowrap',
                'transition-colors duration-150',
                'min-h-[44px]',
                isActive ? 'text-white' : 'text-muted hover:text-body',
              ].join(' ')}
            >
              {/*
                Animated pill background.
                Rendered BEHIND the text via -z-10; the text is at default z-index.
                When motionEnabled = false, uses plain bg class on the button instead.
              */}
              {isActive && motionEnabled && (
                <motion.div
                  layoutId={`${id}-pill`}
                  className="absolute inset-0 bg-brand-navy rounded-lg -z-10"
                  transition={indicatorTransition}
                />
              )}
              {isActive && !motionEnabled && (
                <span className="absolute inset-0 bg-brand-navy rounded-lg -z-10" />
              )}

              {Icon && <Icon className="w-4 h-4 shrink-0" aria-hidden />}
              {tab.label}
              {!!tab.badge && <BadgeCount count={tab.badge} />}
            </button>
          )
        })}
      </div>
    </TabScrollContainer>
  )
}