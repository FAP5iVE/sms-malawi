'use client'

import { useParams } from 'next/navigation'
import { useState } from 'react'
import { useRef } from 'react'
import { useReactToPrint } from 'react-to-print'
import { useStudent } from '@/hooks/useStudents'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { StudentForm } from '@/components/students/StudentForm'
import { ArrowLeft, AlertCircle, Pencil, Printer } from 'lucide-react'
import Link from 'next/link'

export default function StudentProfilePage() {
  return (
    <RoleGuard
      allowed={[
        'admin',
        'high_rank',
        'finance',
        'library',
        'lower_rank',
        'academic',
        'hr',
        'exam_officer',
      ]}
    >
      <ProfileContent />
    </RoleGuard>
  )
}

function ProfileContent() {
  const { id } = useParams<{ id: string }>()
  const { data: student, isLoading } = useStudent(id)
  const [editing, setEditing] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)
  const handlePrint = useReactToPrint({ contentRef: printRef })

  if (isLoading)
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-48 rounded-lg" />
        <div className="skeleton h-56 rounded-xl" />
      </div>
    )
  if (!student) return <p className="text-muted">Student not found.</p>

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href="/students"
          className="p-1.5 rounded-lg hover:bg-page border border-base"
          aria-label="Back to students"
        >
          <ArrowLeft className="w-4 h-4 text-muted" />
        </Link>
        <h1 className="font-heading text-xl font-bold text-brand-navy">
          {student.firstName} {student.lastName}
        </h1>
        <span className="ml-auto font-mono text-xs text-muted bg-page px-2 py-1 rounded border border-base">
          {student.registrationNo}
        </span>
        <RoleGuard allowed={['admin', 'high_rank', 'lower_rank']}>
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 border border-base px-3 py-1.5 rounded-lg text-sm hover:bg-page"
            aria-label="Edit student"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
        </RoleGuard>
        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 border border-base px-3 py-1.5 rounded-lg text-sm hover:bg-page"
        >
          <Printer className="w-3.5 h-3.5" /> Print
        </button>
      </div>

      <div ref={printRef}>
        <div className="grid md:grid-cols-2 gap-4">
          {/* Personal details card */}
          <div className="bg-surface border border-base rounded-xl p-5 space-y-3">
            <p className="font-heading font-semibold text-xs uppercase tracking-wide text-muted">
              Personal Details
            </p>
            {[
              ['Date of Birth', new Date(student.dateOfBirth).toLocaleDateString()],
              ['Sex', student.sex],
              ['Nationality', student.nationality],
              ['District', student.district],
              ['Village', student.village ?? '—'],
              ['Phone', student.phone ?? '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-muted">{label}</span>
                <span className="font-medium">{value}</span>
              </div>
            ))}
          </div>

          {/* Guardian + status card */}
          <div className="bg-surface border border-base rounded-xl p-5 space-y-3">
            <p className="font-heading font-semibold text-xs uppercase tracking-wide text-muted">
              Guardian & Status
            </p>
            {[
              ['Guardian', student.guardianName],
              ['Relation', student.guardianRelation],
              ['Guardian Phone', student.guardianPhone],
              ['Class', student.class?.name ?? '—'],
              ['Status', student.status],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-muted">{label}</span>
                <span className="font-medium">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Fee balance badge card */}
        <div className="bg-surface border border-base rounded-xl p-5 mt-4">
          <p className="font-heading font-semibold text-xs uppercase tracking-wide text-muted mb-3">
            Fee Status
          </p>
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-brand-amber" />
            <p className="text-sm text-muted">
              Fee balance visible after Finance module is complete. Check the Finances tab for
              outstanding invoices.
            </p>
          </div>
        </div>
      </div>

      {editing && <StudentForm studentId={id} onClose={() => setEditing(false)} />}
    </div>
  )
}
