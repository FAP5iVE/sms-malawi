/**
 * [FILE]: apps/web/src/server/lib/guardian/invitationEmail.ts
 * [PURPOSE]: The e-mail that carries a claim code to a guardian. Pure, so it can be tested.
 *
 *   Deliberately says NOTHING about any child: an e-mail can be mis-sent, forwarded, or
 *   read on a shared device. The code is useless without the guardian also being linked to
 *   a child by the school, and it expires.
 */
export interface InvitationEmailInput {
  schoolName: string
  code: string
  claimUrl: string
  expiresAt: Date
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

export function buildInvitationEmail(i: InvitationEmailInput): { subject: string; html: string; text: string } {
  const expires = i.expiresAt.toUTCString()
  const subject = `Your ${i.schoolName} guardian account invitation`
  const text = [
    `${i.schoolName} has invited you to a guardian account.`,
    '',
    `Your one-time code: ${i.code}`,
    `Use it here: ${i.claimUrl}`,
    `The code works once and expires on ${expires}.`,
    '',
    'If you were not expecting this, ignore this message. Never share this code, and the school will never ask you for it.',
  ].join('\n')
  const html = `<p>${esc(i.schoolName)} has invited you to a guardian account.</p>
<p>Your one-time code:</p>
<p style="font-size:22px;font-weight:bold;letter-spacing:2px;font-family:monospace">${esc(i.code)}</p>
<p><a href="${esc(i.claimUrl)}">Open your guardian account</a></p>
<p>The code works once and expires on ${esc(expires)}.</p>
<p style="color:#555">If you were not expecting this, ignore this message. Never share this code; the school will never ask you for it.</p>`
  return { subject, html, text }
}
