/*
 * apps/web/src/components/calendar/CalendarEventListItem.tsx
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Interactive Calendar UI adoption — single event-row component
 *   shared by the desktop sidebar's selected-day list, the Agenda grid, and
 *   the mobile selected-day list (`variant` switches between the two
 *   reference layouts: a bordered "card" with a colored left bar for
 *   desktop/agenda, and a dense time-column "row" for mobile — mirrors
 *   interactive-calendar-ui's EventCard.tsx + its separate mobile inline
 *   markup, but as one component instead of two copies so title/time/
 *   category/location rendering can't drift apart between surfaces).
 *   Edit/delete actions only render when the caller passes onEdit/onDelete
 *   AND the event is a manually-created (`calevent-`) row — that second
 *   check happens inside this component (via isManualEvent), not at each
 *   call site, so a read-only source (exam, timetable, leave, …) can never
 *   show destructive actions no matter which view renders it.
 * [DEPENDS ON]: ./calendarConfig (categoryColor, categoryLabel,
 *   isManualEvent), ./calendarUtils (formatEventTimeRange, formatEventTimeShort)
 */
'use client'
import { Clock, MapPin, Pencil, Trash2 } from 'lucide-react'
import type { CalendarEvent } from '@shared/types/calendar'
import { categoryColor, categoryLabel, isManualEvent } from './calendarConfig'
import { formatEventTimeRange, formatEventTimeShort } from './calendarUtils'

interface CalendarEventListItemProps {
  event: CalendarEvent
  variant?: 'card' | 'row'
  onEdit?: (event: CalendarEvent) => void
  onDelete?: (event: CalendarEvent) => void
}

export function CalendarEventListItem({
  event,
  variant = 'card',
  onEdit,
  onDelete,
}: CalendarEventListItemProps) {
  const color = categoryColor(event.category)
  const location = event.meta?.venue ? String(event.meta.venue) : undefined
  const description = event.meta?.description ? String(event.meta.description) : undefined
  const editable = isManualEvent(event.id)
  const showEdit = editable && !!onEdit
  const showDelete = editable && !!onDelete

  if (variant === 'row') {
    return (
      <div className="group flex items-start gap-3 py-1.5">
        <div className="w-14 shrink-0 pt-0.5 text-right">
          <span className="text-[11px] font-semibold text-muted tabular">
            {formatEventTimeShort(event)}
          </span>
        </div>
        <div
          className="w-1 rounded-full shrink-0 mt-0.5 self-stretch min-h-[2.25rem]"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-heading font-semibold text-body truncate">{event.title}</h4>
          <p className="text-xs text-muted mt-0.5 truncate flex items-center gap-1.5">
            <span>{formatEventTimeRange(event)}</span>
            {location && (
              <>
                <span className="opacity-50">•</span>
                <span className="truncate">{location}</span>
              </>
            )}
          </p>
        </div>
        {(showEdit || showDelete) && (
          <div className="flex items-center gap-0.5 shrink-0">
            {showEdit && (
              <button
                type="button"
                onClick={() => onEdit!(event)}
                aria-label="Edit event"
                className="p-2 min-h-[36px] min-w-[36px] text-muted hover:text-body active:bg-page rounded-lg transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
            {showDelete && (
              <button
                type="button"
                onClick={() => onDelete!(event)}
                aria-label="Delete event"
                className="p-2 min-h-[36px] min-w-[36px] text-muted hover:text-brand-coral active:bg-page rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="group relative flex items-start gap-3 p-3.5 rounded-xl bg-surface hover:bg-page border border-base transition-colors">
      <div
        className="w-1.5 self-stretch rounded-full shrink-0 my-0.5"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-muted flex items-center gap-1">
            <Clock className="w-3 h-3" aria-hidden="true" />
            {formatEventTimeRange(event)}
          </span>
          <span
            className="text-[11px] font-medium px-2 py-0.5 rounded-md border shrink-0"
            style={{ backgroundColor: `${color}18`, borderColor: `${color}44`, color }}
          >
            {categoryLabel(event.category)}
          </span>
        </div>

        <h4 className="text-sm font-heading font-semibold text-body mt-1 truncate">
          {event.title}
        </h4>

        {description && <p className="text-xs text-muted mt-0.5 line-clamp-2">{description}</p>}

        {location && (
          <div className="flex items-center gap-1.5 text-xs text-muted mt-1.5">
            <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{location}</span>
          </div>
        )}
      </div>

      {(showEdit || showDelete) && (
        <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-1 shrink-0 self-center">
          {showEdit && (
            <button
              type="button"
              onClick={() => onEdit!(event)}
              aria-label="Edit event"
              className="p-1.5 min-h-[32px] min-w-[32px] rounded-lg bg-page text-muted hover:text-body transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
          {showDelete && (
            <button
              type="button"
              onClick={() => onDelete!(event)}
              aria-label="Delete event"
              className="p-1.5 min-h-[32px] min-w-[32px] rounded-lg bg-page text-muted hover:text-brand-coral transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
