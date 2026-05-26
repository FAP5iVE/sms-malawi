
import { Resend } from 'resend'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { formatMWK } from '@shared/constants/malawi'
import { addDays } from 'date-fns'

export async function dailyFeeReminderJob(): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY)
  const now = new Date()
  const threeDays = addDays(now, 3)

  const dueInvoices = await prisma.invoice.findMany({
    where: {
      status: { in: ['UNPAID', 'PARTIAL'] },
      dueDate: { gte: now, lte: threeDays },
    },
    select: {
      id: true,
      studentId: true,
      balance: true,
      dueDate: true,
      term: true,
      academicYear: true,
    },
  })

  let sent = 0

  for (const inv of dueInvoices) {
    try {
      const student = await prisma.student.findUnique({
        where: { id: inv.studentId },
        select: {
          firstName: true,
          lastName: true,
          guardianName: true,
          guardianPhone: true,
        },
      })
      if (!student) continue

      const daysLeft = Math.ceil(
        (inv.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )

      await resend.emails.send({
        from: 'fees@school.edu.mw',
        to: [`${student.guardianPhone}@sms.gateway`],
        subject: `Fee Payment Reminder — ${student.firstName} ${student.lastName}`,
        html: buildReminderEmail({
          guardianName: student.guardianName,
          studentName: `${student.firstName} ${student.lastName}`,
          balance: Number(inv.balance),
          dueDate: inv.dueDate.toLocaleDateString('en-MW'),
          daysLeft,
          term: inv.term,
          academicYear: inv.academicYear,
        }),
      })
      sent++
    } catch (err) {
      logger.error({ event: 'fee_reminder.failed', invoiceId: inv.id, err })
    }
  }

  logger.info({ event: 'fee_reminders.sent', count: sent, total: dueInvoices.length })
}

function buildReminderEmail(data: {
  guardianName: string
  studentName: string
  balance: number
  dueDate: string
  daysLeft: number
  term: number
  academicYear: string
}): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; color: #1A2535; }
    .container { max-width: 560px; margin: 0 auto; padding: 24px; }
    .header { background: #0F2744; color: white; padding: 20px 24px; border-radius: 8px 8px 0 0; }
    .body { background: white; padding: 24px; border: 1px solid #DDE4EC; border-top: none; border-radius: 0 0 8px 8px; }
    .amount { background: #FEF3C7; border: 1px solid #FDE68A; border-radius: 6px; padding: 14px; margin: 16px 0; }
    .amount-value { font-size: 24px; font-weight: 700; color: #78350F; }
    .footer { font-size: 11px; color: #64748B; margin-top: 16px; }
  </style></head>
  <body><div class="container">
    <div class="header">
      <p style="margin:0;font-size:18px;font-weight:700;">Fee Payment Reminder</p>
      <p style="margin:4px 0 0;opacity:.7;font-size:13px;">Term ${data.term} · ${data.academicYear}</p>
    </div>
    <div class="body">
      <p>Dear <strong>${data.guardianName}</strong>,</p>
      <p style="margin-top:12px;">This is a reminder that school fees for <strong>${data.studentName}</strong> are due in <strong>${data.daysLeft} day${data.daysLeft !== 1 ? 's' : ''}</strong> (${data.dueDate}).</p>
      <div class="amount">
        <p style="margin:0;font-size:12px;color:#78350F;">Outstanding Balance</p>
        <p class="amount-value">${formatMWK(data.balance)}</p>
      </div>
      <p>Please visit the school finance office or contact your school administrator to arrange payment before the due date to avoid late penalty charges.</p>
      <p class="footer">This is an automated message from the School Management System. Please do not reply to this email.</p>
    </div>
  </div></body></html>`
}