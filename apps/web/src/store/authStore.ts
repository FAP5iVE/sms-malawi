import { create } from 'zustand'
import type { User } from 'firebase/auth'
import type { UserRole } from '@shared/types/roles'

interface AuthState {
  user: User | null
  role: UserRole | null
  title: string | null
  subtitle: string | null // e.g. "Head Teacher", "Form 3 Teacher"
  loading: boolean
  initialized: boolean // true after first Firebase Auth state check

  setUser: (user: User | null, role: UserRole | null, subtitle: string | null) => void
  setTitle: (title: string | null) => void
  setSubtitle: (subtitle: string | null) => void
  setLoading: (loading: boolean) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  role: null,
  title: null,
  subtitle: null,
  loading: true,
  initialized: false,

  setUser: (user, role, subtitle) =>
    set({ user, role, subtitle, loading: false, initialized: true }),

  setLoading: (loading) => set({ loading }),

  setTitle: (title) => set({ title }),
  setSubtitle: (subtitle) => set({ subtitle }),

  clearAuth: () =>
    set({ user: null, role: null, title: null, subtitle: null, loading: false, initialized: true }),
}))
