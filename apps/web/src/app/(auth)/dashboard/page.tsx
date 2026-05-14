'use client'

import { useAuthStore } from '../../../store/authStore'
import { AdminDashboard } from '../../../components/dashboards/AdminDashboard'
import { HighRankDashboard } from '../../../components/dashboards/HighRankDashboard'
import { FinanceDashboard } from '../../../components/dashboards/FinanceDashboard'
import { LibraryDashboard } from '../../../components/dashboards/LibraryDashboard'
import { LowerRankDashboard } from '../../../components/dashboards/LowerRankDashboard'
import { AcademicDashboard } from '../../../components/dashboards/AcademicDashboard'
import { HRDashboard } from '../../../components/dashboards/HRDashboard'
import { ExamOfficerDashboard } from '../../../components/dashboards/ExamOfficerDashboard'
import { StudentDashboard } from '../../../components/dashboards/StudentDashboard'

export default function DashboardPage() {
  const { role, user, subtitle, initialized } = useAuthStore()

  // Show skeleton while auth initialises
  if (!initialized) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="skeleton h-9 w-72 rounded-lg" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-28 rounded-xl" />
          ))}
        </div>
        <div className="skeleton h-48 rounded-xl" />
      </div>
    )
  }

  const displayName = user?.displayName ?? user?.email?.split('@')[0] ?? 'there'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-brand-navy">
          Good morning, {displayName} 👋
        </h1>
        <p className="text-muted text-sm mt-0.5">
          {subtitle} · {role?.replace('_', ' ')}
        </p>
      </div>

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
