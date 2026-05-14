import {
  Users,
  Banknote,
  GraduationCap,
  TrendingUp,
  BarChart3,
  FileText,
  ClipboardList,
  Settings,
} from 'lucide-react'
import { StatCard } from '@/components/shared/StatCard'
import { QuickActions } from '@/components/shared/QuickActions'
import { PlaceholderWidget } from '@/components/dashboards/AdminDashboard'
import type { QuickAction } from '@/components/shared/QuickActions'

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'School Reports',
    href: '/reports',
    icon: BarChart3,
    color: 'bg-brand-teal/10',
    text: 'text-brand-teal',
  },
  {
    label: 'Student List',
    href: '/students',
    icon: Users,
    color: 'bg-blue-50',
    text: 'text-blue-600',
  },
  {
    label: 'Exam Results',
    href: '/exams',
    icon: GraduationCap,
    color: 'bg-purple-50',
    text: 'text-purple-600',
  },
  {
    label: 'Finance Summary',
    href: '/finances',
    icon: Banknote,
    color: 'bg-emerald-50',
    text: 'text-emerald-600',
  },
  {
    label: 'Applications',
    href: '/applications',
    icon: ClipboardList,
    color: 'bg-brand-amber/10',
    text: 'text-brand-amber',
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: Settings,
    color: 'bg-brand-navy/8',
    text: 'text-brand-navy',
  },
]

export function HighRankDashboard() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Students"
          value="—"
          icon={Users}
          trend="neutral"
          trendLabel="loading"
          iconColor="bg-blue-50"
          iconText="text-blue-600"
        />
        <StatCard
          label="Total Staff"
          value="—"
          icon={Users}
          trend="neutral"
          trendLabel="loading"
          iconColor="bg-brand-teal/10"
          iconText="text-brand-teal"
        />
        <StatCard
          label="Fee Collection"
          value="—"
          icon={Banknote}
          trend="neutral"
          trendLabel="loading"
          iconColor="bg-emerald-50"
          iconText="text-emerald-600"
        />
        <StatCard
          label="School Pass Rate"
          value="—"
          icon={TrendingUp}
          trend="neutral"
          trendLabel="loading"
          iconColor="bg-purple-50"
          iconText="text-purple-600"
        />
      </div>
      <QuickActions actions={QUICK_ACTIONS} />
      <div className="grid md:grid-cols-2 gap-4">
        <PlaceholderWidget
          title="Student Population Trend"
          sub="New vs outgoing — wired in Phase 3"
        />
        <PlaceholderWidget title="Finance Summary" sub="Income vs expenses — wired in Phase 4" />
      </div>
      <PlaceholderWidget
        title="Important Reports"
        sub="School performance overview — wired in Phase 7"
        h="h-32"
      />
    </div>
  )
}
