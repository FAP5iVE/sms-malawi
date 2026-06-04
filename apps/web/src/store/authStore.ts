'use client'

import { create } from 'zustand'
import type { User } from 'firebase/auth'
import type { UserRole } from '@shared/types/roles'

interface AuthState {
  user:        User | null
  role:        UserRole | null
  title:       string | null
  /** Staff subtitle from Firebase custom claims: "Head Teacher", "Form 3 Teacher", etc. */
  subtitle:    string | null
  loading:     boolean
  /** True after the first Firebase Auth state resolution. */
  initialized: boolean

  setUser:     (user: User | null, role: UserRole | null, subtitle: string | null) => void
  setTitle:    (title: string | null) => void
  setSubtitle: (subtitle: string | null) => void
  setLoading:  (loading: boolean) => void
  clearAuth:   () => void
}

export const useAuthStore = create<AuthState>()((set) => ({
  user:        null,
  role:        null,
  subtitle:    null,
  title:       null,
  loading:     true,
  initialized: false,

  setUser: (user, role, subtitle) =>
    set({ user, role, subtitle, loading: false, initialized: true }),

  setTitle: (title) => set({ title }),

  setLoading: (loading) => set({ loading }),

  setSubtitle: (subtitle) => set({ subtitle }),

  clearAuth: () =>
    set({
      user:        null,
      role:        null,
      title:       null,
      subtitle:    null,
      loading:     false,
      initialized: true,
    }),
}))