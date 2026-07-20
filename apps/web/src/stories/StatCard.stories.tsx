import type { Meta, StoryObj }  from '@storybook/nextjs-vite'
import { Users, AlertTriangle, BookOpen, GraduationCap } from 'lucide-react'
import { StatCard }             from '@/components/shared/StatCard'

const meta: Meta<typeof StatCard> = {
  title:     'Shared/StatCard',
  component: StatCard,
  tags:      ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'KPI summary card used across all role dashboards. Supports trend indicators and colour-coded status.',
      },
    },
  },
  argTypes: {
    trend: { control: { type: 'select' }, options: ['up', 'down', 'neutral', undefined] },
  },
}

export default meta
type Story = StoryObj<typeof StatCard>

export const Default: Story = {
  args: {
    label:      'Total Students',
    value:      '1,248',
    icon:       Users,
    trend:      'up',
    trendLabel: '+12 this term',
  },
}

export const Down: Story = {
  args: {
    label:      'Outstanding Fees',
    value:      'MWK 4.2M',
    icon:       AlertTriangle,
    trend:      'down',
    trendLabel: '-MWK 120K vs last term',
  },
}

export const Neutral: Story = {
  args: {
    label: 'Library Books',
    value: '3,450',
    icon:  BookOpen,
    trend: 'neutral',
  },
}

export const WithSubLabel: Story = {
  args: {
    label:    'Pass Rate',
    value:    '—',
    icon:     GraduationCap,
    subLabel: 'Awaiting term results',
  },
}
