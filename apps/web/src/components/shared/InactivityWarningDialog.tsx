'use client'

/**
 * apps/web/src/components/shared/InactivityWarningDialog.tsx — Phase C9
 *
 * Session-expiry warning dialog rendered by InactivityManager in layout.tsx
 * when useInactivityTimer() returns showWarning = true.
 *
 * Layout:
 *   ┌─────────────────────────────────────────┐
 *   │  ⚠  Session Expiring                   │
 *   │  Your session will expire in            │
 *   │                                         │
 *   │         ╭─────────╮                     │
 *   │         │  1:47   │  ← SVG countdown    │
 *   │         │  MM:SS  │     circle          │
 *   │         ╰─────────╯                     │
 *   │                                         │
 *   │  You've been inactive. Click below to   │
 *   │  stay signed in.                        │
 *   │                                         │
 *   │  [ Log Out Now ]  [ Stay Logged In ]    │
 *   └─────────────────────────────────────────┘
 *
 * Countdown:
 *   Starts at WARNING_SECONDS (120) on mount. Decrements every second.
 *   At 0 → calls onLogout() (belt-and-suspenders alongside the timer in
 *   useInactivityTimer which fires its own logout at T).
 *
 * Colour transitions on the countdown ring:
 *   > 60 s remaining  →  brand-teal  (#00897B)
 *   30 – 60 s         →  amber       (#f59e0b)
 *   < 30 s            →  coral/red   (#ef4444)
 *
 * Animation:
 *   Backdrop: OVERLAY_VARIANTS fade. Dialog: spring scale from 0.92.
 *   Reduced-motion path skips all transforms.
 *
 * Props:
 *   onKeepAlive  () => void   — Dispatches synthetic activity event via
 *                               useInactivityTimer's keepAlive(), resetting
 *                               all timers.
 *   onLogout     () => void   — Immediate explicit sign-out (async, handled
 *                               by InactivityManager in layout.tsx).
 */

import { useEffect, useState }   from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle }          from 'lucide-react'
import { useMotionEnabled }       from '@/store/motionStore'
import {
  OVERLAY_VARIANTS,
  reducedMotionVariants,
  reducedMotionTransition,
  DURATION,
  EASE,
} from '@/lib/motion'

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Must match WARNING_BEFORE_MS / 1000 in useInactivityTimer.ts */
const WARNING_SECONDS = 120

/** SVG circle geometry */
const RADIUS          = 44
const CIRCUMFERENCE   = 2 * Math.PI * RADIUS   // ≈ 276.46

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function formatTime(s: number): string {
  const m   = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

function ringColor(s: number): string {
  if (s > 60) return '#0d9488'   // brand-teal
  if (s > 30) return '#f59e0b'   // amber
  return '#ef4444'               // red
}

// ─────────────────────────────────────────────────────────────────────────────
// COUNTDOWN RING — SVG circular progress
// ─────────────────────────────────────────────────────────────────────────────

function CountdownRing({ seconds }: { seconds: number }) {
  const progress = seconds / WARNING_SECONDS
  const offset   = CIRCUMFERENCE * (1 - progress)
  const color    = ringColor(seconds)

  return (
    <div className="relative flex items-center justify-center w-28 h-28 mx-auto">
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 w-full h-full -rotate-90"
        aria-hidden
      >
        {/* Track */}
        <circle
          cx="50" cy="50" r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-base"
        />
        {/* Progress */}
        <circle
          cx="50" cy="50" r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s ease' }}
        />
      </svg>

      {/* Centre label */}
      <div className="relative text-center">
        <span
          className="block text-2xl font-bold font-heading tabular"
          style={{ color }}
        >
          {formatTime(seconds)}
        </span>
        <span className="block text-[10px] text-muted font-sans mt-0.5 uppercase tracking-wide">
          remaining
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// INACTIVITY WARNING DIALOG
// ─────────────────────────────────────────────────────────────────────────────

interface InactivityWarningDialogProps {
  onKeepAlive: () => void
  onLogout:    () => void
}

export function InactivityWarningDialog({
  onKeepAlive,
  onLogout,
}: InactivityWarningDialogProps) {
  const motionEnabled = useMotionEnabled()
  const [seconds, setSeconds] = useState(WARNING_SECONDS)

  // ── Countdown interval ─────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(interval)
          onLogout()
          return 0
        }
        return s - 1
      })
    }, 1_000)

    return () => clearInterval(interval)
    // onLogout is stable (useCallback in layout.tsx), intentionally listed once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Animation configs ──────────────────────────────────────────────────────
  const backdropVariants = reducedMotionVariants(motionEnabled, OVERLAY_VARIANTS)
  const backdropTransition = reducedMotionTransition(motionEnabled, {
    duration: DURATION.fast,
    ease: EASE.out,
  })

  const dialogVariants = reducedMotionVariants(motionEnabled, {
    hidden:  { opacity: 0, scale: 0.92, y: 12 },
    visible: { opacity: 1, scale: 1,    y: 0  },
    exit:    { opacity: 0, scale: 0.92, y: 12 },
  })
  const dialogTransition = reducedMotionTransition(motionEnabled, {
    type:      'spring',
    stiffness: 420,
    damping:   28,
  })

  return (
    <motion.div
      key="inactivity-backdrop"
      variants={backdropVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={backdropTransition}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      // Clicking the backdrop calls keepAlive (user is clearly still there)
      onClick={onKeepAlive}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="inactivity-title"
      aria-describedby="inactivity-description"
    >
      <motion.div
        key="inactivity-dialog"
        variants={dialogVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={dialogTransition}
        onClick={(e) => e.stopPropagation()}
        className="
          relative w-full max-w-sm
          bg-surface rounded-3xl shadow-2xl
          border border-base
          p-7 flex flex-col items-center text-center
          gap-5
        "
      >
        {/* Icon */}
        <div className="w-12 h-12 rounded-2xl bg-brand-amber/15 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-brand-amber" aria-hidden />
        </div>

        {/* Heading */}
        <div>
          <h2
            id="inactivity-title"
            className="font-heading font-bold text-lg text-body"
          >
            Session Expiring
          </h2>
          <p
            id="inactivity-description"
            className="text-sm text-muted mt-1.5 leading-relaxed"
          >
            You have been inactive for a while. Your session will expire in:
          </p>
        </div>

        {/* Countdown ring */}
        <CountdownRing seconds={seconds} />

        {/* Sub-text */}
        <p className="text-xs text-muted leading-relaxed">
          Click <strong className="text-body">Stay Logged In</strong> to continue
          your session, or you will be signed out automatically.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <button
            type="button"
            onClick={onLogout}
            className="
              flex-1 min-h-[44px] px-5 rounded-xl
              text-sm font-heading font-semibold
              text-muted border border-base
              hover:bg-page transition-colors
            "
          >
            Log Out Now
          </button>

          <button
            type="button"
            onClick={onKeepAlive}
            className="
              flex-1 min-h-[44px] px-5 rounded-xl
              text-sm font-heading font-semibold
              bg-brand-teal text-white
              hover:bg-brand-teal/90 transition-colors
            "
            autoFocus
          >
            Stay Logged In
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}