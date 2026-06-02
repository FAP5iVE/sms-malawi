import 'server-only'

import { buildEmailHtml, buildEmailText, TOKEN, type EmailMessage, type SchoolBranding } from './base'

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
  const subject = `📋 Results released — Term ${data.term} ${data.academicYear} — ${data.studentName}`

  const summaryRows = data.summary ? `
    <tr>
      <td style="padding:20px 32px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid ${TOKEN.BORDER};border-radius:6px;overflow:hidden;">
          <tr style="background-color:#f0fdf4;">
            <td colspan="2" style="padding:12px 16px;font-family:${TOKEN.FONT_STACK};font-size:11px;font-weight:bold;color:${TOKEN.ACCENT_GREEN};text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid ${TOKEN.BORDER};">
              Quick Summary
            </td>
          </tr>
          <tr>
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_MUTED};border-bottom:1px solid ${TOKEN.BORDER};">Average</td>
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_DARK};font-weight:600;border-bottom:1px solid ${TOKEN.BORDER};">${data.summary.average.toFixed(1)}% — Grade ${data.summary.grade}</td>
          </tr>
          ${data.summary.position != null ? `
          <tr style="background-color:#f9fafb;">
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_MUTED};border-bottom:1px solid ${TOKEN.BORDER};">Class Position</td>
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_DARK};font-weight:600;border-bottom:1px solid ${TOKEN.BORDER};">${data.summary.position} of ${data.summary.classSize ?? '—'}</td>
          </tr>` : ''}
          <tr ${data.summary.position != null ? '' : 'style="background-color:#f9fafb;"'}>
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_MUTED};">Status</td>
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;font-weight:bold;color:${data.summary.passStatus ? TOKEN.ACCENT_GREEN : TOKEN.ACCENT_RED};">${data.summary.passStatus ? 'PASS' : 'FAIL'}</td>
          </tr>
        </table>
      </td>
    </tr>` : ''

  const bodyHtml = `
    <!-- Greeting -->
    <tr>
      <td style="padding:32px 32px 0;">
        <!-- Result badge -->
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%);border-radius:8px;margin-bottom:0;">
          <tr>
            <td style="padding:24px;text-align:center;">
              <p style="margin:0 0 4px;font-family:${TOKEN.FONT_STACK};font-size:36px;line-height:1;">🎓</p>
              <p style="margin:0;font-family:${TOKEN.FONT_HEADING};font-size:20px;font-weight:bold;color:${TOKEN.ACCENT_GREEN};">Results Are Out!</p>
              <p style="margin:4px 0 0;font-family:${TOKEN.FONT_STACK};font-size:13px;color:${TOKEN.TEXT_MUTED};">Term ${data.term} &bull; ${data.academicYear}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="padding:20px 32px 0;font-family:${TOKEN.FONT_STACK};font-size:15px;color:${TOKEN.TEXT_BODY};line-height:1.7;">
        <p style="margin:0;">Dear <strong>${data.studentName}</strong>,</p>
        <p style="margin:12px 0 0;">Your <strong>Term ${data.term} ${data.academicYear}</strong> results for <strong>${data.className}</strong> have been officially released and are now available on the school portal.</p>
      </td>
    </tr>

    ${summaryRows}

    <tr>
      <td style="padding:20px 32px 0;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_BODY};line-height:1.7;">
        <p style="margin:0;">Log in to the school portal to view your full results, including individual subject marks, comments from your class teacher, and your full report card.</p>
      </td>
    </tr>

    <tr>
      <td style="padding:16px 32px 0;font-family:${TOKEN.FONT_STACK};font-size:13px;color:${TOKEN.TEXT_MUTED};line-height:1.6;background-color:transparent;">
        <p style="margin:0;"><em>Note: Results are only accessible once all outstanding fees have been cleared. If you are unable to view your results, please contact the school finance office.</em></p>
      </td>
    </tr>

    <tr><td style="padding:24px 0 0;"></td></tr>
  `

  const html = buildEmailHtml({
    previewText:  `Term ${data.term} ${data.academicYear} results for ${data.studentName} are now available`,
    headerLabel:  'Results Release',
    headerColor:  TOKEN.ACCENT_GREEN,
    body:         bodyHtml,
    cta: {
      label: 'View My Results',
      url:   `${school.loginUrl}/exams`,
      color: TOKEN.ACCENT_GREEN,
    },
    school,
    footerExtra: 'Results are only available to students with no outstanding fee balance.',
  })

  const text = buildEmailText(
    [
      `Dear ${data.studentName},`,
      '',
      `Your Term ${data.term} ${data.academicYear} results for ${data.className} have been officially released.`,
      '',
      ...(data.summary ? [
        `Quick Summary:`,
        `  Average:  ${data.summary.average.toFixed(1)}% — Grade ${data.summary.grade}`,
        ...(data.summary.position != null ? [`  Position: ${data.summary.position} of ${data.summary.classSize ?? '—'}`] : []),
        `  Status:   ${data.summary.passStatus ? 'PASS' : 'FAIL'}`,
        '',
      ] : []),
      'Log in to the school portal to view your full results and report card.',
      '',
      `Note: Results are only accessible once all outstanding fees are cleared.`,
      '',
      `View results: ${school.loginUrl}/exams`,
    ].join('\n'),
    school
  )

  return { subject, html, text }
}