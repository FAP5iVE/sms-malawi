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

import { buildEmailHtml, buildEmailText, note, para, type EmailMessage, type SchoolBranding } from './base'

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
  const subject = `Reset your password (link works for ${lifetime})`
  const greeting = data.name ? `Hello ${data.name},` : 'Hello,'

  const bodyHtml = `
    ${para(
      greeting,
      `We received a request to reset the password for your ${school.schoolName} account.
          Use the button below to choose a new one. The link works for <strong>${lifetime}</strong> and can be used once.`,
    )}
    ${note(`If the button does not open, copy this link into your browser:<br /><span style="word-break:break-all;">${data.resetUrl}</span>`)}
    ${note('If you did not ask for this, you can ignore this email. Your password will not change.')}
  `

  const html = buildEmailHtml({
    previewText: `Reset your ${school.schoolName} password. The link works for ${lifetime}.`,
    headerLabel: 'Password reset',
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
