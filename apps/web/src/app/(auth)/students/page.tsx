'use client'

import { useState } from 'react'
import { useStudents, useArchiveStudent } from '@/hooks/useStudents'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { StudentForm } from '@/components/students/StudentForm'
import { DataTable } from '@/components/shared/DataTable'
import type { DataColumn } from '@/components/shared/DataTable'
import type { ApiStudent } from '@shared/types/api'
import { UserPlus } from 'lucide-react'

type Student = ApiStudent

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-brand-teal/15 text-brand-teal',
  ARCHIVED: 'bg-base text-muted',
  AWAITING_MANEB_RESULTS: 'bg-blue-50 text-blue-700',
  GRADUATED: 'bg-brand-purple/15 text-brand-purple',
}

const COLUMNS: DataColumn<Student>[] = [
  { key: 'registrationNo', label: 'Reg No', sortable: true, width: 'w-32' },
  {
    key: 'firstName',
    label: 'Student',
    sortable: true,
    render: (s: Student) => (
      <div>
        <p className="font-medium text-body">
          {s.firstName} {s.lastName}
        </p>
        <p className="text-xs text-muted">{s.sex}</p>
      </div>
    ),
  },
  {
    key: 'class',
    label: 'Class',
    sortable: false,
    render: (s: Student) => <span className="text-sm">{s.class?.name ?? '—'}</span>,
  },
  {
    key: 'status',
    label: 'Status',
    sortable: true,
    render: (s: Student) => (
      <span
        className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[s.status] ?? 'bg-base text-muted'}`}
      >
        {s.status.replace(/_/g, ' ')}
      </span>
    ),
  },
]

const QUICK_FILTERS = [
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Graduated', value: 'GRADUATED' },
  { label: 'Awaiting MANEB', value: 'AWAITING_MANEB_RESULTS' },
  { label: 'Archived', value: 'ARCHIVED' },
]

export default function StudentsPage() {
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
      <StudentsContent />
    </RoleGuard>
  )
}

function StudentsContent() {
  const [showForm, setShowForm] = useState(false)
  const [status, setStatus] = useState('ACTIVE')
  const [page, setPage] = useState(1)
  const { data, isLoading } = useStudents({ status, page })
  const archive = useArchiveStudent()

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl font-bold text-brand-navy">Students</h1>
          <p className="text-sm text-muted mt-0.5">{data?.total ?? '—'} students</p>
        </div>
        <RoleGuard allowed={['admin', 'high_rank', 'lower_rank']}>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-brand-teal text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-brand-teal-light transition-colors"
          >
            <UserPlus className="w-4 h-4" /> Add Student
          </button>
        </RoleGuard>
      </div>

      <DataTable<Student>
        data={data?.students ?? []}
        isLoading={isLoading}
        columns={COLUMNS}
        quickFilters={QUICK_FILTERS}
        activeQuickFilter={status}
        onQuickFilter={(v) => {
          setStatus(v)
          setPage(1)
        }}
        rowKey="id"
        onBulkArchive={(ids) => ids.forEach((id) => archive.mutate(id))}
        pagination={{ page, pages: data?.pages ?? 1, onPageChange: setPage }}
      />

      {showForm && <StudentForm onClose={() => setShowForm(false)} />}
    </div>
  )
}
