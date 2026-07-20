import type { Meta, StoryObj, Decorator } from '@storybook/nextjs-vite'
import type { UserRole } from '@shared/types/roles'
import { MobileBottomNav } from '@/components/shared/MobileBottomNav'
import { useAuthStore }    from '@/store/authStore'

/**
 * MobileBottomNav takes zero props and resolves the active role internally via
 * useAuthStore(). Each story therefore seeds the auth store with a role (rather
 * than passing a nonexistent `role` prop, which left all four stories rendering
 * identically) so the role-differentiated navigation is actually demonstrated.
 */
function withRole(role: UserRole): Decorator {
  return function RoleDecorator(Story) {
    useAuthStore.setState({ role, initialized: true, loading: false })
    return <Story />
  }
}

const meta: Meta<typeof MobileBottomNav> = {
  title:     'Navigation/MobileBottomNav',
  component: MobileBottomNav,
  tags:      ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
    docs: {
      description: {
        component: 'Bottom navigation bar shown on mobile viewports for authenticated users. Role-aware — only shows tabs relevant to the active user role.',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof MobileBottomNav>

export const Student: Story  = { decorators: [withRole('student')] }
export const Academic: Story = { decorators: [withRole('academic')] }
export const Finance: Story  = { decorators: [withRole('finance')] }
export const Admin: Story    = { decorators: [withRole('admin')] }
