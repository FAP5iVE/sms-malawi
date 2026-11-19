/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/server/templates/emails/newsletter-confirm.ts
 * [R-PHASE]: R5 — Academics I: Admissions & Student Records
 * [PURPOSE]: Renders the newsletter double-opt-in confirmation email,
 *   replacing the inline raw-HTML template string previously built by hand
 *   inside public.ts's POST /newsletter/subscribe handler — follows the
 *   base.ts shell pattern established in announcement.ts/fee-reminder.ts.
 * [DEPENDS ON]: ./base
 */
import 'server-only'

import { buildEmailHtml, buildEmailText, note, para, type EmailMessage, type SchoolBranding } from './base'

export interface NewsletterConfirmData {
  name?:       string
  confirmUrl:  string
}

export function renderNewsletterConfirm(
  data:   NewsletterConfirmData,
  school: SchoolBranding
): EmailMessage {
  const subject = 'Confirm your newsletter subscription'
  const greeting = data.name ? `Hello ${data.name},` : 'Hello,'

  const bodyHtml = `
    ${para(
      greeting,
      `Thank you for subscribing to the ${school.schoolName} newsletter. Please confirm your
          subscription using the button below.`,
    )}
    ${note(`If the button does not open, copy this link into your browser:<br /><span style="word-break:break-all;">${data.confirmUrl}</span>`)}
    ${note('If you did not request this subscription, you can ignore this email. No further messages will be sent unless the button above is used.')}
  `

  const html = buildEmailHtml({
    previewText: `Confirm your newsletter subscription to ${school.schoolName}`,
    headerLabel: 'Newsletter',
    body:        bodyHtml,
    cta: {
      label: 'Confirm subscription',
      url:   data.confirmUrl,
    },
    school,
  })

  const text = buildEmailText(
    [
      greeting,
      '',
      `Thank you for subscribing to the ${school.schoolName} newsletter.`,
      'Please confirm your subscription using the link below:',
      '',
      data.confirmUrl,
      '',
      'If you did not request this subscription, you can ignore this email.',
    ].join('\n'),
    school
  )

  return { subject, html, text }
}
