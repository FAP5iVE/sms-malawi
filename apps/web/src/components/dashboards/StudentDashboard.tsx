import {
  BookOpen,
  Banknote,
  GraduationCap,
  Library,
  Clock,
  Bell,
  BarChart3,
  AlertCircle,
} from 'lucide-react'
import { StatCard } from '@/components/shared/StatCard'
import { QuickActions } from '@/components/shared/QuickActions'
import { PlaceholderWidget } from '@/components/dashboards/AdminDashboard'
import type { QuickAction } from '@/components/shared/QuickActions'
import { StudentResultsView } from '@/components/exams/StudentResultsView'
import { useAuthStore } from '@/store/authStore'


const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'My Timetable',
    href: '/timetable',
    icon: Clock,
    color: 'bg-brand-teal/10',
    text: 'text-brand-teal',
  },
  { label: 'Library', href: '/library', icon: Library, color: 'bg-blue-50', text: 'text-blue-600' },
  {
    label: 'My Results',
    href: '/exams',
    icon: BarChart3,
    color: 'bg-purple-50',
    text: 'text-purple-600',
  },
  {
    label: 'Announcements',
    href: '/announcements',
    icon: Bell,
    color: 'bg-brand-amber/10',
    text: 'text-brand-amber',
  },
]

export function StudentDashboard() {
  const { role, user } = useAuthStore()
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="My Class"
          value="—"
          icon={BookOpen}
          trend="neutral"
          trendLabel="current form"
          iconColor="bg-brand-navy/8"
          iconText="text-brand-navy"
        />
        <StatCard
          label="Books Borrowed"
          value="—"
          icon={Library}
          trend="neutral"
          trendLabel="from library"
          iconColor="bg-blue-50"
          iconText="text-blue-600"
        />
        <StatCard
          label="Fees Balance"
          value="MWK —"
          icon={Banknote}
          trend="neutral"
          trendLabel="outstanding"
          iconColor="bg-brand-amber/10"
          iconText="text-brand-amber"
        />
        <StatCard
          label="Upcoming Exams"
          value="—"
          icon={GraduationCap}
          trend="neutral"
          trendLabel="this week"
          iconColor="bg-brand-teal/10"
          iconText="text-brand-teal"
        />
      </div>

      {/* Fee-gated exam results notice — always visible so student knows fees block results */}
      <div className="bg-brand-amber/10 border border-brand-amber/30 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-brand-amber shrink-0 mt-0.5" />
        <div>
          <p className="font-heading font-semibold text-sm text-brand-navy">
            Exam results are linked to your fee balance
          </p>
          <p className="text-xs text-muted mt-1">
            Your results will be visible once all outstanding fees for the term are cleared. Visit
            the Finances page to view your balance.
          </p>
        </div>
      </div>

      <QuickActions actions={QUICK_ACTIONS} />
      <div className="grid md:grid-cols-2 gap-4">
        <PlaceholderWidget
          title="Today's Timetable"
          sub="Daily schedule — wired in Phase 3"
          h="h-56"
        />
        <PlaceholderWidget
          title="My Performance"
          sub="Class report chart — wired in Phase 5"
          h="h-56"
        />
      </div>
      <div className="bg-surface border border-base rounded-2xl p-5">
        <h3 className="font-heading font-semibold text-brand-navy mb-4">My Exam Results</h3>
        {user?.uid && <StudentResultsView studentId={user.uid} />}
      </div>
    </div>
  )
}
