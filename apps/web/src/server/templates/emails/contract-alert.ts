import 'server-only'

import { format } from 'date-fns'
import { banner, buildEmailHtml, buildEmailText, details, fitSubject, para, tone, type EmailMessage, type SchoolBranding, type Tone } from './base'

export interface ContractAlertData {
  staffName:       string
  jobTitle:        string
  department:      string
  /** The expiry date being warned about. For kind 'licence' this is the TCM licence expiry. */
  contractExpiry:  Date
  daysUntilExpiry: number
  employeeNo:      string
  /** Default 'contract'. 'licence' re-uses this template for TCM licence expiry (teaching staff). */
  kind?:           'contract' | 'licence'
}

function getUrgencyConfig(days: number, noun: string): { label: string; tone: Tone } {
  if (days <= 0)  return { label: `${noun} expired`,       tone: 'red'   }
  if (days <= 14) return { label: 'Urgent: expires soon',  tone: 'red'   }
  if (days <= 30) return { label: `${noun} expiring soon`, tone: 'amber' }
  return { label: `${noun} renewal notice`, tone: 'blue' }
}

export function renderContractAlert(
  data:   ContractAlertData,
  school: SchoolBranding
): EmailMessage {
  const isLicence       = data.kind === 'licence'
  const lower           = isLicence ? 'TCM licence' : 'contract'      // sentence use
  const Title           = isLicence ? 'TCM licence' : 'Contract'      // heading use
  const cfg             = getUrgencyConfig(data.daysUntilExpiry, Title)
  const formattedExpiry = format(data.contractExpiry, 'd MMMM yyyy')
  const isExpired       = data.daysUntilExpiry <= 0
  const dayWord         = `${data.daysUntilExpiry} day${data.daysUntilExpiry !== 1 ? 's' : ''}`
  const expiryLabel     = isLicence ? 'Licence expiry' : 'Contract expiry'

  const subject = fitSubject(
    isExpired
      ? `${Title} expired for ${data.staffName}`
      : `${Title} expires ${format(data.contractExpiry, 'd MMM yyyy')}: ${data.staffName}`,
  )

  const bodyHtml = `
    ${banner({
      tone:   cfg.tone,
      title:  cfg.label,
      detail: isExpired
        ? `Expired on ${formattedExpiry}. Immediate action is required.`
        : `Expires on ${formattedExpiry}, ${dayWord} remaining.`,
    })}
    ${para(
      'Dear HR Team,',
      isExpired
        ? `${isLicence ? 'The TCM licence' : 'The employment contract'} for <strong>${data.staffName}</strong> has ${tone('red', 'expired')}. ${isLicence ? 'Please make sure the licence is renewed before this teacher continues in the classroom.' : 'Please take immediate action to either renew or end the employment arrangement.'}`
        : `${isLicence ? 'The TCM licence' : 'The employment contract'} for <strong>${data.staffName}</strong> is due to expire in <strong>${dayWord}</strong>. Please start the ${isLicence ? 'licence renewal' : 'contract renewal'} as soon as possible.`,
    )}
    ${details({
      title: 'Staff member details',
      rows: [
        { label: 'Name',            value: data.staffName },
        { label: 'Employee number', value: data.employeeNo },
        { label: 'Job title',       value: data.jobTitle },
        { label: 'Department',      value: data.department },
        { label: expiryLabel,       value: formattedExpiry, tone: cfg.tone },
      ],
    })}
    ${para(`Please sign in to the HR page to manage this staff member's ${lower} and take the next step.`)}
  `

  const html = buildEmailHtml({
    previewText:  isExpired
      ? `${Title} expired for ${data.staffName}. Immediate action is required.`
      : `${Title} expires on ${formattedExpiry} for ${data.staffName}`,
    headerLabel:  isLicence ? 'Licence alert' : 'Contract alert',
    body:         bodyHtml,
    cta: {
      label: 'Open HR records',
      url:   `${school.loginUrl}/hr`,
    },
    school,
  })

  const text = buildEmailText(
    [
      `Dear HR Team,`,
      '',
      `${isLicence ? 'Licence' : 'Contract'} alert: ${cfg.label}`,
      '',
      `Name:             ${data.staffName}`,
      `Employee number:  ${data.employeeNo}`,
      `Job title:        ${data.jobTitle}`,
      `Department:       ${data.department}`,
      `${expiryLabel}: ${formattedExpiry}`,
      `Days remaining:   ${isExpired ? 'Expired' : data.daysUntilExpiry}`,
      '',
      isExpired
        ? `This ${lower} has expired. Immediate action is required.`
        : `Please start the ${isLicence ? 'licence' : 'contract'} renewal within the next ${dayWord}.`,
      '',
      `Open HR records: ${school.loginUrl}/hr`,
    ].join('\n'),
    school
  )

  return { subject, html, text }
}
