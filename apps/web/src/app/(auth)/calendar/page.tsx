'use client'

import { useEffect, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { MALAWI_PUBLIC_HOLIDAYS_2026 } from '@shared/constants/malawi'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'

type CalEvent = {
  id: string
  title: string
  start: string
  end?: string
  color: string
  allDay?: boolean
}

const HOLIDAY_EVENTS: CalEvent[] = MALAWI_PUBLIC_HOLIDAYS_2026.map((h) => ({
  id: `holiday-${h.date}`,
  title: h.name,
  start: h.date,
  color: '#6B3FA0',
  allDay: true,
}))

const TERM_EVENTS: CalEvent[] = [
  { id: 't1-start', title: 'Term 1 Starts', start: '2025-09-01', color: '#0E8A6A', allDay: true },
  { id: 't1-end', title: 'Term 1 Ends', start: '2025-12-15', color: '#0E8A6A', allDay: true },
  { id: 't2-start', title: 'Term 2 Starts', start: '2026-01-10', color: '#0E8A6A', allDay: true },
  { id: 't2-end', title: 'Term 2 Ends', start: '2026-04-15', color: '#0E8A6A', allDay: true },
  { id: 't3-start', title: 'Term 3 Starts', start: '2026-05-05', color: '#0E8A6A', allDay: true },
  { id: 't3-end', title: 'Term 3 Ends', start: '2026-07-25', color: '#0E8A6A', allDay: true },
]

export default function CalendarPage() {
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
      <CalendarContent />
    </RoleGuard>
  )
}

function CalendarContent() {
  const [firestoreEvents, setFirestoreEvents] = useState<CalEvent[]>([])

useEffect(() => {
  const q = query(collection(db, 'calendar_events'), orderBy('start'))
  return onSnapshot(q, (snap) => {
    setFirestoreEvents(
      snap.docs.map((d) => {
        const data = d.data() as Omit<CalEvent, 'id'>
        return {
          id: d.id,
          ...data,
          color: data.color ?? '#D97706',
        }
      })
    )
  })
}, [])

  const allEvents = [...HOLIDAY_EVENTS, ...TERM_EVENTS, ...firestoreEvents]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-bold text-brand-navy">Calendar</h1>
        <div className="flex items-center gap-4 mt-2">
          {[
            { color: '#0E8A6A', label: 'Term dates' },
            { color: '#6B3FA0', label: 'Public holidays' },
            { color: '#D97706', label: 'School events' },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1.5 text-xs text-muted">
              <span className="w-3 h-3 rounded-sm" style={{ background: l.color }} />
              {l.label}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-surface border border-base rounded-xl p-4">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,listWeek',
          }}
          events={allEvents}
          height="auto"
          eventDisplay="block"
        />
      </div>
    </div>
  )
}