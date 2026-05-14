import {
  Users,
  ShieldCheck,
  Activity,
  AlertCircle,
  UserPlus,
  FileSearch,
  Settings,
  Bell,
} from 'lucide-react'
import { StatCard } from '@/components/shared/StatCard'
import { QuickActions } from '@/components/shared/QuickActions'
import type { QuickAction } from '@/components/shared/QuickActions'

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Add User',
    href: '/user-management/new',
    icon: UserPlus,
    color: 'bg-brand-teal/10',
    text: 'text-brand-teal',
  },
  {
    label: 'Audit Logs',
    href: '/reports',
    icon: FileSearch,
    color: 'bg-brand-navy/8',
    text: 'text-brand-navy',
  },
  {
    label: 'System Health',
    href: '/user-management',
    icon: Activity,
    color: 'bg-emerald-50',
    text: 'text-emerald-600',
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: Settings,
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
  {
    label: 'Users',
    href: '/user-management',
    icon: Users,
    color: 'bg-blue-50',
    text: 'text-blue-600',
  },
]

export function AdminDashboard() {
  return (
    <div className="space-y-6">
      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Users"
          value="—"
          icon={Users}
          trend="neutral"
          trendLabel="loading"
          iconColor="bg-brand-teal/10"
          iconText="text-brand-teal"
        />
        <StatCard
          label="Active Sessions"
          value="—"
          icon={Activity}
          trend="neutral"
          trendLabel="loading"
          iconColor="bg-blue-50"
          iconText="text-blue-600"
        />
        <StatCard
          label="Security Alerts"
          value="0"
          icon={ShieldCheck}
          trend="up"
          trendLabel="All clear"
          iconColor="bg-emerald-50"
          iconText="text-emerald-600"
        />
        <StatCard
          label="System Errors"
          value="0"
          icon={AlertCircle}
          trend="up"
          trendLabel="No errors"
          iconColor="bg-brand-coral/10"
          iconText="text-brand-coral"
        />
      </div>

      {/* Quick actions */}
      <QuickActions actions={QUICK_ACTIONS} />

      {/* Placeholder — wired to real data in Phase 7 */}
      <div className="grid md:grid-cols-2 gap-4">
        <PlaceholderWidget title="User Activity" sub="Login trends — wired in Phase 7" h="h-48" />
        <PlaceholderWidget
          title="Recent Announcements"
          sub="Latest posts — wired in Phase 3"
          h="h-48"
        />
      </div>
    </div>
  )
}

// Shared placeholder widget used across all dashboards
export function PlaceholderWidget({
  title,
  sub,
  h = 'h-40',
}: {
  title: string
  sub: string
  h?: string
}) {
  return (
    <div
      className={`bg-surface border border-base rounded-xl p-5 ${h} flex flex-col justify-between`}
    >
      <div>
        <p className="font-heading font-semibold text-sm text-brand-navy">{title}</p>
        <p className="text-xs text-muted mt-1">{sub}</p>
      </div>
      <div className="space-y-2">
        <div className="skeleton h-3 w-full rounded" />
        <div className="skeleton h-3 w-4/5 rounded" />
        <div className="skeleton h-3 w-3/5 rounded" />
      </div>
    </div>
  )
}
