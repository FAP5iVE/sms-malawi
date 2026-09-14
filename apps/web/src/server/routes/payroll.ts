/*
 * apps/web/src/server/routes/payroll.ts
 *
 * [CHANGE TYPE]: MAJOR REWRITE
 * [R-PHASE]: R10 — Finance II: Payroll, Forecasting & the Finance↔Library
 *   Reconciliation; extended for the Payroll Runs & Approvals / My Pay
 *   redesign (user-requested)
 * [PURPOSE]:
 *   R10 (unchanged from this point on):
 *   1. Mounted the (now-rebuilt) payrollApprovalService behind
 *      POST /runs/:id/submit-for-approval, .../approve, .../lock,
 *      .../rollback — none of these existed in any route file before this
 *      phase, despite PayrollApprovalPanel.tsx calling equivalents since
 *      its own phase. Gated with requirePermission() against the real
 *      1-to-1 permission each action maps to (verified directly against
 *      S/types/permissions.ts, not assumed): finance.runPayroll for
 *      submit (the closest real match — there is no dedicated
 *      "submit-for-approval" permission, and finance is the role that
 *      owns the payroll run through to submission), finance.approvePayroll
 *      (high_rank only), finance.lockPayroll (finance only),
 *      finance.rollbackPayroll (finance only).
 *
 *   Redesign additions/fixes:
 *   2. GET / and POST /run: converted from requireRole to
 *      requirePermission('finance.viewPayrollRuns' / 'finance.runPayroll')
 *      — requireRole(['admin','finance']) on POST /run let admin trigger a
 *      payroll run despite admin holding none of finance.runPayroll in the
 *      permission matrix (verified against S/types/permissions.ts); GET /
 *      already had this fixed in R10, this brings POST /run to the same
 *      standard rather than leaving one route on each convention.
 *   3. POST /run now surfaces payrollService.processMonthlyPayroll()'s new
 *      run-window/already-run errors (403/409, thrown with .status) via
 *      sendError instead of the bare try-less call this route used before
 *      — a closed window or an already-run month now returns a real,
 *      readable error instead of an unhandled 500.
 *   4. GET /run-window — new. Backs the Run Payroll button's enabled state
 *      and "opens on"/"locked for this month" copy; no client-side date
 *      math duplicating payrollService's own window computation.
 *   5. GET /:id — new. "Deep Inspection"/"Inspect Payslips" drill-down;
 *      PayrollApprovalPanel.tsx's own header comment confirmed no such
 *      route existed and it removed its per-staff table rather than call
 *      one. Registered after every more-specific literal path below it
 *      (run-window, my-payslips, my-salary, payslips/:id/download,
 *      runs/:id/...) so it can't shadow them.
 *   6. GET /my-payslips and GET /my-salary (the latter new — see #7) now
 *      accept an optional ?staffUid= query param, permission-checked
 *      against hr.viewAnyPayslips when it names someone other than the
 *      caller — the "Viewing Employee" picker in My Pay (Self-Service).
 *      hr.viewAnyPayslips already existed in the permission matrix
 *      (granted to hr/high_rank) with zero routes enforcing it anywhere;
 *      verifyPermission.ts's own requireAnyPermission() doc comment even
 *      demonstrates it as an example against this exact route.
 *   7. GET /my-salary — new. useMySalaryStructure() called this exact path
 *      and 404'd; the route and its backing service function
 *      (payrollService.getMySalaryStructure) did not exist at all.
 * [DEPENDS ON]: payrollApprovalService.ts (R10), payrollService.ts
 *   (getPayrollRunWindow/getPayrollRunDetail/getMySalaryStructure — same
 *   redesign), sendError.ts
 */

import { Router, type Request, type Response } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import { requirePermission } from '@/server/middleware/verifyPermission'
import { hasPermission } from '@shared/types/permissions'
import * as payrollService from '@/server/services/payrollService'
import * as payrollApprovalService from '@/server/services/payrollApprovalService'
import { getSignedViewUrl, canReadFile } from '@/lib/storage'
import { prisma } from '@/lib/prisma'
import { sendError } from '@/server/lib/sendError'

export const payrollRouter = Router()

// GET /payroll?year=2026 — payroll run history
payrollRouter.get('/', verifyAuth, requirePermission('finance.viewPayrollRuns'), async (req, res) => {
  const year = Number(req.query.year ?? new Date().getFullYear())
  res.json(await payrollService.getPayrollHistory(year))
})

// GET /payroll/run-window?month=&year= — is the run window open right now,
// has this month already been run, how many staff are enrolled. Defaults to
// the current calendar month/year, matching what Run Payroll itself targets.
payrollRouter.get('/run-window', verifyAuth, requirePermission('finance.viewPayrollRuns'), async (req, res) => {
  const now = new Date()
  const month = Number(req.query.month ?? now.getMonth() + 1)
  const year = Number(req.query.year ?? now.getFullYear())
  if (!month || month < 1 || month > 12 || !year) {
    return res.status(400).json({ error: 'Valid month (1-12) and year required' })
  }
  res.json(await payrollService.getPayrollRunWindow(month, year))
})

// POST /payroll/run — trigger payroll for month/year
// In production this should queue a Cloud Task instead of running inline
payrollRouter.post('/run', verifyAuth, requirePermission('finance.runPayroll'), async (req, res) => {
  const { month, year } = req.body as { month: number; year: number }
  if (!month || !year || month < 1 || month > 12) {
    return res.status(400).json({ error: 'Valid month (1-12) and year required' })
  }
  try {
    // For development: run inline. For production: enqueue Cloud Task
    const runId = await payrollService.processMonthlyPayroll(month, year, req.user!.uid)
    res.status(201).json({ runId, status: 'COMPLETED' })
  } catch (err) {
    return sendError(res, err, { defaultStatus: 400, tags: { module: 'payroll' } })
  }
})

/**
 * A caller may always view their own payroll data; viewing someone else's
 * requires hr.viewAnyPayslips (granted to hr/high_rank — see
 * S/types/permissions.ts). Shared by GET /my-payslips and GET /my-salary,
 * the two "Viewing Employee" picker endpoints.
 */
function resolveTargetUid(req: Request, res: Response): string | null {
  const requested = typeof req.query.staffUid === 'string' ? req.query.staffUid : undefined
  if (!requested || requested === req.user!.uid) return req.user!.uid
  if (!hasPermission(req.user!.role, 'hr.viewAnyPayslips')) {
    res.status(403).json({
      error: 'You do not have permission to view another staff member\'s payroll details.',
      required: 'hr.viewAnyPayslips',
    })
    return null
  }
  return requested
}

// GET /payroll/my-payslips?staffUid= — staff view their own payslips, or
// (with hr.viewAnyPayslips) another staff member's.
payrollRouter.get('/my-payslips', verifyAuth, async (req, res) => {
  const targetUid = resolveTargetUid(req, res)
  if (!targetUid) return
  const payslips = await payrollService.getStaffPayslips(targetUid)
  res.json(payslips)
})

// GET /payroll/my-salary?staffUid= — self-service current salary structure.
// [PRODUCTION FIX] Did not exist at all — useMySalaryStructure() called
// this exact path and 404'd.
payrollRouter.get('/my-salary', verifyAuth, async (req, res) => {
  const targetUid = resolveTargetUid(req, res)
  if (!targetUid) return
  const structure = await payrollService.getMySalaryStructure(targetUid)
  res.json(structure)
})

// GET /payroll/payslips/:id/download — get a signed, auth-checked view URL
// [PRODUCTION FIX] Two bugs, both required for "View Payslip" to actually
// work for anyone:
//   1. This previously returned getDownloadUrl(...) — a raw, unauthenticated
//      Appwrite REST URL. Payslip files are private in Appwrite (not in
//      PUBLIC_FILE_PREFIXES), so that URL 401'd from Appwrite itself for
//      every caller, including the payslip's own owner — the "even self
//      payslips don't work" report. getDownloadUrl's own doc comment says
//      as much: "Internal use only — callers should prefer getSignedViewUrl
//      for client-facing URLs." Switched to getSignedViewUrl(), which
//      returns this app's own auth-checked /api/files/[fileId] proxy URL —
//      the same mechanism report cards, transcripts, and every other
//      protected document already use.
//   2. The permission check here was narrower than the real access rule
//      already defined for this exact file category — lib/storage.ts's
//      READ_ROLES.payslip is ['admin','finance','hr','__self'], but this
//      route only ever allowed admin or the owner. finance/hr got a 403
//      trying to view a payslip that isn't their own, despite the
//      "Viewing Employee" picker in My Pay existing specifically so they
//      can do that. Now checks the same canReadFile() the file proxy uses,
//      so both layers agree on who's allowed in.
payrollRouter.get('/payslips/:id/download', verifyAuth, async (req, res) => {
  const payslip = await prisma.payslip.findUniqueOrThrow({
    where: { id: String(req.params.id) },
  })
  if (!payslip.payslipKey) return res.status(404).json({ error: 'Payslip PDF not ready' })
  if (!canReadFile(payslip.payslipKey, req.user!.role, req.user!.uid, payslip.staffUid)) {
    return res.status(403).json({ error: 'Access denied' })
  }
  const url = await getSignedViewUrl(payslip.payslipKey)
  res.json({ url })
})

// ── PAYROLL APPROVAL WORKFLOW (R10 — new)
payrollRouter.post(
  '/runs/:id/submit-for-approval',
  verifyAuth,
  requirePermission('finance.runPayroll'),
  async (req, res) => {
    const run = await payrollApprovalService.submitForApproval(
      String(req.params.id), req.user!.uid, req.user!.role
    )
    res.json(run)
  }
)

payrollRouter.post(
  '/runs/:id/approve',
  verifyAuth,
  requirePermission('finance.approvePayroll'),
  async (req, res) => {
    const run = await payrollApprovalService.approve(
      String(req.params.id), req.user!.uid, req.user!.role
    )
    res.json(run)
  }
)

payrollRouter.post(
  '/runs/:id/lock',
  verifyAuth,
  requirePermission('finance.lockPayroll'),
  async (req, res) => {
    const run = await payrollApprovalService.lock(
      String(req.params.id), req.user!.uid, req.user!.role
    )
    res.json(run)
  }
)

payrollRouter.post(
  '/runs/:id/rollback',
  verifyAuth,
  requirePermission('finance.rollbackPayroll'),
  async (req, res) => {
    const { reason } = req.body as { reason: string }
    if (!reason?.trim()) return res.status(400).json({ error: 'A rollback reason is required.' })
    const run = await payrollApprovalService.rollback(
      String(req.params.id), reason.trim(), req.user!.uid, req.user!.role
    )
    res.json(run)
  }
)

// GET /payroll/:id — a single run's full detail (every payslip line), for
// the "Deep Inspection" / "Inspect Payslips" drill-down. Registered last so
// this single-segment catch-all pattern can never shadow the more specific
// literal routes above it (run-window, my-payslips, my-salary,
// payslips/:id/download all have 2+ path segments and are unaffected either
// way, but ordering after them keeps the file's routes readable top-to-
// bottom by specificity).
payrollRouter.get('/:id', verifyAuth, requirePermission('finance.viewPayrollRuns'), async (req, res) => {
  try {
    const run = await payrollService.getPayrollRunDetail(String(req.params.id))
    res.json(run)
  } catch (err) {
    return sendError(res, err, { defaultStatus: 404, tags: { module: 'payroll' } })
  }
})
