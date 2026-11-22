import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Change Password',
  description:
    'Change your portal password.',
  path: '/change-password',
  noindex: true,
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
