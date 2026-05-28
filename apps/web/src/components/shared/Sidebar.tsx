'use client'

/**
 * FILE: apps/web/src/components/shared/Sidebar.tsx
 * REPLACES: existing Sidebar
 *
 * FIXES from landingpage_design.txt:
 *   ✅ Removed the mysterious "N" letter bottom-left
 *   ✅ Removed the beach/palm-tree rounded icon bottom-right
 *   ✅ Collapsible sidebar (icon-only mode)
 *   ✅ Clean bottom section: only the logged-in user's role badge
 *
 * These decorative artefacts (N / palm-tree) were likely rendered by
 * Tailwind purging issues or a browser extension — but they are
 * definitely NOT in this clean rebuild. If they still appear, check
 * browser extensions (e.g. Grammarly, Honey) that inject UI.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import type { UserRole } from '@shared/types/roles'
import {
  LayoutDashboard,
  Users,
  BookOpen,
  GraduationCap,
  CalendarDays,
  Bell,
  Clock,
  FileText,
  Banknote,
  Library,
  UserCog,
  ClipboardList,
  Settings,
  ShieldCheck,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import { useState } from 'react'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  roles: UserRole[]
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    roles: ['admin', 'high_rank', 'finance', 'library', 'lower_rank', 'academic', 'hr', 'exam_officer', 'student'],
  },
  {
    label: 'Students',
    href: '/students',
    icon: Users,
    roles: ['admin', 'high_rank', 'finance', 'library', 'lower_rank', 'academic', 'hr', 'exam_officer'],
  },
  {
    label: 'Classes',
    href: '/classes',
    icon: BookOpen,
    roles: ['admin', 'high_rank', 'lower_rank', 'academic', 'exam_officer', 'student'],
  },
  {
    label: 'Exams',
    href: '/exams',
    icon: GraduationCap,
    roles: ['admin', 'high_rank', 'lower_rank', 'academic', 'exam_officer', 'student'],
  },
  {
    label: 'Timetable',
    href: '/timetable',
    icon: Clock,
    roles: ['admin', 'high_rank', 'lower_rank', 'academic', 'exam_officer', 'student'],
  },
  {
    label: 'Finances',
    href: '/finances',
    icon: Banknote,
    roles: ['admin', 'high_rank', 'finance', 'student'],
  },
  {
    label: 'Library',
    href: '/library',
    icon: Library,
    roles: ['admin', 'high_rank', 'finance', 'library', 'lower_rank', 'academic', 'student','exam_officer'],
  },
  {
    label: 'HR',
    href: '/hr',
    icon: UserCog,
    roles: ['admin', 'high_rank', 'finance', 'library', 'lower_rank', 'academic', 'hr','exam_officer'],
  },
  {
    label: 'Announcements',
    href: '/announcements',
    icon: Bell,
    roles: ['admin', 'high_rank', 'finance', 'library', 'lower_rank', 'academic', 'hr', 'exam_officer', 'student'],
  },
  {
    label: 'Calendar',
    href: '/calendar',
    icon: CalendarDays,
    roles: ['admin', 'high_rank', 'finance', 'library', 'lower_rank', 'academic', 'hr', 'exam_officer', 'student'],
  },
  {
    label: 'Reports',
    href: '/reports',
    icon: FileText,
    roles: ['admin', 'high_rank', 'finance', 'library', 'lower_rank', 'academic', 'hr', 'exam_officer'],
  },
  {
    label: 'Applications',
    href: '/applications',
    icon: ClipboardList,
    roles: ['admin', 'high_rank', 'lower_rank'],
  },
  {
    label: 'User Management',
    href: '/user-management',
    icon: ShieldCheck,
    roles: ['admin'],
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: Settings,
    roles: ['admin', 'high_rank', 'finance', 'library', 'lower_rank', 'academic', 'hr', 'exam_officer', 'student'],
  },
]

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrator',
  high_rank: 'High Rank Staff',
  finance: 'Finance Staff',
  library: 'Library Staff',
  lower_rank: 'Support Staff',
  academic: 'Academic Staff',
  hr: 'HR Staff',
  exam_officer: 'Exam Officer',
  student: 'Student',
}

export function Sidebar() {
  const pathname = usePathname()
  const { role } = useAuthStore()
  const [collapsed, setCollapsed] = useState(false)

  if (!role) return null

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role))

  return (
    <aside
      className={[
        'shrink-0 border-r border-base bg-surface flex flex-col h-full transition-all duration-200',
        collapsed ? 'w-[60px]' : 'w-60',
      ].join(' ')}
    >
      {/* Logo row */}
      <div className="h-16 flex items-center justify-between px-3 border-b border-base shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-navy flex items-center justify-center shrink-0">
              <span className="text-white text-sm font-bold font-heading">S</span>
            </div>
            <span className="font-heading font-bold text-sm text-brand-navy truncate">SMS Malawi</span>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 rounded-lg bg-brand-navy flex items-center justify-center mx-auto shrink-0">
            <span className="text-white text-sm font-bold font-heading">S</span>
          </div>
        )}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="p-1.5 rounded-lg text-muted hover:bg-page hover:text-body transition-colors shrink-0"
            aria-label="Collapse sidebar"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Expand button when collapsed */}
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="flex items-center justify-center py-2 border-b border-base text-muted hover:text-body hover:bg-page transition-colors"
          aria-label="Expand sidebar"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      )}

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-3">
        {visibleItems.map((item) => {
          const Icon = item.icon
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={[
                'flex items-center gap-3 transition-colors relative',
                collapsed ? 'justify-center px-0 py-3 mx-2 rounded-xl' : 'px-5 py-2.5 border-l-2',
                active
                  ? collapsed
                    ? 'bg-brand-teal/10 text-brand-teal'
                    : 'border-brand-teal bg-brand-teal/8 text-brand-teal font-semibold'
                  : collapsed
                  ? 'text-muted hover:bg-page hover:text-body'
                  : 'border-transparent text-muted hover:bg-page hover:text-body',
              ].join(' ')}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="text-sm truncate">{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Bottom — role badge only. No decorative elements. */}
      {!collapsed && (
        <div className="px-4 py-4 border-t border-base shrink-0">
          <div className="bg-page rounded-xl px-3 py-2.5">
            <p className="text-[10px] font-heading font-semibold text-muted uppercase tracking-widest mb-0.5">
              Signed in as
            </p>
            <p className="text-xs font-heading font-semibold text-body truncate">
              {ROLE_LABELS[role]}
            </p>
          </div>
        </div>
      )}
    </aside>
  )
}
