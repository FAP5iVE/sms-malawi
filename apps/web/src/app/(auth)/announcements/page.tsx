'use client'

import { useState } from 'react'
import { useAnnouncements } from '@/hooks/useAnnouncements'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { Bell, PlusCircle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

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
  const { announcements, loading } = useAnnouncements()
  const [showForm, setShowForm] = useState(false)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-brand-navy">Announcements</h1>
          <p className="text-sm text-muted mt-0.5">School-wide notices and updates</p>
        </div>
        <RoleGuard allowed={['admin', 'high_rank', 'academic', 'lower_rank', 'hr', 'exam_officer']}>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-brand-teal text-white px-4 py-2 rounded-lg text-sm font-heading font-semibold hover:bg-brand-teal-light transition-colors"
          >
            <PlusCircle className="w-4 h-4" /> New Announcement
          </button>
        </RoleGuard>
      </div>

      {loading ? (
        Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-24 rounded-xl" />
        ))
      ) : announcements.length === 0 ? (
        <div className="bg-surface border border-base rounded-xl p-12 text-center">
          <Bell className="w-8 h-8 text-muted mx-auto mb-3 opacity-40" />
          <p className="font-heading font-semibold text-brand-navy">No announcements yet</p>
          <p className="text-sm text-muted mt-1">Published notices will appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <div key={a.id} className="bg-surface border border-base rounded-xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-heading font-semibold text-brand-navy">{a.title}</p>
                  <p className="text-sm text-muted mt-1 leading-relaxed">{a.body}</p>
                </div>
                <span className="text-xs text-muted whitespace-nowrap">
                  {a.createdAt?.seconds
                    ? formatDistanceToNow(new Date(a.createdAt.seconds * 1000), { addSuffix: true })
                    : 'just now'}
                </span>
              </div>
              <div className="flex gap-2 mt-3">
                {a.targetAll && (
                  <span className="text-xs bg-brand-navy/8 text-brand-navy px-2 py-0.5 rounded-full font-medium">
                    Everyone
                  </span>
                )}
                {a.targetRoles?.map((r: string) => (
                  <span
                    key={r}
                    className="text-xs bg-brand-teal/10 text-brand-teal px-2 py-0.5 rounded-full font-medium"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
