import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DataTable } from '../DataTable'

const columns = [
  { key: 'name' as const,   label: 'Name',   priority: 1 as const },
  { key: 'status' as const, label: 'Status', priority: 2 as const },
  { key: 'class' as const,  label: 'Class',  priority: 3 as const },
]

const rows = [
  { name: 'Alice Banda',    status: 'ACTIVE',   class: 'Form 1A' },
  { name: 'Bob Chirwa',     status: 'INACTIVE', class: 'Form 2B' },
  { name: 'Carol Phiri',    status: 'ACTIVE',   class: 'Form 1A' },
]

describe('DataTable', () => {
  it('renders all rows', () => {
    render(<DataTable columns={columns} rows={rows} rowKey="name" />)
    expect(screen.getByText('Alice Banda')).toBeInTheDocument()
    expect(screen.getByText('Bob Chirwa')).toBeInTheDocument()
    expect(screen.getByText('Carol Phiri')).toBeInTheDocument()
  })

  it('renders column headers', () => {
    render(<DataTable columns={columns} rows={rows} rowKey="name" />)
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
  })

  it('shows empty state when rows is empty', () => {
    render(<DataTable columns={columns} rows={[]} rowKey="name" emptyMessage="No students found" />)
    expect(screen.getByText('No students found')).toBeInTheDocument()
  })

  it('calls onRowClick when row is clicked', () => {
    const onRowClick = vi.fn()
    render(<DataTable columns={columns} rows={rows} rowKey="name" onRowClick={onRowClick} />)
    fireEvent.click(screen.getByText('Alice Banda'))
    expect(onRowClick).toHaveBeenCalledWith(rows[0])
  })

  it('shows loading skeleton when isLoading is true', () => {
    render(<DataTable columns={columns} rows={[]} rowKey="name" isLoading />)
    expect(document.querySelector('.animate-pulse')).toBeTruthy()
  })
})