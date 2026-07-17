/*
 * apps/web/src/server/jobs/overdueLibraryJob.ts
 *
 * [CHANGE TYPE]: MAJOR REWRITE
 * [R-PHASE]: R12 — Library Domain & the Storage API Contract Fix
 * [PURPOSE]: Previously this job called only markOverdueBorrowings() — a
 *   bulk status flip with no per-borrower data assembly, so no borrower
 *   was ever actually notified. Added the aggregation step that builds
 *   the OverdueLibraryData shape notificationService.sendOverdueLibraryWarning()
 *   requires (already correctly built and templated via
 *   overdue-library.ts's renderOverdueLibrary(), for both pre-due-reminder
 *   and overdue-notice modes, with zero callers before this fix), then
 *   calls it per affected borrower — matching the exact-day (not
 *   overlapping-range) query pattern hrService.ts's R11
 *   getContractExpiryAlert() fix established, to avoid sending the same
 *   pre-due reminder on every day inside the window instead of once.
 * [DEPENDS ON]: apps/web/src/server/services/notificationService.ts
 *   (sendOverdueLibraryWarning — existing, first real caller as of this
 *   phase), apps/web/src/server/services/settingsService.ts
 *   (SETTING_KEYS.LIBRARY_FINE_PER_DAY / .LIBRARY_REMINDER_DAYS_BEFORE —
 *   existing), apps/web/src/server/services/libraryService.ts
 *   (markOverdueBorrowings — unchanged)
 */
import { markOverdueBorrowings } from '@/server/services/libraryService'
import { sendOverdueLibraryWarning } from '@/server/services/notificationService'
import { getIdentitySettings, get as getSetting } from '@/server/services/settingsService'
import { SETTING_KEYS } from '@shared/types/settings'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { differenceInCalendarDays, startOfDay, addDays } from 'date-fns'
import type { OverdueBook, OverdueLibraryData } from '@/server/templates/emails/overdue-library'

type Borrower = { uid: string | null; name: string; email: string | null; type: 'STUDENT' | 'STAFF' }

function borrowerKey(studentId: string | null, staffId: string | null): string {
  return studentId ? `student:${studentId}` : `staff:${staffId}`
}

export async function overdueLibraryJob(): Promise<void> {
  const count = await markOverdueBorrowings()
  logger.info({ event: 'overdue_library.processed', count })

  const [identity, finePerDay, reminderDaysBefore] = await Promise.all([
    getIdentitySettings(),
    getSetting(SETTING_KEYS.LIBRARY_FINE_PER_DAY),
    getSetting(SETTING_KEYS.LIBRARY_REMINDER_DAYS_BEFORE),
  ])

  const now = new Date()

  // ── OVERDUE NOTICES — every currently-OVERDUE borrowing, grouped by borrower ──
  const overdueBorrowings = await prisma.borrowing.findMany({
    where: { status: 'OVERDUE' },
    include: {
      book:    { select: { title: true, author: true } },
      student: { select: { id: true, firstName: true, lastName: true, email: true } },
      staff:   { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  })

  const overdueByBorrower = new Map<string, { borrower: Borrower; books: OverdueBook[] }>()
  for (const b of overdueBorrowings) {
    const key = borrowerKey(b.studentId, b.staffId)
    const borrower: Borrower = b.student
      ? { uid: b.student.id, name: `${b.student.firstName} ${b.student.lastName}`, email: b.student.email, type: 'STUDENT' }
      : b.staff
        ? { uid: b.staff.id, name: `${b.staff.firstName} ${b.staff.lastName}`, email: b.staff.email, type: 'STAFF' }
        : { uid: null, name: 'Unknown borrower', email: null, type: 'STUDENT' }

    const daysOverdue = Math.max(0, differenceInCalendarDays(now, b.dueDate))
    const entry = overdueByBorrower.get(key) ?? { borrower, books: [] }
    entry.books.push({
      title:       b.book.title,
      author:      b.book.author,
      issuedOn:    b.issuedAt,
      dueDate:     b.dueDate,
      daysOverdue,
      fineAmount:  daysOverdue * finePerDay,
    })
    overdueByBorrower.set(key, entry)
  }

  let overdueSent = 0
  let overdueSkippedNoEmail = 0
  for (const { borrower, books } of overdueByBorrower.values()) {
    if (!borrower.email) {
      overdueSkippedNoEmail++
      logger.warn({ event: 'overdue_library.no_email', borrowerType: borrower.type, borrowerUid: borrower.uid }, 'Overdue library notice skipped — borrower has no email on record')
      continue
    }
    const data: OverdueLibraryData = {
      borrowerName:    borrower.name,
      borrowerType:    borrower.type,
      books,
      totalFineAmount: books.reduce((sum, bk) => sum + bk.fineAmount, 0),
      currency:        identity.currency,
      currencyLocale:  identity.currencyLocale,
    }
    try {
      await sendOverdueLibraryWarning({ to: borrower.email, borrowerUid: borrower.uid ?? undefined, data })
      overdueSent++
    } catch (err) {
      logger.error({ event: 'overdue_library.send_failed', borrowerType: borrower.type, borrowerUid: borrower.uid, err })
    }
  }

  // ── PRE-DUE REMINDERS — ACTIVE borrowings due on exactly reminderDaysBefore days from now ──
  const reminderTarget = startOfDay(addDays(now, reminderDaysBefore))
  const reminderWindowEnd = addDays(reminderTarget, 1)

  const dueSoonBorrowings = await prisma.borrowing.findMany({
    where: { status: 'ACTIVE', dueDate: { gte: reminderTarget, lt: reminderWindowEnd } },
    include: {
      book:    { select: { title: true, author: true } },
      student: { select: { id: true, firstName: true, lastName: true, email: true } },
      staff:   { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  })

  const reminderByBorrower = new Map<string, { borrower: Borrower; books: OverdueBook[] }>()
  for (const b of dueSoonBorrowings) {
    const key = borrowerKey(b.studentId, b.staffId)
    const borrower: Borrower = b.student
      ? { uid: b.student.id, name: `${b.student.firstName} ${b.student.lastName}`, email: b.student.email, type: 'STUDENT' }
      : b.staff
        ? { uid: b.staff.id, name: `${b.staff.firstName} ${b.staff.lastName}`, email: b.staff.email, type: 'STAFF' }
        : { uid: null, name: 'Unknown borrower', email: null, type: 'STUDENT' }

    const entry = reminderByBorrower.get(key) ?? { borrower, books: [] }
    entry.books.push({
      title:       b.book.title,
      author:      b.book.author,
      issuedOn:    b.issuedAt,
      dueDate:     b.dueDate,
      daysOverdue: 0,
      fineAmount:  0,
    })
    reminderByBorrower.set(key, entry)
  }

  let reminderSent = 0
  let reminderSkippedNoEmail = 0
  for (const { borrower, books } of reminderByBorrower.values()) {
    if (!borrower.email) {
      reminderSkippedNoEmail++
      logger.warn({ event: 'overdue_library.reminder_no_email', borrowerType: borrower.type, borrowerUid: borrower.uid }, 'Library return reminder skipped — borrower has no email on record')
      continue
    }
    const data: OverdueLibraryData = {
      borrowerName:    borrower.name,
      borrowerType:    borrower.type,
      books,
      totalFineAmount: 0,
      currency:        identity.currency,
      currencyLocale:  identity.currencyLocale,
      daysUntilDue:    reminderDaysBefore,
    }
    try {
      await sendOverdueLibraryWarning({ to: borrower.email, borrowerUid: borrower.uid ?? undefined, data })
      reminderSent++
    } catch (err) {
      logger.error({ event: 'overdue_library.reminder_send_failed', borrowerType: borrower.type, borrowerUid: borrower.uid, err })
    }
  }

  logger.info({
    event: 'overdue_library.notified',
    overdueSent, overdueSkippedNoEmail, overdueBorrowers: overdueByBorrower.size,
    reminderSent, reminderSkippedNoEmail, reminderBorrowers: reminderByBorrower.size,
  })
}
