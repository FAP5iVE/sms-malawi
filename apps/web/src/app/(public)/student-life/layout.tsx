import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Student Life',
  description:
    'Clubs, sport, wellness support and boarding: what life outside the classroom looks like at our secondary school.',
  path: '/student-life',
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
