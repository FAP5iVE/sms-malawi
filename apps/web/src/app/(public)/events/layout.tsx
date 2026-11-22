import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Events',
  description:
    'Upcoming school events with dates and venues.',
  path: '/events',
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
