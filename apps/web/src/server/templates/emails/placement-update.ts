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
  /** Human-readable status, e.g. 'Confirmed' or 'Verified'. */
  statusLabel:     string
  /** Where the student was placed, if a destination was recorded. */
  programmeName?:  string
  universityName?: string
  /** True when the school has verified the outcome. */
  verified:        boolean
}

export function renderPlacementUpdate(
  data:   PlacementUpdateData,
  school: SchoolBranding,
): EmailMessage {
  const subject = `🎓 University placement update — ${data.studentName}`

  const destinationHtml =
    data.programmeName && data.universityName
      ? `
    <tr>
      <td style="padding:20px 32px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid ${TOKEN.BORDER};border-radius:6px;overflow:hidden;">
          <tr style="background-color:#eff6ff;">
            <td style="padding:12px 16px;font-family:${TOKEN.FONT_STACK};font-size:11px;font-weight:bold;color:${TOKEN.ACCENT_BLUE};text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid ${TOKEN.BORDER};">
              Placement
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

  const bodyHtml = `
    <tr>
      <td style="padding:32px 32px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%);border-radius:8px;">
          <tr>
            <td style="padding:24px;text-align:center;">
              <p style="margin:0 0 4px;font-family:${TOKEN.FONT_STACK};font-size:36px;line-height:1;">🎓</p>
              <p style="margin:0;font-family:${TOKEN.FONT_HEADING};font-size:20px;font-weight:bold;color:${TOKEN.ACCENT_BLUE};">Placement ${data.statusLabel}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="padding:20px 32px 0;font-family:${TOKEN.FONT_STACK};font-size:15px;color:${TOKEN.TEXT_BODY};line-height:1.7;">
        <p style="margin:0;">Dear <strong>${data.studentName}</strong>,</p>
        <p style="margin:12px 0 0;">Your university placement has been <strong>${data.statusLabel.toLowerCase()}</strong>${
          data.verified ? ' and verified by the school' : ''
        }.</p>
      </td>
    </tr>

    ${destinationHtml}

    <tr>
      <td style="padding:20px 32px 0;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_BODY};line-height:1.7;">
        <p style="margin:0;">Log in to the school portal to view your placement, your recorded choices, and your eligibility across programmes.</p>
      </td>
    </tr>

    <tr><td style="padding:24px 0 0;"></td></tr>
  `

  const html = buildEmailHtml({
    previewText: `Your university placement has been ${data.statusLabel.toLowerCase()}`,
    headerLabel: 'University Placement',
    headerColor: TOKEN.ACCENT_BLUE,
    body:        bodyHtml,
    cta: {
      label: 'View My Placement',
      url:   `${school.loginUrl}/my-placement`,
      color: TOKEN.ACCENT_BLUE,
    },
    school,
  })

  const text = buildEmailText(
    [
      `Dear ${data.studentName},`,
      '',
      `Your university placement has been ${data.statusLabel.toLowerCase()}${data.verified ? ' and verified by the school' : ''}.`,
      '',
      ...(data.programmeName && data.universityName
        ? [`Placement: ${data.programmeName} — ${data.universityName}`, '']
        : []),
      'Log in to the school portal to view your placement and recorded choices.',
      '',
      `View placement: ${school.loginUrl}/my-placement`,
    ].join('\n'),
    school,
  )

  return { subject, html, text }
}
