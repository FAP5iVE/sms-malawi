import {
  Users,
  Clock,
  AlertTriangle,
  Banknote,
  UserPlus,
  CheckCircle,
  CalendarDays,
  FileText,
} from 'lucide-react'
import { StatCard } from '@/components/shared/StatCard'
import { QuickActions } from '@/components/shared/QuickActions'
import { PlaceholderWidget } from '@/components/dashboards/AdminDashboard'
import type { QuickAction } from '@/components/shared/QuickActions'

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Approve Leave',
    href: '/hr/leave',
    icon: CheckCircle,
    color: 'bg-brand-teal/10',
    text: 'text-brand-teal',
  },
  {
    label: 'Add Staff',
    href: '/hr/staff/new',
    icon: UserPlus,
    color: 'bg-blue-50',
    text: 'text-blue-600',
  },
  {
    label: 'Leave Calendar',
    href: '/calendar',
    icon: CalendarDays,
    color: 'bg-brand-amber/10',
    text: 'text-brand-amber',
  },
  {
    label: 'HR Reports',
    href: '/reports',
    icon: FileText,
    color: 'bg-brand-navy/8',
    text: 'text-brand-navy',
  },
]

export function HRDashboard() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
          label="Leave Requests"
          value="—"
          icon={Clock}
          trend="neutral"
          trendLabel="pending review"
          iconColor="bg-brand-amber/10"
          iconText="text-brand-amber"
        />
        <StatCard
          label="Contract Expiries"
          value="—"
          icon={AlertTriangle}
          trend="neutral"
          trendLabel="within 60 days"
          iconColor="bg-brand-coral/10"
          iconText="text-brand-coral"
        />
        <StatCard
          label="Pending Loan Approvals"
          value="—"
          icon={Banknote}
          trend="neutral"
          trendLabel="awaiting"
          iconColor="bg-blue-50"
          iconText="text-blue-600"
        />
      </div>
      <QuickActions actions={QUICK_ACTIONS} />
      <div className="grid md:grid-cols-2 gap-4">
        <PlaceholderWidget
          title="Contract Expiry Alerts"
          sub="60 / 30 / 7 day warnings — wired in Phase 6"
        />
        <PlaceholderWidget
          title="Staff Leave Calendar"
          sub="Who is off this week — wired in Phase 6"
        />
      </div>
    </div>
  )
}
