'use client'

/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/shared/PrintLetterhead.tsx
 * [PURPOSE]: School letterhead (logo, name, contact, document title, print
 *   date) that appears ONLY on paper. A few screens print the live page with
 *   window.print() (the student fee statement, the library reports) rather than
 *   generating a PDF; those printouts had no school identity at all. Place this
 *   at the top of the printable region — it is `hidden` on screen and shown
 *   under `print:`. Uses the built-in school mark (the same one the app shell
 *   shows); server-generated PDFs go through schoolLogoService instead, which
 *   can also honour an admin-uploaded logo.
 * [DEPENDS ON]: hooks/useSettings (useSchoolIdentity), lib/schoolLogoData
 */
import { useSchoolIdentity } from '@/hooks/useSettings'
import { DEFAULT_SCHOOL_LOGO_DATA_URI } from '@/lib/schoolLogoData'

interface PrintLetterheadProps {
  /** e.g. "Student Financial Statement". */
  title: string
  /** e.g. "Term 2 · 2025/2026". */
  subtitle?: string
}

export function PrintLetterhead({ title, subtitle }: PrintLetterheadProps) {
  const { data: identity } = useSchoolIdentity()
  const contact = [identity?.schoolAddress, identity?.schoolPhone, identity?.schoolEmail]
    .map((v) => (v ?? '').trim())
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="hidden print:flex items-center gap-4 border-b-2 border-black pb-3 mb-5">
      {/* A plain <img>, not next/image: print-only, inline data URI, and next/image's
          lazy loading can leave it unloaded when the browser snapshots the page. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={DEFAULT_SCHOOL_LOGO_DATA_URI} alt="" className="w-16 h-16 object-contain shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xl font-bold leading-tight">{identity?.schoolName ?? 'School Management System'}</p>
        {contact && <p className="text-xs mt-0.5">{contact}</p>}
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold uppercase tracking-wide">{title}</p>
        {subtitle && <p className="text-xs">{subtitle}</p>}
        <p className="text-xs">Printed {new Date().toLocaleDateString('en-MW')}</p>
      </div>
    </div>
  )
}
