import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { GlobalSearch }        from '@/components/shared/GlobalSearch'

const meta: Meta<typeof GlobalSearch> = {
  title:     'Shared/GlobalSearch',
  component: GlobalSearch,
  tags:      ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'Unified search bar querying students, staff, and library books. Supports expanded (desktop) and compact icon-only (mobile) variants.',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof GlobalSearch>

export const Expanded: Story = {
  args: { variant: 'expanded', placeholder: 'Search students, staff, books…' },
}

export const Compact: Story = {
  args: { variant: 'compact' },
}