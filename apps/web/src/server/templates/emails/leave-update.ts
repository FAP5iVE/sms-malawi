import 'server-only'

import { format } from 'date-fns'
import { banner, buildEmailHtml, buildEmailText, details, fitSubject, para, tone, type EmailMessage, type SchoolBranding, type Tone } from './base'

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
  ANNUAL:    'Annual leave',
  SICK:      'Sick leave',
  MATERNITY: 'Maternity leave',
  PATERNITY: 'Paternity leave',
  STUDY:     'Study leave',
  UNPAID:    'Unpaid leave',
  EMERGENCY: 'Emergency leave',
}

const STATUS_CONFIG: Record<LeaveUpdateStatus, { label: string; tone: Tone }> = {
  APPROVED:  { label: 'Approved',  tone: 'green'   },
  REJECTED:  { label: 'Rejected',  tone: 'red'     },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  PENDING:   { label: 'Pending',   tone: 'amber'   },
}

export function renderLeaveUpdate(
  data:   LeaveUpdateData,
  school: SchoolBranding
): EmailMessage {
  const cfg           = STATUS_CONFIG[data.status] ?? STATUS_CONFIG.PENDING
  const leaveLabel    = LEAVE_TYPE_LABELS[data.leaveType] ?? data.leaveType
  const formattedStart = format(data.startDate, 'd MMMM yyyy')
  const formattedEnd   = format(data.endDate,   'd MMMM yyyy')

  const subject = fitSubject(`Leave ${cfg.label.toLowerCase()}: ${leaveLabel} from ${format(data.startDate, 'd MMM yyyy')}`)

  const statusSentence =
    data.status === 'APPROVED'
      ? `Your leave request has been ${tone('green', 'approved')}. Your dates are confirmed below.`
      : data.status === 'REJECTED'
        ? `Your leave request has been ${tone('red', 'rejected')}. The details are below.`
        : data.status === 'CANCELLED'
          ? 'Your leave request has been <strong>cancelled</strong>.'
          : `Your leave request is ${tone('amber', 'pending review')}.`

  const bodyHtml = `
    ${banner({ tone: cfg.tone, title: `Leave request ${cfg.label.toLowerCase()}`, detail: `${leaveLabel}, ${formattedStart} to ${formattedEnd}` })}
    ${para(`Dear <strong>${data.staffName}</strong>,`, statusSentence)}
    ${details({
      title: 'Leave details',
      rows: [
        { label: 'Leave type', value: leaveLabel },
        { label: 'From',       value: formattedStart },
        { label: 'To',         value: formattedEnd },
        { label: 'Duration',   value: `${data.days} working day${data.days !== 1 ? 's' : ''}` },
        { label: 'Status',     value: cfg.label, tone: cfg.tone },
        ...(data.reviewNotes ? [{ label: 'Review notes', value: data.reviewNotes }] : []),
      ],
    })}
    ${data.status === 'REJECTED' && data.reviewNotes ? para('If you have questions about this decision, speak with your HR officer.') : ''}
  `

  const html = buildEmailHtml({
    previewText:  `Leave request ${cfg.label.toLowerCase()}: ${leaveLabel} from ${formattedStart} to ${formattedEnd}`,
    headerLabel:  'Leave update',
    body:         bodyHtml,
    cta: {
      label: 'View leave records',
      url:   `${school.loginUrl}/hr`,
    },
    school,
  })

  const text = buildEmailText(
    [
      `Dear ${data.staffName},`,
      '',
      `Your ${leaveLabel.toLowerCase()} request has been ${cfg.label.toLowerCase()}.`,
      '',
      `Leave type: ${leaveLabel}`,
      `From:       ${formattedStart}`,
      `To:         ${formattedEnd}`,
      `Duration:   ${data.days} working day${data.days !== 1 ? 's' : ''}`,
      `Status:     ${cfg.label}`,
      ...(data.reviewNotes ? [``, `Review notes: ${data.reviewNotes}`] : []),
      '',
      `View leave records: ${school.loginUrl}/hr`,
    ].join('\n'),
    school
  )

  return { subject, html, text }
}
