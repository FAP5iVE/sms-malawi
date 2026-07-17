/**
 * lib/motion.ts — Phase B8: Framer Motion Token Library
 *
 * Centralised animation durations, easing curves, spring presets,
 * transition objects, and variant collections for every animated
 * surface in the application.
 *
 * Usage pattern:
 *   import { PAGE_VARIANTS, STAT_CARD_VARIANTS, SPRING, DURATION } from '@/lib/motion'
 *   import { reducedMotionVariants } from '@/lib/motion'
 *
 * Every consumer MUST call reducedMotionVariants() and pass the
 * result as the `variants` prop when motionEnabled = false.
 */

import type { Transition, Variants } from 'framer-motion'

// ─────────────────────────────────────────────────────────────────────────────
// DURATIONS  (in seconds)
// ─────────────────────────────────────────────────────────────────────────────

export const DURATION = {
  /** Micro-interactions: focus ring, button active state */
  instant: 0.08,
  /** Fast UI: tooltips, small dropdowns, badge pops */
  fast: 0.18,
  /** Standard: cards, modals, page elements */
  normal: 0.28,
  /** Slow: page entry, panel open, full-screen overlays */
  slow: 0.42,
  /** Very slow: onboarding splash, first-load hero */
  crawl: 0.60,
} as const

// ─────────────────────────────────────────────────────────────────────────────
// CUBIC BÉZIER EASING CURVES
// ─────────────────────────────────────────────────────────────────────────────

export const EASE = {
  /** Entering elements — start fast, end gently */
  out: [0.0, 0.0, 0.2, 1.0] as [number, number, number, number],
  /** Leaving elements — start slow, end fast */
  in: [0.4, 0.0, 1.0, 1.0] as [number, number, number, number],
  /** Balanced — symmetric curve for position changes */
  inOut: [0.4, 0.0, 0.2, 1.0] as [number, number, number, number],
  /** Subtle overshoot — interactive press/lift feedback */
  outBack: [0.175, 0.885, 0.32, 1.275] as [number, number, number, number],
  /** Linear — progress bars, loaders */
  linear: [0.0, 0.0, 1.0, 1.0] as [number, number, number, number],
} as const

// ─────────────────────────────────────────────────────────────────────────────
// SPRING PRESETS
// ─────────────────────────────────────────────────────────────────────────────

export const SPRING = {
  /**
   * Sidebar / panel collapse — crisp, physics-accurate width snap.
   * High stiffness with just enough damping to prevent overshoot.
   */
  snappy: {
    type: 'spring' as const,
    stiffness: 320,
    damping: 32,
    mass: 1.0,
  },

  /**
   * Card elevation hover / badge pop — ultra-tight feel.
   */
  tight: {
    type: 'spring' as const,
    stiffness: 420,
    damping: 42,
    mass: 0.8,
  },

  /**
   * Bottom sheet / side drawer — fluid with minimal residual oscillation.
   */
  fluid: {
    type: 'spring' as const,
    stiffness: 280,
    damping: 36,
    mass: 1.0,
  },

  /**
   * Gentle entrance — soft landing for non-critical UI elements.
   */
  gentle: {
    type: 'spring' as const,
    stiffness: 200,
    damping: 28,
    mass: 1.0,
  },
} as const

// ─────────────────────────────────────────────────────────────────────────────
// STANDARD TRANSITION OBJECTS
// ─────────────────────────────────────────────────────────────────────────────

export const TRANSITION = {
  fast:        { duration: DURATION.fast,   ease: EASE.out    } satisfies Transition,
  normal:      { duration: DURATION.normal, ease: EASE.out    } satisfies Transition,
  slow:        { duration: DURATION.slow,   ease: EASE.out    } satisfies Transition,
  spring:      SPRING.snappy                                   satisfies Transition,
  springFluid: SPRING.fluid                                    satisfies Transition,
  springGentle:SPRING.gentle                                   satisfies Transition,
  /** Instant — used when motionEnabled = false */
  instant:     { duration: 0 }                                 satisfies Transition,
} as const

// ─────────────────────────────────────────────────────────────────────────────
// PAGE-LEVEL ROUTE TRANSITION VARIANTS
// Slide up + fade on enter; fade + micro-slide down on exit.
// Applied via AnimatePresence keyed by pathname.
// ─────────────────────────────────────────────────────────────────────────────

export const PAGE_VARIANTS: Variants = {
  initial: {
    opacity: 0,
    y: 10,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: DURATION.normal,
      ease: EASE.out,
    },
  },
  exit: {
    opacity: 0,
    y: -5,
    transition: {
      duration: DURATION.fast,
      ease: EASE.in,
    },
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// STAT CARD VARIANTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Container variant — apply to the grid wrapper.
 * Triggers staggered entrance across all child StatCards.
 *
 * Usage:
 *   <motion.div variants={STAT_CONTAINER_VARIANTS} initial="hidden" animate="visible">
 *     <StatCard /> <StatCard /> ...
 *   </motion.div>
 */
export const STAT_CONTAINER_VARIANTS: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.04,
    },
  },
}

/**
 * Per-card variant — apply to the StatCard motion wrapper.
 * When inside StatCardGrid the parent propagates the variant state;
 * when standalone the card manages initial/animate itself.
 */
export const STAT_CARD_VARIANTS: Variants = {
  hidden: {
    opacity: 0,
    y: 18,
    scale: 0.97,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: DURATION.normal,
      ease: EASE.out,
    },
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR VARIANTS
// Width transition — spring-based snap between expanded and icon rail.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Animated sidebar container width.
 * 240px = Tailwind w-60, 60px = Tailwind w-[60px].
 */
export const SIDEBAR_WIDTH_VARIANTS: Variants = {
  expanded: {
    width: 240,
    transition: SPRING.snappy,
  },
  collapsed: {
    width: 60,
    transition: SPRING.snappy,
  },
}

/** Label text fade in/out with mild x-slide */
export const SIDEBAR_LABEL_VARIANTS: Variants = {
  hidden: {
    opacity: 0,
    x: -6,
    transition: {
      duration: DURATION.fast,
      ease: EASE.in,
    },
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: DURATION.normal,
      ease: EASE.out,
      delay: 0.06,
    },
  },
}

/** Bottom role badge fade */
export const SIDEBAR_BADGE_VARIANTS: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.94,
    transition: {
      duration: DURATION.fast,
      ease: EASE.in,
    },
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: DURATION.normal,
      ease: EASE.out,
      delay: 0.08,
    },
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// FADE + SLIDE VARIANTS
// Dropdowns, notification panels, user menu pop-overs.
// ─────────────────────────────────────────────────────────────────────────────

export const FADE_DOWN_VARIANTS: Variants = {
  hidden: {
    opacity: 0,
    y: -8,
    scale: 0.96,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: DURATION.fast,
      ease: EASE.out,
    },
  },
  exit: {
    opacity: 0,
    y: -6,
    scale: 0.96,
    transition: {
      duration: DURATION.fast,
      ease: EASE.in,
    },
  },
}

export const FADE_UP_VARIANTS: Variants = {
  hidden: {
    opacity: 0,
    y: 8,
    scale: 0.96,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: DURATION.fast,
      ease: EASE.out,
    },
  },
  exit: {
    opacity: 0,
    y: 6,
    scale: 0.96,
    transition: {
      duration: DURATION.fast,
      ease: EASE.in,
    },
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// BOTTOM SHEET / MOBILE DRAWER VARIANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Full-height bottom sheet sliding up from viewport bottom */
export const SHEET_UP_VARIANTS: Variants = {
  hidden: {
    y: '100%',
    opacity: 0.6,
  },
  visible: {
    y: 0,
    opacity: 1,
    transition: SPRING.fluid,
  },
  exit: {
    y: '100%',
    opacity: 0,
    transition: {
      duration: DURATION.normal,
      ease: EASE.in,
    },
  },
}

/** Side panel sliding in from the right */
export const SHEET_RIGHT_VARIANTS: Variants = {
  hidden: {
    x: '100%',
    opacity: 0.6,
  },
  visible: {
    x: 0,
    opacity: 1,
    transition: SPRING.fluid,
  },
  exit: {
    x: '100%',
    opacity: 0,
    transition: {
      duration: DURATION.normal,
      ease: EASE.in,
    },
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERLAY / BACKDROP
// ─────────────────────────────────────────────────────────────────────────────

export const OVERLAY_VARIANTS: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: DURATION.fast, ease: EASE.out },
  },
  exit: {
    opacity: 0,
    transition: { duration: DURATION.fast, ease: EASE.in },
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST / FEED STAGGER VARIANTS
// DataTable rows, announcement cards, activity feeds.
// ─────────────────────────────────────────────────────────────────────────────

export const LIST_CONTAINER_VARIANTS: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.04,
    },
  },
}

export const LIST_ITEM_VARIANTS: Variants = {
  hidden: {
    opacity: 0,
    x: -10,
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: DURATION.normal,
      ease: EASE.out,
    },
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// TABLE ROW STAGGER  (R15 — moved here from DataTable.tsx so the shared
// table entrance animation lives with every other named motion constant)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stagger container for a <motion.tbody>. Table-element-safe (no transform
 * on the container itself). Stagger only applies for small datasets —
 * ≤ 15 rows — to prevent slow, drawn-out animations on large tables.
 */
export const TBODY_STAGGER = (count: number): Variants => ({
  hidden: {},
  visible: {
    transition: {
      staggerChildren: count <= 15 ? 0.03 : 0,
    },
  },
})

/** Per-<motion.tr> entrance used with TBODY_STAGGER. */
export const TR_VARIANTS: Variants = {
  hidden:  { opacity: 0, y: 4 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.fast, ease: EASE.out },
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// SCALE / POP
// Notification badges, count pills, success states.
// ─────────────────────────────────────────────────────────────────────────────

export const SCALE_POP_VARIANTS: Variants = {
  hidden: {
    scale: 0.6,
    opacity: 0,
  },
  visible: {
    scale: 1,
    opacity: 1,
    transition: SPRING.tight,
  },
  exit: {
    scale: 0.7,
    opacity: 0,
    transition: { duration: DURATION.fast, ease: EASE.in },
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// REDUCED MOTION UTILITIES
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Strips all spatial motion from a Variants map when reduced motion is active.
 * Returns a set of variants where every state is visually equivalent
 * to the "visible" / "animate" state — all at full opacity, no transform.
 *
 * Only transition duration is set to 0; opacity changes below 0.99 are
 * preserved so that fade-ins still work (they are not vestibular triggers).
 *
 * @example
 *   const variants = reducedMotionVariants(motionEnabled, PAGE_VARIANTS)
 *   <motion.div variants={variants} initial="initial" animate="animate" />
 */
export function reducedMotionVariants(
  motionEnabled: boolean,
  variants: Variants,
): Variants {
  if (motionEnabled) return variants

  const safe: Variants = {}
  for (const key of Object.keys(variants)) {
    safe[key] = {
      opacity: 1,
      scale: 1,
      x: 0,
      y: 0,
      rotate: 0,
      transition: { duration: 0 },
    }
  }
  return safe
}

/**
 * Returns an instant transition when reduced motion is active,
 * otherwise returns the provided transition object.
 *
 * @example
 *   transition={reducedMotionTransition(motionEnabled, SPRING.snappy)}
 */
export function reducedMotionTransition(
  motionEnabled: boolean,
  transition: Transition,
): Transition {
  return motionEnabled ? transition : { duration: 0 }
}

/**
 * Resolves whether to use `initial` + `animate` + `exit` props
 * on a motion element. Returns empty objects when motion is disabled,
 * letting the element render in its final state immediately.
 *
 * @example
 *   const motionProps = resolveMotionProps(motionEnabled, 'hidden', 'visible', 'exit')
 *   <motion.div {...motionProps} variants={FADE_DOWN_VARIANTS} />
 */
export function resolveMotionProps(
  motionEnabled: boolean,
  initial: string,
  animate: string,
  exit?: string,
): {
  initial: string | false
  animate: string
  exit?: string
} {
  if (!motionEnabled) {
    return { initial: false, animate: animate, exit: undefined }
  }
  return { initial, animate, exit }
}