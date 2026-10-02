/**
 * apps/web/src/components/shared/SchoolJsonLd.tsx
 *
 * [PURPOSE]: schema.org structured data (SecondarySchool + WebSite) for the
 *   public site, rendered once in the (public) layout. Server component.
 *
 * Reads the same cached public settings the /public/school-info route uses,
 * so the data matches what visitors see. If settings cannot be read (build
 * without a database, cache outage) it falls back to name and URL only. A
 * failure here must never break page rendering, hence the try/catch and the
 * dynamic import (the settings service validates env vars at import time).
 *
 * Contact fields that still hold the seeded demo defaults are left out, so
 * structured data never advertises a placeholder phone number or address.
 */

import { SITE_NAME, SITE_URL, DEFAULT_OG_IMAGE } from '@/lib/site'

const PLACEHOLDER_ADDRESS = 'P.O. Box 123, Blantyre, Malawi'
const PLACEHOLDER_PHONE = '+265 999 123 456'
const PLACEHOLDER_EMAIL = 'info@school.edu.mw'

interface Identity {
  name: string
  address?: string
  phone?: string
  email?: string
  founded?: number
  sameAs: string[]
}

async function loadIdentity(): Promise<Identity> {
  const fallback: Identity = { name: SITE_NAME, sameAs: [] }
  try {
    const settingsService = await import('@/server/services/settingsService')
    const { SETTING_KEYS } = await import('@shared/types/settings')
    const s = await settingsService.getPublicSettings()

    const pick = (value: unknown, placeholder?: string): string | undefined => {
      if (typeof value !== 'string') return undefined
      const v = value.trim()
      return v && v !== placeholder ? v : undefined
    }

    const founded = s[SETTING_KEYS.SCHOOL_FOUNDED_YEAR]
    return {
      name: pick(s[SETTING_KEYS.SCHOOL_NAME]) ?? SITE_NAME,
      address: pick(s[SETTING_KEYS.SCHOOL_ADDRESS], PLACEHOLDER_ADDRESS),
      phone: pick(s[SETTING_KEYS.SCHOOL_PHONE], PLACEHOLDER_PHONE),
      email: pick(s[SETTING_KEYS.SCHOOL_EMAIL], PLACEHOLDER_EMAIL),
      founded: typeof founded === 'number' && founded > 1800 ? founded : undefined,
      sameAs: [
        s[SETTING_KEYS.SOCIAL_FACEBOOK_URL],
        s[SETTING_KEYS.SOCIAL_TWITTER_URL],
        s[SETTING_KEYS.SOCIAL_INSTAGRAM_URL],
        s[SETTING_KEYS.SOCIAL_YOUTUBE_URL],
        s[SETTING_KEYS.SOCIAL_LINKEDIN_URL],
      ].filter((u): u is string => typeof u === 'string' && /^https?:\/\//.test(u)),
    }
  } catch {
    return fallback
  }
}

/** Never let slow settings storage hold up page rendering or the build. */
function withTimeout<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}

export async function SchoolJsonLd() {
  const id = await withTimeout(loadIdentity(), 3000, { name: SITE_NAME, sameAs: [] })

  const school: Record<string, unknown> = {
    '@type': 'SecondarySchool',
    '@id': `${SITE_URL}/#school`,
    name: id.name,
    url: SITE_URL,
    logo: `${SITE_URL}/icon-512.png`,
    image: `${SITE_URL}${DEFAULT_OG_IMAGE}`,
    ...(id.address ? {
      address: { '@type': 'PostalAddress', streetAddress: id.address, addressCountry: 'MW' },
    } : {}),
    ...(id.phone ? { telephone: id.phone } : {}),
    ...(id.email ? { email: id.email } : {}),
    ...(id.founded ? { foundingDate: String(id.founded) } : {}),
    ...(id.sameAs.length > 0 ? { sameAs: id.sameAs } : {}),
  }

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      school,
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: id.name,
        publisher: { '@id': `${SITE_URL}/#school` },
        inLanguage: 'en',
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is escaped for "<" so a value can never close the tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, '\\u003c') }}
    />
  )
}
