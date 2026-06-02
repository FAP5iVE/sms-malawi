import 'server-only'

import { format } from 'date-fns'
import { buildEmailHtml, buildEmailText, TOKEN, type EmailMessage, type SchoolBranding } from './base'

export type AnnouncementAudience =
  | 'ALL'
  | 'STAFF'
  | 'STUDENTS'
  | 'ACADEMIC'
  | 'FINANCE'
  | 'LIBRARY'
  | 'HR'

const AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  ALL:      'All School Members',
  STAFF:    'All Staff',
  STUDENTS: 'All Students',
  ACADEMIC: 'Academic Staff',
  FINANCE:  'Finance Department',
  LIBRARY:  'Library Staff',
  HR:       'HR Department',
}

export interface AnnouncementEmailData {
  title:        string
  body:         string
  authorName:   string
  authorTitle?: string
  audience:     AnnouncementAudience
  publishedAt:  Date
  announcementId: string
  /** Optional: event date if the announcement is about an upcoming event */
  eventDate?:   Date
  /** Optional: category tag displayed as a badge */
  category?:    string
}

const CATEGORY_COLORS: Record<string, string> = {
  'Event':       TOKEN.ACCENT_BLUE,
  'Holiday':     TOKEN.ACCENT_GREEN,
  'Exam':        TOKEN.ACCENT_ORANGE,
  'Finance':     TOKEN.ACCENT_AMBER,
  'Academic':    TOKEN.PRIMARY,
  'General':     TOKEN.TEXT_MUTED,
  'Urgent':      TOKEN.ACCENT_RED,
}

export function renderAnnouncement(
  data:   AnnouncementEmailData,
  school: SchoolBranding
): EmailMessage {
  const audienceLabel  = AUDIENCE_LABELS[data.audience] ?? data.audience
  const publishedLabel = format(data.publishedAt, 'EEEE, d MMMM yyyy')
  const categoryColor  = data.category ? (CATEGORY_COLORS[data.category] ?? TOKEN.ACCENT_BLUE) : TOKEN.ACCENT_BLUE

  const subject = data.category === 'Urgent'
    ? `🚨 URGENT: ${data.title} — ${school.schoolName}`
    : `📢 ${data.title} — ${school.schoolName}`

  // Sanitise body for HTML insertion — preserve line breaks as <br>
  const safeBody = data.body
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/\n/g, '<br />')

  const bodyHtml = `
    <!-- Announcement header -->
    <tr>
      <td style="padding:32px 32px 0;">
        ${data.category ? `
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
          <tr>
            <td style="background-color:${categoryColor};border-radius:4px;padding:4px 12px;">
              <p style="margin:0;font-family:${TOKEN.FONT_STACK};font-size:11px;font-weight:bold;color:#ffffff;text-transform:uppercase;letter-spacing:0.08em;">${data.category}</p>
            </td>
          </tr>
        </table>` : ''}
        <h1 style="margin:0 0 4px;font-family:${TOKEN.FONT_HEADING};font-size:22px;font-weight:bold;color:${TOKEN.TEXT_DARK};line-height:1.3;">${data.title}</h1>
        <p style="margin:0;font-family:${TOKEN.FONT_STACK};font-size:13px;color:${TOKEN.TEXT_MUTED};">
          ${publishedLabel}
          ${data.authorName ? ` &bull; ${data.authorName}${data.authorTitle ? ', ' + data.authorTitle : ''}` : ''}
          &bull; To: ${audienceLabel}
        </p>
      </td>
    </tr>

    <!-- Divider -->
    <tr>
      <td style="padding:16px 32px 0;">
        <hr style="border:none;border-top:1px solid ${TOKEN.BORDER};margin:0;" />
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="padding:20px 32px 0;font-family:${TOKEN.FONT_STACK};font-size:15px;color:${TOKEN.TEXT_BODY};line-height:1.8;">
        ${safeBody}
      </td>
    </tr>

    ${data.eventDate ? `
    <!-- Event date highlight -->
    <tr>
      <td style="padding:20px 32px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border-left:4px solid ${TOKEN.ACCENT_BLUE};border-radius:4px;width:100%;">
          <tr>
            <td style="padding:14px 18px;">
              <p style="margin:0;font-family:${TOKEN.FONT_STACK};font-size:12px;font-weight:bold;color:${TOKEN.ACCENT_BLUE};text-transform:uppercase;letter-spacing:0.06em;">Event Date</p>
              <p style="margin:4px 0 0;font-family:${TOKEN.FONT_STACK};font-size:15px;font-weight:bold;color:${TOKEN.TEXT_DARK};">${format(data.eventDate, 'EEEE, d MMMM yyyy')}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>` : ''}

    <!-- Author footer -->
    ${data.authorName ? `
    <tr>
      <td style="padding:24px 32px 0;">
        <hr style="border:none;border-top:1px solid ${TOKEN.BORDER};margin:0 0 16px;" />
        <p style="margin:0;font-family:${TOKEN.FONT_STACK};font-size:13px;color:${TOKEN.TEXT_MUTED};">
          This announcement was posted by <strong>${data.authorName}</strong>${data.authorTitle ? ', ' + data.authorTitle : ''} on behalf of ${school.schoolName}.
        </p>
      </td>
    </tr>` : ''}

    <tr><td style="padding:24px 0 0;"></td></tr>
  `

  const html = buildEmailHtml({
    previewText:  data.body.replace(/<[^>]+>/g, '').slice(0, 140),
    headerLabel:  `Announcement — ${audienceLabel}`,
    headerColor:  data.category === 'Urgent' ? TOKEN.ACCENT_RED : TOKEN.PRIMARY,
    body:         bodyHtml,
    cta: {
      label: 'View on Portal',
      url:   `${school.loginUrl}/announcements`,
      color: TOKEN.PRIMARY,
    },
    school,
  })

  const text = buildEmailText(
    [
      `ANNOUNCEMENT: ${data.title}`,
      `Date: ${publishedLabel}`,
      `To: ${audienceLabel}`,
      `From: ${data.authorName}${data.authorTitle ? ', ' + data.authorTitle : ''}`,
      '',
      '─'.repeat(40),
      '',
      data.body,
      '',
      ...(data.eventDate ? [`Event Date: ${format(data.eventDate, 'EEEE, d MMMM yyyy')}`, ''] : []),
      `View on portal: ${school.loginUrl}/announcements`,
    ].join('\n'),
    school
  )

  return { subject, html, text }
}