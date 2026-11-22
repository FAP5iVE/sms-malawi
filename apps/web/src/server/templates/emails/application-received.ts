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
import { buildEmailHtml, buildEmailText, details, fitSubject, para, type EmailMessage, type SchoolBranding } from './base'

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

  const subject = fitSubject(
    data.recipient === 'applicant'
      ? 'We received your application'
      : `Application received for ${data.applicantName}`,
  )

  const bodyHtml = `
    ${para(
      `Dear ${greetingName},`,
      data.recipient === 'applicant'
        ? `Thank you for submitting your application to <strong>${school.schoolName}</strong>.`
        : `An application has been submitted to <strong>${school.schoolName}</strong> on behalf of <strong>${data.applicantName}</strong>.`,
    )}
    ${details({
      title: 'Application summary',
      rows: [
        { label: 'Application reference', value: data.applicationId },
        { label: 'Applying for',          value: data.classApplying },
        { label: 'Submitted',             value: submittedLabel },
      ],
    })}
    ${para(
      `Our admissions office will review the application and be in touch via this email
          address or the phone number provided. The review process typically takes 5–10
          business days. Please keep this email as proof of submission.`,
    )}
  `

  const html = buildEmailHtml({
    previewText: `Application received for ${data.applicantName}. Reference ${data.applicationId}.`,
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
