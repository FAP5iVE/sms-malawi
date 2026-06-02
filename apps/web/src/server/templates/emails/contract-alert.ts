import 'server-only'

import { format } from 'date-fns'
import { buildEmailHtml, buildEmailText, TOKEN, type EmailMessage, type SchoolBranding } from './base'

export interface ContractAlertData {
  staffName:       string
  jobTitle:        string
  department:      string
  contractExpiry:  Date
  daysUntilExpiry: number
  employeeNo:      string
}

function getUrgencyConfig(days: number): {
  label:       string
  color:       string
  headerColor: string
  bgColor:     string
  emoji:       string
} {
  if (days <= 0) {
    return { label: 'Contract Expired', color: TOKEN.ACCENT_RED, headerColor: TOKEN.ACCENT_RED, bgColor: '#fef2f2', emoji: '🚨' }
  }
  if (days <= 14) {
    return { label: 'Urgent — Expires Soon', color: TOKEN.ACCENT_RED, headerColor: TOKEN.ACCENT_RED, bgColor: '#fef2f2', emoji: '🔴' }
  }
  if (days <= 30) {
    return { label: 'Contract Expiring Soon', color: TOKEN.ACCENT_ORANGE, headerColor: TOKEN.ACCENT_ORANGE, bgColor: '#fff7ed', emoji: '🟠' }
  }
  return { label: 'Contract Renewal Notice', color: TOKEN.ACCENT_AMBER, headerColor: TOKEN.ACCENT_AMBER, bgColor: '#fffbeb', emoji: '🟡' }
}

export function renderContractAlert(
  data:   ContractAlertData,
  school: SchoolBranding
): EmailMessage {
  const cfg            = getUrgencyConfig(data.daysUntilExpiry)
  const formattedExpiry = format(data.contractExpiry, 'd MMMM yyyy')
  const isExpired       = data.daysUntilExpiry <= 0

  const subject = isExpired
    ? `🚨 Contract expired — ${data.staffName} (${data.employeeNo}) — action required`
    : `${cfg.emoji} Contract expiring in ${data.daysUntilExpiry} day${data.daysUntilExpiry !== 1 ? 's' : ''} — ${data.staffName}`

  const bodyHtml = `
    <!-- Urgency banner -->
    <tr>
      <td style="padding:32px 32px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:${cfg.bgColor};border-left:4px solid ${cfg.color};border-radius:4px;">
          <tr>
            <td style="padding:16px 20px;">
              <p style="margin:0;font-family:${TOKEN.FONT_STACK};font-size:16px;font-weight:bold;color:${cfg.color};">${cfg.emoji} ${cfg.label}</p>
              ${isExpired
                ? `<p style="margin:4px 0 0;font-family:${TOKEN.FONT_STACK};font-size:13px;color:${TOKEN.TEXT_MUTED};">Expired on ${formattedExpiry} — immediate action required.</p>`
                : `<p style="margin:4px 0 0;font-family:${TOKEN.FONT_STACK};font-size:13px;color:${TOKEN.TEXT_MUTED};">Expires on ${formattedExpiry} — ${data.daysUntilExpiry} day${data.daysUntilExpiry !== 1 ? 's' : ''} remaining.</p>`
              }
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="padding:20px 32px 0;font-family:${TOKEN.FONT_STACK};font-size:15px;color:${TOKEN.TEXT_BODY};line-height:1.7;">
        <p style="margin:0;">Dear HR Team,</p>
        <p style="margin:12px 0 0;">
          ${isExpired
            ? `The employment contract for <strong>${data.staffName}</strong> has <strong style="color:${TOKEN.ACCENT_RED};">expired</strong>. Please take immediate action to either renew or terminate the employment arrangement.`
            : `The employment contract for <strong>${data.staffName}</strong> is due to expire in <strong>${data.daysUntilExpiry} day${data.daysUntilExpiry !== 1 ? 's' : ''}</strong>. Please initiate the contract renewal process as soon as possible.`
          }
        </p>
      </td>
    </tr>

    <!-- Staff details -->
    <tr>
      <td style="padding:20px 32px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid ${TOKEN.BORDER};border-radius:6px;overflow:hidden;">
          <tr style="background-color:#f9fafb;">
            <td colspan="2" style="padding:12px 16px;font-family:${TOKEN.FONT_STACK};font-size:11px;font-weight:bold;color:${TOKEN.TEXT_MUTED};text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid ${TOKEN.BORDER};">
              Staff Member Details
            </td>
          </tr>
          <tr>
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_MUTED};width:40%;border-bottom:1px solid ${TOKEN.BORDER};">Name</td>
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_DARK};font-weight:600;border-bottom:1px solid ${TOKEN.BORDER};">${data.staffName}</td>
          </tr>
          <tr style="background-color:#f9fafb;">
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_MUTED};border-bottom:1px solid ${TOKEN.BORDER};">Employee No.</td>
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_DARK};border-bottom:1px solid ${TOKEN.BORDER};">${data.employeeNo}</td>
          </tr>
          <tr>
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_MUTED};border-bottom:1px solid ${TOKEN.BORDER};">Job Title</td>
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_DARK};border-bottom:1px solid ${TOKEN.BORDER};">${data.jobTitle}</td>
          </tr>
          <tr style="background-color:#f9fafb;">
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_MUTED};border-bottom:1px solid ${TOKEN.BORDER};">Department</td>
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_DARK};border-bottom:1px solid ${TOKEN.BORDER};">${data.department}</td>
          </tr>
          <tr>
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_MUTED};">Contract Expiry</td>
            <td style="padding:11px 16px;font-family:${TOKEN.FONT_STACK};font-size:14px;font-weight:bold;color:${cfg.color};">${formattedExpiry}</td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="padding:20px 32px 0;font-family:${TOKEN.FONT_STACK};font-size:14px;color:${TOKEN.TEXT_BODY};line-height:1.7;">
        <p style="margin:0;">Please log in to the HR module to manage this staff member's contract and take appropriate action.</p>
      </td>
    </tr>

    <tr><td style="padding:24px 0 0;"></td></tr>
  `

  const html = buildEmailHtml({
    previewText:  isExpired
      ? `Contract expired — ${data.staffName} — immediate action required`
      : `Contract expiring in ${data.daysUntilExpiry} days — ${data.staffName} — ${formattedExpiry}`,
    headerLabel:  'Contract Alert',
    headerColor:  cfg.headerColor,
    body:         bodyHtml,
    cta: {
      label: 'Manage in HR Module',
      url:   `${school.loginUrl}/hr`,
      color: cfg.color,
    },
    school,
  })

  const text = buildEmailText(
    [
      `Dear HR Team,`,
      '',
      `CONTRACT ALERT — ${cfg.label.toUpperCase()}`,
      '',
      `Staff Member:    ${data.staffName}`,
      `Employee No.:    ${data.employeeNo}`,
      `Job Title:       ${data.jobTitle}`,
      `Department:      ${data.department}`,
      `Contract Expiry: ${formattedExpiry}`,
      `Days Remaining:  ${isExpired ? 'EXPIRED' : data.daysUntilExpiry}`,
      '',
      isExpired
        ? 'This contract has expired. Immediate action is required.'
        : `Please initiate the contract renewal process within the next ${data.daysUntilExpiry} day${data.daysUntilExpiry !== 1 ? 's' : ''}.`,
      '',
      `Manage in HR module: ${school.loginUrl}/hr`,
    ].join('\n'),
    school
  )

  return { subject, html, text }
}