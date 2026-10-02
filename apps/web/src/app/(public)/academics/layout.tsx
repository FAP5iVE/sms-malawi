import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Academics',
  description:
    'Curriculum, MANEB examination standards and facilities for JCE and MSCE students at our Malawian secondary school.',
  path: '/academics',
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
