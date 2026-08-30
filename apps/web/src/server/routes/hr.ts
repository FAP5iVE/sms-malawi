/*
 * apps/web/src/server/routes/hr.ts
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R11 — HR Domain: Loans UI, Leave-Conflict Wiring & Directory
 *   Access Correction
 * [PURPOSE]:
 *   1. GET / (staff directory): corrected the role list to
 *      ['admin','hr','high_rank'] — hr.viewAnyProfile's real, verified
 *      grant (S/types/permissions.ts). Previously all 8 non-student
 *      roles could list the full staff directory; five of those
 *      (finance, academic, library, lower_rank, exam_officer) hold no
 *      formal permission for it at all.
 *   2. Added GET /loans — hrService.listLoans() (new this phase) needs a
 *      route; the Loans tab's admin-management view has nothing else to
 *      call to see loan requests across all staff. Gated to the union of
 *      roles that can act on a loan in some way (admin/hr/finance) plus
 *      high_rank, who formally holds hr.approveLoan on paper even though
 *      the approve route below still gates by role, not permission (that
 *      mismatch is pre-existing and unauthorized for this phase to
 *      change — see hr/page.tsx's header for how the frontend reconciles
 *      this).
 *   3. POST /:id/photo — fixed a build-breaking call to a nonexistent
 *      `getViewUrl` export (no such export exists in storage.ts — the
 *      real helper is `getSignedViewUrl(fileId)`); discovered while
 *      wiring this same route's hrService.uploadStaffPhoto() fix.
 *      staff_photo is a READ_ROLES-gated category
 *      (admin/high_rank/hr only), so the signed-proxy-URL helper is the
 *      correct one, not a public/download-style URL.
 *   4. PATCH /leave/requests/:id/review — no change to the route itself;
 *      hrService.reviewLeave()'s return value now includes a `conflicts`
 *      array (this phase's own leave-conflict wiring), which this route
 *      already passes straight through via `res.json(...)`.
 *   Added `import 'server-only'`.
 *
 *   [POST-R11, user-requested follow-up beyond the roadmap's literal
 *   scope]:
 *   5. Added GET /loans/mine — self-service loan status for the
 *      requesting staff member; hrService.getMyLoans(uid) (same follow-up).
 *   6. PATCH /loans/:id/approve converted from requireRole(['admin','hr'])
 *      to requirePermission('hr.approveLoan') — high_rank formally holds
 *      this permission but was locked out by the role-only gate; admin
 *      does not hold it and loses the role-based bypass, matching this
 *      codebase's consistently-applied "admin does not perform business
 *      operations" design elsewhere. disburse/repay are intentionally
 *      left role-gated — no dedicated permission exists for either.
 * [DEPENDS ON]: hrService.ts (listLoans, reviewLeave conflicts, getMyLoans
 *   — same phase/follow-up)
 */
import 'server-only'
import { Router } from 'express'
import multer from 'multer'
import { verifyAuth, requireRole } from '@/lib/verifyAuth'
import { requirePermission, requireAnyPermission } from '@/server/middleware/verifyPermission'
import { CreateStaffSchema, UpdateStaffSchema, LeaveRequestSchema, ReviewLeaveSchema, LoanRequestSchema, PerformanceNoteSchema, UpdateSalarySchema } from '@shared/schemas/hr'
import * as hrService from '@/server/services/hrService'
import { getSignedViewUrl } from '@/lib/storage'
import { sendError } from '@/server/lib/sendError'
import { prisma } from '@/lib/prisma'

export const hrRouter = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

const HR_ADMIN = ['admin', 'hr'] as const
const REVIEWERS = ['admin', 'hr', 'high_rank'] as const

// ── STAFF DIRECTORY (admin/hr/high_rank only — hr.viewAnyProfile's real grant) ──
hrRouter.get('/', verifyAuth, requireRole([...REVIEWERS]),
  async (req, res) => {
    const { department, jobTitle, status, search } = req.query as Record<string, string>
    const staff = await hrService.listStaff({ department, jobTitle, status, search })
    return res.json(staff)
  })

hrRouter.get('/:id', verifyAuth, requireRole([...REVIEWERS]),
  async (req, res) => {return res.json(await hrService.getStaffProfile(String(req.params.id)))})

hrRouter.patch('/:id', verifyAuth, requirePermission('hr.editStaff'),
  async (req, res) => {
    const parsed = UpdateStaffSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    try {
      return res.json(await hrService.updateStaff(String(req.params.id), parsed.data))
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500
      return res.status(status).json({ error: (err as Error).message ?? 'Failed to update staff member.' })
    }
  })

// [PRODUCTION FIX] Salary was never settable anywhere in this codebase —
// StaffForm.tsx had no field for it, and no route/service function ever
// wrote to SalaryStructure at all (payrollService.ts reads baseSalary/
// allowances from it, but nothing created it). Gated on the permissions
// the matrix already defined for exactly this
// (hr.manageSalaryStructure / finance.manageSalaryStructure) — both roles
// were already granted these, they just had nothing to call.
hrRouter.get('/:id/salary', verifyAuth,
  requireAnyPermission(['hr.manageSalaryStructure', 'finance.manageSalaryStructure']),
  async (req, res) => {
    try {
      const salary = await hrService.getSalaryStructure(String(req.params.id))
      return res.json(salary) // null if none set yet — the form treats that as "not yet configured"
    } catch (err: unknown) {
      return sendError(res, err, { tags: { module: 'hr', route: 'salary-get' } })
    }
  })

hrRouter.put('/:id/salary', verifyAuth,
  requireAnyPermission(['hr.manageSalaryStructure', 'finance.manageSalaryStructure']),
  async (req, res) => {
    const parsed = UpdateSalarySchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    try {
      const result = await hrService.upsertSalaryStructure(
        String(req.params.id), parsed.data, req.user!.uid, req.user!.role,
      )
      return res.json(result)
    } catch (err: unknown) {
      return sendError(res, err, { tags: { module: 'hr', route: 'salary-upsert' } })
    }
  })

hrRouter.post('/', verifyAuth, requireRole([...HR_ADMIN]),
  async (req, res) => {
    const parsed = CreateStaffSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.status(201).json(await hrService.createStaff(parsed.data, req.user!.uid))
  })

hrRouter.post('/:id/photo', verifyAuth, requireRole([...HR_ADMIN]), upload.single('photo'),
  async (req, res) => {
    // [PRODUCTION FIX] No try/catch — same systemic bug as the other
    // upload.single() handlers across this codebase: an error from
    // uploadStaffPhoto()/getSignedViewUrl() became an unhandled rejection
    // with no response ever sent, hanging the client's fetch indefinitely.
    try {
      if (!req.file) return res.status(400).json({ error: 'No photo uploaded.' })
      const fileId = await hrService.uploadStaffPhoto(String(req.params.id), req.file.buffer, req.file.originalname)
      const url = await getSignedViewUrl(fileId)
      return res.json({ fileId, url })
    } catch (err: unknown) {
      return sendError(res, err, { tags: { module: 'hr', route: 'photo-upload' } })
    }
  })

// ── CONTRACT EXPIRY ALERTS ──
hrRouter.get('/alerts/contracts', verifyAuth, requireRole([...HR_ADMIN]),
  async (req, res) => {
    const days = Number(req.query.days ?? 60)
    return res.json(await hrService.getContractExpiryAlert(days))
  })

// ── LEAVE ──
hrRouter.get('/leave/requests', verifyAuth, requireRole([...REVIEWERS]),
  async (req, res) => {
    const { staffId, status } = req.query as Record<string, string>
    return res.json(await hrService.listLeaveRequests({ staffId, status }))
  })

hrRouter.post('/leave/apply', verifyAuth,
  async (req, res) => {
    const parsed = LeaveRequestSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    // Staff can only apply for themselves
    const staffProfile = await prisma.staffProfile.findFirst({
      where: { uid: req.user!.uid }, select: { id: true },
    })
    if (!staffProfile) return res.status(404).json({ error: 'Staff profile not found for this user.' })
    return res.status(201).json(await hrService.applyForLeave(staffProfile.id, parsed.data))
  })

hrRouter.patch('/leave/requests/:id/review', verifyAuth, requireRole([...REVIEWERS]),
  async (req, res) => {
    const parsed = ReviewLeaveSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    // [R11] Return value now includes `conflictResult` (leaveConflictService's
    // full output, non-blocking) for LeaveConflictWarning.tsx to render.
    return res.json(await hrService.reviewLeave(String(req.params.id), parsed.data, req.user!.uid))
  })

// ── LOANS ──
// [R11] NEW — hrService.listLoans() needs a route; the Loans tab's
// admin-management view has no other way to see loan requests across all
// staff. See header comment for the role-list rationale.
hrRouter.get('/loans', verifyAuth, requireRole(['admin', 'hr', 'finance', 'high_rank']),
  async (req, res) => {
    const { status } = req.query as { status?: string }
    return res.json(await hrService.listLoans(
      status as 'PENDING' | 'APPROVED' | 'DISBURSED' | 'REPAYING' | 'SETTLED' | 'REJECTED' | undefined
    ))
  })

// [POST-R11] NEW — self-service loan status. A staff member who submits
// a request via POST /loans/request previously had no way to check on
// it afterward. Placed before /loans/:id/... below so the literal
// "mine" segment is never captured by a later :id param route (Express
// matches in registration order; not strictly required here since no
// existing route is a bare GET /loans/:id, but kept for clarity).
hrRouter.get('/loans/mine', verifyAuth,
  async (req, res) => {
    return res.json(await hrService.getMyLoans(req.user!.uid))
  })

hrRouter.post('/loans/request', verifyAuth,
  async (req, res) => {
    const parsed = LoanRequestSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    const sp = await prisma.staffProfile.findFirst({ where: { uid: req.user!.uid }, select: { id: true } })
    if (!sp) return res.status(404).json({ error: 'Staff profile not found.' })
    return res.status(201).json(await hrService.requestLoan(sp.id, parsed.data))
  })

// [POST-R11] Converted to requirePermission('hr.approveLoan') from
// requireRole(['admin','hr']) — verified against S/types/permissions.ts:
// high_rank formally holds hr.approveLoan but was locked out by the
// role-only gate; admin does not hold it at all. This matches the
// codebase's own consistently-applied design (admin does not perform
// // business operations — recording payments, entering marks, approving
// loans — those belong to domain/senior-staff roles) rather than
// perpetuating the one inconsistent exception. disburse/repay below are
// intentionally left role-gated: no dedicated permission exists for
// either action in the matrix, so there is no real mismatch to correct.
hrRouter.patch('/loans/:id/approve', verifyAuth, requirePermission('hr.approveLoan'),
  async (req, res) => {return res.json(await hrService.approveLoan(String(req.params.id), req.user!.uid))})

hrRouter.patch('/loans/:id/disburse', verifyAuth, requireRole(['admin','finance']),
  async (req, res) => {return res.json(await hrService.disburseLoan(String(req.params.id)))})

hrRouter.patch('/loans/:id/repay', verifyAuth, requireRole(['admin','finance','hr']),
  async (req, res) => {
    const { amount } = req.body as { amount: number }
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid amount required.' })
    return res.json(await hrService.recordLoanRepayment(String(req.params.id), amount))
  })

// ── PERFORMANCE ──
hrRouter.post('/performance', verifyAuth, requireRole([...REVIEWERS]),
  async (req, res) => {
    const parsed = PerformanceNoteSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.status(201).json(await hrService.addPerformanceNote(parsed.data, req.user!.uid))
  })