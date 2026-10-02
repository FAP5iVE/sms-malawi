import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Privacy Policy',
  description:
    "How the school collects, uses, shares and protects personal data, written against Malawi's Data Protection Act, 2024.",
  path: '/privacy',
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
