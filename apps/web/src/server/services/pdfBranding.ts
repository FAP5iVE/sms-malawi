/**
 * [CHANGE TYPE]: MAJOR REWRITE (was: a 37-line logo-badge helper)
 * [FILE]: apps/web/src/server/services/pdfBranding.ts
 * [PURPOSE]: THE shared design kit for every server-rendered jsPDF document
 *   (report card, transcript, payment receipt, payslip). Before this each
 *   document drew its own header in its own hard-coded colours with
 *   Helvetica, so the four documents looked like four different products.
 *   Everything that makes a document "ours" now lives here, once:
 *
 *     - PALETTE   PDF_COLORS — the globals.css brand/status tokens as RGB
 *                 (--brand-navy, --brand-teal, --status-success, ...). A
 *                 document never hard-codes a colour; it picks a token.
 *     - TYPE      DM Sans (body) + Inter (headings), the same families the
 *                 app loads, embedded from lib/pdfFontData. If embedding ever
 *                 fails the kit degrades to Helvetica rather than failing the
 *                 document (a PDF must never be refused over a typeface).
 *     - LETTERHEAD  drawLetterhead(): rounded brand-navy panel, logo sitting
 *                 directly on the navy at the left (no white badge), school
 *                 name / motto / contact centred. ONE function; every
 *                 document calls it, so a change happens in one place.
 *     - STAMP     drawStamp(): the circular, double-ring authentication seal.
 *     - SIGNATORY drawSignatory() + resolvers that derive the signing staff
 *                 member's NAME and TITLE from the staff directory (never
 *                 typed, never a generic "Head Teacher" placeholder).
 *     - HELPERS   money/date/number-to-words formatting, tracked (letter-
 *                 spaced) text, truncation, circular text.
 *
 *   Units are millimetres, A4 portrait, throughout.
 * [DEPENDS ON]: jspdf, lib/pdfFontData, lib/prisma (signatory lookups only),
 *   schoolLogoService, settingsService, @shared/constants/malawi (formatMWK)
 */
import 'server-only'

import { jsPDF } from 'jspdf'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { PDF_FONT_DATA } from '@/lib/pdfFontData'
import { getRasterSchoolLogo } from '@/server/services/schoolLogoService'
import { getIdentitySettings } from '@/server/services/settingsService'
import { CURRENCY_CODE, formatMWK } from '@shared/constants/malawi'

// ─────────────────────────────────────────────────────────────────────────────
// PALETTE — RGB equivalents of the light-mode tokens in app/globals.css
// ─────────────────────────────────────────────────────────────────────────────

export type RGB = readonly [number, number, number]

export const PDF_COLORS = {
  // brand
  navy:      [30, 58, 95],     // --brand-navy / --primary        #1e3a5f
  navyDeep:  [14, 34, 64],     // --sidebar-background            #0e2240
  navyMid:   [46, 134, 171],   // --brand-navy-mid                #2e86ab
  teal:      [14, 138, 106],   // --brand-teal                    #0e8a6a
  amber:     [217, 119, 6],    // --brand-amber                   #d97706
  amberOnNavy: [245, 185, 66], // --brand-amber, dark-mode value (reads on navy)
  coral:     [220, 79, 58],    // --brand-coral                   #dc4f3a
  purple:    [107, 63, 160],   // --brand-purple                  #6b3fa0
  // status text colours
  success:   [4, 120, 87],     // --status-success                #047857
  warning:   [180, 83, 9],     // --status-warning                #b45309
  danger:    [185, 28, 28],    // --status-danger                 #b91c1c
  info:      [29, 78, 216],    // --status-info                   #1d4ed8
  neutral:   [71, 85, 105],    // --status-neutral                #475569
  // surfaces + text
  ink:       [15, 23, 42],     // --foreground                    #0f172a
  muted:     [100, 116, 139],  // --muted-foreground              #64748b
  border:    [221, 226, 234],  // --border                        #dde2ea
  rule:      [190, 199, 212],  // --border darkened ~15%: card outlines that must survive white paper + printing
  page:      [244, 247, 249],  // --background                    #f4f7f9
  secondary: [232, 237, 243],  // --secondary                     #e8edf3
  white:     [255, 255, 255],
  onNavy:    [214, 224, 237],  // body text on the navy panel (white @ ~85%)
} as const satisfies Record<string, RGB>

/** `c` mixed toward white by `t` (0 = c, 1 = white) — soft fills for status colours. */
export function tint(c: RGB, t: number): RGB {
  return [
    Math.round(c[0] + (255 - c[0]) * t),
    Math.round(c[1] + (255 - c[1]) * t),
    Math.round(c[2] + (255 - c[2]) * t),
  ]
}

/** Points -> millimetres. */
export const PT = 25.4 / 72

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT FACTORY + TYPE
// ─────────────────────────────────────────────────────────────────────────────

export type PdfFace = 'body' | 'bodyBold' | 'heading' | 'headingBold'

const fontsOk = new WeakMap<object, boolean>()

function registerFonts(doc: jsPDF): boolean {
  try {
    const faces: Array<[keyof typeof PDF_FONT_DATA, string, 'normal' | 'bold']> = [
      ['DMSans-Regular', 'DMSans', 'normal'],
      ['DMSans-Bold', 'DMSans', 'bold'],
      ['Inter-SemiBold', 'Inter', 'normal'],
      ['Inter-Bold', 'Inter', 'bold'],
    ]
    for (const [key, family, style] of faces) {
      const file = `${key}.ttf`
      doc.addFileToVFS(file, PDF_FONT_DATA[key])
      doc.addFont(file, family, style)
    }
    return true
  } catch (err) {
    logger.warn({ err }, '[pdfBranding] Could not embed system fonts — falling back to Helvetica')
    return false
  }
}

/** A4 portrait jsPDF with the system typefaces registered. Use instead of `new jsPDF`. */
export function createPdfDoc(): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  fontsOk.set(doc, registerFonts(doc))
  return doc
}

/** Select a typeface + size (pt) and optionally the text colour. */
export function setFace(doc: jsPDF, face: PdfFace, size: number, color?: RGB): void {
  if (fontsOk.get(doc) === true) {
    switch (face) {
      case 'body':        doc.setFont('DMSans', 'normal'); break
      case 'bodyBold':    doc.setFont('DMSans', 'bold');   break
      case 'heading':     doc.setFont('Inter', 'normal');  break   // Inter SemiBold
      case 'headingBold': doc.setFont('Inter', 'bold');    break
    }
  } else {
    doc.setFont('helvetica', face === 'bodyBold' || face === 'headingBold' ? 'bold' : 'normal')
  }
  doc.setFontSize(size)
  if (color) doc.setTextColor(color[0], color[1], color[2])
}

export function fillColor(doc: jsPDF, c: RGB): void { doc.setFillColor(c[0], c[1], c[2]) }
export function strokeColor(doc: jsPDF, c: RGB): void { doc.setDrawColor(c[0], c[1], c[2]) }

// ─────────────────────────────────────────────────────────────────────────────
// FORMATTING
// ─────────────────────────────────────────────────────────────────────────────

/** "MK 153,250.00" — the system's own formatter, with Intl's non-breaking
 *  spaces normalised so measured widths are predictable. */
export function money(amount: number): string {
  return formatMWK(amount).replace(/[\u00a0\u202f]/g, ' ')
}

/** "153,250.00" — for table cells whose header already says the currency. */
export function fig(amount: number): string {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
}

/** "22 October 2026" in the school's configured timezone (Settings > Identity),
 *  so a 00:30 local payment never prints yesterday's date. An invalid or empty
 *  timezone falls back to the server's. */
export function fmtDate(d: Date | string | number, month: 'long' | 'short' = 'long', timeZone?: string): string {
  const fmt = (tz?: string) =>
    new Intl.DateTimeFormat('en-GB', { day: '2-digit', month, year: 'numeric', ...(tz ? { timeZone: tz } : {}) }).format(new Date(d))
  try { return fmt(timeZone || undefined) } catch { return fmt() }
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
const SCALES = ['', 'Thousand', 'Million', 'Billion', 'Trillion']

function below1000(n: number): string {
  const parts: string[] = []
  const h = Math.floor(n / 100)
  const r = n % 100
  if (h) parts.push(`${ONES[h]} Hundred`)
  if (r) {
    if (r < 20) parts.push(ONES[r] ?? '')
    else parts.push(`${TENS[Math.floor(r / 10)] ?? ''}${r % 10 ? ` ${ONES[r % 10]}` : ''}`)
  }
  return parts.join(' ')
}

function currencyName(): string {
  try {
    return new Intl.DisplayNames('en', { type: 'currency' }).of(CURRENCY_CODE) ?? CURRENCY_CODE
  } catch {
    return CURRENCY_CODE
  }
}

/** 153250 -> "One Hundred Fifty Three Thousand Two Hundred Fifty Malawian Kwacha Only". */
export function amountInWords(amount: number): string {
  const abs = Math.abs(amount)
  let major = Math.floor(abs)
  let minorUnits = Math.round((abs - major) * 100)
  if (minorUnits === 100) { major += 1; minorUnits = 0 }
  const groups: string[] = []
  let n = major
  for (let i = 0; n > 0 && i < SCALES.length; i++) {
    const chunk = n % 1000
    if (chunk) groups.unshift(`${below1000(chunk)}${SCALES[i] ? ` ${SCALES[i]}` : ''}`)
    n = Math.floor(n / 1000)
  }
  const words = groups.length ? groups.join(' ') : 'Zero'
  const minor = minorUnits > 0 ? ` and ${below1000(minorUnits)} Tambala` : ''
  return `${words} ${currencyName()}${minor} Only`
}

// ─────────────────────────────────────────────────────────────────────────────
// TEXT HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export type Align = 'left' | 'center' | 'right'

/** Single-line text with explicit alignment. */
export function put(doc: jsPDF, s: string, x: number, y: number, align: Align = 'left'): void {
  doc.text(s, x, y, { align })
}

/** Shortens `s` with "..." so it fits `maxW` mm at the CURRENT font/size. */
export function ellipsize(doc: jsPDF, s: string, maxW: number): string {
  if (doc.getTextWidth(s) <= maxW) return s
  let out = s
  while (out.length > 1 && doc.getTextWidth(`${out}...`) > maxW) out = out.slice(0, -1)
  return `${out.trimEnd()}...`
}

/** Width of `s` once letter-spaced by `spacing` mm. */
export function trackedWidth(doc: jsPDF, s: string, spacing: number): number {
  const chars = [...s]
  return chars.reduce((w, c) => w + doc.getTextWidth(c), 0) + spacing * Math.max(0, chars.length - 1)
}

/** Letter-spaced text (small-caps labels). Spaced glyph by glyph, so alignment
 *  is exact whatever jsPDF's own charSpace unit handling is. */
export function tracked(doc: jsPDF, s: string, x: number, y: number, spacing: number, align: Align = 'left'): void {
  const total = trackedWidth(doc, s, spacing)
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x
  for (const ch of s) {
    if (ch !== ' ') doc.text(ch, cx, y)
    cx += doc.getTextWidth(ch) + spacing
  }
}

/** Largest font size in [min, start] (pt, current face) at which `s` fits `maxW` mm. */
export function fitFontSize(doc: jsPDF, s: string, maxW: number, start: number, min: number): number {
  let size = start
  while (size > min) {
    doc.setFontSize(size)
    if (doc.getTextWidth(s) <= maxW) return size
    size -= 0.25
  }
  doc.setFontSize(min)
  return min
}

// ─────────────────────────────────────────────────────────────────────────────
// BRANDING (identity + logo, resolved once per document)
// ─────────────────────────────────────────────────────────────────────────────

export interface PdfBranding {
  schoolName: string
  motto: string
  /** Address / "Tel: …" / email — blanks already dropped. */
  contactLines: string[]
  /** Raster (PNG/JPEG) data URI — jsPDF cannot embed SVG/WEBP. */
  logoDataUri: string
  /** "Northern Region · Malawi" — the tail of the address, for the stamp's lower arc. */
  place: string
  /** IANA timezone from Settings > Identity — pass to fmtDate(). */
  timezone: string
}

/** "P.O. Box 340, Chikangawa, Mzimba South, Northern Region, Malawi" ->
 *  "Northern Region · Malawi": the last two address parts (PO boxes skipped),
 *  for the stamp's lower arc. Empty when the school has no address. */
export function stampPlace(address: string | null | undefined): string {
  return (address ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p && !/^p\.?\s*o\.?\s*box/i.test(p))
    .slice(-2)
    .join(' · ')
}

export async function getPdfBranding(): Promise<PdfBranding> {
  const [identity, logo] = await Promise.all([getIdentitySettings(), getRasterSchoolLogo()])
  const phone = (identity.schoolPhone ?? '').trim()
  return {
    schoolName: identity.schoolName,
    motto: (identity.schoolSlogan ?? '').trim(),
    contactLines: [
      (identity.schoolAddress ?? '').trim(),
      phone ? `Tel: ${phone}` : '',
      (identity.schoolEmail ?? '').trim(),
    ].filter(Boolean),
    logoDataUri: logo.dataUri,
    place: stampPlace(identity.schoolAddress),
    timezone: identity.timezone ?? '',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGO (aspect-preserving)
// ─────────────────────────────────────────────────────────────────────────────

const DATA_URI_RE = /^data:image\/(png|jpeg);base64,(.+)$/i

/** Pixel size read from the PNG/JPEG header, or null if it cannot be read. */
function imageSize(dataUri: string): { w: number; h: number } | null {
  const m = DATA_URI_RE.exec(dataUri)
  if (!m?.[2]) return null
  try {
    const buf = Buffer.from(m[2], 'base64')
    if (m[1]?.toLowerCase() === 'png') {
      if (buf.length < 24) return null
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
    }
    let i = 2
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue }
      const marker = buf[i + 1] ?? 0
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }
      }
      i += 2 + buf.readUInt16BE(i + 2)
    }
  } catch { /* fall through */ }
  return null
}

/** Draws the logo contained (never stretched) in the box (x, y, size×size). */
export function drawLogo(doc: jsPDF, dataUri: string | undefined, x: number, y: number, size: number): boolean {
  if (!dataUri) return false
  const m = DATA_URI_RE.exec(dataUri)
  if (!m?.[1]) return false
  try {
    const dim = imageSize(dataUri)
    let w = size
    let h = size
    if (dim && dim.w > 0 && dim.h > 0) {
      const k = Math.min(size / dim.w, size / dim.h)
      w = dim.w * k
      h = dim.h * k
    }
    doc.addImage(dataUri, m[1].toUpperCase() as 'PNG' | 'JPEG', x + (size - w) / 2, y + (size - h) / 2, w, h, undefined, 'FAST')
    return true
  } catch {
    return false
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LETTERHEAD — the one letterhead every document uses
// ─────────────────────────────────────────────────────────────────────────────

export interface LetterheadOptions {
  x: number
  y: number
  w: number
  /** Tighter panel for documents that must fit one page (report card). */
  compact?: boolean
}

/**
 * Rounded brand-navy panel. Logo at the left, directly on the navy. School
 * name, motto and contact line are centred on the panel (the text column is
 * kept symmetric around the centre so it is optically centred, not merely
 * centred in the leftover space beside the logo).
 * @returns the y (mm) directly below the panel.
 */
export function drawLetterhead(doc: jsPDF, b: PdfBranding, o: LetterheadOptions): number {
  const pad = o.compact ? 3.2 : 4.2
  const logoSize = o.compact ? 17 : 21
  const reserve = pad + 1.5 + logoSize + 4          // left edge -> end of logo + gap
  const textW = Math.max(60, o.w - reserve * 2)     // symmetric column
  const cx = o.x + o.w / 2

  // --- measure ---------------------------------------------------------------
  const name = b.schoolName.toUpperCase()
  setFace(doc, 'headingBold', 16)
  let nameSize = fitFontSize(doc, name, textW, o.compact ? 15 : 16, 10.5)
  setFace(doc, 'headingBold', nameSize)
  let nameLines: string[] = [name]
  if (doc.getTextWidth(name) > textW) {
    nameSize = 11
    setFace(doc, 'headingBold', nameSize)
    nameLines = (doc.splitTextToSize(name, textW) as string[]).slice(0, 2)
  }
  const nameLH = nameSize * PT * 1.18

  let mottoLine = ''
  const mottoSize = o.compact ? 8 : 8.5
  if (b.motto) {
    setFace(doc, 'bodyBold', mottoSize)
    mottoLine = ellipsize(doc, b.motto, textW)
  }

  // Contact: one line if it fits; otherwise break it where a reader would —
  // address on the first line, "Tel · email" on the second — never mid-item.
  const SEP = '  ·  '
  let contactSize = o.compact ? 6.8 : 7.2
  let contactLines: string[] = []
  if (b.contactLines.length) {
    const one = b.contactLines.join(SEP)
    setFace(doc, 'body', contactSize)
    if (doc.getTextWidth(one) > textW) {
      contactSize = 6.6
      setFace(doc, 'body', contactSize)
    }
    if (doc.getTextWidth(one) <= textW) {
      contactLines = [one]
    } else {
      const grouped = b.contactLines.length > 1
        ? [b.contactLines[0] ?? '', b.contactLines.slice(1).join(SEP)]
        : [one]
      contactLines = grouped.flatMap((g) => (doc.splitTextToSize(g, textW) as string[]).slice(0, 1)).filter(Boolean)
    }
  }

  const mottoLH = mottoSize * PT * 1.25
  const contactLH = contactSize * PT * 1.35
  const gap1 = mottoLine ? 0.9 : 0
  const gap2 = contactLines.length ? 1.3 : 0
  const textH = nameLines.length * nameLH + gap1 + (mottoLine ? mottoLH : 0) + gap2 + contactLines.length * contactLH
  const h = Math.max(logoSize + pad * 1.6, textH + pad * 2)

  // --- draw ------------------------------------------------------------------
  fillColor(doc, PDF_COLORS.navy)
  doc.roundedRect(o.x, o.y, o.w, h, 3, 3, 'F')

  drawLogo(doc, b.logoDataUri, o.x + pad + 1.5, o.y + (h - logoSize) / 2, logoSize)

  let ty = o.y + (h - textH) / 2
  setFace(doc, 'headingBold', nameSize, PDF_COLORS.white)
  for (const line of nameLines) {
    ty += nameLH
    put(doc, line, cx, ty - nameSize * PT * 0.2, 'center')
  }
  if (mottoLine) {
    ty += gap1 + mottoLH
    setFace(doc, 'bodyBold', mottoSize, PDF_COLORS.amberOnNavy)
    put(doc, mottoLine, cx, ty - mottoSize * PT * 0.25, 'center')
  }
  if (contactLines.length) {
    ty += gap2
    setFace(doc, 'body', contactSize, PDF_COLORS.onNavy)
    for (const line of contactLines) {
      ty += contactLH
      put(doc, line, cx, ty - contactSize * PT * 0.28, 'center')
    }
  }
  return o.y + h
}

/** Centred document title (+ optional subtitle) under the letterhead. @returns next y. */
export function drawDocumentTitle(doc: jsPDF, cx: number, y: number, title: string, subtitle?: string): number {
  setFace(doc, 'headingBold', 12.5, PDF_COLORS.ink)
  tracked(doc, title.toUpperCase(), cx, y + 4, 0.7, 'center')
  let ny = y + 4
  if (subtitle) {
    setFace(doc, 'body', 8.5, PDF_COLORS.muted)
    ny += 4.6
    put(doc, subtitle, cx, ny, 'center')
  }
  return ny + 3
}

/** One tier of a grading scale — all a document needs to colour and label a grade. */
export interface GradeTier { grade: string; pass: boolean; label: string | null }

/** Ink for a grade, derived from its scale row: fail = danger, a bare "Pass"
 *  tier = warning (amber), any higher tier = success. Unknown grade = neutral.
 *  The same rule the on-screen grading key uses. */
export function gradeInk(row: GradeTier | undefined): RGB {
  if (!row) return PDF_COLORS.neutral
  if (!row.pass) return PDF_COLORS.danger
  return (row.label ?? '').trim().toLowerCase() === 'pass' ? PDF_COLORS.warning : PDF_COLORS.success
}

/** Small letter-spaced section label ("FEE BREAKDOWN"). */
export function sectionLabel(doc: jsPDF, text: string, x: number, y: number, color: RGB = PDF_COLORS.muted): void {
  setFace(doc, 'headingBold', 6.8, color)
  tracked(doc, text.toUpperCase(), x, y, 0.45)
}

/** Rounded card with a hairline border (and optional fill). */
export function drawCard(
  doc: jsPDF, x: number, y: number, w: number, h: number,
  opts: { fill?: RGB; stroke?: RGB; radius?: number; lineWidth?: number } = {},
): void {
  const { fill = PDF_COLORS.white, stroke = PDF_COLORS.rule, radius = 2.2, lineWidth = 0.3 } = opts
  fillColor(doc, fill)
  strokeColor(doc, stroke)
  doc.setLineWidth(lineWidth)
  doc.roundedRect(x, y, w, h, radius, radius, 'FD')
}

// ─────────────────────────────────────────────────────────────────────────────
// STAMP — circular, double-ring authentication seal
// ─────────────────────────────────────────────────────────────────────────────

export interface StampOptions {
  cx: number
  cy: number
  /** Outer radius, mm (15 ≈ a 30 mm seal). */
  r: number
  schoolName: string
  /** Lower-arc text, e.g. "Northern Region · Malawi". Falls back to the label. */
  place: string
  /** Centre word: "PAID", "OFFICIAL", "ISSUED". */
  label: string
  /** Centre date line. */
  date: string
  /** Small caps line under the date, e.g. "VALIDATED". */
  caption?: string
  color: RGB
}

type ArcSide = 'top' | 'bottom'

/** Draws `s` along a circle of radius `rBase` (baseline radius), centred on
 *  the top (12 o'clock) or bottom (6 o'clock). Glyphs are rotated individually. */
function arcText(doc: jsPDF, s: string, cx: number, cy: number, rBase: number, side: ArcSide, spacing: number): void {
  const chars = [...s]
  const widths = chars.map((c) => doc.getTextWidth(c))
  const total = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, chars.length - 1)
  let cum = 0
  chars.forEach((ch, i) => {
    const w = widths[i] ?? 0
    const mid = cum + w / 2
    cum += w + spacing
    if (ch === ' ') return
    const offset = (mid - total / 2) / rBase          // radians from the arc's centre
    // theta: clockwise from 12 o'clock. Top text reads clockwise; bottom text
    // (upright when the page is upright) reads counter-clockwise.
    const theta = side === 'top' ? offset : Math.PI - offset
    const px = cx + rBase * Math.sin(theta)
    const py = cy - rBase * Math.cos(theta)
    // Start of the glyph's baseline: back along the reading direction by w/2.
    const dirX = side === 'top' ? Math.cos(theta) : -Math.cos(theta)
    const dirY = side === 'top' ? Math.sin(theta) : -Math.sin(theta)
    const sx = px - dirX * (w / 2)
    const sy = py - dirY * (w / 2)
    const deg = (theta * 180) / Math.PI
    const angle = side === 'top' ? -deg : 180 - deg
    doc.text(ch, sx, sy, { angle })
  })
}

export function drawStamp(doc: jsPDF, o: StampOptions): void {
  const { cx, cy, r, color } = o
  const k = r / 15
  try {
    doc.saveGraphicsState()
    doc.setGState(new doc.GState({ opacity: 0.92 }))
  } catch { /* opacity is cosmetic */ }

  strokeColor(doc, color)
  doc.setLineWidth(0.55 * k)
  doc.circle(cx, cy, r, 'S')
  doc.setLineWidth(0.2 * k)
  doc.circle(cx, cy, r - 0.95 * k, 'S')
  const rInner = r * 0.63
  doc.setLineWidth(0.3 * k)
  doc.circle(cx, cy, rInner, 'S')

  // ring text, auto-fitted so each arc stays under ~155°
  const band = r - 0.95 * k - rInner
  const rMid = rInner + band / 2
  const top = o.schoolName.toUpperCase()
  const bottom = (o.place || o.label).toUpperCase()
  let size = 6.2 * k
  const spacing = 0.28 * k
  while (size > 3.4) {
    setFace(doc, 'headingBold', size, color)
    const limit = rMid * 2.7
    if (Math.max(trackedWidth(doc, top, spacing), trackedWidth(doc, bottom, spacing)) <= limit) break
    size -= 0.2
  }
  setFace(doc, 'headingBold', size, color)
  const cap = size * PT * 0.72
  arcText(doc, top, cx, cy, rMid - cap / 2, 'top', spacing)
  arcText(doc, bottom, cx, cy, rMid + cap / 2, 'bottom', spacing)

  // separator dots at 3 and 9 o'clock
  fillColor(doc, color)
  doc.circle(cx - rMid, cy, 0.5 * k, 'F')
  doc.circle(cx + rMid, cy, 0.5 * k, 'F')

  // centre: label / date / caption
  const label = o.label.toUpperCase()
  setFace(doc, 'headingBold', 13 * k, color)
  const labelSize = fitFontSize(doc, label, rInner * 1.5, 13 * k, 6)
  setFace(doc, 'headingBold', labelSize, color)
  tracked(doc, label, cx, cy - 0.4 * k, 0.4 * k, 'center')
  doc.setLineWidth(0.18 * k)
  doc.line(cx - rInner * 0.62, cy + 0.9 * k, cx + rInner * 0.62, cy + 0.9 * k)
  setFace(doc, 'bodyBold', 5.4 * k, color)
  put(doc, o.date, cx, cy + 3.9 * k, 'center')
  if (o.caption) {
    setFace(doc, 'headingBold', 4.2 * k, color)
    tracked(doc, o.caption.toUpperCase(), cx, cy + 6.7 * k, 0.35 * k, 'center')
  }

  try { doc.restoreGraphicsState() } catch { /* paired with the save above */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// SIGNATORY BLOCK + resolvers (name & title come from the staff directory)
// ─────────────────────────────────────────────────────────────────────────────

export interface PdfSignatory {
  /** "First Last"; null when the directory has nobody for the role. */
  name: string | null
  /** The staff member's own job title, e.g. "Bursar". */
  title: string
  /** Their department, e.g. "Finance & Accounts". */
  unit: string | null
}

/**
 * Signature line with name / title / unit beneath. `y` is the TOP of the block;
 * the line sits `space` mm below it so a wet signature has room.
 * @returns the y below the block.
 */
export function drawSignatory(
  doc: jsPDF,
  o: { x: number; y: number; w: number; sig: PdfSignatory; org: string; space?: number },
): number {
  const lineY = o.y + (o.space ?? 11)
  strokeColor(doc, PDF_COLORS.muted)
  doc.setLineWidth(0.25)
  doc.line(o.x, lineY, o.x + o.w, lineY)

  let y = lineY + 4
  if (o.sig.name) {
    setFace(doc, 'bodyBold', 9, PDF_COLORS.ink)
    put(doc, ellipsize(doc, o.sig.name, o.w), o.x, y)
    y += 3.9
  }
  setFace(doc, 'headingBold', 6.4, PDF_COLORS.neutral)
  tracked(doc, ellipsize(doc, o.sig.title.toUpperCase(), o.w), o.x, y, 0.35)
  y += 3.4
  setFace(doc, 'body', 7, PDF_COLORS.muted)
  put(doc, ellipsize(doc, [o.sig.unit, o.org].filter(Boolean).join(' · '), o.w), o.x, y)
  return y + 1.5
}

const HEAD_TITLE_RE = /^(head\s*teacher|headmaster|headmistress|principal)\b/i
const FINANCE_LEAD_RE = /bursar|finance\s+(manager|director|head)|head\s+of\s+finance|chief\s+accountant/i
const FINANCE_OFFICER_RE = /accountant|finance\s+officer|accounts\s+officer/i

interface StaffRow {
  uid: string
  firstName: string
  lastName: string
  jobTitle: string
  department: string
  role: string
  departmentRef: { name: string } | null
}

function toSignatory(s: StaffRow): PdfSignatory {
  return {
    name: `${s.firstName} ${s.lastName}`.trim(),
    title: s.jobTitle,
    unit: s.departmentRef?.name ?? (s.department || null),
  }
}

const STAFF_SELECT = {
  uid: true, firstName: true, lastName: true, jobTitle: true, department: true, role: true,
  departmentRef: { select: { name: true } },
} as const

/** Any staff member by Firebase UID, as a signatory. null if no such profile. */
export async function resolveStaffSignatory(uid: string | null | undefined): Promise<PdfSignatory | null> {
  if (!uid) return null
  const s = await prisma.staffProfile.findFirst({ where: { uid }, select: STAFF_SELECT })
  return s ? toSignatory(s) : null
}

/** The school's Head Teacher: the active senior-leadership staff member whose
 *  own job title is Head Teacher / Headmaster / Principal (never a Deputy). */
export async function resolveHeadTeacher(): Promise<PdfSignatory | null> {
  const candidates = await prisma.staffProfile.findMany({
    where: { role: 'high_rank', status: 'ACTIVE' },
    select: STAFF_SELECT,
    orderBy: { dateJoined: 'asc' },
  })
  const head = candidates.find((s) => HEAD_TITLE_RE.test(s.jobTitle.trim()) && !/deputy|assistant/i.test(s.jobTitle))
  return head ? toSignatory(head) : null
}

/**
 * The finance officer to sign a document. `preferUid` (the officer who actually
 * recorded the payment / ran the payroll) wins when that person is finance
 * staff — or, with `anyRole`, whatever their role. Otherwise the most senior
 * active finance staff member: Bursar / finance lead, then accountant /
 * accounts officer, then the longest-serving.
 */
export async function resolveFinanceSignatory(
  preferUid?: string | null,
  opts: { anyRole?: boolean } = {},
): Promise<PdfSignatory | null> {
  let preferred: StaffRow | null = null
  if (preferUid) {
    preferred = await prisma.staffProfile.findFirst({ where: { uid: preferUid }, select: STAFF_SELECT })
    if (preferred && (preferred.role === 'finance' || opts.anyRole)) return toSignatory(preferred)
  }
  const finance = await prisma.staffProfile.findMany({
    where: { role: 'finance', status: 'ACTIVE' },
    select: STAFF_SELECT,
    orderBy: { dateJoined: 'asc' },
  })
  const pick =
    finance.find((s) => FINANCE_LEAD_RE.test(s.jobTitle)) ??
    finance.find((s) => FINANCE_OFFICER_RE.test(s.jobTitle)) ??
    finance[0]
  if (pick) return toSignatory(pick)
  return preferred ? toSignatory(preferred) : null
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE FOOTER
// ─────────────────────────────────────────────────────────────────────────────

/** Hairline + centred grey note, e.g. "Generated on … This is a computer-generated document." */
export function drawFooterNote(doc: jsPDF, x: number, w: number, y: number, text: string): void {
  strokeColor(doc, PDF_COLORS.border)
  doc.setLineWidth(0.25)
  doc.line(x, y, x + w, y)
  setFace(doc, 'body', 7, PDF_COLORS.muted)
  put(doc, text, x + w / 2, y + 4, 'center')
}
