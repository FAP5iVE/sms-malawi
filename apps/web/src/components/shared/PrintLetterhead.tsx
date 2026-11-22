'use client'

/**
 * [CHANGE TYPE]: REDESIGN (was: a black-ruled text header)
 * [FILE]: apps/web/src/components/shared/PrintLetterhead.tsx
 * [PURPOSE]: The school letterhead for everything the BROWSER prints, and the
 *   single React home of the paper design tokens. It is the HTML twin of
 *   server/services/pdfBranding.drawLetterhead(): the same rounded brand-navy
 *   panel, the logo sitting directly on the navy at the left (no badge), and the
 *   school name / motto / contact centred — so a printed fee statement, a library
 *   report and a downloaded PDF all carry one identity.
 *
 *   Exports:
 *     PAPER / FONT_BODY / FONT_HEAD  — fixed light-mode brand colours + the app's
 *         own typefaces. Fixed on purpose: the app's CSS tokens re-theme in dark
 *         mode (--brand-navy turns light blue) but paper must print the same
 *         whatever theme the screen is in. Values mirror pdfBranding.PDF_COLORS.
 *     LetterheadPanel  — the panel itself (used by PrintableReportCard too).
 *     PrintLetterhead  — panel + centred document title, `hidden` on screen and
 *         shown only under `print:`. A few screens print the live page with
 *         window.print() (student fee statement, library reports) rather than
 *         generating a PDF; place this at the top of the printable region.
 *   Uses the built-in school mark (as the app shell does); server-generated PDFs
 *   go through schoolLogoService, which also honours an admin-uploaded logo.
 * [DEPENDS ON]: hooks/useSettings (useSchoolIdentity), lib/schoolLogoData
 */
import type { CSSProperties } from 'react'
import { useSchoolIdentity } from '@/hooks/useSettings'
import { DEFAULT_SCHOOL_LOGO_DATA_URI } from '@/lib/schoolLogoData'

export const PAPER = {
  navy: '#1e3a5f', ink: '#0f172a', muted: '#64748b', neutral: '#475569',
  border: '#dde2ea', rule: '#bec7d4', secondary: '#e8edf3', zebra: '#f3f6f9', navyTint: '#e4e9ef',
  success: '#047857', warning: '#b45309', danger: '#b91c1c',
  amberOnNavy: '#f5b942', onNavy: '#d6e0ed', white: '#ffffff',
} as const

export const FONT_BODY = "var(--font-sans), 'DM Sans', 'Segoe UI', Arial, sans-serif"
export const FONT_HEAD = "var(--font-heading), 'Inter', 'Segoe UI', Arial, sans-serif"

const EXACT_COLOR: CSSProperties = { WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }

interface LetterheadPanelProps {
  schoolName: string
  motto?: string | null | undefined
  /** Address / "Tel: …" / email, in that order; blanks are skipped. Printed on one line
   *  when it fits, otherwise broken after the address — never mid-item. */
  contact?: Array<string | null | undefined>
  /** Defaults to the built-in school mark. */
  logoSrc?: string | null | undefined
  /** Tighter panel for documents that must fit one page (report card). */
  compact?: boolean
}

export function LetterheadPanel({ schoolName, motto, contact, logoSrc, compact = false }: LetterheadPanelProps) {
  const logo = compact ? '17mm' : '21mm'
  const parts = (contact ?? []).map((v) => (v ?? '').trim()).filter(Boolean)
  const SEP = '  ·  '
  // ~96 characters is what the centred column holds at this size (≈105 when compact).
  const contactLines = parts.join(SEP).length > (compact ? 105 : 96) && parts.length > 1
    ? [parts[0] ?? '', parts.slice(1).join(SEP)]
    : [parts.join(SEP)].filter(Boolean)
  return (
    <div
      style={{
        ...EXACT_COLOR,
        display: 'grid', gridTemplateColumns: `${logo} 1fr ${logo}`, alignItems: 'center', columnGap: '3mm',
        background: PAPER.navy, color: PAPER.white, borderRadius: '3mm',
        padding: compact ? '3.2mm 4.7mm' : '4.2mm 5.7mm', fontFamily: FONT_BODY,
      }}
    >
      {/* The logo sits directly on the navy — no badge. A plain <img>: print-only,
          inline data URI, and next/image's lazy loading can leave it unloaded when
          the browser snapshots the page. Contained, never cropped. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoSrc || DEFAULT_SCHOOL_LOGO_DATA_URI} alt="" style={{ width: logo, height: logo, objectFit: 'contain', display: 'block' }} />
      <div style={{ textAlign: 'center', minWidth: 0 }}>
        <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: compact ? '15pt' : '16pt', textTransform: 'uppercase', lineHeight: 1.18 }}>
          {schoolName}
        </div>
        {motto && <div style={{ fontWeight: 700, fontSize: compact ? '8pt' : '8.5pt', color: PAPER.amberOnNavy, marginTop: '0.9mm' }}>{motto}</div>}
        {contactLines.length > 0 && (
          <div style={{ fontSize: compact ? '6.8pt' : '7.2pt', color: PAPER.onNavy, marginTop: '1.3mm', lineHeight: 1.35 }}>
            {contactLines.map((line) => <div key={line}>{line}</div>)}
          </div>
        )}
      </div>
      <div />
    </div>
  )
}

interface PrintLetterheadProps {
  /** e.g. "Student Financial Statement". */
  title: string
  /** e.g. "Term 2 · 2025/2026". */
  subtitle?: string
}

export function PrintLetterhead({ title, subtitle }: PrintLetterheadProps) {
  const { data: identity } = useSchoolIdentity()
  const contact = [identity?.schoolAddress, identity?.schoolPhone ? `Tel: ${identity.schoolPhone}` : '', identity?.schoolEmail]

  // "24 October 2026" in the school's own timezone; an unusable zone falls back to the browser's.
  const printed = (() => {
    const base = { day: '2-digit', month: 'long', year: 'numeric' } as const
    try {
      return new Intl.DateTimeFormat('en-GB', { ...base, ...(identity?.timezone ? { timeZone: identity.timezone } : {}) }).format(new Date())
    } catch {
      return new Intl.DateTimeFormat('en-GB', base).format(new Date())
    }
  })()

  return (
    <div className="hidden print:block mb-5" style={EXACT_COLOR}>
      <LetterheadPanel schoolName={identity?.schoolName ?? 'School Management System'} motto={identity?.schoolSlogan} contact={contact} />
      <div style={{ textAlign: 'center', marginTop: '5mm', fontFamily: FONT_BODY }}>
        <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: '12pt', letterSpacing: '0.12em', textTransform: 'uppercase', color: PAPER.ink }}>{title}</div>
        <div style={{ fontSize: '8.2pt', color: PAPER.muted, marginTop: '1mm' }}>
          {[subtitle, `Printed ${printed}`].filter(Boolean).join('  ·  ')}
        </div>
      </div>
    </div>
  )
}
