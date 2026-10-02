import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Academic Advertisements',
  description:
    'Calls for applications, intake notices and examination circulars from the school.',
  path: '/academic-advertisements',
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
