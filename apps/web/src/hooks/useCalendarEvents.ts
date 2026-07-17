/*
 * apps/web/src/hooks/useCalendarEvents.ts
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R13 — Announcements, Timetable & Calendar Domain
 * [PURPOSE]: fetchCalendarEvents() previously caught both a non-2xx
 *   response and any thrown exception and returned [] in both cases —
 *   TanStack Query's isError could never fire, so a genuine fetch failure
 *   was structurally indistinguishable from a real empty result set.
 *   Replaced the raw fetch() + manual token handling with the
 *   R1-consolidated apiFetch, which throws ApiError on any non-2xx
 *   response and lets useQuery's isError/error reflect it correctly.
 *   Added useCreateCalendarEvent()/useUpdateCalendarEvent()/
 *   useDeleteCalendarEvent() mutations for the new POST/PATCH/DELETE
 *   /calendar/events routes (calendar.ts, same phase), each with the
 *   required onError handler (sms-erp-frontend Rule 4) and invalidating
 *   queryKeys.calendar.all() on success.
 * [DEPENDS ON]: apps/web/src/lib/api-client.ts (apiFetch, queryKeys —
 *   queryKeys.calendar.all() added this phase), @shared/schemas/calendarEvent
 *   (CreateCalendarEventInput/UpdateCalendarEventInput — same phase)
 */
'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, queryKeys } from '@/lib/api-client'
import type { CalendarEvent } from '@shared/types/calendar'
import type { CreateCalendarEventInput, UpdateCalendarEventInput } from '@shared/schemas/calendarEvent'

async function fetchCalendarEvents(start: string, end: string): Promise<CalendarEvent[]> {
  return apiFetch<CalendarEvent[]>(
    `/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
  )
}

export function useCalendarEvents(start: string, end: string) {
  return useQuery<CalendarEvent[]>({
    queryKey: queryKeys.calendar.events(start, end),
    queryFn:  () => fetchCalendarEvents(start, end),
    staleTime: 1000 * 60 * 5,
    enabled:  !!(start && end),
  })
}

export function useCreateCalendarEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCalendarEventInput) =>
      apiFetch('/calendar/events', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all() })
    },
    onError: (err) => {
      console.error('Failed to create calendar event', err)
    },
  })
}

export function useUpdateCalendarEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCalendarEventInput }) =>
      apiFetch(`/calendar/events/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all() })
    },
    onError: (err) => {
      console.error('Failed to update calendar event', err)
    },
  })
}

export function useDeleteCalendarEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/calendar/events/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all() })
    },
    onError: (err) => {
      console.error('Failed to delete calendar event', err)
    },
  })
}