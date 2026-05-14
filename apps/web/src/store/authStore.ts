import { create } from 'zustand'
import type { User } from 'firebase/auth'

// All 9 user roles in the system
export type UserRole =
  | 'admin'
  | 'high_rank'
  | 'finance'
  | 'library'
  | 'lower_rank'
  | 'academic'
  | 'hr'
  | 'exam_officer'
  | 'student'

interface AuthState {
  user: User | null
  role: UserRole | null
  subtitle: string | null // e.g. "Head Teacher", "Form 3 Teacher"
  loading: boolean
  initialized: boolean // true after first Firebase Auth state check

  setUser: (user: User | null, role: UserRole | null, subtitle: string | null) => void
  setLoading: (loading: boolean) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  role: null,
  subtitle: null,
  loading: true,
  initialized: false,

  setUser: (user, role, subtitle) =>
    set({ user, role, subtitle, loading: false, initialized: true }),

  setLoading: (loading) => set({ loading }),

  clearAuth: () =>
    set({ user: null, role: null, subtitle: null, loading: false, initialized: true }),
}))
