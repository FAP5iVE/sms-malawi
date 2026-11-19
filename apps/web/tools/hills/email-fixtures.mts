/**
 * apps/web/tools/hills/email-fixtures.mts
 *
 * [PURPOSE]: Sample data for every email template (Phase 8f, RULEBOOK section 11), used by the
 *   email tests and by the capture script. Templates import 'server-only', so anything that loads
 *   this file must run with `--conditions=react-server` (hills:test does).
 */
const root = '../../src/server/templates/emails/'
const d = (s: string) => new Date(s)

export const SCHOOL = {
  schoolName: 'Chikangawa Hills Academy',
  schoolAddress: 'P.O. Box 120, Mzuzu, Malawi',
  schoolEmail: 'info@chikangawahills.ac.mw',
  schoolPhone: '+265 1 234 567',
  loginUrl: 'https://sms-malawi.vercel.app',
}

export interface RenderedEmail { name: string; subject: string; html: string; text: string }

export async function renderAll(school = SCHOOL): Promise<RenderedEmail[]> {
  const fee = await import(`${root}fee-reminder.ts`)
  const res = await import(`${root}result-release.ts`)
  const ann = await import(`${root}announcement.ts`)
  const lv = await import(`${root}leave-update.ts`)
  const ca = await import(`${root}contract-alert.ts`)
  const ol = await import(`${root}overdue-library.ts`)
  const pu = await import(`${root}placement-update.ts`)
  const ar = await import(`${root}application-received.ts`)
  const nc = await import(`${root}newsletter-confirm.ts`)
  const pr = await import(`${root}password-reset.ts`)

  const feeBase = { guardianName: 'Mrs Grace Banda', studentName: 'Chimwemwe Banda', studentClass: 'Form 3B', balanceAmount: 120000, dueDate: d('2026-12-05'), invoiceId: 'INV-2026-00418', term: 1, academicYear: '2026', currency: 'MWK', currencyLocale: 'en-MW' }
  const lvBase = { staffName: 'Ms Esther Kamanga', leaveType: 'ANNUAL', startDate: d('2026-12-14'), endDate: d('2026-12-18'), days: 5, reviewedBy: 'Mr Mwale', requestDate: d('2026-11-10') }
  const caBase = { staffName: 'Mr John Chirwa', jobTitle: 'Mathematics teacher', department: 'Academic', employeeNo: 'EMP-0042', contractExpiry: d('2026-12-20') }
  const books = [
    { title: 'Things Fall Apart', author: 'Chinua Achebe', issuedOn: d('2026-10-20'), dueDate: d('2026-11-03'), daysOverdue: 15, fineAmount: 1500 },
    { title: 'A Long Walk to Freedom', author: 'Nelson Mandela', issuedOn: d('2026-10-20'), dueDate: d('2026-11-06'), daysOverdue: 12, fineAmount: 1200 },
  ]
  const olBase = { borrowerName: 'Chimwemwe Banda', borrowerType: 'STUDENT', books, totalFineAmount: 2700, currency: 'MWK', currencyLocale: 'en-MW' }

  const items: [string, string, unknown, Record<string, unknown>][] = [
    ['fee-due', 'renderFeeReminder', { ...feeBase, daysUntilDue: 16 }, fee],
    ['fee-overdue', 'renderFeeReminder', { ...feeBase, dueDate: d('2026-11-10'), daysUntilDue: -9 }, fee],
    ['result-summary', 'renderResultRelease', { studentName: 'Chimwemwe Banda', className: 'Form 3B', term: 1, academicYear: '2026', summary: { average: 74.6, grade: 'B', position: 4, classSize: 52, passStatus: true } }, res],
    ['result-plain', 'renderResultRelease', { studentName: 'Chimwemwe Banda', className: 'Form 3B', term: 1, academicYear: '2026' }, res],
    ['announcement-urgent', 'renderAnnouncement', { title: 'School closes early on Friday because of the storm warning', body: 'Dear parents,\nBecause of the storm warning issued today, classes end at 11:00 on Friday 20 November.\nBuses leave at 11:30.', authorName: 'Mr Peter Mwale', authorTitle: 'Deputy Head', audience: 'ALL', publishedAt: d('2026-11-18'), announcementId: 'a1', eventDate: d('2026-11-20'), category: 'Urgent' }, ann],
    ['announcement-general', 'renderAnnouncement', { title: 'Library opening hours', body: 'The library now opens at 07:00 on school days.', authorName: 'Mrs Tadala Phiri', audience: 'STUDENTS', publishedAt: d('2026-11-18'), announcementId: 'a2', category: 'General' }, ann],
    ['leave-approved', 'renderLeaveUpdate', { ...lvBase, status: 'APPROVED' }, lv],
    ['leave-rejected', 'renderLeaveUpdate', { ...lvBase, status: 'REJECTED', reviewNotes: 'Exam invigilation week. Please choose other dates.' }, lv],
    ['contract-soon', 'renderContractAlert', { ...caBase, daysUntilExpiry: 31 }, ca],
    ['contract-urgent', 'renderContractAlert', { ...caBase, daysUntilExpiry: 9, contractExpiry: d('2026-11-28') }, ca],
    ['licence-expired', 'renderContractAlert', { ...caBase, daysUntilExpiry: -3, contractExpiry: d('2026-11-15'), kind: 'licence' }, ca],
    ['library-overdue', 'renderOverdueLibrary', olBase, ol],
    ['library-reminder', 'renderOverdueLibrary', { ...olBase, books: [{ ...books[0], dueDate: d('2026-11-21'), daysOverdue: 0, fineAmount: 0 }], totalFineAmount: 0, daysUntilDue: 2 }, ol],
    ['placement-confirmed', 'renderPlacementUpdate', { studentName: 'Chimwemwe Banda', statusLabel: 'Confirmed', programmeName: 'BSc Computer Science', universityName: 'University of Malawi', verified: true }, pu],
    ['placement-rejected', 'renderPlacementUpdate', { studentName: 'Chimwemwe Banda', statusLabel: 'Rejected', verified: false, rejectionReason: 'The offer letter could not be matched to a selection list.' }, pu],
    ['application-applicant', 'renderApplicationReceived', { recipient: 'applicant', applicantName: 'Chimwemwe Banda', guardianName: 'Mrs Grace Banda', classApplying: 'Form 1', applicationId: 'APP-2026-0091', submittedAt: d('2026-11-18') }, ar],
    ['application-guardian', 'renderApplicationReceived', { recipient: 'guardian', applicantName: 'Chimwemwe Banda', guardianName: 'Mrs Grace Banda', classApplying: 'Form 1', applicationId: 'APP-2026-0091', submittedAt: d('2026-11-18') }, ar],
    ['newsletter', 'renderNewsletterConfirm', { name: 'Grace', confirmUrl: 'https://sms-malawi.vercel.app/newsletter/confirm?token=abc123' }, nc],
    ['password-reset', 'renderPasswordReset', { name: 'Grace Banda', resetUrl: 'https://sms-malawi.vercel.app/reset-password?oobCode=abc123', expiresInMinutes: 60 }, pr],
  ]
  type Render = (data: unknown, school: typeof SCHOOL) => { subject: string; html: string; text: string }
  return items.map(([name, fn, data, mod]) => ({ name, ...(mod[fn] as Render)(data, school) }))
}
