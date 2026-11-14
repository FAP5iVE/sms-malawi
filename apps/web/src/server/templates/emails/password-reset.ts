/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/server/templates/emails/password-reset.ts
 * [PURPOSE]: The password-reset email. Its button opens the app's own
 *   /reset-password page (same look as sign-in) instead of Firebase's plain
 *   hosted page, which is where Firebase's default reset email always sent people.
 *   Follows the base.ts shell used by the other templates.
 * [DEPENDS ON]: ./base
 */
import 'server-only'

import { buildEmailHtml, buildEmailText, TOKEN, type EmailMessage, type SchoolBranding } from './base'

export interface PasswordResetData {
  /** Account holder's name when known; the greeting falls back to "Hello,". */
  name?:    string | null
  /** Full link to the app's /reset-password page, including the one-time code. */
  resetUrl: string
  /** How long the link works, in minutes. Firebase reset codes last 60. */
  expiresInMinutes?: number
}

export function renderPasswordReset(data: PasswordResetData, school: SchoolBranding): EmailMessage {
  const minutes = data.expiresInMinutes ?? 60
  const lifetime = minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? '' : 's'}` : `${minutes} minutes`
  const subject = `Reset your password — ${school.schoolName}`
  const greeting = data.name ? `Hello ${data.name},` : 'Hello,'

  const bodyHtml = `
    <tr>
      <td style="padding:32px 32px 0;font-family:${TOKEN.FONT_STACK};font-size:15px;color:${TOKEN.TEXT_BODY};line-height:1.7;">
        <p style="margin:0 0 8px;">${greeting}</p>
        <p style="margin:0;">
          We received a request to reset the password for your ${school.schoolName} account.
          Use the button below to choose a new one. The link works for ${lifetime} and can be used once.
        </p>
      </td>
    </tr>

    <tr>
      <td style="padding:20px 32px 0;font-family:${TOKEN.FONT_STACK};font-size:12px;color:${TOKEN.TEXT_MUTED};line-height:1.6;">
        If you did not ask for this, you can ignore this email. Your password will not change.
      </td>
    </tr>

    <tr><td style="padding:24px 0 0;"></td></tr>
  `

  const html = buildEmailHtml({
    previewText: `Reset your ${school.schoolName} password`,
    headerLabel: 'Password Reset',
    body:        bodyHtml,
    cta: {
      label: 'Reset password',
      url:   data.resetUrl,
    },
    school,
  })

  const text = buildEmailText(
    [
      greeting,
      '',
      `We received a request to reset the password for your ${school.schoolName} account.`,
      `Open this link to choose a new password (it works for ${lifetime} and can be used once):`,
      '',
      data.resetUrl,
      '',
      'If you did not ask for this, you can ignore this email. Your password will not change.',
    ].join('\n'),
    school,
  )

  return { subject, html, text }
}
