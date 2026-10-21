/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/server/services/pdfBranding.ts
 * [PURPOSE]: Shared jsPDF helper that stamps the school logo into a document
 *   header (report card, transcript). The logo sits on a white rounded badge so
 *   the orange mark keeps its contrast on the navy header bar. jsPDF can embed
 *   only PNG/JPEG, so anything else is skipped quietly here — callers feed it
 *   the raster-safe logo from schoolLogoService.getRasterSchoolLogo(), and a
 *   missing/invalid logo must never fail a document.
 * [DEPENDS ON]: jspdf (type only)
 */
import 'server-only'

import type { jsPDF } from 'jspdf'

const DATA_URI_RE = /^data:image\/(png|jpeg);base64,/i

/**
 * Draws the logo badge with its top-left corner at (x, y), `size` mm square.
 * @returns true if an image was drawn.
 */
export function drawLogoBadge(doc: jsPDF, dataUri: string | undefined, x: number, y: number, size: number): boolean {
  if (!dataUri) return false
  const m = DATA_URI_RE.exec(dataUri)
  if (!m) return false
  try {
    const format = m[1]
    if (!format) return false
    const pad = size * 0.1
    doc.setFillColor(255, 255, 255)
    doc.roundedRect(x, y, size, size, 1.8, 1.8, 'F')
    doc.addImage(dataUri, format.toUpperCase() as 'PNG' | 'JPEG', x + pad, y + pad, size - 2 * pad, size - 2 * pad)
    return true
  } catch {
    return false
  }
}
