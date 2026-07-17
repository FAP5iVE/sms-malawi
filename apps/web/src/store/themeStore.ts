'use client'

/**
 * apps/web/src/store/themeStore.ts
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]: Removed the `mode` field and `setMode` action entirely.
 *   ModeToggle.tsx's setTheme() only ever updated next-themes and never
 *   called setMode(), so themeStore.mode permanently drifted from the
 *   actually-applied theme after the first user change. next-themes is the
 *   single authoritative theme-mode source in this codebase (it already
 *   persists the choice itself); maintaining a second, structurally
 *   unreachable copy in Zustand only invited exactly that class of drift.
 *   Confirmed before removal: zero consumers of `mode`/`setMode` anywhere
 *   in apps/web/src outside this file. The ThemeMode type is retained —
 *   ModeToggle.tsx imports it to type its option list — and motionEnabled
 *   remains the single source of truth motionStore.ts re-exports.
 * [DEPENDS ON]: none
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

/**
 * The three theme modes next-themes manages. Kept here as the shared type
 * for components (ModeToggle) that enumerate the options — the *value*
 * lives solely in next-themes, never in this store.
 */
export type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeState {
  /**
   * Whether animations are enabled.
   * Initialised from prefers-reduced-motion.
   * Persisted — user can override OS preference via Settings.
   */
  motionEnabled: boolean

  setMotionEnabled: (enabled: boolean) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      motionEnabled: true, // Safe default — overridden on client mount

      setMotionEnabled: (motionEnabled) => set({ motionEnabled }),
    }),
    {
      name:    'sms-theme-prefs',
      storage: createJSONStorage(() => localStorage),
      // Only persist explicit user choices — not derived state
      partialize: (state) => ({
        motionEnabled: state.motionEnabled,
      }),
    }
  )
)
