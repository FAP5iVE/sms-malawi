/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/server/services/schoolLogoService.ts
 * [PURPOSE]: ONE place that answers "what is the school's logo?" for every
 *   generated document. Before this, the logo lived only in the SCHOOL_LOGO_URL
 *   setting — which has no upload UI and was therefore always empty — so the
 *   report card printed an initials circle and receipts, payslips, transcripts
 *   and exports had no logo at all.
 *
 *   Resolution order:
 *     1. SCHOOL_LOGO_URL, when an admin has set one. May be a data: URI, an
 *        /api/files/<id> proxy path or a bare storage file id (read straight
 *        from storage), or an absolute http(s) URL (fetched, short timeout).
 *     2. The embedded default mark (lib/schoolLogoData.ts) — the same logo the
 *        app shell shows. Always succeeds, so a document NEVER ships without a
 *        logo, and a flaky storage/network call can never fail a PDF.
 *
 *   The result is always an inline data URI (never a remote URL): headless
 *   Chromium, jsPDF and ExcelJS all consume bytes, and an inline image cannot
 *   break when a document is generated offline or later re-rendered.
 *   Cached briefly in-process so a bulk run (e.g. 400 report cards) resolves
 *   the logo once, not 400 times.
 * [DEPENDS ON]: settingsService (SCHOOL_LOGO_URL), storage.streamFile,
 *   lib/schoolLogoData
 */
import 'server-only'

import { logger } from '@/lib/logger'
import { streamFile } from '@/lib/storage'
import { DEFAULT_SCHOOL_LOGO_BASE64, DEFAULT_SCHOOL_LOGO_DATA_URI } from '@/lib/schoolLogoData'
import * as settingsService from '@/server/services/settingsService'
import { SETTING_KEYS } from '@shared/types/settings'

export interface SchoolLogo {
  /** Always an inline `data:` URI — safe to drop into <img src>, jsPDF, or ExcelJS. */
  dataUri: string
  /** Raw base64 payload (no `data:` prefix) — what ExcelJS.addImage wants. */
  base64: string
  mime: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml'
  /** jsPDF/ExcelJS can embed PNG and JPEG only. null => HTML-only (e.g. SVG/WEBP). */
  rasterFormat: 'png' | 'jpeg' | null
  /** true when this is the built-in mark rather than an admin upload. */
  isDefault: boolean
}

const MAX_BYTES = 2 * 1024 * 1024
const FETCH_TIMEOUT_MS = 4000
const CACHE_TTL_MS = 5 * 60 * 1000

let cache: { value: SchoolLogo; at: number } | null = null

const DEFAULT_LOGO: SchoolLogo = {
  dataUri: DEFAULT_SCHOOL_LOGO_DATA_URI,
  base64: DEFAULT_SCHOOL_LOGO_BASE64,
  mime: 'image/png',
  rasterFormat: 'png',
  isDefault: true,
}

type LogoMime = SchoolLogo['mime']

function normaliseMime(raw: string | undefined | null, bytes: Buffer): LogoMime | null {
  const m = ((raw ?? '').toLowerCase().split(';')[0] ?? '').trim()
  if (m === 'image/png' || m === 'image/jpeg' || m === 'image/webp' || m === 'image/svg+xml') return m
  if (m === 'image/jpg') return 'image/jpeg'
  // Sniff magic bytes when the server sent a generic content-type.
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png'
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg'
  if (bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  if (bytes.toString('utf8', 0, 200).includes('<svg')) return 'image/svg+xml'
  return null
}

function build(bytes: Buffer, mime: LogoMime): SchoolLogo {
  const base64 = bytes.toString('base64')
  return {
    dataUri: `data:${mime};base64,${base64}`,
    base64,
    mime,
    rasterFormat: mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpeg' : null,
    isDefault: false,
  }
}

async function loadConfigured(ref: string): Promise<SchoolLogo | null> {
  const value = ref.trim()
  if (!value) return null

  // data: URI stored directly in the setting
  const dataMatch = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(value)
  if (dataMatch) {
    const bytes = Buffer.from(dataMatch[2] ?? '', 'base64')
    const mime = normaliseMime(dataMatch[1], bytes)
    return mime && bytes.length <= MAX_BYTES ? build(bytes, mime) : null
  }

  // Our own authenticated proxy path, or a bare storage file id
  const proxyMatch = /^\/api\/files\/([^/?#]+)/.exec(value)
  const bareId = !/^https?:\/\//i.test(value) && !value.startsWith('/') ? value : null
  const proxyId = proxyMatch?.[1]
  const fileId = proxyId ? decodeURIComponent(proxyId) : bareId
  if (fileId) {
    const { buffer, mimeType } = await streamFile(fileId)
    const bytes = Buffer.from(buffer as ArrayBuffer)
    const mime = normaliseMime(mimeType, bytes)
    return mime && bytes.length <= MAX_BYTES ? build(bytes, mime) : null
  }

  // Absolute URL
  if (/^https?:\/\//i.test(value)) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(value, { signal: controller.signal })
      if (!res.ok) return null
      const bytes = Buffer.from(await res.arrayBuffer())
      if (bytes.length > MAX_BYTES) return null
      const mime = normaliseMime(res.headers.get('content-type'), bytes)
      return mime ? build(bytes, mime) : null
    } finally {
      clearTimeout(timer)
    }
  }
  return null
}

/**
 * The logo to stamp on a generated document. Never throws and never returns
 * null: any failure resolving an uploaded logo degrades to the built-in mark.
 */
export async function getSchoolLogo(): Promise<SchoolLogo> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value
  let resolved: SchoolLogo = DEFAULT_LOGO
  try {
    const configured = await settingsService.get(SETTING_KEYS.SCHOOL_LOGO_URL)
    if (configured) {
      const custom = await loadConfigured(String(configured))
      if (custom) resolved = custom
    }
  } catch (err) {
    logger.warn({ err }, '[schoolLogoService] Could not load configured logo — using default mark')
  }
  cache = { value: resolved, at: Date.now() }
  return resolved
}

/** Test/admin hook: drop the cached logo after the setting changes. */
export function invalidateSchoolLogoCache(): void {
  cache = null
}

/**
 * A logo for jsPDF/ExcelJS, which can only embed PNG/JPEG. If the admin logo is
 * SVG/WEBP, fall back to the built-in PNG for those binary formats rather than
 * dropping the logo.
 */
export async function getRasterSchoolLogo(): Promise<SchoolLogo & { rasterFormat: 'png' | 'jpeg' }> {
  const logo = await getSchoolLogo()
  if (logo.rasterFormat) return logo as SchoolLogo & { rasterFormat: 'png' | 'jpeg' }
  return DEFAULT_LOGO as SchoolLogo & { rasterFormat: 'png' | 'jpeg' }
}
