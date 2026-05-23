'use client'

import { useState } from 'react'
import { useAnnouncements } from '@/hooks/useAnnouncements'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { AnnouncementForm } from '@/components/announcements/AnnouncementForm'
import { useAuthStore } from '@/store/authStore'
import { Bell, PlusCircle, Megaphone } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default function AnnouncementsPage() {
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
        'student',
      ]}
    >
      <AnnouncementsContent />
    </RoleGuard>
  )
}

function AnnouncementsContent() {
  const { announcements, loading: isLoading } = useAnnouncements()
  const { role } = useAuthStore()
  const [showForm, setShowForm] = useState(false)

  const canCreate = role !== 'student'

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-brand-teal" />
          <h1 className="font-heading font-bold text-xl text-brand-navy">Announcements</h1>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-brand-teal text-white px-4 py-2 rounded-xl text-sm font-heading font-semibold hover:bg-brand-teal-light transition-colors"
          >
            <PlusCircle className="w-4 h-4" /> New Announcement
          </button>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-surface animate-pulse" />
          ))}
        </div>
      ) : announcements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted">
          <Bell className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">No announcements yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <div key={a.id} className="bg-surface border border-base rounded-2xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-heading font-semibold text-body">{a.title}</h3>
                  <p className="text-sm text-muted mt-1 leading-relaxed">{a.body}</p>
                </div>
                <span
                  className={`text-[10px] font-heading font-bold px-2.5 py-1 rounded-full ${
                    a.status === 'PUBLISHED'
                      ? 'bg-brand-teal/15 text-brand-teal'
                      : a.status === 'PENDING_APPROVAL'
                        ? 'bg-brand-amber/15 text-brand-amber'
                        : 'bg-base text-muted'
                  }`}
                >
                  {a.status}
                </span>
              </div>
              {a.createdAt && (
                <p className="text-[10px] text-muted mt-3 font-sans">
                  {new Date(a.createdAt.toDate?.() ?? a.createdAt).toLocaleDateString()}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && <AnnouncementForm onClose={() => setShowForm(false)} />}
    </div>
  )
}
