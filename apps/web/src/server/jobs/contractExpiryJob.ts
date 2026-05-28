import { Resend }  from 'resend'
import { getContractExpiryAlert } from '@/server/services/hrService'
import { logger } from '@/lib/logger'

export async function contractExpiryJob(): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY)
  for (const days of [7, 30, 60]) {
    const expiring = await getContractExpiryAlert(days)
    for (const staff of expiring) {
      await resend.emails.send({
        from: 'hr@school.edu.mw',
        to:   [staff.email],
        subject: `Contract Expiry Notice — ${days} days remaining`,
        html: `<p>Dear ${staff.firstName},</p>
               <p>Your employment contract expires in <strong>${days} days</strong>
               (${staff.contractExpiry?.toLocaleDateString('en-MW')}).
               Please contact HR to discuss renewal.</p>`,
      }).catch((e: unknown) => logger.error({ event: 'contract_alert.email_failed', staffId: staff.id, e }))
    }
    if (expiring.length > 0)
      logger.info({ event: 'contract_alerts.sent', daysAhead: days, count: expiring.length })
  }
}