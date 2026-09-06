import 'server-only'

import { buildEmailHtml, buildEmailText, TOKEN, type EmailMessage, type SchoolBranding } from './base'

/*
 * apps/web/src/server/templates/emails/placement-update.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [R-PHASE]: R18 — University Placement Module (Phase 11 Blueprint)
 * [PURPOSE]: The email a student receives when their university-placement
 *   outcome is confirmed or verified by the school. Mirrors the structure and
 *   token usage of result-release.ts (buildEmailHtml/buildEmailText + TOKEN),
 *   so it renders identically to the rest of the school's transactional mail.
 */

export interface PlacementUpdateData {
  studentName:     string
  /** Human-readable status: 'Confirmed' or 'Rejected'. */
  statusLabel:     string
  /** Where the student was placed, if a destination was recorded. */
  programmeName?:  string
  universityName?: string
  /** True when the school has verified/confirmed the outcome. */
  verified:        boolean
  /** Set when statusLabel is 'Rejected' — why the claim was turned down. */
  rejectionReason?: string
}

export function renderPlacementUpdate(
  data:   PlacementUpdateData,
  school: SchoolBranding,
): EmailMessage {
  const isRejected = data.statusLabel === 'Rejected'
  const accentColor = isRejected ? TOKEN.ACCENT_RED : TOKEN.ACCENT_BLUE
  const emoji = isRejected ? '\u26a0\ufe0f' : '\ud83c\udf93'
  const subject = isRejected
    ? `University placement claim update \u2014 ${data.studentName}`
    : `\ud83c\udf93 University placement update \u2014 ${data.studentName}`

  const destinationHtml =
    data.programmeName && data.universityName
      ? `
    <tr>
      <td style="padding:20px 32px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid ${TOKEN.BORDER};border-radius:6px;overflow:hidden;">
          <tr style="background-color:#eff6ff;">
            <td style="padding:12px 16px;font-family:${TOKEN.FONT_STACK};font-size:11px;font-weight:bold;color:${TOKEN.ACCENT_BLUE};text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid ${TOKEN.BORDER};">
              Placement claimed
            </td>
          </tr>
          <tr>
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_DARK};font-weight:600;border-bottom:1px solid ${TOKEN.BORDER};">${data.programmeName}</td>
          </tr>
          <tr style="background-color:#f9fafb;">
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_MUTED};">${data.universityName}</td>
          </tr>
        </table>
      </td>
    </tr>`
      : ''

  const rejectionHtml =
    isRejected && data.rejectionReason
      ? `
    <tr>
      <td style="padding:16px 32px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #fecaca;border-radius:6px;background-color:#fef2f2;">
          <tr>
            <td style="padding:12px 16px;font-family:${TOKEN.FONT_STACK};font-size:13px;color:#991b1b;">
              <strong>Reason:</strong> ${data.rejectionReason}
            </td>
          </tr>
        </table>
      </td>
    </tr>`
      : ''

  const bodyHtml = `
    <tr>
      <td style="padding:32px 32px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:${isRejected ? 'linear-gradient(135deg,#fef2f2 0%,#fee2e2 100%)' : 'linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%)'};border-radius:8px;">
          <tr>
            <td style="padding:24px;text-align:center;">
              <p style="margin:0 0 4px;font-family:${TOKEN.FONT_STACK};font-size:36px;line-height:1;">${emoji}</p>
              <p style="margin:0;font-family:${TOKEN.FONT_HEADING};font-size:20px;font-weight:bold;color:${accentColor};">Placement ${data.statusLabel}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="padding:20px 32px 0;font-family:${TOKEN.FONT_STACK};font-size:15px;color:${TOKEN.TEXT_BODY};line-height:1.7;">
        <p style="margin:0;">Dear <strong>${data.studentName}</strong>,</p>
        <p style="margin:12px 0 0;">${
          isRejected
            ? 'The placement claim you submitted could not be verified and has been rejected.'
            : `Your university placement has been <strong>confirmed</strong>${data.verified ? ' and verified by the school' : ''}.`
        }</p>
      </td>
    </tr>

    ${destinationHtml}
    ${rejectionHtml}

    <tr>
      <td style="padding:20px 32px 0;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_BODY};line-height:1.7;">
        <p style="margin:0;">${
          isRejected
            ? 'Log in to the school portal to review the details and submit a corrected claim.'
            : 'Log in to the school portal to view your confirmed placement.'
        }</p>
      </td>
    </tr>

    <tr><td style="padding:24px 0 0;"></td></tr>
  `

  const html = buildEmailHtml({
    previewText: isRejected
      ? 'Your university placement claim was rejected'
      : 'Your university placement has been confirmed',
    headerLabel: 'University Placement',
    headerColor: accentColor,
    body:        bodyHtml,
    cta: {
      label: 'View My Placement',
      url:   `${school.loginUrl}/placements`,
      color: accentColor,
    },
    school,
  })

  const text = buildEmailText(
    [
      `Dear ${data.studentName},`,
      '',
      isRejected
        ? `The placement claim you submitted could not be verified and has been rejected.${data.rejectionReason ? ` Reason: ${data.rejectionReason}` : ''}`
        : `Your university placement has been confirmed${data.verified ? ' and verified by the school' : ''}.`,
      '',
      ...(data.programmeName && data.universityName
        ? [`Placement: ${data.programmeName} \u2014 ${data.universityName}`, '']
        : []),
      isRejected
        ? 'Log in to the school portal to review the details and submit a corrected claim.'
        : 'Log in to the school portal to view your confirmed placement.',
      '',
      `View placement: ${school.loginUrl}/placements`,
    ].join('\n'),
    school,
  )

  return { subject, html, text }
}
