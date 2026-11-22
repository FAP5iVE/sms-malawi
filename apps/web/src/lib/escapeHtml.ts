/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/lib/escapeHtml.ts
 * [PURPOSE]: Minimal HTML escaping for the server-rendered document templates
 *   (receipt/payslip PDFs). Those templates interpolate student names,
 *   references and school settings straight into markup that headless Chromium
 *   renders, so an unescaped `<` in a payment reference or a school name would
 *   break the layout (or inject markup into the PDF).
 * [DEPENDS ON]: none
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
