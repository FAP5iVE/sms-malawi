import {
  Users,
  ClipboardList,
  CalendarDays,
  GraduationCap,
  UserPlus,
  BookOpen,
  Bell,
  Clock,
} from 'lucide-react'
import { StatCard } from '@/components/shared/StatCard'
import { QuickActions } from '@/components/shared/QuickActions'
import { PlaceholderWidget } from '@/components/dashboards/AdminDashboard'
import type { QuickAction } from '@/components/shared/QuickActions'

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Add Student',
    href: '/students/new',
    icon: UserPlus,
    color: 'bg-brand-teal/10',
    text: 'text-brand-teal',
  },
  {
    label: 'Applications',
    href: '/applications',
    icon: ClipboardList,
    color: 'bg-brand-amber/10',
    text: 'text-brand-amber',
  },
  {
    label: 'View Calendar',
    href: '/calendar',
    icon: CalendarDays,
    color: 'bg-blue-50',
    text: 'text-blue-600',
  },
  {
    label: 'Announcements',
    href: '/announcements',
    icon: Bell,
    color: 'bg-purple-50',
    text: 'text-purple-600',
  },
]

export function LowerRankDashboard() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Students"
          value="—"
          icon={Users}
          trend="neutral"
          trendLabel="enrolled"
          iconColor="bg-blue-50"
          iconText="text-blue-600"
        />
        <StatCard
          label="Total Staff"
          value="—"
          icon={Users}
          trend="neutral"
          trendLabel="active"
          iconColor="bg-brand-teal/10"
          iconText="text-brand-teal"
        />
        <StatCard
          label="Pending Applications"
          value="—"
          icon={ClipboardList}
          trend="neutral"
          trendLabel="awaiting"
          iconColor="bg-brand-amber/10"
          iconText="text-brand-amber"
        />
        <StatCard
          label="Exams This Week"
          value="—"
          icon={GraduationCap}
          trend="neutral"
          trendLabel="scheduled"
          iconColor="bg-purple-50"
          iconText="text-purple-600"
        />
      </div>
      <QuickActions actions={QUICK_ACTIONS} />
      <div className="grid md:grid-cols-2 gap-4">
        <PlaceholderWidget
          title="Exam Schedule This Week"
          sub="Timetable widget — wired in Phase 3"
        />
        <PlaceholderWidget title="Recent Applications" sub="Admissions queue — wired in Phase 3" />
      </div>
    </div>
  )
}
