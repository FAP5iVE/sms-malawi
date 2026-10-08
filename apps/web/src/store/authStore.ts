'use client'

import { create } from 'zustand'
import type { User } from 'firebase/auth'
import type { UserRole } from '@shared/types/roles'

interface AuthState {
  user:        User | null
  role:        UserRole | null
  /**
   * True only for the alpha_admin super user (Firebase claim `superUser`).
   * Every client-side role/permission gate treats this as "allowed".
   * UX only — the server independently enforces the same claim.
   */
  superUser:   boolean
  title:       string | null
  /** Staff subtitle from Firebase custom claims: "Head Teacher", "Form 3 Teacher", etc. */
  subtitle:    string | null
  loading:     boolean
  /** True after the first Firebase Auth state resolution. */
  initialized: boolean

  setUser:     (user: User | null, role: UserRole | null, subtitle: string | null, superUser?: boolean) => void
  setTitle:    (title: string | null) => void
  setSubtitle: (subtitle: string | null) => void
  setLoading:  (loading: boolean) => void
  clearAuth:   () => void
}

export const useAuthStore = create<AuthState>()((set) => ({
  user:        null,
  role:        null,
  superUser:   false,
  subtitle:    null,
  title:       null,
  loading:     true,
  initialized: false,

  setUser: (user, role, subtitle, superUser = false) =>
    set({ user, role, subtitle, superUser, loading: false, initialized: true }),

  setTitle: (title) => set({ title }),

  setLoading: (loading) => set({ loading }),

  setSubtitle: (subtitle) => set({ subtitle }),

  clearAuth: () =>
    set({
      user:        null,
      role:        null,
      superUser:   false,
      title:       null,
      subtitle:    null,
      loading:     false,
      initialized: true,
    }),
}))