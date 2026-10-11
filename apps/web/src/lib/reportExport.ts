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

/** One exportable table. `rows` is held as unknown[] (type erased at the boundary). */
export interface ExportTable {
  name: string
  columns: CsvColumn<never>[]
  rows: readonly unknown[]
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
export async function downloadXlsx(label: string, tables: readonly ExportTable[]): Promise<boolean> {
  const withRows = tables.filter((t) => t.rows.length > 0)
  if (withRows.length === 0) return false

  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'SMS Malawi'
  wb.created = new Date()

  const names = sheetNames(withRows.map((t) => t.name))
  withRows.forEach((table, i) => {
    const ws = wb.addWorksheet(names[i])
    const matrix = tableToMatrix(table)
    matrix.forEach((cells) => ws.addRow(cells.map((c) => (c === undefined ? null : c))))
    const header = ws.getRow(1)
    header.font = { bold: true }
    header.alignment = { vertical: 'middle' }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
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
  critical: 'CRITICAL',
  watch: 'WATCH',
  info: 'INFO',
  positive: 'GOOD',
}

const PDF_MAX_COLUMNS = 8
const PDF_MAX_ROWS = 60

/** Builds the PDF blob. Exported separately so callers/tests can reuse it. */
export async function buildReportPdf(model: ReportPackModel): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
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
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(15, 52, 96)
    doc.text(text, margin, y)
    y += 6
    doc.setDrawColor(200)
    doc.line(margin, y, pageW - margin, y)
    y += 14
  }

  // Title block
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(90)
  doc.text(model.schoolName.toUpperCase(), margin, y)
  y += 20
  doc.setFontSize(20)
  doc.setTextColor(15, 52, 96)
  doc.text(model.title, margin, y)
  y += 18
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(90)
  const meta = [...model.filters, `Generated ${model.generatedAt.toLocaleString('en-GB')}`].join('  •  ')
  const metaLines = doc.splitTextToSize(meta, contentW) as string[]
  doc.text(metaLines, margin, y)
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
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(110)
        doc.text(k.label, x, y)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(13)
        doc.setTextColor(20)
        doc.text(k.value, x, y + 15)
        if (k.sub) {
          doc.setFont('helvetica', 'normal')
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
      const lines = doc.splitTextToSize(`${ins.title} — ${ins.detail}`, contentW - 60) as string[]
      ensure(lines.length * 11 + 8)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(ins.severity === 'critical' ? 190 : ins.severity === 'watch' ? 160 : 70, ins.severity === 'critical' ? 40 : ins.severity === 'watch' ? 100 : 70, 40)
      doc.text(SEVERITY_LABEL[ins.severity], margin, y)
      doc.setFont('helvetica', 'normal')
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
        doc.setFont('helvetica', bold ? 'bold' : 'normal')
        doc.setFontSize(8)
        doc.setTextColor(30)
        texts.forEach((t, i) => doc.text(t, margin + i * colW + 3, y))
        y += h
      }
      drawRow(headerRow, true)
      matrix.slice(1, PDF_MAX_ROWS + 1).forEach((r) => drawRow(r, false))
      if (matrix.length - 1 > PDF_MAX_ROWS) {
        ensure(14)
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(8)
        doc.setTextColor(110)
        doc.text(`${matrix.length - 1 - PDF_MAX_ROWS} more rows — export to Excel for the full table.`, margin, y)
        y += 14
      }
      if (headerRow.length > cols) {
        ensure(14)
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(8)
        doc.setTextColor(110)
        doc.text(`${headerRow.length - cols} further columns omitted — export to Excel for all columns.`, margin, y)
        y += 14
      }
      y += 10
    })

  // Page numbers + footer
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(`${model.schoolName} — ${model.title}`, margin, pageH - 24)
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
