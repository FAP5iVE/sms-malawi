'use client'

/**
 * FILE: apps/web/src/components/shared/PageHeader.tsx
 * REPLACES: existing PageHeader (fixes non-functional dropdown + bell)
 *
 * FIXES from landingpage_design.txt:
 *   ✅ Bell dropdown now opens/closes correctly
 *   ✅ User dropdown (ChevronDown) now opens/closes correctly
 *   ✅ Dark/Light/System theme toggle added to dropdown
 *
 * HOW IT WORKS:
 *   - Click bell → notification panel slides down (closes on click outside)
 *   - Click user avatar/name → dropdown menu opens (closes on click outside)
 *   - Dropdown includes: Profile, Theme toggle, Sign Out
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useAuthStore } from '@/store/authStore'
import { Bell, ChevronDown, Sun, Moon, Monitor, LogOut, User, Settings, X } from 'lucide-react'

const CURRENT_TERM = 'Term 1 — 2025/2026'

type Theme = 'light' | 'dark' | 'system'

const MOCK_NOTIFICATIONS = [
  {
    id: 1,
    title: 'New announcement posted',
    body: 'Term 2 timetable is now available.',
    time: '2m ago',
    unread: true,
  },
  {
    id: 2,
    title: 'Fee reminder',
    body: 'Your term fees are due in 3 days.',
    time: '1h ago',
    unread: true,
  },
  {
    id: 3,
    title: 'Exam results released',
    body: 'Form 2 midterm results are ready.',
    time: '3h ago',
    unread: false,
  },
]

export function PageHeader() {
  const router = useRouter()
  const { user, role, subtitle } = useAuthStore()

  const displayName = user?.displayName ?? user?.email?.split('@')[0] ?? 'User'
  const initials = displayName.slice(0, 2).toUpperCase()

  const [bellOpen, setBellOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system'
    return (localStorage.getItem('sms-theme') as Theme | null) ?? 'system'
  })

  const bellRef = useRef<HTMLDivElement>(null)
  const userRef = useRef<HTMLDivElement>(null)

  const unreadCount = MOCK_NOTIFICATIONS.filter((n) => n.unread).length

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false)
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Theme is read lazily in useState above — no effect needed for initial read

  useEffect(() => {
    const root = document.documentElement
    const apply = (t: Theme) => {
      if (t === 'system') {
        root.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches)
      } else {
        root.classList.toggle('dark', t === 'dark')
      }
    }
    apply(theme)
    localStorage.setItem('sms-theme', theme)
  }, [theme])

  async function handleSignOut() {
    await signOut(auth)
    document.cookie = 'sms_session=; path=/; max-age=0'
    router.push('/')
  }

  const themeOptions: { value: Theme; icon: React.ReactNode; label: string }[] = [
    { value: 'light', icon: <Sun className="w-3.5 h-3.5" />, label: 'Light' },
    { value: 'dark', icon: <Moon className="w-3.5 h-3.5" />, label: 'Dark' },
    { value: 'system', icon: <Monitor className="w-3.5 h-3.5" />, label: 'System' },
  ]

  // themeOptions used only in the dropdown buttons below

  return (
    <header className="h-16 border-b border-base bg-surface flex items-center justify-between px-6 shrink-0 relative z-30">
      {/* Left — current term indicator */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold font-heading bg-brand-teal/10 text-brand-teal border border-brand-teal/20 px-3 py-1 rounded-full">
          {CURRENT_TERM}
        </span>
      </div>

      {/* Right — bell + user */}
      <div className="flex items-center gap-2">
        {/* ── NOTIFICATION BELL ─────────────────────────────────────── */}
        <div ref={bellRef} className="relative">
          <button
            onClick={() => {
              setBellOpen(!bellOpen)
              setUserOpen(false)
            }}
            className="relative p-2 rounded-lg hover:bg-page transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5 text-muted" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-brand-coral rounded-full text-white text-[9px] font-heading font-bold flex items-center justify-center px-1">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Notification panel */}
          {bellOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-surface border border-base rounded-2xl shadow-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-base">
                <h3 className="font-heading font-semibold text-sm text-body">Notifications</h3>
                <button
                  onClick={() => setBellOpen(false)}
                  className="p-1 rounded text-muted hover:text-body"
                  aria-label="Close notifications"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-base">
                {MOCK_NOTIFICATIONS.map((n) => (
                  <div
                    key={n.id}
                    className={`px-4 py-3 hover:bg-page cursor-pointer transition-colors ${n.unread ? 'bg-brand-teal/5' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      {n.unread && (
                        <div className="w-1.5 h-1.5 rounded-full bg-brand-teal mt-1.5 shrink-0" />
                      )}
                      <div className={n.unread ? '' : 'pl-3.5'}>
                        <p className="text-xs font-heading font-semibold text-body">{n.title}</p>
                        <p className="text-xs text-muted font-sans mt-0.5 leading-relaxed">
                          {n.body}
                        </p>
                        <p className="text-[10px] text-muted mt-1 font-sans">{n.time}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2.5 border-t border-base">
                <button className="text-xs text-brand-teal font-heading font-semibold hover:underline">
                  View all notifications
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── USER DROPDOWN ──────────────────────────────────────────── */}
        <div ref={userRef} className="relative">
          <button
            onClick={() => {
              setUserOpen(!userOpen)
              setBellOpen(false)
            }}
            className="flex items-center gap-2.5 hover:bg-page rounded-xl px-2.5 py-1.5 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-brand-navy flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold font-heading">{initials}</span>
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-sm font-semibold font-heading text-body leading-none">
                {displayName}
              </p>
              <p className="text-xs text-muted mt-0.5">{subtitle ?? role}</p>
            </div>
            <ChevronDown
              className={`w-3.5 h-3.5 text-muted hidden sm:block transition-transform ${userOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Dropdown menu */}
          {userOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-surface border border-base rounded-2xl shadow-lg overflow-hidden">
              {/* User info header */}
              <div className="px-4 py-3 border-b border-base">
                <p className="text-sm font-heading font-semibold text-body">{displayName}</p>
                <p className="text-xs text-muted font-sans">{user?.email}</p>
              </div>

              {/* Menu items */}
              <div className="py-1.5">
                <button
                  onClick={() => {
                    setUserOpen(false)
                    router.push('/settings')
                  }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-muted hover:text-body hover:bg-page transition-colors"
                >
                  <User className="w-4 h-4" /> Profile
                </button>
                <button
                  onClick={() => {
                    setUserOpen(false)
                    router.push('/settings')
                  }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-muted hover:text-body hover:bg-page transition-colors"
                >
                  <Settings className="w-4 h-4" /> Settings
                </button>
              </div>

              {/* Theme toggle */}
              <div className="px-4 py-2.5 border-t border-base">
                <p className="text-[10px] font-heading font-semibold text-muted uppercase tracking-widest mb-2">
                  Theme
                </p>
                <div className="flex gap-1.5">
                  {themeOptions.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setTheme(t.value)}
                      className={[
                        'flex-1 flex flex-col items-center gap-1 py-1.5 rounded-lg text-[10px] font-heading font-medium transition-colors',
                        theme === t.value
                          ? 'bg-brand-navy text-white'
                          : 'bg-page text-muted hover:text-body',
                      ].join(' ')}
                    >
                      {t.icon}
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sign out */}
              <div className="py-1.5 border-t border-base">
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-brand-coral hover:bg-brand-coral/5 transition-colors"
                >
                  <LogOut className="w-4 h-4" /> Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
