'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeState {
  /** Explicitly chosen mode. 'system' means follow OS preference. */
  mode: ThemeMode

  /**
   * Whether animations are enabled.
   * Initialised from prefers-reduced-motion.
   * Persisted — user can override OS preference via Settings.
   */
  motionEnabled: boolean

  setMode:          (mode: ThemeMode)    => void
  setMotionEnabled: (enabled: boolean)   => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode:          'system',
      motionEnabled: true,   // Safe default — overridden on client mount

      setMode: (mode) => set({ mode }),

      setMotionEnabled: (motionEnabled) => set({ motionEnabled }),
    }),
    {
      name:    'sms-theme-prefs',
      storage: createJSONStorage(() => localStorage),
      // Only persist explicit user choices — not derived state
      partialize: (state) => ({
        mode:          state.mode,
        motionEnabled: state.motionEnabled,
      }),
    }
  )
)