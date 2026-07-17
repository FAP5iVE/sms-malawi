/*
 * apps/web/src/server/jobs/feeReminderJob.ts
 *
 * [CHANGE TYPE]: MAJOR REWRITE of the send path only. The overdue-invoice
 *   query logic (which invoices are due within the reminder window) is
 *   unchanged from the prior implementation.
 * [R-PHASE]: R9 — Finance I: Invoicing, Fees & the Accounting Ledger
 *   Reconnection
 * [PURPOSE]:
 *   1. HIGHEST-PRIORITY FIX: deleted the inline buildReminderEmail() HTML
 *      builder and its `${student.guardianPhone}@sms.gateway` recipient —
 *      Resend is an email API, not an SMS gateway; no mail server has ever
 *      resolved for that fabricated domain, so 100% of fee reminders have
 *      silently failed to deliver since this job's inception. Sends now go
 *      through notificationService.sendBulkFeeReminders() — the
 *      already-correctly-built, doc-comment-confirmed "used by the daily
 *      fee reminder cron job" implementation that was sitting unused
 *      beside this broken one — which uses each student's real `email`
 *      field (the only guardian-reachable email field on the Student
 *      model) and renders through the properly design-token-styled
 *      fee-reminder.ts template, with correct per-recipient pacing for
 *      Resend's rate limits.
 *   2. The direct `new Resend(...)` construction and the hardcoded
 *      'fees@school.edu.mw' sender literal are both removed along with the
 *      inline builder — sendBulkFeeReminders()/sendEmail() resolve the
 *      sender through lib/email.ts's singleton (EMAIL_FROM_ADDRESS /
 *      EMAIL_FROM_NAME), never a per-job hardcoded literal.
 *   3. A student with no `email` on record cannot receive a reminder (the
 *      Student model has no separate guardian-email field) — this is now
 *      logged and skipped explicitly rather than papered over with a
 *      fabricated address that looked like it worked but never delivered.
 * [DEPENDS ON]: notificationService.sendBulkFeeReminders() (existing),
 *   settingsService.getIdentitySettings() (existing, R5 pattern) for the
 *   currency/currencyLocale the fee-reminder.ts template needs.
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { sendBulkFeeReminders, type BulkFeeReminderItem } from '@/server/services/notificationService'
import { getIdentitySettings } from '@/server/services/settingsService'
import { addDays } from 'date-fns'

export async function dailyFeeReminderJob(): Promise<void> {
  const now       = new Date()
  const threeDays = addDays(now, 3)

  const dueInvoices = await prisma.invoice.findMany({
    where: {
      status:  { in: ['UNPAID', 'PARTIAL'] },
      dueDate: { gte: now, lte: threeDays },
    },
    select: {
      id:           true,
      studentId:    true,
      balance:      true,
      dueDate:      true,
      term:         true,
      academicYear: true,
    },
  })

  if (dueInvoices.length === 0) {
    logger.info({ event: 'fee_reminders.sent', count: 0, total: 0 })
    return
  }

  const identity = await getIdentitySettings()

  const items: BulkFeeReminderItem[] = []
  let skippedNoEmail = 0

  for (const inv of dueInvoices) {
    const student = await prisma.student.findUnique({
      where:  { id: inv.studentId },
      select: {
        firstName:     true,
        lastName:      true,
        email:         true,
        guardianName:  true,
        guardianPhone: true,
        firebaseUid:   true,
        class:         { select: { name: true } },
      },
    })

    if (!student) continue

    if (!student.email) {
      skippedNoEmail++
      logger.warn(
        { event: 'fee_reminder.no_email', invoiceId: inv.id, studentId: inv.studentId },
        'Fee reminder skipped — student has no email on record',
      )
      continue
    }

    const daysUntilDue = Math.ceil(
      (inv.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    )

    items.push({
      to:            student.email,
      studentUid:    student.firebaseUid ?? undefined,
      guardianPhone: student.guardianPhone,
      data: {
        guardianName:   student.guardianName,
        studentName:    `${student.firstName} ${student.lastName}`,
        studentClass:   student.class?.name ?? '—',
        balanceAmount:  Number(inv.balance),
        dueDate:        inv.dueDate,
        invoiceId:      inv.id,
        term:           inv.term,
        academicYear:   inv.academicYear,
        currency:       identity.currency,
        currencyLocale: identity.currencyLocale,
        daysUntilDue,
      },
    })
  }

  const result = await sendBulkFeeReminders(items)

  logger.info(
    {
      event:    'fee_reminders.sent',
      count:    result.sent,
      failed:   result.failed,
      skipped:  result.skipped + skippedNoEmail,
      total:    dueInvoices.length,
    },
    'Daily fee reminder job complete',
  )
}
