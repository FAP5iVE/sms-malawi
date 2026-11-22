/**
 * AttendanceSheet.test.tsx
 * [CHANGE TYPE]: NEW FILE
 *
 * REGRESSION: opening a class's Attendance tab as anyone whose request failed
 * (typically a 403 for a viewer who isn't the class teacher) used to blank the
 * whole page with "Something went wrong loading this page".
 *
 * Cause: `const { data: fetched = [] } = useClassAttendance(...)` made a NEW []
 * on every render while `data` was undefined; the sheet's render-phase
 * `fetched !== prevFetched` re-seed then looped until React threw "Too many
 * re-renders", which the app shell's ErrorBoundary turned into that screen.
 * These tests use the real react-query hook and a rejecting fetch, so they
 * exercise exactly the loading → error transition that triggered it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

// A PLAIN function stands in for apiFetch (not vi.fn): vitest's call-result
// tracking re-reports a vi.fn()'s rejected promises as unhandled errors at test
// teardown, which would fail these tests for reasons unrelated to the app.
let fetchImpl: () => Promise<unknown> = () => Promise.resolve([])
let fetchCalls = 0

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>()
  return {
    ...actual,
    apiFetch: () => {
      fetchCalls += 1
      return fetchImpl()
    },
  }
})

import { ApiError } from '@/lib/api-client'
import { AttendanceSheet } from '../AttendanceSheet'

const STUDENTS = [
  { id: 'st1', firstName: 'Chikondi', lastName: 'Banda' },
  { id: 'st2', firstName: 'Tadala',   lastName: 'Phiri' },
]

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 1 } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  fetchCalls = 0
  fetchImpl = () => Promise.resolve([])
})

const rejectWith = (err: unknown) => () => Promise.reject(err)

describe('AttendanceSheet — load failures stay inside the tab', () => {
  it('a 403 shows a "restricted" panel (no crash, no retry button)', async () => {
    fetchImpl = rejectWith(new ApiError('Forbidden', 403))
    wrap(<AttendanceSheet classId="c1" students={STUDENTS} readOnly />)

    expect(await screen.findByText('Attendance is restricted')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/does not have permission/i)
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument()
    expect(fetchCalls).toBe(1)                          // a 403 is never retried
  })

  it('a server error shows a recoverable message with working "Try again"', async () => {
    fetchImpl = rejectWith(new ApiError('Boom', 500))
    wrap(<AttendanceSheet classId="c1" students={STUDENTS} readOnly />)

    expect(await screen.findByText(/couldn.t load attendance/i)).toBeInTheDocument()

    fetchImpl = () => Promise.resolve([])
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    await waitFor(() => expect(screen.queryByText(/couldn.t load attendance/i)).not.toBeInTheDocument())
    expect((await screen.findAllByText(/Chikondi/)).length).toBeGreaterThan(0)
  })
})

describe('AttendanceSheet — read-only view', () => {
  it('shows the roster, names the class teacher and offers no marking controls', async () => {
    wrap(<AttendanceSheet classId="c1" students={STUDENTS} readOnly classTeacherName="Hilda Kayira" />)

    expect(await screen.findByText(/Hilda Kayira/)).toBeInTheDocument()
    expect(screen.getByText(/view only/i)).toBeInTheDocument()
    expect((await screen.findAllByText(/Chikondi/)).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /mark all present/i })).not.toBeInTheDocument()
  })

  it('explains when the class has no teacher assigned', async () => {
    wrap(<AttendanceSheet classId="c1" students={STUDENTS} readOnly classTeacherName={null} />)
    expect(await screen.findByText(/no teacher assigned yet/i)).toBeInTheDocument()
  })
})
