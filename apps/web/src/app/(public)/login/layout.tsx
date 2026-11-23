import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Sign in',
  description:
    'Sign in to the student and staff account.',
  path: '/login',
  noindex: true,
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
