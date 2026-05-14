import {
  Banknote,
  TrendingUp,
  TrendingDown,
  Clock,
  PlusCircle,
  FileText,
  Users,
  Receipt,
} from 'lucide-react'
import { StatCard } from '@/components/shared/StatCard'
import { QuickActions } from '@/components/shared/QuickActions'
import { PlaceholderWidget } from '@/components/dashboards/AdminDashboard'
import type { QuickAction } from '@/components/shared/QuickActions'

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Record Payment',
    href: '/finances/payments/new',
    icon: PlusCircle,
    color: 'bg-brand-teal/10',
    text: 'text-brand-teal',
  },
  {
    label: 'Generate Receipt',
    href: '/finances/receipts',
    icon: Receipt,
    color: 'bg-emerald-50',
    text: 'text-emerald-600',
  },
  {
    label: 'Fee Reports',
    href: '/reports',
    icon: FileText,
    color: 'bg-blue-50',
    text: 'text-blue-600',
  },
  {
    label: 'Student Balances',
    href: '/finances',
    icon: Users,
    color: 'bg-brand-amber/10',
    text: 'text-brand-amber',
  },
]

export function FinanceDashboard() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Collected"
          value="MWK —"
          icon={Banknote}
          trend="neutral"
          trendLabel="this term"
          iconColor="bg-emerald-50"
          iconText="text-emerald-600"
        />
        <StatCard
          label="Outstanding Fees"
          value="MWK —"
          icon={TrendingDown}
          trend="neutral"
          trendLabel="unpaid"
          iconColor="bg-brand-coral/10"
          iconText="text-brand-coral"
        />
        <StatCard
          label="Total Income"
          value="MWK —"
          icon={TrendingUp}
          trend="neutral"
          trendLabel="this month"
          iconColor="bg-brand-teal/10"
          iconText="text-brand-teal"
        />
        <StatCard
          label="Pending Payroll"
          value="—"
          icon={Clock}
          trend="neutral"
          trendLabel="staff"
          iconColor="bg-brand-amber/10"
          iconText="text-brand-amber"
        />
      </div>
      <QuickActions actions={QUICK_ACTIONS} />
      <div className="grid md:grid-cols-2 gap-4">
        <PlaceholderWidget
          title="Fee Collection vs Target"
          sub="ApexCharts radial bar — wired in Phase 4"
          h="h-56"
        />
        <PlaceholderWidget
          title="Income vs Expenses"
          sub="Monthly comparison — wired in Phase 4"
          h="h-56"
        />
      </div>
    </div>
  )
}
