import { buildPostMetadata, PublicPostLayout } from '@/components/shared/PublicPostSeoLayout'

// Metadata is read from Firestore on the server; cache it for ten minutes.
export const revalidate = 600

type Props = { children: React.ReactNode; params: Promise<{ id: string }> }

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return buildPostMetadata({
    id,
    postType: 'NEWS',
    basePath: '/news',
    fallbackTitle: 'News article',
    fallbackDescription: 'Read this news article from our school.',
  })
}

export default async function Layout({ children, params }: Props) {
  const { id } = await params
  return (
    <PublicPostLayout id={id} postType="NEWS" basePath="/news">
      {children}
    </PublicPostLayout>
  )
}
