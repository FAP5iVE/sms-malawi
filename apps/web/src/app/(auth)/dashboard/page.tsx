'use client'

/**
 * apps/web/src/app/(auth)/dashboard/page.tsx
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]: (1) The nine relative '../../../' imports converted to the
 *   project's @/ alias (sms-erp-constraints import convention — this was
 *   the only page still using relative paths into src roots). (2) The
 *   greeting was hardcoded to "Good morning" regardless of wall-clock
 *   time — now derived from the hour, the same hardcoded-display-value
 *   class of defect this phase removes from the dashboards themselves.
 *   Judgment call, flagged: the greeting fix is not in R15's literal
 *   change list, but it is a hardcoded user-visible value on the exact
 *   surface this phase rewrites, and leaving it would fail the phase's
 *   own no-hardcoded-values output standard on a file already being
 *   edited.
 * [DEPENDS ON]: W/components/dashboards/* (this phase's rewrites)
 */

import { Hand } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { AdminDashboard } from '@/components/dashboards/AdminDashboard'
import { HighRankDashboard } from '@/components/dashboards/HighRankDashboard'
import { FinanceDashboard } from '@/components/dashboards/FinanceDashboard'
import { LibraryDashboard } from '@/components/dashboards/LibraryDashboard'
import { LowerRankDashboard } from '@/components/dashboards/LowerRankDashboard'
import { AcademicDashboard } from '@/components/dashboards/AcademicDashboard'
import { HRDashboard } from '@/components/dashboards/HRDashboard'
import { ExamOfficerDashboard } from '@/components/dashboards/ExamOfficerDashboard'
import { StudentDashboard } from '@/components/dashboards/StudentDashboard'

/** Time-of-day greeting: morning until noon, afternoon until 17:00, evening after. */
function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

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
        <h1 className="font-heading text-2xl font-bold text-brand-navy flex items-center gap-2">
          {greetingForHour(new Date().getHours())}, {displayName}
          <Hand className="w-5 h-5 text-brand-amber" aria-hidden />
        </h1>
        <p className="text-muted text-sm mt-0.5">
          {/* [PRODUCTION FIX 2026-07-28] subtitle (a real per-staff job
              title, e.g. "Head Teacher") is null for many roles — the old
              `{subtitle} · {role}` concatenation then rendered as a bare
              "· exam officer" with nothing before the bullet, looking like
              a leftover hardcoded fragment. Only show the bullet+role when
              there's an actual subtitle to pair it with. */}
          {subtitle ? <>{subtitle} · {role?.replace('_', ' ')}</> : role?.replace('_', ' ')}
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