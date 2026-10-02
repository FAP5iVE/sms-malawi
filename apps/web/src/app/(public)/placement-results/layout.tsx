import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'University Placement Results',
  description:
    'Confirmed university and college placements of our MSCE leavers, listed by year.',
  path: '/placement-results',
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
