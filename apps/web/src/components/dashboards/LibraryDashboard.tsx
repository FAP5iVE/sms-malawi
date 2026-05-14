import {
  BookOpen,
  BookX,
  BookCheck,
  Library,
  PlusCircle,
  RotateCcw,
  Search,
  FileText,
} from 'lucide-react'
import { StatCard } from '@/components/shared/StatCard'
import { QuickActions } from '@/components/shared/QuickActions'
import { PlaceholderWidget } from '@/components/dashboards/AdminDashboard'
import type { QuickAction } from '@/components/shared/QuickActions'

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Issue Book',
    href: '/library/issue',
    icon: PlusCircle,
    color: 'bg-brand-teal/10',
    text: 'text-brand-teal',
  },
  {
    label: 'Return Book',
    href: '/library/return',
    icon: RotateCcw,
    color: 'bg-blue-50',
    text: 'text-blue-600',
  },
  {
    label: 'Search Catalog',
    href: '/library',
    icon: Search,
    color: 'bg-brand-amber/10',
    text: 'text-brand-amber',
  },
  {
    label: 'Library Report',
    href: '/reports',
    icon: FileText,
    color: 'bg-brand-navy/8',
    text: 'text-brand-navy',
  },
]

export function LibraryDashboard() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Books"
          value="—"
          icon={Library}
          trend="neutral"
          trendLabel="in catalog"
          iconColor="bg-brand-navy/8"
          iconText="text-brand-navy"
        />
        <StatCard
          label="Currently Borrowed"
          value="—"
          icon={BookOpen}
          trend="neutral"
          trendLabel="checked out"
          iconColor="bg-brand-teal/10"
          iconText="text-brand-teal"
        />
        <StatCard
          label="Overdue Books"
          value="—"
          icon={BookX}
          trend="neutral"
          trendLabel="past due"
          iconColor="bg-brand-coral/10"
          iconText="text-brand-coral"
        />
        <StatCard
          label="Returned Today"
          value="—"
          icon={BookCheck}
          trend="neutral"
          trendLabel="today"
          iconColor="bg-emerald-50"
          iconText="text-emerald-600"
        />
      </div>
      <QuickActions actions={QUICK_ACTIONS} />
      <div className="grid md:grid-cols-2 gap-4">
        <PlaceholderWidget title="Borrow Trends" sub="Weekly activity — wired in Phase 6" />
        <PlaceholderWidget title="Overdue Students" sub="List by class — wired in Phase 6" />
      </div>
    </div>
  )
}
