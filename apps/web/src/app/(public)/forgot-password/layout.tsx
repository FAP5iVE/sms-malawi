import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Forgot Password',
  description:
    'Request a link to reset your portal password.',
  path: '/forgot-password',
  noindex: true,
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
