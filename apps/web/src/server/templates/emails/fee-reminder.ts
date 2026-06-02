import 'server-only'

import { format } from 'date-fns'
import { buildEmailHtml, buildEmailText, TOKEN, divider, type EmailMessage, type SchoolBranding } from './base'

export interface FeeReminderData {
  guardianName:   string
  studentName:    string
  studentClass:   string
  balanceAmount:  number
  dueDate:        Date
  invoiceId:      string
  term:           number
  academicYear:   string
  currency:       string
  currencyLocale: string
  /** Number of days until due date. Negative = overdue. */
  daysUntilDue:   number
}

function formatCurrency(amount: number, locale: string, currency: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style:    'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

export function renderFeeReminder(
  data:   FeeReminderData,
  school: SchoolBranding
): EmailMessage {
  const isOverdue      = data.daysUntilDue < 0
  const formattedAmount = formatCurrency(data.balanceAmount, data.currencyLocale, data.currency)
  const formattedDue    = format(data.dueDate, 'EEEE, d MMMM yyyy')
  const headerColor     = isOverdue ? TOKEN.ACCENT_RED : TOKEN.ACCENT_ORANGE
  const urgencyLabel    = isOverdue
    ? `OVERDUE — ${Math.abs(data.daysUntilDue)} day${Math.abs(data.daysUntilDue) !== 1 ? 's' : ''} past due`
    : data.daysUntilDue === 0
      ? 'DUE TODAY'
      : `Due in ${data.daysUntilDue} day${data.daysUntilDue !== 1 ? 's' : ''}`

  const subject = isOverdue
    ? `⚠ Overdue fees — ${data.studentName} — ${formattedAmount} outstanding`
    : `Fee reminder — ${data.studentName} — ${formattedAmount} due ${format(data.dueDate, 'd MMM yyyy')}`

  const bodyHtml = `
    <!-- Greeting -->
    <tr>
      <td style="padding:32px 32px 0;font-family:${TOKEN.FONT_STACK};font-size:15px;color:${TOKEN.TEXT_BODY};line-height:1.7;">
        <p style="margin:0 0 8px;">Dear ${data.guardianName},</p>
        <p style="margin:0;">This is a reminder regarding outstanding school fees for <strong>${data.studentName}</strong> (${data.studentClass}).</p>
      </td>
    </tr>

    <!-- Urgency banner -->
    <tr>
      <td style="padding:20px 32px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:${isOverdue ? '#fef2f2' : '#fff7ed'};border-left:4px solid ${isOverdue ? TOKEN.ACCENT_RED : TOKEN.ACCENT_ORANGE};border-radius:4px;">
          <tr>
            <td style="padding:14px 16px;">
              <p style="margin:0;font-family:${TOKEN.FONT_STACK};font-size:12px;font-weight:bold;color:${isOverdue ? TOKEN.ACCENT_RED : TOKEN.ACCENT_ORANGE};text-transform:uppercase;letter-spacing:0.06em;">${urgencyLabel}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Fee summary table -->
    <tr>
      <td style="padding:20px 32px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid ${TOKEN.BORDER};border-radius:6px;overflow:hidden;">
          <tr style="background-color:#f9fafb;">
            <td colspan="2" style="padding:12px 16px;font-family:${TOKEN.FONT_STACK};font-size:11px;font-weight:bold;color:${TOKEN.TEXT_MUTED};text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid ${TOKEN.BORDER};">
              Invoice Summary
            </td>
          </tr>
          <tr>
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_MUTED};border-bottom:1px solid ${TOKEN.BORDER};">Student</td>
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_DARK};font-weight:600;border-bottom:1px solid ${TOKEN.BORDER};">${data.studentName}</td>
          </tr>
          <tr style="background-color:#f9fafb;">
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_MUTED};border-bottom:1px solid ${TOKEN.BORDER};">Class</td>
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_DARK};border-bottom:1px solid ${TOKEN.BORDER};">${data.studentClass}</td>
          </tr>
          <tr>
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_MUTED};border-bottom:1px solid ${TOKEN.BORDER};">Term</td>
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_DARK};border-bottom:1px solid ${TOKEN.BORDER};">Term ${data.term} — ${data.academicYear}</td>
          </tr>
          <tr style="background-color:#f9fafb;">
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_MUTED};border-bottom:1px solid ${TOKEN.BORDER};">Due Date</td>
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${isOverdue ? TOKEN.ACCENT_RED : TOKEN.TEXT_DARK};font-weight:600;border-bottom:1px solid ${TOKEN.BORDER};">${formattedDue}</td>
          </tr>
          <tr>
            <td style="padding:14px 16px;font-family:${TOKEN.FONT_STACK};font-size:15px;font-weight:bold;color:${TOKEN.TEXT_DARK};">Amount Outstanding</td>
            <td style="padding:14px 16px;font-family:${TOKEN.FONT_STACK};font-size:18px;font-weight:bold;color:${isOverdue ? TOKEN.ACCENT_RED : TOKEN.ACCENT_ORANGE};">${formattedAmount}</td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Instructions -->
    <tr>
      <td style="padding:20px 32px 0;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_BODY};line-height:1.7;">
        <p style="margin:0 0 8px;">To settle this balance, please visit the school finance office or log in to the school portal to view payment options.</p>
        <p style="margin:0;">Please quote invoice reference <strong>${data.invoiceId}</strong> when making your payment.</p>
      </td>
    </tr>

    <!-- Spacer -->
    <tr><td style="padding:24px 0 0;"></td></tr>
  `

  const html = buildEmailHtml({
    previewText:  `Outstanding balance of ${formattedAmount} — due ${format(data.dueDate, 'd MMM yyyy')}`,
    headerLabel:  'Fee Reminder',
    headerColor,
    body:         bodyHtml,
    cta: {
      label: 'View Fee Statement',
      url:   `${school.loginUrl}/finances`,
      color: isOverdue ? TOKEN.ACCENT_RED : TOKEN.ACCENT_ORANGE,
    },
    school,
  })

  const text = buildEmailText(
    [
      `Dear ${data.guardianName},`,
      '',
      `This is a fee reminder for ${data.studentName} (${data.studentClass}).`,
      '',
      `STATUS: ${urgencyLabel}`,
      '',
      `Student:     ${data.studentName}`,
      `Class:       ${data.studentClass}`,
      `Term:        Term ${data.term} — ${data.academicYear}`,
      `Due Date:    ${formattedDue}`,
      `Outstanding: ${formattedAmount}`,
      `Invoice Ref: ${data.invoiceId}`,
      '',
      'Please visit the school finance office or log in to the school portal to settle this balance.',
      '',
      `View fee statement: ${school.loginUrl}/finances`,
    ].join('\n'),
    school
  )

  return { subject, html, text }
}