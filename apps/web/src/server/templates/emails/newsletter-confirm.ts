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

import { buildEmailHtml, buildEmailText, TOKEN, type EmailMessage, type SchoolBranding } from './base'

export interface NewsletterConfirmData {
  name?:       string
  confirmUrl:  string
}

export function renderNewsletterConfirm(
  data:   NewsletterConfirmData,
  school: SchoolBranding
): EmailMessage {
  const subject = `Confirm your newsletter subscription — ${school.schoolName}`
  const greeting = data.name ? `Hello ${data.name},` : 'Hello,'

  const bodyHtml = `
    <tr>
      <td style="padding:32px 32px 0;font-family:${TOKEN.FONT_STACK};font-size:15px;color:${TOKEN.TEXT_BODY};line-height:1.7;">
        <p style="margin:0 0 8px;">${greeting}</p>
        <p style="margin:0;">
          Thank you for subscribing to the ${school.schoolName} newsletter. Please confirm your
          subscription using the button below.
        </p>
      </td>
    </tr>

    <tr>
      <td style="padding:20px 32px 0;font-family:${TOKEN.FONT_STACK};font-size:12px;color:${TOKEN.TEXT_MUTED};line-height:1.6;">
        If you did not request this subscription, you can safely ignore this email — no
        further messages will be sent unless the link above is used.
      </td>
    </tr>

    <tr><td style="padding:24px 0 0;"></td></tr>
  `

  const html = buildEmailHtml({
    previewText: `Confirm your newsletter subscription to ${school.schoolName}`,
    headerLabel: 'Newsletter',
    body:        bodyHtml,
    cta: {
      label: 'Confirm Subscription',
      url:   data.confirmUrl,
      color: TOKEN.ACCENT_GREEN,
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
      'If you did not request this subscription, you can safely ignore this email.',
    ].join('\n'),
    school
  )

  return { subject, html, text }
}
