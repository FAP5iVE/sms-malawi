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
          <span className="text-xs font-semibold text-muted tabular">
            {formatEventTimeShort(event)}
          </span>
        </div>
        <div
          className="w-1 rounded-full shrink-0 mt-0.5 self-stretch min-h-[2.25rem]"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-heading font-semibold text-body line-clamp-2 break-words">{event.title}</h4>
          <p className="text-xs text-muted mt-0.5 flex flex-wrap items-center gap-x-1.5">
            <span>{formatEventTimeRange(event)}</span>
            <span aria-hidden="true">·</span>
            <span>{categoryLabel(event.category)}</span>
            {location && (
              <>
                <span aria-hidden="true">·</span>
                <span className="min-w-0 break-words">{location}</span>
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
                className="inline-flex items-center justify-center min-h-11 min-w-11 text-muted hover:text-body active:bg-page rounded-xl transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
            {showDelete && (
              <button
                type="button"
                onClick={() => onDelete!(event)}
                aria-label="Delete event"
                className="inline-flex items-center justify-center min-h-11 min-w-11 text-muted hover:text-tone-coral active:bg-page rounded-xl transition-colors"
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
    <div className="group relative flex items-start gap-3 p-3.5 rounded-xl app-tint hover:bg-brand-teal/10 transition-colors">
      <div
        className="w-1.5 self-stretch rounded-full shrink-0 my-0.5"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="text-xs font-semibold text-muted flex items-center gap-1 whitespace-nowrap">
            <Clock className="w-3 h-3 shrink-0" aria-hidden="true" />
            {formatEventTimeRange(event)}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-body shrink-0">
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            />
            {categoryLabel(event.category)}
          </span>
        </div>

        <h4 className="text-sm font-heading font-semibold text-body mt-1 line-clamp-2 break-words">
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
              className="inline-flex items-center justify-center min-h-9 min-w-9 rounded-xl text-muted hover:text-body hover:bg-page transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
          {showDelete && (
            <button
              type="button"
              onClick={() => onDelete!(event)}
              aria-label="Delete event"
              className="inline-flex items-center justify-center min-h-9 min-w-9 rounded-xl text-muted hover:text-tone-coral hover:bg-page transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
