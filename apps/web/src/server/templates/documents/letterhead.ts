/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/server/templates/documents/letterhead.ts
 * [PURPOSE]: The shared header block for every server-rendered HTML->PDF
 *   document (receipts, payslips). One letterhead = the school logo + name +
 *   contact line + document title, so documents stay visually consistent and a
 *   logo change happens in exactly one place. All interpolated values are
 *   escaped. The logo is an inline data URI (see schoolLogoService), so
 *   headless Chromium never needs the network to render it.
 * [DEPENDS ON]: lib/escapeHtml
 */
import { escapeHtml } from '@/lib/escapeHtml'

export interface LetterheadInput {
  logoDataUri: string
  schoolName: string
  /** Address / phone / email — blanks are skipped. */
  contactLines?: Array<string | null | undefined>
  /** e.g. "Payment Receipt", "Payslip — March 2026". */
  documentTitle: string
}

/** CSS for {@link letterheadHtml}. Include once inside the document's <style>. */
export const LETTERHEAD_CSS = `
    .lh{background:#0F2744;color:#fff;padding:18px 22px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:16px;}
    .lh-logo{flex:0 0 auto;width:64px;height:64px;background:#fff;border-radius:12px;padding:6px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;}
    .lh-logo img{max-width:100%;max-height:100%;object-fit:contain;display:block;}
    .lh-text{flex:1 1 auto;min-width:0;}
    .lh-name{margin:0;font-size:20px;font-weight:700;line-height:1.2;}
    .lh-contact{font-size:11.5px;color:#B7C4D6;margin-top:3px;}
    .lh-title{flex:0 0 auto;text-align:right;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#fff;}
`

export function letterheadHtml(input: LetterheadInput): string {
  const contact = (input.contactLines ?? [])
    .map((l) => (l ?? '').trim())
    .filter(Boolean)
    .map(escapeHtml)
    .join(' · ')
  return `<div class="lh">
      <div class="lh-logo"><img src="${input.logoDataUri}" alt="" /></div>
      <div class="lh-text">
        <h2 class="lh-name">${escapeHtml(input.schoolName)}</h2>
        ${contact ? `<div class="lh-contact">${contact}</div>` : ''}
      </div>
      <div class="lh-title">${escapeHtml(input.documentTitle)}</div>
    </div>`
}
