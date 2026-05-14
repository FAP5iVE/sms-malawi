'use client'

import { Bell, ChevronDown } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

// TODO Phase 3: replace with real term from Firestore settings
const CURRENT_TERM = 'Term 1 — 2025/2026'

export function PageHeader() {
  const { user, role, subtitle } = useAuthStore()

  const displayName = user?.displayName ?? user?.email?.split('@')[0] ?? 'User'
  const initials = displayName.slice(0, 2).toUpperCase()

  return (
    <header className="h-16 border-b border-base bg-surface flex items-center justify-between px-6 shrink-0">
      {/* Left — current term indicator (always visible per spec §3.5) */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold font-heading bg-brand-teal/10 text-brand-teal border border-brand-teal/20 px-3 py-1 rounded-full">
          {CURRENT_TERM}
        </span>
      </div>

      {/* Right — bell + user info */}
      <div className="flex items-center gap-4">
        {/* Notification bell — TODO Phase 3: wire to Firestore notifications */}
        <button
          className="relative p-2 rounded-lg hover:bg-page transition-colors"
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5 text-muted" />
          {/* Unread badge */}
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-brand-coral rounded-full" />
        </button>

        {/* User avatar + name */}
        <button className="flex items-center gap-2.5 hover:bg-page rounded-lg px-2 py-1.5 transition-colors">
          <div className="w-8 h-8 rounded-full bg-brand-navy flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold font-heading">{initials}</span>
          </div>
          <div className="text-left hidden sm:block">
            <p className="text-sm font-semibold font-heading text-body leading-none">
              {displayName}
            </p>
            <p className="text-xs text-muted mt-0.5">{subtitle ?? role}</p>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-muted hidden sm:block" />
        </button>
      </div>
    </header>
  )
}
