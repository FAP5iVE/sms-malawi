/*
 * apps/web/src/server/jobs/contractExpiryJob.ts
 *
 * [CHANGE TYPE]: MAJOR REWRITE of the send path only. The daysAhead loop
 *   and getContractExpiryAlert() query are unchanged.
 * [R-PHASE]: R10 — Finance II: Payroll, Forecasting & the Finance↔Library
 *   Reconciliation
 * [PURPOSE]: Deleted the inline raw-HTML email builder, the direct
 *   `new Resend(...)` construction, and the hardcoded 'hr@school.edu.mw'
 *   sender. Sends now go through notificationService.sendContractAlert()
 *   — already correctly built (renders via contract-alert.ts's
 *   renderContractAlert(), properly design-token-styled and
 *   urgency-graded by days-until-expiry) but with zero callers before
 *   this fix, the third confirmed instance of this exact pattern in the
 *   audit (after the R9 fee-reminder and R9 payment-receipt fixes).
 *   sendContractAlert() notifies the HR team about each expiring
 *   contract — not the affected staff member directly — matching its own
 *   documented design ("Send a contract expiry alert to the HR team");
 *   this is a real behavior change from the prior (broken) job, which
 *   emailed the staff member directly, but matches the function this
 *   phase is required to reconnect.
 * [DEPENDS ON]: notificationService.sendContractAlert() (existing),
 *   hrService.getContractExpiryAlert() (this phase's select-clause
 *   extension for jobTitle/employeeNo)
 */

import { getContractExpiryAlert } from '@/server/services/hrService'
import { sendContractAlert } from '@/server/services/notificationService'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export async function contractExpiryJob(): Promise<void> {
  const hrTeam = await prisma.staffProfile.findMany({
    where:  { role: 'hr', status: 'ACTIVE' },
    select: { uid: true, email: true },
  })

  if (hrTeam.length === 0) {
    logger.warn({ event: 'contract_alerts.no_hr_recipients' })
    return
  }

  const hrEmails = hrTeam.map((h) => h.email)
  const hrUids   = hrTeam.map((h) => h.uid)

  for (const days of [7, 30, 60]) {
    const expiring = await getContractExpiryAlert(days)

    for (const staff of expiring) {
      if (!staff.contractExpiry) continue
      try {
        await sendContractAlert({
          to:     hrEmails,
          hrUids,
          data: {
            staffName:       `${staff.firstName} ${staff.lastName}`,
            jobTitle:        staff.jobTitle,
            department:      staff.department,
            contractExpiry:  staff.contractExpiry,
            daysUntilExpiry: days,
            employeeNo:      staff.employeeNo,
          },
        })
      } catch (err) {
        logger.error({ event: 'contract_alert.send_failed', staffId: staff.id, days, err })
      }
    }

    if (expiring.length > 0) {
      logger.info({ event: 'contract_alerts.sent', daysAhead: days, count: expiring.length })
    }
  }
}
