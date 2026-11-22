import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'School Leadership',
  description:
    'Meet the head teacher and the leadership team of our secondary school.',
  path: '/leadership',
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
