/**
 * SearchableSelect.test.tsx
 * [CHANGE TYPE]: NEW FILE
 * Covers the "staff dropdown has nothing to choose from / can't search" fix.
 */
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { SearchableSelect, type SelectOption } from '../SearchableSelect'
import { Modal } from '../Modal'

const OPTIONS: SelectOption[] = [
  { value: 's1', label: 'Agnes Banda',  description: 'EMP-001 · Finance · Accountant' },
  { value: 's2', label: 'Hilda Kayira', description: 'EMP-031 · Academics · Teacher' },
  { value: 's3', label: 'Mercy Munthali', description: 'EMP-044 · Administration · Principal' },
]

function Harness(props: Partial<React.ComponentProps<typeof SearchableSelect>> & { onPick?: (v: string) => void }) {
  const [v, setV] = useState('')
  return (
    <SearchableSelect
      options={OPTIONS}
      value={v}
      onChange={(x) => { setV(x); props.onPick?.(x) }}
      placeholder="Select a staff member…"
      {...props}
    />
  )
}

const open = () => fireEvent.click(screen.getByRole('combobox'))

describe('SearchableSelect', () => {
  it('lists every option when opened', () => {
    render(<Harness />)
    open()
    expect(screen.getAllByRole('option')).toHaveLength(3)
  })

  it('filters as you type, matching name AND description (every word)', () => {
    render(<Harness />)
    open()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'finance bandA' } })
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      expect.stringContaining('Agnes Banda'),
    ])
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } })
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText(/No match for/)).toBeInTheDocument()
  })

  it('selects with a click and shows the choice on the trigger', () => {
    const onPick = vi.fn()
    render(<Harness onPick={onPick} />)
    open()
    fireEvent.click(screen.getByText('Hilda Kayira'))
    expect(onPick).toHaveBeenCalledWith('s2')
    expect(screen.getByRole('combobox')).toHaveTextContent('Hilda Kayira')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('supports keyboard selection (ArrowDown + Enter)', () => {
    const onPick = vi.fn()
    render(<Harness onPick={onPick} />)
    open()
    const box = screen.getByRole('searchbox')
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(onPick).toHaveBeenCalledWith('s2')
  })

  it('Enter inside the search box never submits the surrounding form', () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
    render(<form onSubmit={onSubmit}><Harness /></form>)
    open()
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Enter' })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('Escape closes the list first and does NOT close the surrounding Modal', () => {
    const onClose = vi.fn()
    render(
      <Modal title="Allocate" onClose={onClose}>
        <Harness />
      </Modal>,
    )
    open()
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })   // list already closed → modal closes
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows a load failure with retry instead of a silently empty list', () => {
    const onRetry = vi.fn()
    render(<Harness options={[]} errorMessage="Could not load the staff list." onRetry={onRetry} />)
    open()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the staff list.')
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('shows the empty message when there are genuinely no options', () => {
    render(<Harness options={[]} emptyMessage="No active staff members found." />)
    open()
    expect(screen.getByText('No active staff members found.')).toBeInTheDocument()
  })
})
