/**
 * StudentIdentity.test.tsx
 * The student's own status, class and stream line: shows the stream only when the form has
 * more than one, and says so plainly when there is no class.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const me = vi.fn()
vi.mock('@/hooks/useStudents', () => ({ useStudentMe: () => me() }))

import { StudentIdentityLine, StudentIdentityMenuLine, manebWords } from '../StudentIdentity'

describe('StudentIdentity', () => {
  beforeEach(() => me.mockReset())

  it('shows class, stream and status for a multi-stream form', () => {
    me.mockReturnValue({ isLoading: false, data: { status: 'ACTIVE', className: 'Form 3', classStream: 'B', classStreamCount: 2 } })
    render(<StudentIdentityLine />)
    expect(screen.getByText('Form 3 B')).toBeTruthy()
    expect(screen.getByText('Active')).toBeTruthy()
  })

  it('hides the stream when the form has one stream', () => {
    me.mockReturnValue({ isLoading: false, data: { status: 'ACTIVE', className: 'Form 1', classStream: 'A', classStreamCount: 1 } })
    render(<StudentIdentityLine />)
    expect(screen.getByText('Form 1')).toBeTruthy()
  })

  it('says no class yet and shows a graduate as graduated', () => {
    me.mockReturnValue({ isLoading: false, data: { status: 'GRADUATED', className: null } })
    render(<StudentIdentityLine />)
    expect(screen.getByText('No class yet')).toBeTruthy()
    expect(screen.getByText('Graduated')).toBeTruthy()
  })

  it('says what MANEB stage a finished student is at', () => {
    expect(manebWords(null, 'ACTIVE')).toBeNull()
    expect(manebWords({ examType: 'MSCE', registered: false }, 'ACTIVE')).toBe('MSCE not registered')
    expect(manebWords({ examType: 'MSCE', registered: true }, 'ACTIVE')).toBe('MSCE registered')
    expect(manebWords({ examType: 'MSCE', registered: true }, 'AWAITING_MANEB_RESULTS')).toBe('MSCE registered, results awaited')
    expect(manebWords({ examType: 'MSCE', registered: true, resultsEntered: true }, 'GRADUATED')).toBe('MSCE registered, results in')
  })

  it('shows awaiting results and the MANEB line on the dashboard', () => {
    me.mockReturnValue({ isLoading: false, data: { status: 'AWAITING_MANEB_RESULTS', className: null, maneb: { examType: 'MSCE', registered: true, resultsEntered: false } } })
    render(<StudentIdentityLine />)
    expect(screen.getByText('Awaiting MANEB results')).toBeTruthy()
    expect(screen.getByText('MSCE registered, results awaited')).toBeTruthy()
  })

  it('renders nothing for a signed-in person who is not a student', () => {
    me.mockReturnValue({ isLoading: false, data: undefined })
    const { container } = render(<StudentIdentityMenuLine />)
    expect(container.innerHTML).toBe("")
  })
})
