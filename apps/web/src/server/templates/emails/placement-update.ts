import 'server-only'

import { banner, buildEmailHtml, buildEmailText, details, fitSubject, para, type EmailMessage, type SchoolBranding } from './base'

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
  const subject = fitSubject(`Placement ${data.statusLabel.toLowerCase()}: ${data.studentName}`)

  const destinationHtml =
    data.programmeName && data.universityName
      ? details({
          title: 'Placement claimed',
          rows: [
            { label: 'Programme',  value: data.programmeName },
            { label: 'University', value: data.universityName },
          ],
        })
      : ''

  const rejectionHtml =
    isRejected && data.rejectionReason
      ? details({ rows: [{ label: 'Reason', value: data.rejectionReason, tone: 'red' }] })
      : ''

  const bodyHtml = `
    ${banner({ tone: isRejected ? 'red' : 'green', title: `Placement ${data.statusLabel.toLowerCase()}` })}
    ${para(
      `Dear <strong>${data.studentName}</strong>,`,
      isRejected
        ? 'The placement claim you submitted could not be verified and has been rejected.'
        : `Your university placement has been <strong>confirmed</strong>${data.verified ? ' and verified by the school' : ''}.`,
    )}
    ${destinationHtml}
    ${rejectionHtml}
    ${para(
      isRejected
        ? 'Sign in to the school portal to review the details and submit a corrected claim.'
        : 'Sign in to the school portal to see your confirmed placement.',
    )}
  `

  const html = buildEmailHtml({
    previewText: isRejected
      ? 'Your university placement claim was rejected'
      : 'Your university placement has been confirmed',
    headerLabel: 'University placement',
    body:        bodyHtml,
    cta: {
      label: 'View my placement',
      url:   `${school.loginUrl}/placements`,
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
        ? [`Placement: ${data.programmeName}, ${data.universityName}`, '']
        : []),
      isRejected
        ? 'Sign in to the school portal to review the details and submit a corrected claim.'
        : 'Sign in to the school portal to see your confirmed placement.',
      '',
      `View placement: ${school.loginUrl}/placements`,
    ].join('\n'),
    school,
  )

  return { subject, html, text }
}
