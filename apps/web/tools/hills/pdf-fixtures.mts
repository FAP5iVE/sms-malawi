/**
 * apps/web/tools/hills/pdf-fixtures.mts
 *
 * [PURPOSE]: Sample data for the PDF documents (Phase 8g, RULEBOOK R11.7), used by the document
 *   tests and the capture script. The builders are the exported pure ones (no database, no
 *   storage). Anything that loads this file must run with `--conditions=react-server` because
 *   the services import 'server-only' (hills:test does).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const publicDir = fileURLToPath(new URL('../../public/', import.meta.url))
const logo = `data:image/png;base64,${readFileSync(`${publicDir}icon-192.png`).toString('base64')}`

export const BRANDING = {
  schoolName: 'Chikangawa Hills Academy',
  motto: 'Knowledge, character, service',
  contactLines: ['P.O. Box 340, Chikangawa, Mzimba South, Northern Region, Malawi', 'Tel: +265 1 234 567', 'info@chikangawahills.ac.mw'],
  logoDataUri: logo,
  place: 'Northern Region · Malawi',
  timezone: 'Africa/Blantyre',
}

export interface RenderedPdf { name: string; pdf: Buffer }
export interface PdfDoc { name: string; build: () => Buffer }

const subj = (subject: string, ca: number, exam: number, grade: string, remarks: string) => ({ subject, caScore: ca, examScore: exam, total: ca + exam, grade, remarks, points: null, inAggregate: true })

export async function pdfDocs(): Promise<PdfDoc[]> {
  const receipt = await import('../../src/server/services/receiptService.ts')
  const transcript = await import('../../src/server/services/transcriptService.ts')
  const card = await import('../../src/server/services/reportCardService.ts')
  const officer = { name: 'Mrs Chikondi Banda', title: 'Bursar', unit: 'Finance and accounts' }
  const head = { name: 'Mr Peter Mwale', title: 'Head teacher', unit: 'Administration' }

  const receiptCtx = {
    studentName: 'Chimwemwe Banda', registrationNo: 'CHA/2026/0418', className: 'Form 3B', invoiceNumber: 'INV-2026-00418',
    academicYear: '2026', term: 1, amount: 120000, methodLabel: 'Mobile money', reference: 'TNM-88213344', paidAt: new Date('2026-11-12T09:30:00Z'),
    lines: [
      { fee: 'Tuition', fixed: 150000, before: 150000, allocated: 100000, after: 50000 },
      { fee: 'Boarding', fixed: 60000, before: 60000, allocated: 20000, after: 40000 },
    ],
    credit: 0,
    invoice: { fixedTotal: 210000, netDue: 210000, paidToDate: 120000, balanceDue: 90000 },
    officer,
  }
  const payslip = {
    staffUid: 'u1', staffName: 'Ms Esther Kamanga', grossSalary: 950000, paye: 150000, pension: 47500, pensionPercent: 5, loanDeduction: 25000, netSalary: 727500,
    period: 'November 2026', processedAt: new Date('2026-11-25T08:00:00Z'), employeeNo: 'EMP-0042', jobTitle: 'Mathematics teacher', department: 'Academic',
    lines: [
      { label: 'Base Salary', amount: 800000, allowance: false },
      { label: 'Allowance (Housing)', amount: 150000, allowance: true },
    ],
    officer,
  }

  const terms = [1, 2, 3].map((term) => ({
    academicYear: '2025/2026', term, className: 'Form 2A',
    subjects: [subj('English', 28, 52, 'A', 'Distinction'), subj('Mathematics', 24, 45, 'B', 'Credit'), subj('Chemistry', 20, 38, 'C', 'Pass'), subj('Chichewa', 27, 50, 'A', 'Distinction')],
    gradingTrack: 'JCE' as const, aggregatePoints: null, termAverage: 71.5, classPosition: 4, classTotal: 52, daysPresent: 58, daysAbsent: 2,
  }))
  const scale = (track: string) => [
    { grade: 'A', pass: true, label: 'Distinction' }, { grade: 'B', pass: true, label: 'Credit' }, { grade: 'C', pass: true, label: 'Pass' }, { grade: 'D', pass: true, label: 'Pass' }, { grade: 'F', pass: false, label: 'Fail' },
  ].map((r) => ({ ...r, ...(track ? {} : {}) }))
  const transcriptData = {
    studentId: 's1', registrationNo: 'CHA/2026/0418', firstName: 'Chimwemwe', lastName: 'Banda', sex: 'FEMALE', dateOfBirth: '2010-04-09',
    schoolName: BRANDING.schoolName, schoolAddress: 'P.O. Box 340, Chikangawa, Mzimba South, Northern Region, Malawi', schoolMotto: BRANDING.motto, schoolPhone: '+265 1 234 567',
    schoolEmail: 'info@chikangawahills.ac.mw', schoolPlace: BRANDING.place, timezone: BRANDING.timezone, schoolLogoDataUri: logo, headTeacher: head,
    gradeScales: { JCE: scale('JCE'), MSCE: scale('MSCE') }, records: terms, generatedAt: '2026-11-19T08:00:00Z',
  }

  const cardData = {
    schoolName: BRANDING.schoolName, schoolMotto: BRANDING.motto, schoolAddress: 'P.O. Box 340, Chikangawa, Mzimba South, Northern Region, Malawi', schoolPhone: '+265 1 234 567',
    schoolEmail: 'info@chikangawahills.ac.mw', schoolLogoUrl: logo,
    student: { registrationNo: 'CHA/2026/0418', firstName: 'Chimwemwe', lastName: 'Banda', sex: 'female', dateOfBirth: '2010-04-09', className: 'Form 2A' },
    classForm: 2, academicYear: '2025/2026', term: 1 as const,
    subjects: terms[0]!.subjects, classPosition: 4, classTotal: 52, totalMarks: 286, averagePercent: 71.5, gradingTrack: 'JCE' as const,
    daysPresent: 58, daysAbsent: 2, totalSchoolDays: 60,
    gradingScale: [
      { grade: 'A', minPercent: 80, maxPercent: 100, pass: true, label: 'Distinction' }, { grade: 'B', minPercent: 70, maxPercent: 79, pass: true, label: 'Credit' },
      { grade: 'C', minPercent: 60, maxPercent: 69, pass: true, label: 'Pass' }, { grade: 'D', minPercent: 50, maxPercent: 59, pass: true, label: 'Pass' }, { grade: 'F', minPercent: 0, maxPercent: 49, pass: false, label: 'Fail' },
    ],
    overallGrade: 'B', classTeacher: 'Ms Esther Kamanga', classTeacherTitle: 'Mathematics teacher', classTeacherComment: 'A steady term. Keep practising chemistry.',
    headTeacher: 'Mr Peter Mwale', headTeacherTitle: 'Head teacher', headTeacherComment: 'Well done.', promotionStatus: null,
    issueDate: '2026-11-19', nextTermDate: '2027-01-11', schoolPlace: BRANDING.place, timezone: BRANDING.timezone,
  }

  return [
    { name: 'receipt', build: () => receipt.buildReceiptPdf(BRANDING, receiptCtx as never, 'RCP-1A2B3C4D') },
    { name: 'payslip', build: () => receipt.buildPayslipPdf(BRANDING, payslip as never) },
    { name: 'transcript', build: () => transcript.generateTranscriptPDF(transcriptData as never) },
    // Many terms: runs onto several pages, so every page has to carry the reference and its own "Page x of y".
    { name: 'transcript-long', build: () => transcript.generateTranscriptPDF({ ...transcriptData, records: Array.from({ length: 4 }, () => terms).flat() } as never) },
    { name: 'report-card', build: () => card.generateReportCardPDF(cardData as never) },
  ]
}

export async function renderAllPdfs(): Promise<RenderedPdf[]> {
  return (await pdfDocs()).map((d) => ({ name: d.name, pdf: d.build() }))
}
