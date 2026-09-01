/*
 * apps/web/src/server/routes/payroll.ts
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R10 — Finance II: Payroll, Forecasting & the Finance↔Library
 *   Reconciliation
 * [PURPOSE]:
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
 *   2. GET /: corrected the role list to ['finance','hr','high_rank'] —
 *      removing admin (does not hold finance.viewPayrollRuns) and adding
 *      high_rank (does, but was excluded).
 * [DEPENDS ON]: payrollApprovalService.ts (rebuilt, same phase)
 */

import { Router } from 'express'
import { verifyAuth, requireRole } from '@/lib/verifyAuth'
import { requirePermission } from '@/server/middleware/verifyPermission'
import * as payrollService from '@/server/services/payrollService'
import * as payrollApprovalService from '@/server/services/payrollApprovalService'
import { getDownloadUrl } from '@/lib/storage'
import { prisma } from '@/lib/prisma'

export const payrollRouter = Router()

// GET /payroll?year=2026 — payroll run history
payrollRouter.get('/', verifyAuth, requireRole(['finance', 'hr', 'high_rank']), async (req, res) => {
  const year = Number(req.query.year ?? new Date().getFullYear())
  res.json(await payrollService.getPayrollHistory(year))
})

// POST /payroll/run — trigger payroll for month/year
// In production this should queue a Cloud Task instead of running inline
payrollRouter.post('/run', verifyAuth, requireRole(['admin', 'finance']), async (req, res) => {
  const { month, year } = req.body as { month: number; year: number }
  if (!month || !year || month < 1 || month > 12) {
    return res.status(400).json({ error: 'Valid month (1-12) and year required' })
  }
  // For development: run inline. For production: enqueue Cloud Task
  const runId = await payrollService.processMonthlyPayroll(month, year, req.user!.uid)
  res.status(201).json({ runId, status: 'COMPLETED' })
})

// GET /payroll/my-payslips — staff view their own payslips
payrollRouter.get('/my-payslips', verifyAuth, async (req, res) => {
  const payslips = await payrollService.getStaffPayslips(req.user!.uid)
  res.json(payslips)
})

// GET /payroll/payslips/:id/download — get signed URL
payrollRouter.get('/payslips/:id/download', verifyAuth, async (req, res) => {
  const payslip = await prisma.payslip.findUniqueOrThrow({
    where: { id: String(req.params.id) },
  })
  // Staff can only download their own payslip (admin can download any)
  if (req.user!.role !== 'admin' && payslip.staffUid !== req.user!.uid) {
    return res.status(403).json({ error: 'Access denied' })
  }
  if (!payslip.payslipKey) return res.status(404).json({ error: 'Payslip PDF not ready' })
  const url = await getDownloadUrl('sms-payslips', payslip.payslipKey)
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
