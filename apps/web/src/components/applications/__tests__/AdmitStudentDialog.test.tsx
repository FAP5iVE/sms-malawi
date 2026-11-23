/**
 * AdmitStudentDialog.test.tsx
 * Admitting asks for the stream: lists only live classes of the applied form, pre-selects the
 * one with the fewest students, and sends the chosen class id.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const classes = vi.fn()
vi.mock('@/hooks/useClasses', () => ({ useClasses: () => classes() }))
vi.mock('@/hooks/useViewingPeriod', () => ({ useEffectiveViewingPeriod: () => ({ academicYear: '2026/2027' }) }))

import { AdmitStudentDialog } from '../AdmitStudentDialog'

const app = { id: 'a1', firstName: 'Tadala', lastName: 'Banda', applyingForForm: 1 } as never
const cls = (id: string, name: string, form: number, n: number, status = 'ACTIVE', year = '2026/2027') =>
  ({ id, name, form, status, academicYear: year, _count: { students: n } })

describe('AdmitStudentDialog', () => {
  beforeEach(() => classes.mockReset())

  it('lists only live classes of the form, preselects the fewest, and sends the pick', () => {
    classes.mockReturnValue({ isLoading: false, data: [
      cls('c1', 'Form 1 A', 1, 40), cls('c2', 'Form 1 B', 1, 31), cls('c3', 'Form 1 C', 1, 10, 'ARCHIVED'),
      cls('c4', 'Form 2 A', 2, 5), cls('c5', 'Form 1 D', 1, 3, 'ACTIVE', '2025/2026'),
    ] })
    const onConfirm = vi.fn()
    render(<AdmitStudentDialog application={app} busy={false} error={null} onClose={() => {}} onConfirm={onConfirm} />)
    expect(screen.queryByText('Form 1 C')).toBeNull()
    expect(screen.queryByText('Form 2 A')).toBeNull()
    expect(screen.queryByText('Form 1 D')).toBeNull()
    expect(screen.getByText('40 students')).toBeTruthy()
    expect(screen.getByText('Fewest students')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Admit student' }))
    expect(onConfirm).toHaveBeenCalledWith('c2')
    fireEvent.click(screen.getByLabelText(/Form 1 A/))
    fireEvent.click(screen.getByRole('button', { name: 'Admit student' }))
    expect(onConfirm).toHaveBeenLastCalledWith('c1')
  })

  it('one class: no choice; none: admit without a class', () => {
    classes.mockReturnValue({ isLoading: false, data: [cls('c1', 'Form 1', 1, 12)] })
    const onConfirm = vi.fn()
    const { unmount } = render(<AdmitStudentDialog application={app} busy={false} error={null} onClose={() => {}} onConfirm={onConfirm} />)
    expect(screen.getByText(/the only Form 1 class/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Admit student' }))
    expect(onConfirm).toHaveBeenCalledWith('c1')
    unmount()
    classes.mockReturnValue({ isLoading: false, data: [] })
    const none = vi.fn()
    render(<AdmitStudentDialog application={app} busy={false} error={null} onClose={() => {}} onConfirm={none} />)
    expect(screen.getByText(/has no classes/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Admit student' }))
    expect(none).toHaveBeenCalledWith(undefined)
  })
})
