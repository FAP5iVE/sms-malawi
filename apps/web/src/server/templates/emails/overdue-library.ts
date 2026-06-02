import 'server-only'

import { format } from 'date-fns'
import { buildEmailHtml, buildEmailText, TOKEN, type EmailMessage, type SchoolBranding } from './base'

export interface OverdueBook {
  title:       string
  author:      string
  issuedOn:    Date
  dueDate:     Date
  daysOverdue: number
  fineAmount:  number
}

export interface OverdueLibraryData {
  borrowerName:   string
  borrowerType:   'STUDENT' | 'STAFF'
  books:          OverdueBook[]
  totalFineAmount:number
  currency:       string
  currencyLocale: string
  /** If provided, this is a pre-due warning (daysUntilDue > 0). Otherwise it's an overdue notice. */
  daysUntilDue?:  number
}

function formatCurrency(amount: number, locale: string, currency: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency', currency,
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

export function renderOverdueLibrary(
  data:   OverdueLibraryData,
  school: SchoolBranding
): EmailMessage {
  const isReminder     = (data.daysUntilDue ?? 0) > 0
  const fmtTotal       = formatCurrency(data.totalFineAmount, data.currencyLocale, data.currency)
  const bookCount      = data.books.length
  const bookWord       = bookCount === 1 ? 'book' : 'books'
  const headerColor    = isReminder ? TOKEN.ACCENT_BLUE : TOKEN.ACCENT_AMBER

  const subject = isReminder
    ? `📚 Library reminder — ${bookCount} ${bookWord} due in ${data.daysUntilDue} day${data.daysUntilDue !== 1 ? 's' : ''}`
    : `⚠ Overdue library ${bookWord} — ${fmtTotal} in fines — ${data.borrowerName}`

  const booksTableRows = data.books.map((book, i) => {
    const isEven          = i % 2 === 0
    const formattedDue    = format(book.dueDate, 'd MMM yyyy')
    const formattedIssued = format(book.issuedOn, 'd MMM yyyy')
    const bookFmt         = formatCurrency(book.fineAmount, data.currencyLocale, data.currency)

    return `
    <tr${isEven ? '' : ' style="background-color:#f9fafb;"'}>
      <td style="padding:12px 16px;border-bottom:1px solid ${TOKEN.BORDER};">
        <p style="margin:0;font-family:${TOKEN.FONT_STACK};font-size:13px;font-weight:600;color:${TOKEN.TEXT_DARK};">${book.title}</p>
        <p style="margin:2px 0 0;font-family:${TOKEN.FONT_STACK};font-size:12px;color:${TOKEN.TEXT_MUTED};">${book.author}</p>
      </td>
      <td style="padding:12px 16px;font-family:${TOKEN.FONT_STACK};font-size:13px;color:${TOKEN.TEXT_MUTED};border-bottom:1px solid ${TOKEN.BORDER};white-space:nowrap;">${formattedDue}</td>
      ${!isReminder ? `<td style="padding:12px 16px;font-family:${TOKEN.FONT_STACK};font-size:13px;font-weight:600;color:${TOKEN.ACCENT_AMBER};border-bottom:1px solid ${TOKEN.BORDER};white-space:nowrap;">${book.daysOverdue}d late</td>
      <td style="padding:12px 16px;font-family:${TOKEN.FONT_STACK};font-size:13px;font-weight:600;color:${TOKEN.ACCENT_RED};border-bottom:1px solid ${TOKEN.BORDER};white-space:nowrap;">${bookFmt}</td>` : ''}
    </tr>`
  }).join('')

  const bodyHtml = `
    <!-- Intro -->
    <tr>
      <td style="padding:32px 32px 0;font-family:${TOKEN.FONT_STACK};font-size:15px;color:${TOKEN.TEXT_BODY};line-height:1.7;">
        <p style="margin:0;">Dear <strong>${data.borrowerName}</strong>,</p>
        <p style="margin:12px 0 0;">
          ${isReminder
            ? `This is a friendly reminder that you have <strong>${bookCount} ${bookWord}</strong> due to be returned to the library in <strong>${data.daysUntilDue} day${data.daysUntilDue !== 1 ? 's' : ''}</strong>. Please return ${bookCount === 1 ? 'it' : 'them'} by the due date to avoid fines.`
            : `You have <strong>${bookCount} overdue library ${bookWord}</strong>. Please return ${bookCount === 1 ? 'it' : 'them'} immediately to avoid further fines. Your current outstanding fine is <strong style="color:${TOKEN.ACCENT_RED};">${fmtTotal}</strong>.`
          }
        </p>
      </td>
    </tr>

    <!-- Books table -->
    <tr>
      <td style="padding:20px 32px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid ${TOKEN.BORDER};border-radius:6px;overflow:hidden;">
          <tr style="background-color:#f9fafb;">
            <td style="padding:12px 16px;font-family:${TOKEN.FONT_STACK};font-size:11px;font-weight:bold;color:${TOKEN.TEXT_MUTED};text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid ${TOKEN.BORDER};">Book</td>
            <td style="padding:12px 16px;font-family:${TOKEN.FONT_STACK};font-size:11px;font-weight:bold;color:${TOKEN.TEXT_MUTED};text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid ${TOKEN.BORDER};white-space:nowrap;">Due Date</td>
            ${!isReminder ? `
            <td style="padding:12px 16px;font-family:${TOKEN.FONT_STACK};font-size:11px;font-weight:bold;color:${TOKEN.TEXT_MUTED};text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid ${TOKEN.BORDER};white-space:nowrap;">Overdue</td>
            <td style="padding:12px 16px;font-family:${TOKEN.FONT_STACK};font-size:11px;font-weight:bold;color:${TOKEN.TEXT_MUTED};text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid ${TOKEN.BORDER};white-space:nowrap;">Fine</td>` : ''}
          </tr>
          ${booksTableRows}
        </table>
      </td>
    </tr>

    ${!isReminder && data.totalFineAmount > 0 ? `
    <!-- Total fine -->
    <tr>
      <td style="padding:16px 32px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#fef2f2;border-radius:6px;">
          <tr>
            <td style="padding:14px 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
                <tr>
                  <td style="font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_MUTED};">Total Outstanding Fine</td>
                  <td style="font-family:${TOKEN.FONT_STACK};font-size:18px;font-weight:bold;color:${TOKEN.ACCENT_RED};text-align:right;">${fmtTotal}</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>` : ''}

    <tr>
      <td style="padding:20px 32px 0;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_BODY};line-height:1.7;">
        <p style="margin:0;">
          ${isReminder
            ? 'Please return your books to the library before or on the due date. If you need to renew your loan, visit the library in person.'
            : 'Please return your books to the library immediately. Fines can be paid at the school finance office. Continued overdue status will result in suspension of your borrowing privileges.'
          }
        </p>
      </td>
    </tr>

    <tr><td style="padding:24px 0 0;"></td></tr>
  `

  const html = buildEmailHtml({
    previewText: isReminder
      ? `Return reminder — ${bookCount} ${bookWord} due in ${data.daysUntilDue} day${data.daysUntilDue !== 1 ? 's' : ''}`
      : `Overdue library notice — ${fmtTotal} in fines — ${data.borrowerName}`,
    headerLabel: isReminder ? 'Library Return Reminder' : 'Overdue Library Notice',
    headerColor,
    body:        bodyHtml,
    cta: {
      label: 'View Borrowing History',
      url:   `${school.loginUrl}/library`,
      color: headerColor,
    },
    school,
  })

  const textLines = [
    `Dear ${data.borrowerName},`,
    '',
    isReminder
      ? `LIBRARY RETURN REMINDER: You have ${bookCount} ${bookWord} due in ${data.daysUntilDue} day${data.daysUntilDue !== 1 ? 's' : ''}.`
      : `OVERDUE LIBRARY NOTICE: You have ${bookCount} overdue ${bookWord}. Total fine: ${fmtTotal}`,
    '',
    'Book(s):',
    ...data.books.map((b) =>
      `  • "${b.title}" by ${b.author} — due ${format(b.dueDate, 'd MMM yyyy')}` +
      (!isReminder ? ` — ${b.daysOverdue} day${b.daysOverdue !== 1 ? 's' : ''} overdue — Fine: ${formatCurrency(b.fineAmount, data.currencyLocale, data.currency)}` : '')
    ),
    '',
    isReminder
      ? 'Please return your books on or before the due date to avoid fines.'
      : `Please return your books immediately. Total fine of ${fmtTotal} is payable at the finance office.`,
    '',
    `Library portal: ${school.loginUrl}/library`,
  ]

  const text = buildEmailText(textLines.join('\n'), school)

  return { subject, html, text }
}