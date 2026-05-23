"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dailyInstallmentCheck = exports.dailyLatePenalties = exports.dailyFeeReminder = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const resend_1 = require("resend");
const prisma_1 = require("./lib/prisma");
const logger_1 = require("./lib/logger");
const feeService_1 = require("./services/feeService");
const installmentService_1 = require("./services/installmentService");
const malawi_1 = require("../../../packages/shared/constants/malawi");
const date_fns_1 = require("date-fns");
const resend = new resend_1.Resend(process.env.RESEND_API_KEY);
// ─────────────────────────────────────────────────────────
// JOB 1: Daily fee reminder
// Runs every day at 07:00 Africa/Blantyre time.
// Sends email (+ SMS if Twilio configured) to guardians
// of students with invoices due in the next 3 days.
// ─────────────────────────────────────────────────────────
exports.dailyFeeReminder = (0, scheduler_1.onSchedule)({
    schedule: '0 7 * * *', // every day at 07:00
    timeZone: 'Africa/Blantyre',
    region: 'africa-south1',
}, async () => {
    const now = new Date();
    const threeDays = (0, date_fns_1.addDays)(now, 3);
    // Find unpaid/partial invoices due within 3 days
    const dueInvoices = await prisma_1.prisma.invoice.findMany({
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
    });
    let sent = 0;
    for (const inv of dueInvoices) {
        try {
            // Look up student guardian contact
            const student = await prisma_1.prisma.student.findUnique({
                where: { id: inv.studentId },
                select: {
                    firstName: true,
                    lastName: true,
                    guardianName: true,
                    guardianPhone: true,
                },
            });
            if (!student)
                continue;
            const daysLeft = Math.ceil((inv.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            // Send email via Resend
            await resend.emails.send({
                from: 'fees@school.edu.mw', // use your verified Resend domain
                to: [`${student.guardianPhone}@sms.gateway`], // replace with real email when guardians have emails
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
            });
            sent++;
            // Optional Twilio SMS — uncomment if Twilio is configured
            // const twilio = require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
            // await twilio.messages.create({
            //   body: `Dear ${student.guardianName}, fees of ${formatMWK(inv.balance)} for ${student.firstName} are due in ${daysLeft} days. Please pay promptly.`,
            //   from: process.env.TWILIO_PHONE_NUMBER,
            //   to:   student.guardianPhone,
            // })
        }
        catch (err) {
            logger_1.logger.error({ event: 'fee_reminder.failed', invoiceId: inv.id, err });
        }
    }
    logger_1.logger.info({ event: 'fee_reminders.sent', count: sent, total: dueInvoices.length });
});
// ─────────────────────────────────────────────────────────
// JOB 2: Daily late penalty application
// Runs at 00:05 every day. Applies 5% penalty to all
// UNPAID/PARTIAL invoices past their due date.
// ─────────────────────────────────────────────────────────
exports.dailyLatePenalties = (0, scheduler_1.onSchedule)({ schedule: '5 0 * * *', timeZone: 'Africa/Blantyre', region: 'africa-south1' }, async () => {
    const count = await (0, feeService_1.applyLatePenalties)(0.05);
    logger_1.logger.info({ event: 'late_penalties.applied', count });
});
// ─────────────────────────────────────────────────────────
// JOB 3: Daily installment overdue check
// Marks installments past their due date as OVERDUE.
// ─────────────────────────────────────────────────────────
exports.dailyInstallmentCheck = (0, scheduler_1.onSchedule)({ schedule: '10 0 * * *', timeZone: 'Africa/Blantyre', region: 'africa-south1' }, async () => {
    const count = await (0, installmentService_1.markOverdueInstallments)();
    logger_1.logger.info({ event: 'installments.overdue_checked', count });
});
// ─────────────────────────────────────────────────────────
// HELPER — reminder email HTML
// ─────────────────────────────────────────────────────────
function buildReminderEmail(data) {
    return `
  <!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; color: #1A2535; }
    .container { max-width: 560px; margin: 0 auto; padding: 24px; }
    .header { background: #0F2744; color: white; padding: 20px 24px; border-radius: 8px 8px 0 0; }
    .body { background: white; padding: 24px; border: 1px solid #DDE4EC; border-top: none; border-radius: 0 0 8px 8px; }
    .amount { background: #FEF3C7; border: 1px solid #FDE68A; border-radius: 6px; padding: 14px; margin: 16px 0; }
    .amount-value { font-size: 24px; font-weight: 700; color: #78350F; }
    .btn { display: inline-block; background: #0E8A6A; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; }
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
        <p class="amount-value">${(0, malawi_1.formatMWK)(data.balance)}</p>
      </div>
      <p>Please visit the school finance office or contact your school administrator to arrange payment before the due date to avoid late penalty charges.</p>
      <p class="footer">This is an automated message from the School Management System. Please do not reply to this email.</p>
    </div>
  </div></body></html>`;
}
//# sourceMappingURL=scheduledJobs.js.map