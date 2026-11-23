/**
 * apps/web/src/lib/reportExport.ts
 *
 * Client-side export for the Reports workspace. CSV already exists in
 * lib/csv.ts; this adds the two formats the blueprint calls for:
 *
 *  - XLSX: a multi-sheet workbook of every table on the current report tab
 *    (ExcelJS, imported lazily so it never touches the initial bundle).
 *  - PDF report pack: title, school identity, selected filters, generated
 *    time, KPI summary, findings, detail tables, page numbers and a footer
 *    (jsPDF, lazily imported). It opens in a browser tab so the user can read
 *    it before printing or saving — the same Generate → Preview → Download
 *    pattern the app uses for report cards and payslips.
 *
 * Everything here runs on data the user already loaded through their own
 * permission-scoped API calls; nothing is fetched or widened by exporting.
 */
'use client'

import type { CsvCell, CsvColumn } from '@/lib/csv'
import { csvFilename } from '@/lib/csv'
import { DEFAULT_SCHOOL_LOGO_DATA_URI } from '@/lib/schoolLogoData'
import { SITE_NAME } from '@/lib/site'

/** One exportable table. `rows` is held as unknown[] (type erased at the boundary). */
export interface ExportTable {
  name: string
  columns: CsvColumn<never>[]
  rows: readonly unknown[]
  /** Said out loud when the table is not the whole result (e.g. "First 300 largest balances only"). */
  note?: string
}

export interface PackKpi {
  label: string
  value: string
  sub?: string
}

export interface PackInsight {
  severity: 'info' | 'positive' | 'watch' | 'critical'
  title: string
  detail: string
}

export interface ReportPackModel {
  title: string
  schoolName: string
  /** School motto, printed under the name in the letterhead. */
  schoolMotto?: string
  /** "Address · Tel: … · email" — one pre-joined line for the letterhead. */
  schoolContact?: string
  /** PNG/JPEG data URI for the letterhead. Defaults to the built-in school mark. */
  logoDataUri?: string
  /** e.g. ["Academic year: 2025/2026", "Term: 2"] */
  filters: string[]
  generatedAt: Date
  kpis: PackKpi[]
  insights: PackInsight[]
  tables: ExportTable[]
}

/** Row → cell matrix (header first). Pure; unit-tested. */
export function tableToMatrix(table: ExportTable): CsvCell[][] {
  const header = table.columns.map((c) => c.label)
  const body = table.rows.map((row) =>
    table.columns.map((c) => (c.value as (r: unknown) => CsvCell)(row)),
  )
  return [header, ...body]
}

/** What an export file needs to say about itself, so a printout or workbook can be read without the screen. */
export interface ExportAbout {
  title: string
  schoolName: string
  filters: string[]
  generatedAt: Date
}

/**
 * The "About this export" sheet: report, school, when it was generated, the
 * filters that were applied, and for each table how many rows it holds and any
 * note saying it is not the whole result. Pure; unit-tested.
 */
export function aboutMatrix(about: ExportAbout, tables: readonly ExportTable[]): CsvCell[][] {
  const rows: CsvCell[][] = [
    ['Report', about.title],
    ['School', about.schoolName],
    ['Generated', about.generatedAt.toLocaleString('en-GB')],
    ['Filters', about.filters.length > 0 ? about.filters.join('; ') : 'None'],
    [],
    ['Table', 'Rows', 'Note'],
  ]
  for (const t of tables) rows.push([t.name, t.rows.length, t.note ?? 'Complete for the filters above'])
  return rows
}

/** Excel sheet names: max 31 chars, none of : \ / ? * [ ], unique. */
export function sheetNames(names: readonly string[]): string[] {
  const used = new Set<string>()
  return names.map((raw) => {
    const base = raw.replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || 'Sheet'
    let candidate = base
    let n = 2
    while (used.has(candidate.toLowerCase())) {
      const suffix = ` ${n}`
      candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`
      n += 1
    }
    used.add(candidate.toLowerCase())
    return candidate
  })
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Download every table as one sheet each. Returns false when there is nothing to export. */
export async function downloadXlsx(label: string, tables: readonly ExportTable[], about?: ExportAbout): Promise<boolean> {
  const withRows = tables.filter((t) => t.rows.length > 0)
  if (withRows.length === 0) return false

  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = SITE_NAME
  wb.created = new Date()

  // The About sheet is named first so a data table can never take its name.
  const names = sheetNames([...(about ? ['About this export'] : []), ...withRows.map((t) => t.name)]).slice(about ? 1 : 0)
  if (about) {
    const info = wb.addWorksheet('About this export')
    aboutMatrix(about, withRows).forEach((cells) => info.addRow(cells))
    info.getColumn(1).font = { bold: true }
    info.getColumn(1).width = 28
    info.getColumn(2).width = 48
    info.getColumn(3).width = 52
  }
  withRows.forEach((table, i) => {
    const ws = wb.addWorksheet(names[i])
    const matrix = tableToMatrix(table)
    matrix.forEach((cells) => ws.addRow(cells.map((c) => (c === undefined ? null : c))))
    const header = ws.getRow(1)
    header.font = { bold: true }
    header.alignment = { vertical: 'middle' }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    // Printed pages (R11.7): A4 landscape, one page wide, header row repeated, "Page x of y" in the footer.
    ws.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1' }
    ws.headerFooter.oddFooter = `&L&8${names[i]}&C&8Generated &D&R&8Page &P of &N`
    ws.columns.forEach((col, idx) => {
      const widest = matrix.reduce((w, r) => Math.max(w, String(r[idx] ?? '').length), 8)
      col.width = Math.min(48, widest + 2)
    })
  })

  const buffer = await wb.xlsx.writeBuffer()
  triggerDownload(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    csvFilename(label).replace(/\.csv$/, '.xlsx'),
  )
  return true
}

// ─── PDF REPORT PACK ──────────────────────────────────────────────────────────

const SEVERITY_LABEL: Record<PackInsight['severity'], string> = {
  critical: 'Critical',
  watch: 'Watch',
  info: 'Info',
  positive: 'Good',
}

/** The brand navy (--brand-navy, light mode) — a printed pack is paper, so it never re-themes. */
const NAVY: [number, number, number] = [30, 58, 95]
const AMBER_ON_NAVY: [number, number, number] = [245, 185, 66]
const ON_NAVY: [number, number, number] = [214, 224, 237]

interface PdfFamilies { body: string; head: string }

/** Registers the system typefaces (DM Sans body, Inter headings) on a client-side jsPDF.
 *  The font data is a separate lazily-loaded chunk; any failure falls back to Helvetica so an
 *  export is never blocked by a typeface. */
async function registerBrandFonts(doc: { addFileToVFS(n: string, d: string): unknown; addFont(f: string, fam: string, s: string): unknown }): Promise<PdfFamilies> {
  try {
    const { PDF_FONT_DATA } = await import('@/lib/pdfFontData')
    const faces = [
      ['DMSans-Regular', 'DMSans', 'normal'], ['DMSans-Bold', 'DMSans', 'bold'],
      ['Inter-SemiBold', 'Inter', 'normal'], ['Inter-Bold', 'Inter', 'bold'],
    ] as const
    for (const [key, family, style] of faces) {
      doc.addFileToVFS(`${key}.ttf`, PDF_FONT_DATA[key])
      doc.addFont(`${key}.ttf`, family, style)
    }
    return { body: 'DMSans', head: 'Inter' }
  } catch {
    return { body: 'helvetica', head: 'helvetica' }
  }
}

const PDF_MAX_COLUMNS = 8
const PDF_MAX_ROWS = 60

/** Builds the PDF blob. Exported separately so callers/tests can reuse it. */
export async function buildReportPdf(model: ReportPackModel): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
  const fam = await registerBrandFonts(doc)
  /** The custom faces have no italic; fall back to the regular face (Helvetica keeps real italic). */
  const italic = fam.body === 'helvetica' ? 'italic' : 'normal'
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 40
  const contentW = pageW - margin * 2
  let y = margin

  const ensure = (needed: number) => {
    if (y + needed > pageH - margin - 20) {
      doc.addPage()
      y = margin
    }
  }

  const heading = (text: string) => {
    ensure(30)
    doc.setFont(fam.body, 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...NAVY)
    doc.text(text, margin, y)
    y += 6
    doc.setDrawColor(200)
    doc.line(margin, y, pageW - margin, y)
    y += 14
  }

  // Letterhead — the same panel every school document uses: rounded brand navy, logo
  // directly on it at the left, name / motto / contact centred. The report's own title
  // and filters sit beneath it.
  const logoUri = model.logoDataUri ?? DEFAULT_SCHOOL_LOGO_DATA_URI
  const logoFormat = /^data:image\/jpe?g/i.test(logoUri) ? 'JPEG' : 'PNG'
  const logoSize = 46
  const padX = 14
  const textW = contentW - (padX + logoSize + 12) * 2
  const contactLines = model.schoolContact ? (doc.splitTextToSize(model.schoolContact, textW) as string[]).slice(0, 2) : []
  const panelH = Math.max(logoSize + 20, 26 + (model.schoolMotto ? 13 : 0) + contactLines.length * 10 + 16)
  doc.setFillColor(...NAVY)
  doc.roundedRect(margin, y, contentW, panelH, 8, 8, 'F')
  try {
    doc.addImage(logoUri, logoFormat, margin + padX, y + (panelH - logoSize) / 2, logoSize, logoSize)
  } catch {
    // A bad logo must never block a report export — fall back to text only.
  }
  let ty = y + (panelH - (16 + (model.schoolMotto ? 13 : 0) + contactLines.length * 10)) / 2 + 13
  doc.setFont(fam.head, 'bold')
  doc.setFontSize(15)
  doc.setTextColor(255, 255, 255)
  doc.text(model.schoolName.toUpperCase(), pageW / 2, ty, { align: 'center', maxWidth: textW })
  if (model.schoolMotto) {
    ty += 13
    doc.setFont(fam.body, 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...AMBER_ON_NAVY)
    doc.text(model.schoolMotto, pageW / 2, ty, { align: 'center', maxWidth: textW })
  }
  doc.setFont(fam.body, 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...ON_NAVY)
  contactLines.forEach((ln) => { ty += 10; doc.text(ln, pageW / 2, ty, { align: 'center' }) })
  y += panelH + 22

  doc.setFont(fam.head, 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...NAVY)
  doc.text(model.title.toUpperCase(), pageW / 2, y, { align: 'center', charSpace: 1.2 })
  y += 15
  doc.setFont(fam.body, 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100, 116, 139)
  const meta = [...model.filters, `Generated ${model.generatedAt.toLocaleString('en-GB')}`].join('  •  ')
  const metaLines = doc.splitTextToSize(meta, contentW) as string[]
  doc.text(metaLines, pageW / 2, y, { align: 'center' })
  y += metaLines.length * 12 + 10

  // KPI summary (2 per row for legibility)
  if (model.kpis.length > 0) {
    heading('Key indicators')
    const colW = contentW / 2
    for (let i = 0; i < model.kpis.length; i += 2) {
      ensure(40)
      ;[model.kpis[i], model.kpis[i + 1]].forEach((k, col) => {
        if (!k) return
        const x = margin + col * colW
        doc.setFont(fam.body, 'normal')
        doc.setFontSize(8)
        doc.setTextColor(110)
        doc.text(k.label, x, y)
        doc.setFont(fam.body, 'bold')
        doc.setFontSize(13)
        doc.setTextColor(20)
        doc.text(k.value, x, y + 15)
        if (k.sub) {
          doc.setFont(fam.body, 'normal')
          doc.setFontSize(8)
          doc.setTextColor(110)
          doc.text(k.sub, x, y + 26, { maxWidth: colW - 12 })
        }
      })
      y += 40
    }
    y += 4
  }

  // Findings
  if (model.insights.length > 0) {
    heading('Findings')
    model.insights.forEach((ins) => {
      const lines = doc.splitTextToSize(`${ins.title}: ${ins.detail}`, contentW - 60) as string[]
      ensure(lines.length * 11 + 8)
      doc.setFont(fam.body, 'bold')
      doc.setFontSize(8)
      doc.setTextColor(ins.severity === 'critical' ? 190 : ins.severity === 'watch' ? 160 : 70, ins.severity === 'critical' ? 40 : ins.severity === 'watch' ? 100 : 70, 40)
      doc.text(SEVERITY_LABEL[ins.severity], margin, y)
      doc.setFont(fam.body, 'normal')
      doc.setFontSize(9)
      doc.setTextColor(30)
      doc.text(lines, margin + 60, y)
      y += lines.length * 11 + 6
    })
    y += 4
  }

  // Tables
  model.tables
    .filter((t) => t.rows.length > 0)
    .forEach((table) => {
      const matrix = tableToMatrix(table)
      const headerRow = matrix[0] ?? []
      const cols = Math.min(headerRow.length, PDF_MAX_COLUMNS)
      const colW = contentW / cols
      heading(table.name)
      if (table.note) {
        doc.setFont(fam.body, italic)
        doc.setFontSize(8)
        doc.setTextColor(150, 80, 0)
        doc.text(table.note, margin, y - 2)
        y += 10
      }
      const drawRow = (cells: CsvCell[], bold: boolean) => {
        const texts = cells.slice(0, cols).map((c) =>
          doc.splitTextToSize(String(c ?? ''), colW - 6).slice(0, 3) as string[],
        )
        const h = Math.max(...texts.map((t) => t.length)) * 10 + 6
        ensure(h)
        if (bold) {
          doc.setFillColor(238, 242, 247)
          doc.rect(margin, y - 8, contentW, h, 'F')
        }
        doc.setFont(fam.body, bold ? 'bold' : 'normal')
        doc.setFontSize(8)
        doc.setTextColor(30)
        texts.forEach((t, i) => doc.text(t, margin + i * colW + 3, y))
        y += h
      }
      drawRow(headerRow, true)
      matrix.slice(1, PDF_MAX_ROWS + 1).forEach((r) => drawRow(r, false))
      if (matrix.length - 1 > PDF_MAX_ROWS) {
        ensure(14)
        doc.setFont(fam.body, italic)
        doc.setFontSize(8)
        doc.setTextColor(110)
        doc.text(`${matrix.length - 1 - PDF_MAX_ROWS} more rows. Export to Excel for the full table.`, margin, y)
        y += 14
      }
      if (headerRow.length > cols) {
        ensure(14)
        doc.setFont(fam.body, italic)
        doc.setFontSize(8)
        doc.setTextColor(110)
        doc.text(`${headerRow.length - cols} further columns left out. Export to Excel for all columns.`, margin, y)
        y += 14
      }
      y += 10
    })

  // Page numbers + footer
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p)
    doc.setFont(fam.body, 'normal')
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(`${model.schoolName}  ·  ${model.title}`, margin, pageH - 24)
    doc.text(`Page ${p} of ${pages}`, pageW - margin, pageH - 24, { align: 'right' })
  }

  return doc.output('blob')
}

/**
 * Generate the PDF and open it in a new browser tab for review. The tab is
 * opened synchronously (inside the click handler) and navigated once the PDF
 * is ready, so popup blockers do not swallow it.
 */
export async function openReportPdfPreview(model: ReportPackModel): Promise<void> {
  const tab = typeof window !== 'undefined' ? window.open('', '_blank') : null
  try {
    const blob = await buildReportPdf(model)
    const url = URL.createObjectURL(blob)
    if (tab) {
      tab.location.href = url
    } else {
      triggerDownload(blob, csvFilename(model.title).replace(/\.csv$/, '.pdf'))
    }
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000)
  } catch (err) {
    tab?.close()
    throw err
  }
}
