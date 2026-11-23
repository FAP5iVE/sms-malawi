import 'server-only'

import { format } from 'date-fns'
import { banner, buildEmailHtml, buildEmailText, details, fitSubject, para, TOKEN, TONES, tone, type EmailMessage, type SchoolBranding } from './base'

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
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2,
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
  const dayWord        = `${data.daysUntilDue} day${data.daysUntilDue !== 1 ? 's' : ''}`
  const earliestDue    = bookCount > 0 ? new Date(Math.min(...data.books.map((b) => b.dueDate.getTime()))) : null

  const subject = fitSubject(
    isReminder
      ? (earliestDue
          ? `Return ${bookCount} library ${bookWord} by ${format(earliestDue, 'd MMM yyyy')}`
          : `${bookCount} library ${bookWord} due soon`)
      : (data.totalFineAmount > 0
          ? `${bookCount} overdue library ${bookWord}, ${fmtTotal} in fines`
          : `${bookCount} overdue library ${bookWord}`),
  )

  const bookBlocks = data.books.map((book, i) => {
    const formattedDue = format(book.dueDate, 'd MMM yyyy')
    const bookFmt      = formatCurrency(book.fineAmount, data.currencyLocale, data.currency)
    const last         = i === data.books.length - 1
    const bg           = i % 2 === 1 ? ` class="em-tint" bgcolor="${TOKEN.BG_ROW}" style="background-color:${TOKEN.BG_ROW};"` : ''
    const late         = !isReminder
      ? `<span class="${TONES.red.cls}" style="color:${TOKEN.ACCENT_RED};font-weight:bold;">${book.daysOverdue} day${book.daysOverdue !== 1 ? 's' : ''} late</span> &bull; Fine <span class="${TONES.red.cls}" style="color:${TOKEN.ACCENT_RED};font-weight:bold;">${bookFmt}</span> &bull; `
      : ''
    return `
          <tr${bg}>
            <td class="em-line" style="padding:12px 16px;${last ? '' : `border-bottom:1px solid ${TOKEN.BORDER};`}">
              <p class="em-t" style="margin:0;font-family:${TOKEN.FONT_STACK};font-size:16px;font-weight:bold;color:${TOKEN.TEXT_DARK};line-height:1.4;">${book.title}</p>
              <p class="em-m" style="margin:2px 0 0;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_MUTED};line-height:1.5;">${book.author}</p>
              <p class="em-t" style="margin:6px 0 0;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_BODY};line-height:1.5;">${late}Due ${formattedDue}</p>
            </td>
          </tr>`
  }).join('')

  const booksHtml = `
    <tr>
      <td class="em-pad" style="padding:20px 32px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" class="em-line" style="width:100%;border:1px solid ${TOKEN.BORDER};border-radius:6px;">
          <tr class="em-tint" bgcolor="${TOKEN.BG_ROW}" style="background-color:${TOKEN.BG_ROW};">
            <td class="em-m em-line" style="padding:12px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;font-weight:bold;color:${TOKEN.TEXT_MUTED};border-bottom:1px solid ${TOKEN.BORDER};">${bookCount} ${bookWord}</td>
          </tr>${bookBlocks}
        </table>
      </td>
    </tr>`

  const bodyHtml = `
    ${isReminder
      ? banner({ tone: 'blue', title: 'Return reminder', detail: `${bookCount} ${bookWord} due in ${dayWord}` })
      : banner({ tone: 'red', title: `Overdue library ${bookWord}`, detail: data.totalFineAmount > 0 ? `Outstanding fine: ${fmtTotal}` : undefined })}
    ${para(
      `Dear <strong>${data.borrowerName}</strong>,`,
      isReminder
        ? `This is a reminder that you have <strong>${bookCount} ${bookWord}</strong> to return to the library in <strong>${dayWord}</strong>. Please return ${bookCount === 1 ? 'it' : 'them'} by the due date to avoid fines.`
        : `You have <strong>${bookCount} overdue library ${bookWord}</strong>. Please return ${bookCount === 1 ? 'it' : 'them'} now to avoid more fines. Your current outstanding fine is ${tone('red', fmtTotal)}.`,
    )}
    ${booksHtml}
    ${!isReminder && data.totalFineAmount > 0
      ? details({ rows: [{ label: 'Total outstanding fine', value: fmtTotal, tone: 'red', big: true }] })
      : ''}
    ${para(
      isReminder
        ? 'Please return your books to the library on or before the due date. To renew a loan, visit the library in person.'
        : 'Please return your books to the library now. You can pay fines at the school finance office. If books stay overdue, your borrowing may be suspended.',
    )}
  `

  const html = buildEmailHtml({
    previewText: isReminder
      ? `Return reminder: ${bookCount} ${bookWord} due in ${dayWord}`
      : `Overdue library ${bookWord}${data.totalFineAmount > 0 ? `: ${fmtTotal} in fines` : ''}`,
    headerLabel: isReminder ? 'Library return reminder' : 'Overdue library notice',
    body:        bodyHtml,
    cta: {
      label: 'View borrowing history',
      url:   `${school.loginUrl}/library`,
    },
    school,
  })

  const textLines = [
    `Dear ${data.borrowerName},`,
    '',
    isReminder
      ? `Return reminder: you have ${bookCount} ${bookWord} due in ${dayWord}.`
      : `Overdue library notice: you have ${bookCount} overdue ${bookWord}. Total fine: ${fmtTotal}`,
    '',
    bookCount === 1 ? 'Book:' : 'Books:',
    ...data.books.map((b) =>
      `  - "${b.title}" by ${b.author}, due ${format(b.dueDate, 'd MMM yyyy')}` +
      (!isReminder ? `, ${b.daysOverdue} day${b.daysOverdue !== 1 ? 's' : ''} late, fine ${formatCurrency(b.fineAmount, data.currencyLocale, data.currency)}` : '')
    ),
    '',
    isReminder
      ? 'Please return your books on or before the due date to avoid fines.'
      : `Please return your books now. The total fine of ${fmtTotal} can be paid at the finance office.`,
    '',
    `Library: ${school.loginUrl}/library`,
  ]

  const text = buildEmailText(textLines.join('\n'), school)

  return { subject, html, text }
}
