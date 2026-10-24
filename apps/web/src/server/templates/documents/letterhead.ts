/**
 * [CHANGE TYPE]: REDESIGN (matches pdfBranding.drawLetterhead and components/shared/PrintLetterhead)
 * [FILE]: apps/web/src/server/templates/documents/letterhead.ts
 * [PURPOSE]: The shared header block for any server-rendered HTML->PDF
 *   document. Same design as every other school document: a rounded brand-navy
 *   panel, the logo sitting directly on the navy at the left (no white badge),
 *   school name / motto / contact centred, then the document title centred
 *   beneath. One letterhead = one place to change. All interpolated values are
 *   escaped. The logo is an inline data URI (see schoolLogoService), so
 *   headless Chromium never needs the network to render it.
 *   NOTE: the jsPDF documents (report card, receipt, payslip, transcript) draw
 *   this same panel with pdfBranding.drawLetterhead(); no document currently
 *   renders through this HTML template, it is kept in step for when one does.
 * [DEPENDS ON]: lib/escapeHtml
 */
import { escapeHtml } from '@/lib/escapeHtml'

export interface LetterheadInput {
  logoDataUri: string
  schoolName: string
  /** School motto, shown under the name. */
  motto?: string | null | undefined
  /** Address / phone / email — blanks are skipped. */
  contactLines?: Array<string | null | undefined>
  /** e.g. "Payment Receipt", "Payslip — March 2026". */
  documentTitle: string
}

/** CSS for {@link letterheadHtml}. Include once inside the document's <style>.
 *  Colours are the light-mode brand tokens (a printed document never re-themes). */
export const LETTERHEAD_CSS = `
    .lh{background:#1e3a5f;color:#fff;padding:4.2mm 5.7mm;border-radius:3mm;display:grid;grid-template-columns:21mm 1fr 21mm;column-gap:3mm;align-items:center;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    .lh-logo{width:21mm;height:21mm;object-fit:contain;display:block;}
    .lh-text{text-align:center;min-width:0;}
    .lh-name{margin:0;font-family:'Inter',sans-serif;font-size:16pt;font-weight:700;line-height:1.18;text-transform:uppercase;}
    .lh-motto{font-size:8.5pt;font-weight:700;color:#f5b942;margin-top:.9mm;}
    .lh-contact{font-size:7.2pt;color:#d6e0ed;margin-top:1.3mm;line-height:1.35;}
    .lh-title{text-align:center;margin-top:5mm;font-family:'Inter',sans-serif;font-size:12pt;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#0f172a;}
`

export function letterheadHtml(input: LetterheadInput): string {
  const contact = (input.contactLines ?? [])
    .map((l) => (l ?? '').trim())
    .filter(Boolean)
    .map(escapeHtml)
    .join(' · ')
  const motto = (input.motto ?? '').trim()
  return `<div class="lh">
      <img class="lh-logo" src="${input.logoDataUri}" alt="" />
      <div class="lh-text">
        <h2 class="lh-name">${escapeHtml(input.schoolName)}</h2>
        ${motto ? `<div class="lh-motto">${escapeHtml(motto)}</div>` : ''}
        ${contact ? `<div class="lh-contact">${contact}</div>` : ''}
      </div>
      <div></div>
    </div>
    <div class="lh-title">${escapeHtml(input.documentTitle)}</div>`
}
