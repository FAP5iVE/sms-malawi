import {
  Users,
  BookOpen,
  GraduationCap,
  CheckSquare,
  ClipboardCheck,
  PenLine,
  Clock,
  Bell,
} from 'lucide-react'
import { StatCard } from '@/components/shared/StatCard'
import { QuickActions } from '@/components/shared/QuickActions'
import { PlaceholderWidget } from '@/components/dashboards/AdminDashboard'
import type { QuickAction } from '@/components/shared/QuickActions'

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Mark Attendance',
    href: '/classes',
    icon: ClipboardCheck,
    color: 'bg-brand-teal/10',
    text: 'text-brand-teal',
  },
  {
    label: 'Enter Marks',
    href: '/exams',
    icon: PenLine,
    color: 'bg-blue-50',
    text: 'text-blue-600',
  },
  {
    label: 'View Timetable',
    href: '/timetable',
    icon: Clock,
    color: 'bg-brand-amber/10',
    text: 'text-brand-amber',
  },
  {
    label: 'Announcements',
    href: '/announcements',
    icon: Bell,
    color: 'bg-purple-50',
    text: 'text-purple-600',
  },
]

export function AcademicDashboard() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="My Classes"
          value="—"
          icon={BookOpen}
          trend="neutral"
          trendLabel="assigned"
          iconColor="bg-brand-navy/8"
          iconText="text-brand-navy"
        />
        <StatCard
          label="Total Students"
          value="—"
          icon={Users}
          trend="neutral"
          trendLabel="in my classes"
          iconColor="bg-blue-50"
          iconText="text-blue-600"
        />
        <StatCard
          label="Exams This Week"
          value="—"
          icon={GraduationCap}
          trend="neutral"
          trendLabel="scheduled"
          iconColor="bg-brand-teal/10"
          iconText="text-brand-teal"
        />
        <StatCard
          label="Marks Pending"
          value="—"
          icon={CheckSquare}
          trend="neutral"
          trendLabel="to enter"
          iconColor="bg-brand-amber/10"
          iconText="text-brand-amber"
        />
      </div>
      <QuickActions actions={QUICK_ACTIONS} />
      <div className="grid md:grid-cols-2 gap-4">
        <PlaceholderWidget
          title="Today's Timetable"
          sub="Daily schedule widget — wired in Phase 3"
          h="h-56"
        />
        <PlaceholderWidget title="Upcoming Exams" sub="Next 7 days — wired in Phase 5" h="h-56" />
      </div>
    </div>
  )
}
