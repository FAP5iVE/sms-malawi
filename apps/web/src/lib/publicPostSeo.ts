import 'server-only'

/**
 * apps/web/src/lib/publicPostSeo.ts
 *
 * [PURPOSE]: Server-side read of one public post (news, announcement, event,
 *   advertisement) for page metadata, structured data and the sitemap. The
 *   public detail pages are client components that fetch their own data, so
 *   without this a crawler sees no title, description or share image for
 *   /news/<id> and friends.
 *
 * Applies the same visibility rule as GET /public/* in server/routes/public.ts:
 *   status === 'PUBLISHED' && publicWebsite === true && matching postType.
 *
 * Returns:
 *   - a post object        found and public
 *   - null                 genuinely missing or not public (caller can 404)
 *   - 'unavailable'        the lookup itself failed (caller must NOT 404)
 */

import { cache } from 'react'
import { toPlainText } from '@/lib/site'

export type PublicPostType = 'ANNOUNCEMENT' | 'NEWS' | 'EVENT' | 'ADVERTISEMENT'

export interface PublicPostSeo {
  id: string
  title: string
  description: string
  imageUrl: string | null
  authorName: string | null
  createdAt: Date
  eventDate: Date | null
}

interface FirestoreTimestampLike { toDate(): Date }
interface RawPost {
  title?: string
  body?: string
  imageKey?: string | null
  authorName?: string | null
  postType?: string
  status?: string
  publicWebsite?: boolean
  createdAt?: FirestoreTimestampLike
  eventDate?: FirestoreTimestampLike | string | null
}

function toDate(v: unknown): Date | null {
  if (!v) return null
  if (typeof v === 'object' && v !== null && 'toDate' in v) return (v as FirestoreTimestampLike).toDate()
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d
}

async function resolveImage(imageKey: string | null | undefined): Promise<string | null> {
  if (!imageKey) return null
  try {
    const { getPublicViewUrl } = await import('@/lib/storage')
    return await getPublicViewUrl('', imageKey)
  } catch {
    return null
  }
}

export const getPublicPostSeo = cache(
  async (id: string, postType: PublicPostType): Promise<PublicPostSeo | null | 'unavailable'> => {
    try {
      const [{ getFirestore }, { getAdminApp }, { COLLECTIONS }] = await Promise.all([
        import('firebase-admin/firestore'),
        import('@/lib/verifyAuth'),
        import('@shared/constants/storage'),
      ])
      const snap = await getFirestore(getAdminApp()).collection(COLLECTIONS.ANNOUNCEMENTS).doc(id).get()
      if (!snap.exists) return null

      const data = snap.data() as RawPost
      if (
        data.status !== 'PUBLISHED' ||
        data.publicWebsite !== true ||
        (data.postType ?? 'ANNOUNCEMENT') !== postType
      ) {
        return null
      }

      return {
        id: snap.id,
        title: data.title?.trim() || 'Untitled',
        description: toPlainText(data.body ?? ''),
        imageUrl: await resolveImage(data.imageKey),
        authorName: data.authorName ?? null,
        createdAt: toDate(data.createdAt) ?? new Date(),
        eventDate: toDate(data.eventDate),
      }
    } catch {
      return 'unavailable'
    }
  },
)

/** Recent public posts of one type, for the sitemap. Empty on any failure. */
export async function listPublicPostRefs(
  postType: PublicPostType,
  limit = 500,
): Promise<Array<{ id: string; lastModified: Date }>> {
  try {
    const [{ getFirestore }, { getAdminApp }, { COLLECTIONS }] = await Promise.all([
      import('firebase-admin/firestore'),
      import('@/lib/verifyAuth'),
      import('@shared/constants/storage'),
    ])
    const snap = await getFirestore(getAdminApp())
      .collection(COLLECTIONS.ANNOUNCEMENTS)
      .where('status', '==', 'PUBLISHED')
      .where('publicWebsite', '==', true)
      .where('postType', '==', postType)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get()
    return snap.docs.map((d) => ({
      id: d.id,
      lastModified: toDate((d.data() as RawPost).createdAt) ?? new Date(),
    }))
  } catch {
    return []
  }
}
