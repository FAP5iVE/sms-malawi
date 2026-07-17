/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/server/templates/emails/application-received.ts
 * [R-PHASE]: R5 — Academics I: Admissions & Student Records
 * [PURPOSE]: Renders the admission-application confirmation email sent to
 *   both the applicant and (when different) their guardian, replacing the
 *   two inline raw-HTML `<p>...</p>` template strings that previously lived
 *   directly inside applicationService.ts's createPublicApplication(). One
 *   `render` function, parameterised by `recipient` ('applicant' |
 *   'guardian'), rather than two near-duplicate implementations — follows
 *   the base.ts shell pattern established in announcement.ts/fee-reminder.ts.
 * [DEPENDS ON]: ./base
 */
import 'server-only'

import { format } from 'date-fns'
import { buildEmailHtml, buildEmailText, TOKEN, type EmailMessage, type SchoolBranding } from './base'

export type ApplicationReceivedRecipient = 'applicant' | 'guardian'

export interface ApplicationReceivedData {
  recipient:        ApplicationReceivedRecipient
  applicantName:    string
  guardianName:     string
  classApplying:    string
  applicationId:    string
  submittedAt:      Date
}

export function renderApplicationReceived(
  data:   ApplicationReceivedData,
  school: SchoolBranding
): EmailMessage {
  const submittedLabel = format(data.submittedAt, 'EEEE, d MMMM yyyy')
  const greetingName   = data.recipient === 'applicant' ? data.applicantName : data.guardianName

  const subject = data.recipient === 'applicant'
    ? `Application Received — ${school.schoolName}`
    : `Application Submitted for ${data.applicantName} — ${school.schoolName}`

  const bodyHtml = `
    <!-- Greeting -->
    <tr>
      <td style="padding:32px 32px 0;font-family:${TOKEN.FONT_STACK};font-size:15px;color:${TOKEN.TEXT_BODY};line-height:1.7;">
        <p style="margin:0 0 8px;">Dear ${greetingName},</p>
        <p style="margin:0;">
          ${data.recipient === 'applicant'
            ? `Thank you for submitting your application to <strong>${school.schoolName}</strong>.`
            : `An application has been submitted to <strong>${school.schoolName}</strong> on behalf of <strong>${data.applicantName}</strong>.`}
        </p>
      </td>
    </tr>

    <!-- Divider -->
    <tr>
      <td style="padding:16px 32px 0;">
        <hr style="border:none;border-top:1px solid ${TOKEN.BORDER};margin:0;" />
      </td>
    </tr>

    <!-- Application summary -->
    <tr>
      <td style="padding:20px 32px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
          <tr>
            <td style="padding:0 0 10px;font-family:${TOKEN.FONT_STACK};font-size:13px;color:${TOKEN.TEXT_MUTED};">Application reference</td>
            <td style="padding:0 0 10px;font-family:${TOKEN.FONT_STACK};font-size:13px;color:${TOKEN.TEXT_DARK};font-weight:bold;text-align:right;">${data.applicationId}</td>
          </tr>
          <tr>
            <td style="padding:0 0 10px;font-family:${TOKEN.FONT_STACK};font-size:13px;color:${TOKEN.TEXT_MUTED};">Applying for</td>
            <td style="padding:0 0 10px;font-family:${TOKEN.FONT_STACK};font-size:13px;color:${TOKEN.TEXT_DARK};font-weight:bold;text-align:right;">${data.classApplying}</td>
          </tr>
          <tr>
            <td style="padding:0;font-family:${TOKEN.FONT_STACK};font-size:13px;color:${TOKEN.TEXT_MUTED};">Submitted</td>
            <td style="padding:0;font-family:${TOKEN.FONT_STACK};font-size:13px;color:${TOKEN.TEXT_DARK};font-weight:bold;text-align:right;">${submittedLabel}</td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Next steps -->
    <tr>
      <td style="padding:24px 32px 0;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_BODY};line-height:1.7;">
        <p style="margin:0;">
          Our admissions office will review the application and be in touch via this email
          address or the phone number provided. The review process typically takes 5–10
          business days. Please retain this email as proof of submission.
        </p>
      </td>
    </tr>

    <tr><td style="padding:24px 0 0;"></td></tr>
  `

  const html = buildEmailHtml({
    previewText: `Application received for ${data.applicantName} — reference ${data.applicationId}`,
    headerLabel: 'Admissions',
    body:        bodyHtml,
    school,
  })

  const text = buildEmailText(
    [
      data.recipient === 'applicant'
        ? `Thank you for submitting your application to ${school.schoolName}.`
        : `An application has been submitted to ${school.schoolName} on behalf of ${data.applicantName}.`,
      '',
      `Application reference: ${data.applicationId}`,
      `Applying for: ${data.classApplying}`,
      `Submitted: ${submittedLabel}`,
      '',
      'Our admissions office will review the application and be in touch within 5–10 business days.',
    ].join('\n'),
    school
  )

  return { subject, html, text }
}
