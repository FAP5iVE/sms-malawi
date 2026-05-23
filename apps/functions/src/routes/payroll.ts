import { Router } from 'express'
import { verifyAuth, requireRole } from '../middleware/auth'
import * as payrollService from '../services/payrollService'
import { getDownloadUrl } from '../lib/storage'
import { prisma } from '../lib/prisma'

export const payrollRouter = Router()

// GET /payroll?year=2026 — payroll run history
payrollRouter.get('/', verifyAuth, requireRole(['admin', 'finance', 'hr']), async (req, res) => {
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
