import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Photo Gallery',
  description:
    'Photos from school life, events and facilities.',
  path: '/gallery',
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
