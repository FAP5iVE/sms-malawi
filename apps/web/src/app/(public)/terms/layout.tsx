import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Terms of Use',
  description:
    "The terms for using the school website and the student and staff portal.",
  path: '/terms',
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
