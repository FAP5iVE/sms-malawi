import 'server-only'

import { banner, buildEmailHtml, buildEmailText, details, fitSubject, note, para, type EmailMessage, type SchoolBranding } from './base'

export interface ResultReleaseData {
  studentName:    string
  className:      string
  term:           number
  academicYear:   string
  /** Optional summary stats to include. Omit if the fee gate blocks full detail. */
  summary?: {
    average:     number
    grade:       string
    position?:   number
    classSize?:  number
    passStatus:  boolean
  }
}

export function renderResultRelease(
  data:   ResultReleaseData,
  school: SchoolBranding
): EmailMessage {
  const subject = fitSubject(`Term ${data.term} ${data.academicYear} results for ${data.studentName}`)

  const summaryHtml = data.summary
    ? details({
        title: 'Summary',
        rows: [
          { label: 'Average', value: `${data.summary.average.toFixed(1)}%, Grade ${data.summary.grade}` },
          ...(data.summary.position != null
            ? [{ label: 'Class position', value: `${data.summary.position}${data.summary.classSize != null ? ` of ${data.summary.classSize}` : ''}` }]
            : []),
          { label: 'Result', value: data.summary.passStatus ? 'Pass' : 'Fail', tone: data.summary.passStatus ? 'green' as const : 'red' as const },
        ],
      })
    : ''

  const bodyHtml = `
    ${banner({ tone: 'green', title: 'Results are out', detail: `Term ${data.term}, ${data.academicYear}` })}
    ${para(
      `Dear <strong>${data.studentName}</strong>,`,
      `Your <strong>Term ${data.term} ${data.academicYear}</strong> results for <strong>${data.className}</strong> have been released and are now in your account.`,
    )}
    ${summaryHtml}
    ${para('Sign in to your account to see your full results, including marks for each subject, comments from your class teacher and your report card.')}
    ${note('Results are only available once all outstanding fees are paid. If you cannot see your results, contact the school finance office.')}
  `

  const html = buildEmailHtml({
    previewText:  `Term ${data.term} ${data.academicYear} results for ${data.studentName} are now available`,
    headerLabel:  'Results',
    body:         bodyHtml,
    cta: {
      label: 'View my results',
      url:   `${school.loginUrl}/exams`,
    },
    school,
    footerExtra: 'Results are only available to students with no outstanding fee balance.',
  })

  const text = buildEmailText(
    [
      `Dear ${data.studentName},`,
      '',
      `Your Term ${data.term} ${data.academicYear} results for ${data.className} have been released.`,
      '',
      ...(data.summary ? [
        `Summary:`,
        `  Average:        ${data.summary.average.toFixed(1)}%, Grade ${data.summary.grade}`,
        ...(data.summary.position != null ? [`  Class position: ${data.summary.position}${data.summary.classSize != null ? ` of ${data.summary.classSize}` : ''}`] : []),
        `  Result:         ${data.summary.passStatus ? 'Pass' : 'Fail'}`,
        '',
      ] : []),
      'Sign in to your account to see your full results and report card.',
      '',
      `Results are only available once all outstanding fees are paid.`,
      '',
      `View results: ${school.loginUrl}/exams`,
    ].join('\n'),
    school
  )

  return { subject, html, text }
}
