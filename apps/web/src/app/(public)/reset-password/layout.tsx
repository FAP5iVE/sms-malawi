import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Reset Password',
  description:
    'Choose a new password for your portal account.',
  path: '/reset-password',
  noindex: true,
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
