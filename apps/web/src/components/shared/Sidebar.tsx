'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import type { UserRole } from '@/store/authStore'
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
} from 'lucide-react'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  roles: UserRole[] // which roles can see this item
}

// ── Add new module nav items here as each phase is built ──
const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    roles: [
      'admin',
      'high_rank',
      'finance',
      'library',
      'lower_rank',
      'academic',
      'hr',
      'exam_officer',
      'student',
    ],
  },
  {
    label: 'Students',
    href: '/students',
    icon: Users,
    roles: [
      'admin',
      'high_rank',
      'finance',
      'library',
      'lower_rank',
      'academic',
      'hr',
      'exam_officer',
    ],
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
    roles: ['admin', 'high_rank', 'finance', 'library', 'lower_rank', 'academic', 'student'],
  },
  {
    label: 'HR',
    href: '/hr',
    icon: UserCog,
    roles: ['admin', 'high_rank', 'finance', 'library', 'lower_rank', 'academic', 'hr'],
  },
  {
    label: 'Announcements',
    href: '/announcements',
    icon: Bell,
    roles: [
      'admin',
      'high_rank',
      'finance',
      'library',
      'lower_rank',
      'academic',
      'hr',
      'exam_officer',
      'student',
    ],
  },
  {
    label: 'Calendar',
    href: '/calendar',
    icon: CalendarDays,
    roles: [
      'admin',
      'high_rank',
      'finance',
      'library',
      'lower_rank',
      'academic',
      'hr',
      'exam_officer',
      'student',
    ],
  },
  {
    label: 'Reports',
    href: '/reports',
    icon: FileText,
    roles: [
      'admin',
      'high_rank',
      'finance',
      'library',
      'lower_rank',
      'academic',
      'hr',
      'exam_officer',
    ],
  },
  {
    label: 'Applications',
    href: '/applications',
    icon: ClipboardList,
    roles: ['admin', 'high_rank', 'lower_rank'],
  },
  { label: 'User Management', href: '/user-management', icon: ShieldCheck, roles: ['admin'] },
  {
    label: 'Settings',
    href: '/settings',
    icon: Settings,
    roles: [
      'admin',
      'high_rank',
      'finance',
      'library',
      'lower_rank',
      'academic',
      'hr',
      'exam_officer',
      'student',
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { role } = useAuthStore()

  if (!role) return null

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role))

  return (
    <aside className="w-60 shrink-0 border-r border-base bg-surface flex flex-col h-full">
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-base">
        <div className="w-8 h-8 rounded-lg bg-brand-teal flex items-center justify-center">
          <span className="text-white text-sm font-bold font-heading">S</span>
        </div>
        <span className="font-heading font-bold text-sm text-brand-navy">SMS Malawi</span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-3">
        {visibleItems.map((item) => {
          const Icon = item.icon
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'flex items-center gap-3 px-5 py-2.5 text-sm transition-colors',
                'border-l-2',
                active
                  ? 'border-brand-teal bg-teal-50 text-brand-teal font-semibold'
                  : 'border-transparent text-muted hover:bg-page hover:text-body',
              ].join(' ')}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
