import 'server-only'

import { format } from 'date-fns'
import { banner, buildEmailHtml, buildEmailText, details, fitSubject, note, para, type EmailMessage, type SchoolBranding } from './base'

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
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
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
  const shortDue        = format(data.dueDate, 'd MMM yyyy')
  const tone            = isOverdue ? 'red' : 'amber'
  const days            = Math.abs(data.daysUntilDue)
  const financeContact  = school.schoolPhone ? `on ${school.schoolPhone} or at ${school.schoolEmail}` : `at ${school.schoolEmail}`
  const urgencyLabel    = isOverdue
    ? `Overdue by ${days} day${days !== 1 ? 's' : ''}`
    : data.daysUntilDue === 0
      ? 'Due today'
      : `Due in ${data.daysUntilDue} day${data.daysUntilDue !== 1 ? 's' : ''}`

  const subject = fitSubject(
    isOverdue
      ? `${formattedAmount} overdue for ${data.studentName}`
      : `${formattedAmount} due ${shortDue} for ${data.studentName}`,
  )

  const bodyHtml = `
    ${para(
      `Dear ${data.guardianName},`,
      `${isOverdue ? 'The balance of' : 'A balance of'} <strong>${formattedAmount}</strong> ${isOverdue ? 'was due on' : 'is due on'} <strong>${shortDue}</strong> for Term ${data.term} fees for <strong>${data.studentName}</strong> (${data.studentClass}).`,
    )}
    ${banner({ tone, title: urgencyLabel })}
    ${details({
      title: 'Invoice summary',
      rows: [
        { label: 'Student',            value: data.studentName },
        { label: 'Class',              value: data.studentClass },
        { label: 'Term',               value: `Term ${data.term}, ${data.academicYear}` },
        { label: 'Due date',           value: formattedDue, tone: isOverdue ? 'red' : undefined },
        { label: 'Invoice reference',  value: data.invoiceId },
        { label: 'Amount outstanding', value: formattedAmount, tone, big: true },
      ],
    })}
    ${para(
      'To pay this balance, visit the school finance office or sign in to your account to see payment options.',
      `Please quote invoice reference <strong>${data.invoiceId}</strong> when you pay.`,
    )}
    ${note(`If this balance looks wrong, contact the school finance office ${financeContact}.`)}
  `

  const html = buildEmailHtml({
    previewText:  `Outstanding balance of ${formattedAmount}. Due ${shortDue}.`,
    headerLabel:  'Fee reminder',
    body:         bodyHtml,
    cta: {
      label: 'View fee statement',
      url:   `${school.loginUrl}/finances`,
    },
    school,
  })

  const text = buildEmailText(
    [
      `Dear ${data.guardianName},`,
      '',
      `${isOverdue ? 'The balance of' : 'A balance of'} ${formattedAmount} ${isOverdue ? 'was due on' : 'is due on'} ${shortDue} for Term ${data.term} fees for ${data.studentName} (${data.studentClass}).`,
      '',
      `Status: ${urgencyLabel}`,
      '',
      `Student:            ${data.studentName}`,
      `Class:              ${data.studentClass}`,
      `Term:               Term ${data.term}, ${data.academicYear}`,
      `Due date:           ${formattedDue}`,
      `Invoice reference:  ${data.invoiceId}`,
      `Amount outstanding: ${formattedAmount}`,
      '',
      'To pay this balance, visit the school finance office or sign in to your account to see payment options.',
      `Please quote invoice reference ${data.invoiceId} when you pay.`,
      '',
      `If this balance looks wrong, contact the school finance office ${financeContact}.`,
      '',
      `View fee statement: ${school.loginUrl}/finances`,
    ].join('\n'),
    school
  )

  return { subject, html, text }
}
