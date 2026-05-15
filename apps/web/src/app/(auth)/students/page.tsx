"use client"

import { useState } from "react"
import { useStudents } from "@/hooks/useStudents"
import { RoleGuard }   from "@/components/shared/RoleGuard"
import { StudentForm } from "@/components/students/StudentForm"
import { UserPlus, Download, Filter } from "lucide-react"

export default function StudentsPage() {
  return (
    <RoleGuard allowed={["admin","high_rank","finance","library","lower_rank","academic","hr","exam_officer"]}>
      <StudentsContent />
    </RoleGuard>
  )
}

function StudentsContent() {
  const [showForm,    setShowForm]    = useState(false)
  const [filterOpen,  setFilterOpen]  = useState(false)
  const [statusFilter,setStatusFilter] = useState("ACTIVE")
  const [page,         setPage]        = useState(1)

  const { data, isLoading } = useStudents({ status: statusFilter, page })

  return (
    <div className="space-y-5">

      {/* Page header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl font-bold text-brand-navy">Students</h1>
          <p className="text-sm text-muted mt-0.5">
            {data?.total ?? "—"} students {statusFilter === "ACTIVE" ? "enrolled" : "total"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RoleGuard allowed={["admin","high_rank","lower_rank"]}>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-brand-teal text-white px-4 py-2 rounded-lg text-sm font-heading font-semibold hover:bg-brand-teal-light transition-colors"
            >
              <UserPlus className="w-4 h-4" /> Add Student
            </button>
          </RoleGuard>
          <button
            onClick={() => setFilterOpen(!filterOpen)}
            className="flex items-center gap-2 border border-base bg-surface px-4 py-2 rounded-lg text-sm font-medium hover:bg-page transition-colors"
          >
            <Filter className="w-4 h-4" /> Filters
          </button>
        </div>
      </div>

      {/* Quick status filter chips */}
      <div className="flex gap-2 flex-wrap">
        {["ACTIVE","ARCHIVED","AWAITING_MANEB_RESULTS","GRADUATED"].map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={[
              "px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
              statusFilter === s
                ? "bg-brand-navy text-white border-brand-navy"
                : "bg-surface border-base text-muted hover:border-brand-navy",
            ].join(" ")}
          >
            {s.replace("_"," ")}
          </button>
        ))}
      </div>

      {/* Student table */}
      <div className="bg-surface border border-base rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-base bg-page">
              <th className="text-left px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wide text-muted">Name</th>
              <th className="text-left px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wide text-muted">Reg No</th>
              <th className="text-left px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wide text-muted">Class</th>
              <th className="text-left px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wide text-muted">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 8 }).map((_,i) => (
                  <tr key={i} className="border-b border-base">
                    {Array.from({ length: 5 }).map((__,j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="skeleton h-4 rounded w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              : data?.students.map((student) => (
                  <tr key={student.id} className="border-b border-base hover:bg-page transition-colors">
                    <td className="px-4 py-3 font-medium">
                      {student.firstName} {student.lastName}
                    </td>
                    <td className="px-4 py-3 text-muted font-mono text-xs tabular">
                      {student.registrationNo}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {student.class?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={student.status} />
                    </td>
                    <td className="px-4 py-3">
                      <a href={`/students/${student.id}`} className="text-brand-teal text-xs font-medium hover:underline">
                        View
                      </a>
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table>

        {/* Pagination */}
        {data && data.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-base">
            <p className="text-xs text-muted">Page {page} of {data.pages}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-xs border border-base rounded-lg disabled:opacity-40 hover:bg-page"
              >Previous</button>
              <button
                onClick={() => setPage(p => Math.min(data.pages, p + 1))}
                disabled={page === data.pages}
                className="px-3 py-1 text-xs border border-base rounded-lg disabled:opacity-40 hover:bg-page"
              >Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Add student slide-over */}
      {showForm && <StudentForm onClose={() => setShowForm(false)} />}

    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string,string> = {
    ACTIVE:                 "bg-emerald-50 text-emerald-700 border-emerald-200",
    ARCHIVED:               "bg-gray-100 text-gray-500 border-gray-200",
    AWAITING_MANEB_RESULTS: "bg-blue-50 text-blue-700 border-blue-200",
    GRADUATED:              "bg-purple-50 text-purple-700 border-purple-200",
  }
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${styles[status] ?? styles.ACTIVE}`}>
      {status.replace("_"," ")}
    </span>
  )
}