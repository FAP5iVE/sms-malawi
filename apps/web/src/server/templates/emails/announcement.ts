/*
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R13 — Announcements, Timetable & Calendar Domain
 * [PURPOSE]: AnnouncementAudience was defined locally here with no shared
 *   source, duplicating (and risking drifting out of sync with)
 *   announcementService.ts's own targetAll/targetRoles vocabulary — now
 *   imported from @shared/schemas/announcement, the single reconciled
 *   type this phase establishes across all three call sites. Both inline
 *   `<hr>`-row reimplementations replaced with base.ts's existing,
 *   exported, previously-zero-caller divider() helper.
 * [DEPENDS ON]: @shared/schemas/announcement (AnnouncementAudience)
 */
import 'server-only'

import { format } from 'date-fns'
import { banner, buildEmailHtml, buildEmailText, details, divider, fitSubject, note, TOKEN, TONES, type EmailMessage, type SchoolBranding, type Tone } from './base'
import type { AnnouncementAudience } from '@shared/schemas/announcement'

const AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  ALL:      'All school members',
  STAFF:    'All staff',
  STUDENTS: 'All students',
  ACADEMIC: 'Academic staff',
  FINANCE:  'Finance department',
  LIBRARY:  'Library staff',
  HR:       'HR department',
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

const CATEGORY_TONES: Record<string, Tone> = {
  'Event':       'blue',
  'Holiday':     'green',
  'Exam':        'amber',
  'Finance':     'amber',
  'Academic':    'neutral',
  'General':     'neutral',
  'Urgent':      'red',
}

export function renderAnnouncement(
  data:   AnnouncementEmailData,
  school: SchoolBranding
): EmailMessage {
  const audienceLabel  = AUDIENCE_LABELS[data.audience] ?? data.audience
  const publishedLabel = format(data.publishedAt, 'EEEE, d MMMM yyyy')
  const isUrgent       = data.category === 'Urgent'
  const categoryTone   = data.category ? (CATEGORY_TONES[data.category] ?? 'blue') : 'blue'
  const categoryColors = TONES[categoryTone]

  const subject = fitSubject(isUrgent ? `Urgent: ${data.title}` : data.title)

  // Sanitise body for HTML insertion, preserve line breaks as <br>
  const safeBody = data.body
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/\n/g, '<br />')

  const bodyHtml = `
    ${isUrgent ? banner({ tone: 'red', title: 'Urgent announcement' }) : ''}
    <!-- Announcement header -->
    <tr>
      <td class="em-pad" style="padding:${isUrgent ? '20' : '32'}px 32px 0;">
        ${data.category && !isUrgent ? `<p class="${categoryColors.cls}" style="margin:0 0 4px;font-family:${TOKEN.FONT_STACK};font-size:14px;font-weight:bold;color:${categoryColors.text};line-height:1.5;">${data.category}</p>` : ''}
        <h1 class="em-t" style="margin:0 0 4px;font-family:${TOKEN.FONT_HEADING};font-size:22px;font-weight:bold;color:${TOKEN.TEXT_DARK};line-height:1.3;">${data.title}</h1>
        <p class="em-m" style="margin:0;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_MUTED};line-height:1.5;">
          ${publishedLabel}
          ${data.authorName ? ` &bull; ${data.authorName}${data.authorTitle ? ', ' + data.authorTitle : ''}` : ''}
          &bull; To: ${audienceLabel}
        </p>
      </td>
    </tr>

    <tr><td style="padding:16px 0 0;"></td></tr>
    ${divider()}

    <!-- Body -->
    <tr>
      <td class="em-pad em-t" style="padding:20px 32px 0;font-family:${TOKEN.FONT_STACK};font-size:16px;color:${TOKEN.TEXT_BODY};line-height:1.5;">
        ${safeBody}
      </td>
    </tr>

    ${data.eventDate ? details({ rows: [{ label: 'Event date', value: format(data.eventDate, 'EEEE, d MMMM yyyy'), tone: 'blue' }] }) : ''}

    ${data.authorName ? `
    <tr><td style="padding:24px 0 0;"></td></tr>
    ${divider()}
    ${note(`This announcement was posted by <strong>${data.authorName}</strong>${data.authorTitle ? ', ' + data.authorTitle : ''} on behalf of ${school.schoolName}.`)}` : ''}
  `

  const html = buildEmailHtml({
    previewText:  data.body.replace(/<[^>]+>/g, '').slice(0, 140),
    headerLabel:  `Announcement: ${audienceLabel}`,
    body:         bodyHtml,
    cta: {
      label: 'View announcement',
      url:   `${school.loginUrl}/announcements`,
    },
    school,
  })

  const text = buildEmailText(
    [
      `${isUrgent ? 'Urgent announcement' : 'Announcement'}: ${data.title}`,
      `Date: ${publishedLabel}`,
      `To: ${audienceLabel}`,
      `From: ${data.authorName}${data.authorTitle ? ', ' + data.authorTitle : ''}`,
      '',
      '-'.repeat(40),
      '',
      data.body,
      '',
      ...(data.eventDate ? [`Event date: ${format(data.eventDate, 'EEEE, d MMMM yyyy')}`, ''] : []),
      `View announcement: ${school.loginUrl}/announcements`,
    ].join('\n'),
    school
  )

  return { subject, html, text }
}
