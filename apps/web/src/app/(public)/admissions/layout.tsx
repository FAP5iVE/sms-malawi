import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Admissions',
  description:
    'How to apply, entry requirements, fees and scholarships for new students joining our secondary school in Malawi.',
  path: '/admissions',
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
