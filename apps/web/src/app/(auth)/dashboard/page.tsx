'use client'

import { useAuthStore } from '@/store/authStore'

/*
  skeleton dashboard per role.
  Each role section will be replaced with a
  full dashboard component in subsequent steps.
*/

export default function DashboardPage() {
  const { role, user, subtitle, initialized } = useAuthStore()

  if (!initialized) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-10 w-64 rounded-lg" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-28 rounded-xl" />
          ))}
        </div>
        <div className="skeleton h-64 rounded-xl" />
      </div>
    )
  }

  const displayName = user?.displayName ?? 'there'

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-brand-navy">
          Good morning, {displayName} 👋
        </h1>
        <p className="text-muted text-sm mt-1">
          {subtitle} · {role?.replace('_', ' ')}
        </p>
      </div>

      {/* Role-specific dashboard content
           Each case will be replaced with a full dashboard component */}
      {role === 'admin' && <AdminDashboard />}
      {role === 'high_rank' && <HighRankDashboard />}
      {role === 'finance' && <FinanceDashboard />}
      {role === 'library' && <LibraryDashboard />}
      {role === 'lower_rank' && <LowerRankDashboard />}
      {role === 'academic' && <AcademicDashboard />}
      {role === 'hr' && <HRDashboard />}
      {role === 'exam_officer' && <ExamOfficerDashboard />}
      {role === 'student' && <StudentDashboard />}
    </div>
  )
}

/* ── Placeholder dashboard components ──────────────────────
   These will each be moved to their own file and fully built
   out with charts, widgets, and quick actions
   ────────────────────────────────────────────────────────── */

function DashboardPlaceholder({ label }: { label: string }) {
  return (
    <div className="border border-base rounded-xl p-8 bg-surface text-center">
      <p className="font-heading font-semibold text-brand-navy">{label}</p>
      <p className="text-muted text-sm mt-1">Dashboard widgets loading…</p>
      <div className="grid grid-cols-3 gap-3 mt-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-24 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

const AdminDashboard = () => <DashboardPlaceholder label="Admin Dashboard" />
const HighRankDashboard = () => <DashboardPlaceholder label="High Rank Staff Dashboard" />
const FinanceDashboard = () => <DashboardPlaceholder label="Finance Dashboard" />
const LibraryDashboard = () => <DashboardPlaceholder label="Library Staff Dashboard" />
const LowerRankDashboard = () => <DashboardPlaceholder label="Lower Rank Staff Dashboard" />
const AcademicDashboard = () => <DashboardPlaceholder label="Academic Staff Dashboard" />
const HRDashboard = () => <DashboardPlaceholder label="HR Dashboard" />
const ExamOfficerDashboard = () => <DashboardPlaceholder label="Exam Officer Dashboard" />
const StudentDashboard = () => <DashboardPlaceholder label="Student Dashboard" />
