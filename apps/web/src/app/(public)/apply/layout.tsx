import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Apply for Admission',
  description:
    'Apply online for a place at our secondary school. Submit the application form and hear back from the admissions office by email.',
  path: '/apply',
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
