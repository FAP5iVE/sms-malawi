/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/shared/TodaysTimetableList.tsx
 * [R-PHASE]: POST-R17 — Dashboard List Widgets (permanent-skeleton fix)
 * [PURPOSE]: Row rendering for GET /classes/my-timetable/today's slots —
 *   used identically by AcademicDashboard.tsx (teacher) and
 *   StudentDashboard.tsx's "Today's Timetable" widgets, both previously
 *   permanent PlaceholderWidgets. One shared renderer instead of pasting
 *   the same list markup into both dashboard files.
 * [DEPENDS ON]: @shared/types/api (ApiTimetableSlot)
 */

'use client'

import { Clock } from 'lucide-react'
import type { ApiTimetableSlot } from '@shared/types/api'

export function TodaysTimetableList({ slots }: { slots: ApiTimetableSlot[] }) {
  return (
    <ul className="divide-y divide-base">
      {slots.map((slot) => (
        <li key={slot.id} className="py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Clock className="w-4 h-4 text-muted shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium text-brand-navy truncate">{slot.subject}</p>
              <p className="text-xs text-muted truncate">
                {slot.class?.name ?? 'Class'}
                {slot.room ? ` · ${slot.room}` : ''}
              </p>
            </div>
          </div>
          <span className="text-xs text-muted whitespace-nowrap shrink-0">
            {slot.periodStart}–{slot.periodEnd}
          </span>
        </li>
      ))}
    </ul>
  )
}