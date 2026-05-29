'use client'
import { useState } from 'react'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { useAuthStore } from '@/store/authStore'
import {
  useAdminReport, useSchoolReport, useFinanceReport, useLibraryReport,
  useHRReport, useAcademicReport, useExamOfficerReport, useStudentReport, useAuditLog
} from '@/hooks/useReports'
import type {
  ApiAdminReport,
  ApiSchoolReport,
  ApiFinanceReport,
  ApiLibraryReport,
  ApiExamReport,
  ApiStudentReport,
  ApiAuditLogResponse,
  ApiAuditLogEntry,
  ApiTermResult,
} from '@shared/types/api'  // adjust path to wherever api.ts lives
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { FileText, TrendingUp, AlertTriangle } from 'lucide-react'

export default function ReportsPage() {
  return (
    <RoleGuard allowed={['admin','high_rank','finance','library','hr','academic','exam_officer','student']}>
      <ReportsContent />
    </RoleGuard>
  )
}

function ReportsContent() {
  const { role, user } = useAuthStore()
  const [year]  = useState('2025/2026')
  const [term, setTerm]  = useState(1)

  // Only fetch what the current role can see
  const isAdmin     = role === 'admin'
  const isHighRank  = role === 'high_rank'
  const isFinance   = role === 'finance'
  const isLibrary   = role === 'library'
  const isHR        = role === 'hr'
  const isAcademic  = role === 'academic'
  const isExamOfficer = role === 'exam_officer'
  const isStudent   = role === 'student'

  const { data: adminData }       = useAdminReport()
  const { data: schoolData }      = useSchoolReport(year, term)
  const { data: financeData }     = useFinanceReport(year, term)
  const { data: libraryData }     = useLibraryReport()
  const { data: hrData }          = useHRReport()
  const { data: academicData }    = useAcademicReport(year)
  const { data: examData }        = useExamOfficerReport(year, term)
  const { data: studentData }     = useStudentReport(user?.uid ?? '')
  const { data: auditData }       = useAuditLog({ page: 1})

 const admin        = adminData     as ApiAdminReport         | undefined
 const school       = schoolData    as ApiSchoolReport        | undefined
 const fin          = financeData   as ApiFinanceReport       | undefined
 const lib          = libraryData   as ApiLibraryReport       | undefined
 const exam         = examData      as ApiExamReport          | undefined
 const stu          = studentData   as ApiStudentReport       | undefined
 const audit        = auditData     as ApiAuditLogResponse    | undefined
 const hr           = hrData        as unknown       | undefined
 const academic     = academicData  as unknown    | undefined

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-brand-navy">Reports</h1>
          <p className="text-sm text-muted mt-0.5">Your personalised reports and analytics</p>
        </div>
        <div className="flex items-center gap-3">
        <select
            value={term}
            onChange={(e) => setTerm(Number(e.target.value))}
            aria-label="Select term"
            className="border border-base rounded-xl px-3 py-2 text-sm focus:outline-none">
            {[1,2,3].map((t) => <option key={t} value={t}>Term {t}</option>)}
          </select>
        </div>
      </div>

      {isAdmin && admin && (
        <div className="space-y-4">
          <h2 className="font-heading font-semibold text-brand-navy flex items-center gap-2"><TrendingUp className="w-4 h-4" /> System Overview</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Total Students', value: admin.totalStudents },
              { label: 'Active Students', value: admin.activeStudents },
              { label: 'Active Staff',    value: admin.totalStaff },
              { label: 'Invoices',         value: admin.totalInvoices },
              { label: 'Paid Invoices',    value: admin.paidInvoices },
              { label: 'Total Exams',      value: admin.totalExams },
            ].map(({ label, value }) => (
              <div key={label} className="bg-surface border border-base rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-brand-navy">{value}</p>
                <p className="text-xs text-muted mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {(isAdmin || isHighRank) && school?.overall && (
        <div className="space-y-4">
          <h2 className="font-heading font-semibold text-brand-navy">School Performance — Term {term}</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-surface border border-base rounded-xl p-5 text-center">
              <p className="text-3xl font-bold text-brand-teal">{school.overall.passRate}%</p>
              <p className="text-xs text-muted mt-1">Overall Pass Rate</p>
            </div>
            <div className="bg-surface border border-base rounded-xl p-5 text-center">
              <p className="text-3xl font-bold text-brand-navy">{school.overall.average}%</p>
              <p className="text-xs text-muted mt-1">School Average</p>
            </div>
            <div className="bg-surface border border-base rounded-xl p-5 text-center">
              <p className="text-3xl font-bold text-brand-amber">{school.overall.total}</p>
              <p className="text-xs text-muted mt-1">Students Assessed</p>
            </div>
          </div>
          {school.classStats && (
            <div className="bg-surface border border-base rounded-xl p-5">
              <h3 className="font-semibold text-brand-navy mb-4">Enrolment by Class</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={school.classStats}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="_count.students" fill="#0E8A6A" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {(isAdmin || isHighRank || isFinance) && fin && (
        <div className="space-y-4">
          <h2 className="font-heading font-semibold text-brand-navy">Fee Collection</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Collected',       value: `MWK ${fin.collected?.toLocaleString()}` },
              { label: 'Outstanding',     value: `MWK ${fin.outstanding?.toLocaleString()}`, warn: true },
              { label: 'Target',          value: `MWK ${fin.target?.toLocaleString()}` },
              { label: 'Collection %',    value: `${fin.collectionPct}%` },
            ].map(({ label, value, warn }) => (
              <div key={label} className={`bg-surface border rounded-xl p-4 text-center ${warn ? 'border-brand-coral/30' : 'border-base'}`}>
                <p className={`text-xl font-bold ${warn ? 'text-brand-coral' : 'text-brand-navy'}`}>{value}</p>
                <p className="text-xs text-muted mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {(isAdmin || isHighRank || isLibrary) && lib && (
        <div className="space-y-3">
          <h2 className="font-heading font-semibold text-brand-navy">Library Status</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Books',      value: lib.stats?._sum?.totalCopies ?? 0 },
              { label: 'Available',        value: lib.stats?._sum?.availableCopies ?? 0 },
              { label: 'Overdue',          value: lib.overdueBorrowings?.length ?? 0, warn: (lib.overdueBorrowings?.length ?? 0) > 0 },
              { label: 'Pending Approvals', value: lib.pendingApprovals ?? 0 },
            ].map(({ label, value, warn }) => (
              <div key={label} className={`bg-surface border rounded-xl p-4 text-center ${warn ? 'border-brand-amber/30 bg-amber-50/50' : 'border-base'}`}>
                <p className={`text-2xl font-bold ${warn ? 'text-brand-amber' : 'text-brand-navy'}`}>{value}</p>
                <p className="text-xs text-muted mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {(isAdmin || isExamOfficer) && exam && (
        <div className="space-y-3">
          <h2 className="font-heading font-semibold text-brand-navy">Exam Status — Term {term}</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-amber-700">{exam.pendingMarks}</p>
              <p className="text-xs text-amber-600 mt-1">Pending Marks Entry</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-green-700">{exam.approvedResults}</p>
              <p className="text-xs text-green-600 mt-1">Results Approved</p>
            </div>
            <div className="bg-surface border border-base rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-brand-navy">{exam.manebRecords?.length ?? 0}</p>
              <p className="text-xs text-muted mt-1">MANEB Records</p>
            </div>
          </div>
        </div>
      )}

      {isStudent && stu && (
        <div className="space-y-3">
          <h2 className="font-heading font-semibold text-brand-navy">My Academic Summary</h2>
          <div className="border border-base rounded-xl overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead><tr className="bg-page border-b border-base">
                {['Year','Term','Average','Grade','Position','Result'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted uppercase">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-base">
                {stu.results.map((r: Pick<ApiTermResult, 'id'|'academicYear'|'term'|'average'|'grade'|'position'|'passStatus'>) => (
                  <tr key={r.id} className="hover:bg-page">
                    <td className="px-4 py-3">{r.academicYear}</td>
                    <td className="px-4 py-3">Term {r.term}</td>
                    <td className="px-4 py-3 font-medium">{Number(r.average).toFixed(1)}%</td>
                    <td className="px-4 py-3 font-bold text-brand-navy">{r.grade}</td>
                    <td className="px-4 py-3">{r.position ? `#${r.position}` : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.passStatus ? 'bg-green-50 text-green-700' : 'bg-brand-coral/10 text-brand-coral'}`}>
                        {r.passStatus ? 'Pass' : 'Fail'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isAdmin && audit && (
        <div className="space-y-3">
          <h2 className="font-heading font-semibold text-brand-navy flex items-center gap-2"><FileText className="w-4 h-4" /> Recent Audit Log</h2>
          <div className="border border-base rounded-xl overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead><tr className="bg-page border-b border-base">
                {['Action','Entity','Actor','Role','Time'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted uppercase">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-base">
                {audit.logs.map((log: ApiAuditLogEntry) => (
                  <tr key={log.id} className="hover:bg-page">
                    <td className="px-4 py-3 font-mono text-xs text-brand-teal">{log.action}</td>
                    <td className="px-4 py-3 text-xs">{log.entityType} · <span className="text-muted">{log.entityId.slice(0,8)}</span></td>
                    <td className="px-4 py-3 font-mono text-xs">{log.actorUid.slice(0,8)}</td>
                    <td className="px-4 py-3"><span className="text-xs bg-base rounded px-2 py-0.5">{log.actorRole}</span></td>
                    <td className="px-4 py-3 text-xs text-muted">{new Date(log.createdAt).toLocaleString('en-MW')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}