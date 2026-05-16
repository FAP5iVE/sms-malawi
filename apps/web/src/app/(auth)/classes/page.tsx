'use client'

import Link from 'next/link'
import { useClasses } from '@/hooks/useClasses'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { Users, BookOpen, ChevronRight } from 'lucide-react'

const FORM_COLORS = [
  'bg-blue-50 border-blue-200',
  'bg-teal-50 border-teal-200',
  'bg-purple-50 border-purple-200',
  'bg-amber-50 border-amber-200',
]

export default function ClassesPage() {
  return (
    <RoleGuard
      allowed={['admin', 'high_rank', 'lower_rank', 'academic', 'exam_officer', 'student']}
    >
      <ClassesContent />
    </RoleGuard>
  )
}

function ClassesContent() {
  const { data: classes, isLoading } = useClasses('2025/2026')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-bold text-brand-navy">Classes</h1>
        <p className="text-sm text-muted mt-0.5">Academic Year 2025/2026</p>
      </div>

      {[1, 2, 3, 4].map((form) => {
        const formClasses = classes?.filter((c) => c.form === form) ?? []
        return (
          <div key={form}>
            <h2 className="font-heading font-semibold text-sm text-brand-navy mb-3">Form {form}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {isLoading
                ? Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="skeleton h-28 rounded-xl" />
                  ))
                : formClasses.map((cls) => (
                    <Link
                      key={cls.id}
                      href={`/classes/${cls.id}`}
                      className={`border rounded-xl p-4 flex flex-col gap-3 hover:shadow-md transition-all ${FORM_COLORS[(form - 1) % 4]}`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-heading font-bold text-brand-navy">{cls.name}</p>
                          <p className="text-xs text-muted mt-0.5">
                            {cls.room ?? 'No room assigned'}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted mt-0.5" />
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="flex items-center gap-1.5 text-muted">
                          <Users className="w-3.5 h-3.5" />
                          {cls._count?.students ?? 0} students
                        </span>
                      </div>
                    </Link>
                  ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
