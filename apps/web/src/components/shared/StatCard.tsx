'use client'

/**
 * StatCard — Phase B8: Framer Motion entrance + hover animations
 *
 * Upgrades from a static div to a motion.div with:
 *  - Staggered entrance animation (slide-up + fade)
 *  - Subtle whileHover card elevation micro-interaction
 *  - index prop for manual delay sequencing when StatCardGrid is unavailable
 *  - Full reduced motion compliance via useMotionEnabled()
 *
 * Backwards compatible — existing usage with no motion props works identically.
 *
 * Export: StatCard, StatCardGrid
 * StatCardGrid = motion container that orchestrates true stagger across children.
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]: Added statValue() — the single formatting helper every role
 *   dashboard's newly-wired stat cards share ('…' while the backing query
 *   loads, '—' only when the value is genuinely unavailable, the formatted
 *   figure otherwise), so nine dashboards don't each re-implement the same
 *   three-state ternary.
 */

import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useMotionEnabled } from '@/store/motionStore'
import {
  STAT_CARD_VARIANTS,
  STAT_CONTAINER_VARIANTS,
  DURATION,
  EASE,
  SPRING,
  reducedMotionTransition,
} from '@/lib/motion'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// STAT VALUE FORMATTER (R15)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Three-state stat-card value: '…' while loading, '—' when the resolved
 * value is null/undefined (query errored or the figure doesn't exist), the
 * formatted value otherwise. `format` defaults to en-US thousands grouping
 * for numbers and String() passthrough for strings.
 */
export function statValue(
  isLoading: boolean,
  value: number | string | null | undefined,
  format?: (v: number | string) => string,
): string {
  if (isLoading) return '…'
  if (value === null || value === undefined) return '—'
  if (format) return format(value)
  return typeof value === 'number' ? value.toLocaleString('en-US') : value
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string
  value: string | number
  icon: React.ElementType
  /** Tailwind bg class for the icon circle, e.g. "bg-brand-teal/10" */
  iconColor?: string
  /** Tailwind text class for the icon, e.g. "text-brand-teal" */
  iconText?: string
  trend?: 'up' | 'down' | 'neutral'
  /** e.g. "+12 this month" */
  trendLabel?: string
  /** Secondary descriptor below the value */
  subLabel?: string
  /**
   * Stagger index for delay sequencing when used outside StatCardGrid.
   * Each increment adds 70ms of delay (0, 70ms, 140ms, 210ms …).
   * When inside StatCardGrid this prop is not needed — the container
   * orchestrates timing automatically via staggerChildren.
   */
  index?: number
  /** Additional class names applied to the outer wrapper */
  className?: string
}

interface StatCardGridProps {
  children: React.ReactNode
  className?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// STAT CARD GRID — orchestrated stagger container
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wraps a row of StatCards and orchestrates their staggered entrance via
 * Framer Motion's variant propagation. Children do not need to set their
 * own initial/animate when nested here — the parent propagates it.
 *
 * Usage:
 *   <StatCardGrid className="grid grid-cols-2 md:grid-cols-4 gap-4">
 *     <StatCard label="Total" value="124" icon={Users} />
 *     <StatCard label="Active" value="89" icon={Activity} />
 *   </StatCardGrid>
 */
export function StatCardGrid({ children, className }: StatCardGridProps) {
  const motionEnabled = useMotionEnabled()

  return (
    <motion.div
      variants={STAT_CONTAINER_VARIANTS}
      initial={motionEnabled ? 'hidden' : false}
      animate="visible"
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// STAT CARD
// ─────────────────────────────────────────────────────────────────────────────

export function StatCard({
  label,
  value,
  icon: Icon,
  iconColor  = 'bg-brand-teal/10',
  iconText   = 'text-brand-teal',
  trend,
  trendLabel,
  subLabel,
  index,
  className,
}: StatCardProps) {
  const motionEnabled = useMotionEnabled()

  const TrendIcon =
    trend === 'up'
      ? TrendingUp
      : trend === 'down'
        ? TrendingDown
        : trend === 'neutral'
          ? Minus
          : null

  const trendColor =
    trend === 'up'
      ? 'text-emerald-600'
      : trend === 'down'
        ? 'text-brand-coral'
        : 'text-muted'

  // ── Per-card entrance transition ──────────────────────────────────────────
  // When index is provided, add manual delay for stagger sequencing.
  // The delay is ignored when inside StatCardGrid (parent controls timing).
  const cardTransition = motionEnabled
    ? {
        duration: DURATION.normal,
        ease: EASE.out,
        delay: index !== undefined ? index * 0.07 : 0,
      }
    : { duration: 0 }

  const cardVariants = motionEnabled
    ? {
        hidden: STAT_CARD_VARIANTS.hidden ?? { opacity: 0, y: 12, scale: 0.97 },
        visible: {
          ...STAT_CARD_VARIANTS.visible as object,
          transition: cardTransition,
        },
      }
    : {
        hidden:  { opacity: 1, y: 0, scale: 1 },
        visible: { opacity: 1, y: 0, scale: 1 },
      }

  // ── Hover elevation transition ────────────────────────────────────────────
  const hoverProps = motionEnabled
    ? {
        whileHover: {
          y: -3,
          boxShadow: '0 6px 24px -4px rgba(0, 0, 0, 0.10)',
          transition: reducedMotionTransition(motionEnabled, SPRING.tight),
        },
        whileTap: {
          y: -1,
          scale: 0.99,
          transition: reducedMotionTransition(motionEnabled, SPRING.tight),
        },
      }
    : {}

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className={cn(
        'bg-surface border border-base rounded-xl p-5 flex flex-col gap-3',
        'cursor-default',
        className
      )}
      {...hoverProps}
    >
      {/* ── Icon + Trend row ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <motion.div
          className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconColor}`}
          whileHover={motionEnabled ? { scale: 1.08, rotate: 3 } : undefined}
          transition={reducedMotionTransition(motionEnabled, SPRING.tight)}
        >
          <Icon className={`w-5 h-5 ${iconText}`} />
        </motion.div>

        {TrendIcon && trendLabel && (
          <motion.div
            className={`flex items-center gap-1 text-xs font-medium ${trendColor}`}
            initial={motionEnabled ? { opacity: 0, x: 6 } : false}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: DURATION.normal, ease: EASE.out, delay: (index ?? 0) * 0.07 + 0.15 }}
          >
            <TrendIcon className="w-3 h-3" />
            {trendLabel}
          </motion.div>
        )}
      </div>

      {/* ── Value + Labels ────────────────────────────────────────────────── */}
      <div>
        <p className="text-2xl font-bold font-heading text-brand-navy tabular">{value}</p>
        {subLabel && <p className="text-xs text-muted mt-0.5">{subLabel}</p>}
        <p className="text-sm text-muted mt-1">{label}</p>
      </div>
    </motion.div>
  )
}