import 'server-only'

import { format, differenceInDays } from 'date-fns'
import { buildEmailHtml, buildEmailText, TOKEN, type EmailMessage, type SchoolBranding } from './base'

export type LeaveUpdateStatus = 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'PENDING'

export interface LeaveUpdateData {
  staffName:    string
  leaveType:    string
  startDate:    Date
  endDate:      Date
  days:         number
  status:       LeaveUpdateStatus
  reviewedBy?:  string
  reviewNotes?: string
  requestDate:  Date
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
  ANNUAL:    'Annual Leave',
  SICK:      'Sick Leave',
  MATERNITY: 'Maternity Leave',
  PATERNITY: 'Paternity Leave',
  STUDY:     'Study Leave',
  UNPAID:    'Unpaid Leave',
  EMERGENCY: 'Emergency Leave',
}

const STATUS_CONFIG: Record<
  LeaveUpdateStatus,
  { label: string; color: string; emoji: string; headerColor: string }
> = {
  APPROVED:  { label: 'Approved',  color: TOKEN.ACCENT_GREEN,  emoji: '✅', headerColor: TOKEN.ACCENT_GREEN  },
  REJECTED:  { label: 'Rejected',  color: TOKEN.ACCENT_RED,    emoji: '❌', headerColor: TOKEN.ACCENT_RED    },
  CANCELLED: { label: 'Cancelled', color: TOKEN.TEXT_MUTED,    emoji: '🚫', headerColor: TOKEN.TEXT_MUTED    },
  PENDING:   { label: 'Pending',   color: TOKEN.ACCENT_ORANGE, emoji: '⏳', headerColor: TOKEN.ACCENT_ORANGE },
}

export function renderLeaveUpdate(
  data:   LeaveUpdateData,
  school: SchoolBranding
): EmailMessage {
  const cfg           = STATUS_CONFIG[data.status] ?? STATUS_CONFIG.PENDING
  const leaveLabel    = LEAVE_TYPE_LABELS[data.leaveType] ?? data.leaveType
  const formattedStart = format(data.startDate, 'd MMMM yyyy')
  const formattedEnd   = format(data.endDate,   'd MMMM yyyy')

  const subject = `${cfg.emoji} Leave request ${cfg.label.toLowerCase()} — ${leaveLabel} (${formattedStart})`

  const bodyHtml = `
    <!-- Status banner -->
    <tr>
      <td style="padding:32px 32px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:${data.status === 'APPROVED' ? '#f0fdf4' : data.status === 'REJECTED' ? '#fef2f2' : '#f9fafb'};border-radius:8px;">
          <tr>
            <td style="padding:20px 24px;text-align:center;">
              <p style="margin:0 0 4px;font-family:${TOKEN.FONT_STACK};font-size:32px;line-height:1;">${cfg.emoji}</p>
              <p style="margin:0;font-family:${TOKEN.FONT_HEADING};font-size:18px;font-weight:bold;color:${cfg.color};">
                Leave Request ${cfg.label}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Greeting -->
    <tr>
      <td style="padding:20px 32px 0;font-family:${TOKEN.FONT_STACK};font-size:15px;color:${TOKEN.TEXT_BODY};line-height:1.7;">
        <p style="margin:0;">Dear <strong>${data.staffName}</strong>,</p>
        <p style="margin:12px 0 0;">
          ${data.status === 'APPROVED'
            ? `Your leave request has been <strong style="color:${TOKEN.ACCENT_GREEN};">approved</strong>. Your dates have been confirmed as below.`
            : data.status === 'REJECTED'
              ? `Your leave request has been <strong style="color:${TOKEN.ACCENT_RED};">rejected</strong>. Please see the details below.`
              : data.status === 'CANCELLED'
                ? `Your leave request has been <strong>cancelled</strong>.`
                : `Your leave request is <strong style="color:${TOKEN.ACCENT_ORANGE};">pending review</strong>.`
          }
        </p>
      </td>
    </tr>

    <!-- Leave details table -->
    <tr>
      <td style="padding:20px 32px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid ${TOKEN.BORDER};border-radius:6px;overflow:hidden;">
          <tr style="background-color:#f9fafb;">
            <td colspan="2" style="padding:12px 16px;font-family:${TOKEN.FONT_STACK};font-size:11px;font-weight:bold;color:${TOKEN.TEXT_MUTED};text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid ${TOKEN.BORDER};">
              Leave Details
            </td>
          </tr>
          <tr>
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_MUTED};width:40%;border-bottom:1px solid ${TOKEN.BORDER};">Leave Type</td>
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_DARK};font-weight:600;border-bottom:1px solid ${TOKEN.BORDER};">${leaveLabel}</td>
          </tr>
          <tr style="background-color:#f9fafb;">
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_MUTED};border-bottom:1px solid ${TOKEN.BORDER};">From</td>
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_DARK};border-bottom:1px solid ${TOKEN.BORDER};">${formattedStart}</td>
          </tr>
          <tr>
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_MUTED};border-bottom:1px solid ${TOKEN.BORDER};">To</td>
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_DARK};border-bottom:1px solid ${TOKEN.BORDER};">${formattedEnd}</td>
          </tr>
          <tr style="background-color:#f9fafb;">
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_MUTED};border-bottom:1px solid ${TOKEN.BORDER};">Duration</td>
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_DARK};font-weight:600;border-bottom:1px solid ${TOKEN.BORDER};">${data.days} working day${data.days !== 1 ? 's' : ''}</td>
          </tr>
          <tr>
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_MUTED};${data.reviewNotes ? 'border-bottom:1px solid ' + TOKEN.BORDER + ';' : ''}">Status</td>
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;font-weight:bold;color:${cfg.color};${data.reviewNotes ? 'border-bottom:1px solid ' + TOKEN.BORDER + ';' : ''}">${cfg.label}</td>
          </tr>
          ${data.reviewNotes ? `
          <tr style="background-color:#f9fafb;">
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_MUTED};">Review Notes</td>
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_BODY};font-style:italic;">${data.reviewNotes}</td>
          </tr>` : ''}
        </table>
      </td>
    </tr>

    ${data.status === 'REJECTED' && data.reviewNotes ? `
    <tr>
      <td style="padding:16px 32px 0;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_BODY};line-height:1.7;">
        <p style="margin:0;">If you have questions about this decision, please speak with your HR officer.</p>
      </td>
    </tr>` : ''}

    <tr><td style="padding:24px 0 0;"></td></tr>
  `

  const html = buildEmailHtml({
    previewText:  `Leave request ${cfg.label.toLowerCase()} — ${leaveLabel} from ${formattedStart} to ${formattedEnd}`,
    headerLabel:  'Leave Update',
    headerColor:  cfg.headerColor,
    body:         bodyHtml,
    cta: {
      label: 'View Leave Records',
      url:   `${school.loginUrl}/hr`,
      color: cfg.color,
    },
    school,
  })

  const text = buildEmailText(
    [
      `Dear ${data.staffName},`,
      '',
      `Your ${leaveLabel} request has been ${cfg.label.toUpperCase()}.`,
      '',
      `Leave Type: ${leaveLabel}`,
      `From:       ${formattedStart}`,
      `To:         ${formattedEnd}`,
      `Duration:   ${data.days} working day${data.days !== 1 ? 's' : ''}`,
      `Status:     ${cfg.label}`,
      ...(data.reviewNotes ? [``, `Notes: ${data.reviewNotes}`] : []),
      '',
      `View leave records: ${school.loginUrl}/hr`,
    ].join('\n'),
    school
  )

  return { subject, html, text }
}