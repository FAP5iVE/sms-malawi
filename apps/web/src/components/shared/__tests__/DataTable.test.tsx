/**
 * DataTable.test.tsx
 * [CHANGE TYPE]: TARGETED EDIT + RENAME .ts -> .tsx (R19 — unit-test repair).
 *
 * The file contains JSX and must be a .tsx (its former .ts extension caused
 * catastrophic parse errors that aborted whole-project type analysis). Props
 * are corrected to the real DataTableProps<T> interface: `rows` -> `data`,
 * column `priority` uses the real 'critical' | 'important' | 'optional' union
 * (not numeric), and the required `isLoading` prop is supplied. The former
 * onRowClick test is removed (DataTable exposes no such prop) and replaced by a
 * custom-render column test. Queries use getAllByText because DataTable renders
 * both a desktop table and a mobile card list into the DOM (CSS controls which
 * is visible), so a value can legitimately appear more than once.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DataTable, type DataColumn } from '../DataTable'

interface Row {
  name: string
  status: string
  klass: string
}

const columns: DataColumn<Row>[] = [
  { key: 'name',   label: 'Name',   priority: 'critical' },
  { key: 'status', label: 'Status', priority: 'important' },
  { key: 'klass',  label: 'Class',  priority: 'optional' },
]

const data: Row[] = [
  { name: 'Alice Banda',  status: 'ACTIVE',   klass: 'Form 1A' },
  { name: 'Bob Chirwa',   status: 'INACTIVE', klass: 'Form 2B' },
  { name: 'Carol Phiri',  status: 'ACTIVE',   klass: 'Form 1A' },
]

describe('DataTable', () => {
  it('renders every row', () => {
    render(<DataTable columns={columns} data={data} rowKey="name" isLoading={false} />)
    expect(screen.getAllByText('Alice Banda').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Bob Chirwa').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Carol Phiri').length).toBeGreaterThan(0)
  })

  it('renders column headers', () => {
    render(<DataTable columns={columns} data={data} rowKey="name" isLoading={false} />)
    expect(screen.getAllByText('Name').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Status').length).toBeGreaterThan(0)
  })

  it('shows the empty state when data is empty', () => {
    render(
      <DataTable columns={columns} data={[]} rowKey="name" isLoading={false} emptyMessage="No students found" />,
    )
    expect(screen.getAllByText('No students found').length).toBeGreaterThan(0)
  })

  it('renders values produced by a custom column render function', () => {
    const withRender: DataColumn<Row>[] = [
      { key: 'name', label: 'Name', priority: 'critical', render: (r) => `★ ${r.name}` },
    ]
    render(<DataTable columns={withRender} data={[data[0]!]} rowKey="name" isLoading={false} />)
    expect(screen.getAllByText('★ Alice Banda').length).toBeGreaterThan(0)
  })

  it('shows a loading skeleton when isLoading is true', () => {
    render(<DataTable columns={columns} data={[]} rowKey="name" isLoading />)
    expect(document.querySelector('.animate-pulse')).toBeTruthy()
  })
})
