'use client'

/**
 * store/motionStore.ts — Phase B8
 *
 * Motion-preference state lives in themeStore (Phase B7) alongside the
 * theme mode. This file provides clean, focused re-exports so components
 * can import motion concerns without coupling to theme concerns.
 *
 * Architecture note: We deliberately avoid creating a second Zustand
 * store for motionEnabled. Duplicating state into a separate store would
 * create a sync problem. Instead we expose a focused selector hook and
 * a toggle utility — backed by the single source of truth in themeStore.
 *
 * Usage:
 *   import { useMotionEnabled, useMotionActions } from '@/store/motionStore'
 *
 *   const motionEnabled = useMotionEnabled()
 *   const { toggleMotion, disableMotion } = useMotionActions()
 */

import { useThemeStore } from './themeStore'

// ─────────────────────────────────────────────────────────────────────────────
// HOOKS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the current motion-enabled flag.
 * Safe to call in any client component.
 *
 * @returns true  — animations are active (default)
 * @returns false — user has prefers-reduced-motion or manually disabled
 */
export function useMotionEnabled(): boolean {
  return useThemeStore((s) => s.motionEnabled)
}

/**
 * Returns motion control actions without subscribing to the motionEnabled value.
 * Use when a component only needs to toggle motion, not read its current state.
 */
export function useMotionActions(): {
  setMotionEnabled: (enabled: boolean) => void
  toggleMotion: () => void
  disableMotion: () => void
  enableMotion: () => void
} {
  const setMotionEnabled = useThemeStore((s) => s.setMotionEnabled)

  return {
    setMotionEnabled,
    toggleMotion: () => {
      const current = useThemeStore.getState().motionEnabled
      setMotionEnabled(!current)
    },
    disableMotion: () => setMotionEnabled(false),
    enableMotion: () => setMotionEnabled(true),
  }
}

/**
 * Combined selector — returns both value and setter in a single hook call.
 * Convenience for components that need to both read and write motion preference.
 */
export function useMotion(): {
  motionEnabled: boolean
  setMotionEnabled: (enabled: boolean) => void
} {
  const motionEnabled    = useThemeStore((s) => s.motionEnabled)
  const setMotionEnabled = useThemeStore((s) => s.setMotionEnabled)
  return { motionEnabled, setMotionEnabled }
}