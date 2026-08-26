/**
 * apps/web/src/app/api/cron/daily-tasks/route.ts
 *
 * [CHANGE TYPE]: NEW FILE (production fix, 2026-07-31)
 * [PURPOSE]: Vercel rejected the deployment with 6 separate cron entries in
 *   vercel.json, even though every individual schedule already satisfies
 *   the documented "once per day" Hobby rule. Per Vercel's own changelog,
 *   Hobby was capped at 2 cron jobs per team before the per-project limit
 *   was raised to 100 in January 2026 — this account's deployment
 *   behaviour matches the OLD cap still being enforced, whether that's a
 *   rollout lag or an account-specific limit. Removing the crons block
 *   entirely confirmed it was the cause (deploy succeeded).
 *
 *   Fix: collapse all six scheduled tasks into ONE cron entry that runs
 *   them all in sequence. This works under either the old 2-job cap or the
 *   documented 100-job cap, and stays well inside "once per day" since
 *   it's a single daily invocation. The six original route files are left
 *   untouched and still work individually (e.g. for manual/local testing
 *   via curl) — they're just no longer the thing vercel.json schedules.
 *
 * [DEPENDS ON]: the same six job functions the original routes each
 *   called individually — contractExpiryJob, dailyFeeReminderJob,
 *   dailyInstallmentCheckJob, dailyLatePenaltiesJob, overdueLibraryJob,
 *   runRiskAssessmentJob (+ settingsService for its academicYear/term args)
 */
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { contractExpiryJob } from '@/server/jobs/contractExpiryJob'
import { dailyFeeReminderJob } from '@/server/jobs/feeReminderJob'
import { dailyInstallmentCheckJob } from '@/server/jobs/installmentCheckJob'
import { dailyLatePenaltiesJob } from '@/server/jobs/latePenaltiesJob'
import { overdueLibraryJob } from '@/server/jobs/overdueLibraryJob'
import { runRiskAssessmentJob } from '@/server/services/riskJob'
import * as settingsService from '@/server/services/settingsService'
import { SETTING_KEYS } from '@shared/types/settings'
import * as Sentry from '@sentry/nextjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Six real jobs in sequence (DB writes, some send emails) can run past the
// default timeout on a cold start — give it real headroom. Hobby's ceiling
// is 60s; this stays under it while giving each task room to breathe.
export const maxDuration = 60

// A task failing must not stop the others from running — each is wrapped
// individually and the response reports per-task success/failure rather
// than the whole invocation failing on the first error.
async function runTask(name: string, fn: () => Promise<unknown>) {
  try {
    const result = await fn()
    return { name, ok: true, result: result ?? null }
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'daily-tasks', task: name } })
    return { name, ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function GET() {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
  }
  const h = await headers()
  if (h.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

   // Sentry.withMonitor wraps the WHOLE run — this is the "did the cron
  // actually fire and complete" signal (research §7). Per-task failures
  // (above) are separately captured and do NOT fail the monitor itself —
  // this file's own existing design philosophy ("a task failing must not
  // stop the others") is preserved exactly; withMonitor just adds
  // visibility on top, it doesn't change what happens when a task fails.
  const results = await Sentry.withMonitor(
    'sms-daily-tasks',
    async () => {
      const { current_academic_year: academicYear, current_term: academicTerm } =
        await settingsService.getMany([SETTING_KEYS.CURRENT_ACADEMIC_YEAR, SETTING_KEYS.CURRENT_TERM])

      return [
        await runTask('fee-reminders', dailyFeeReminderJob),
        await runTask('overdue-library', overdueLibraryJob),
        await runTask('contract-alerts', contractExpiryJob),
        await runTask('installment-check', dailyInstallmentCheckJob),
        await runTask('late-penalties', dailyLatePenaltiesJob),
        await runTask('risk-detection', () => runRiskAssessmentJob(academicTerm, academicYear)),
      ]
    },
    {
      schedule: { type: 'crontab', value: '0 4 * * *' },   // matches vercel.json's real cron entry exactly
      timezone: 'Africa/Blantyre',                          // Malawi — not UTC, not a placeholder
      checkinMargin: 5,      // minutes grace before "missed"
      maxRuntime: 2,         // minutes — headroom above the real maxDuration=60s cap above
      failureIssueThreshold: 1,
      recoveryThreshold: 1,
    },
  )

  const allOk = results.every((r) => r.ok)
  return NextResponse.json(
    { ok: allOk, ran: 'daily-tasks', ts: new Date().toISOString(), results },
    { status: allOk ? 200 : 207 },   // 207 Multi-Status — some tasks failed, response still lists which
  )
}