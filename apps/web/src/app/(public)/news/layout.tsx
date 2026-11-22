import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'News',
  description:
    'Latest news and stories from our secondary school.',
  path: '/news',
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
