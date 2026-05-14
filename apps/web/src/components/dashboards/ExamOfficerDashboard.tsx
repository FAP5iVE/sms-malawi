import {
  GraduationCap,
  PenLine,
  CheckCircle,
  AlertCircle,
  ClipboardList,
  Settings,
  BarChart3,
  Clock,
} from 'lucide-react'
import { StatCard } from '@/components/shared/StatCard'
import { QuickActions } from '@/components/shared/QuickActions'
import { PlaceholderWidget } from '@/components/dashboards/AdminDashboard'
import type { QuickAction } from '@/components/shared/QuickActions'

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Enter Marks',
    href: '/exams/marks',
    icon: PenLine,
    color: 'bg-brand-teal/10',
    text: 'text-brand-teal',
  },
  {
    label: 'Release Results',
    href: '/exams/results',
    icon: CheckCircle,
    color: 'bg-emerald-50',
    text: 'text-emerald-600',
  },
  {
    label: 'MANEB Records',
    href: '/exams/maneb',
    icon: ClipboardList,
    color: 'bg-blue-50',
    text: 'text-blue-600',
  },
  {
    label: 'Exam Analytics',
    href: '/reports',
    icon: BarChart3,
    color: 'bg-brand-amber/10',
    text: 'text-brand-amber',
  },
  {
    label: 'Exam Settings',
    href: '/settings',
    icon: Settings,
    color: 'bg-brand-navy/8',
    text: 'text-brand-navy',
  },
]

export function ExamOfficerDashboard() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
          label="Marks Pending Entry"
          value="—"
          icon={PenLine}
          trend="neutral"
          trendLabel="to enter"
          iconColor="bg-brand-amber/10"
          iconText="text-brand-amber"
        />
        <StatCard
          label="Results to Release"
          value="—"
          icon={CheckCircle}
          trend="neutral"
          trendLabel="awaiting"
          iconColor="bg-blue-50"
          iconText="text-blue-600"
        />
        <StatCard
          label="MANEB Config Alerts"
          value="0"
          icon={AlertCircle}
          trend="up"
          trendLabel="all clear"
          iconColor="bg-emerald-50"
          iconText="text-emerald-600"
        />
      </div>
      <QuickActions actions={QUICK_ACTIONS} />
      <div className="grid md:grid-cols-2 gap-4">
        <PlaceholderWidget
          title="Exam Schedule This Week"
          sub="Timetable view — wired in Phase 5"
          h="h-56"
        />
        <PlaceholderWidget
          title="Results Release Queue"
          sub="Pending authorization — wired in Phase 5"
          h="h-56"
        />
      </div>
    </div>
  )
}
