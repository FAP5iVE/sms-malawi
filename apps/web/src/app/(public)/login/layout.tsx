import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Portal Login',
  description:
    'Sign in to the student and staff portal.',
  path: '/login',
  noindex: true,
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
