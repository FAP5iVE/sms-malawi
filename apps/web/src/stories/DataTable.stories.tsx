import type { Meta, StoryObj }  from '@storybook/nextjs-vite'
import { DataTable }            from '@/components/shared/DataTable'
import type { DataColumn }      from '@/components/shared/DataTable'

interface Row {
  id:     string
  name:   string
  class:  string
  status: string
  fees:   string
}

const columns: DataColumn<Row>[] = [
  { key: 'name',   label: 'Student Name', priority: 'critical'  },
  { key: 'class',  label: 'Class',        priority: 'important' },
  { key: 'status', label: 'Status',       priority: 'important' },
  { key: 'fees',   label: 'Fees Status',  priority: 'optional'  },
]

const data: Row[] = [
  { id: '1', name: 'Alice Banda',    class: 'Form 1A', status: 'Active',   fees: 'Paid'    },
  { id: '2', name: 'Bob Chirwa',     class: 'Form 2B', status: 'Active',   fees: 'Partial' },
  { id: '3', name: 'Carol Phiri',    class: 'Form 1A', status: 'Inactive', fees: 'Overdue' },
  { id: '4', name: 'David Kamwana',  class: 'Form 3C', status: 'Active',   fees: 'Paid'    },
  { id: '5', name: 'Eve Mwale',      class: 'Form 4A', status: 'Active',   fees: 'Paid'    },
]

const meta: Meta<typeof DataTable<Row>> = {
  title:     'Shared/DataTable',
  component: DataTable,
  tags:      ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Responsive data table with priority-based column visibility, card view for mobile, search, filter chips, and column visibility toggle.',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof DataTable<Row>>

export const Default: Story = {
  args: { columns, data, rowKey: 'id', isLoading: false },
}

export const Loading: Story = {
  args: { columns, data: [], rowKey: 'id', isLoading: true },
}

export const Empty: Story = {
  args: { columns, data: [], rowKey: 'id', isLoading: false, emptyMessage: 'No students found matching your search.' },
}

export const WithActiveFilters: Story = {
  args: {
    columns,
    data,
    rowKey:        'id',
    isLoading:     false,
    activeFilters: [
      { key: 'status', label: 'Status', value: 'Active' },
      { key: 'class',  label: 'Class',  value: 'Form 1A' },
    ],
    onFilterRemove:   (key) => console.log('Remove filter', key),
    onFilterClearAll: () => console.log('Clear all filters'),
  },
}

export const WithQuickFilters: Story = {
  args: {
    columns,
    data,
    rowKey:       'id',
    isLoading:    false,
    quickFilters: [
      { value: 'active',  label: 'Active Only'  },
      { value: 'overdue', label: 'Overdue Fees' },
      { value: 'form1',   label: 'Form 1'       },
    ],
    onQuickFilter: (value) => console.log('Quick filter', value),
  },
}