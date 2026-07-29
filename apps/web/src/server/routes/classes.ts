/**
 * [CHANGE TYPE]: TARGETED EDIT (output in full — most of the file changes)
 * [FILE]: apps/web/src/server/routes/classes.ts
 * [R-PHASE]: R6 — Academics II: Classes, Assignments & the Attendance Rebuild
 * [PURPOSE]:
 *   1. GET / and GET /:id, GET /:id/timetable: requireRole([...every role
 *      that happens to hold the relevant permission today]) replaced with
 *      requirePermission('class.view'/'timetable.view') — a zero-behavior-
 *      change correctness improvement (verified: all roles previously
 *      listed do hold the permission), consistent with R4/R5's established
 *      convergence on permission-based gating over hand-maintained role
 *      arrays.
 *   2. POST /: requireRole(['admin','high_rank']) replaced with
 *      requirePermission('class.create') — admin does not actually hold
 *      class.create (confirmed against the real permission matrix; it was
 *      over-granted) while lower_rank does (it was wrongly excluded with
 *      no fallback). lower_rank's request is now diverted through the
 *      PendingAction workflow, matching students.ts's established pattern
 *      exactly; high_rank continues to create directly.
 *   3. Added PATCH /:id and DELETE /:id (soft-delete via classService.
 *      archiveClass) — no route existed for either despite class.edit/
 *      class.softDelete being defined permissions.
 *   4. POST /:id/timetable: unchanged gate (admin/high_rank/exam_officer);
 *      the approval-state decision itself now lives in
 *      classService.createTimetableSlot() (see that file).
 *   5. Added PATCH /:id/timetable/:slotId/approve, gated by the existing
 *      timetable.approve permission — the write path that clears a
 *      pending exam_officer-created slot's approvedAt/approvedByUid.
 *   6. GET /:id/timetable: the hardcoded academicYear = '2025/2026'
 *      default is replaced with settingsService.get(SETTING_KEYS.
 *      CURRENT_ACADEMIC_YEAR) — R14 will centralize this lookup pattern
 *      further; this phase wires the call.
 * [DEPENDS ON]: apps/web/src/server/services/classService.ts,
 *   apps/web/src/server/services/settingsService.ts,
 *   apps/web/src/server/services/pendingActionService.ts,
 *   @shared/schemas/student (UpdateClassSchema)
 */
import { Router } from 'express'
import { verifyAuth, requireRole } from '@/lib/verifyAuth'
import { requirePermission } from '@/server/middleware/verifyPermission'
import { CreateClassSchema, UpdateClassSchema, CreateTimetableSlotSchema } from '@shared/schemas/student'
import * as classService         from '@/server/services/classService'
import * as pendingActionService from '@/server/services/pendingActionService'
import * as settingsService      from '@/server/services/settingsService'
import { SETTING_KEYS }          from '@shared/types/settings'
import { prisma }                from '@/lib/prisma'
import { assignmentsRouter }     from './assignments'

export const classesRouter = Router()

classesRouter.use(verifyAuth)

// GET /classes
classesRouter.get(
  '/',
  requirePermission('class.view'),
  async (req, res) => {
    const { academicYear, includeArchived } = req.query
    const classes = await classService.listClasses(
      academicYear as string | undefined,
      includeArchived === 'true'
    )
    res.json(classes)
  }
)

// GET /classes/:id
classesRouter.get(
  '/:id',
  requirePermission('class.view'),
  async (req, res) => {
    const id = String(req.params.id)
    const cls = await classService.getClass(id)
    res.json(cls)
  }
)

// ─────────────────────────────────────────────────────────
//  POST /classes
//  high_rank: direct create.
//  lower_rank: routes to PendingAction workflow (class.create is held by
//  both roles; admin is not, matching the real permission matrix).
// ─────────────────────────────────────────────────────────

classesRouter.post('/', requirePermission('class.create'), async (req, res) => {
  const parsed = CreateClassSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
  const { user } = req
  if (!user) return res.status(401).json({ error: 'Not authenticated.' })

  if (user.role === 'lower_rank') {
    const entityId = `new:${parsed.data.name}:${parsed.data.academicYear}`
    const alreadyPending = await pendingActionService.hasPendingAction('Class', entityId, 'class.create')
    if (alreadyPending) {
      return res.status(409).json({ error: 'A pending class creation request already exists with these details.' })
    }

    const pendingAction = await pendingActionService.create({
      entityType:      'Class',
      entityId,
      action:          'class.create',
      description:     `Create class: ${parsed.data.name} (Form ${parsed.data.form}, ${parsed.data.academicYear})`,
      requestedByUid:  user.uid,
      requestedByRole: user.role,
      targetState:     parsed.data,
    })

    return res.status(202).json({
      message: 'Class creation submitted for approval.',
      pendingActionId: pendingAction.id,
    })
  }

  const cls = await classService.createClass(parsed.data, user.uid, user.role)
  return res.status(201).json(cls)
})

// PATCH /classes/:id
classesRouter.patch('/:id', requirePermission('class.edit'), async (req, res) => {
  const id = String(req.params.id)
  const parsed = UpdateClassSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
  const { user } = req
  if (!user) return res.status(401).json({ error: 'Not authenticated.' })

  const cls = await classService.updateClass(id, parsed.data, user.uid, user.role)
  return res.json(cls)
})

// DELETE /classes/:id — soft-delete (Class.status → ARCHIVED)
classesRouter.delete('/:id', requirePermission('class.softDelete'), async (req, res) => {
  const id = String(req.params.id)
  const { user } = req
  if (!user) return res.status(401).json({ error: 'Not authenticated.' })

  const cls = await classService.archiveClass(id, user.uid, user.role)
  return res.json(cls)
})

// GET /classes/my-timetable/today
// [PRODUCTION FIX 2026-07-28] Teacher dashboard's "Today's Timetable" was a
// permanent PlaceholderWidget ("wired in R17" — never happened). Only a
// per-class timetable route existed (GET /:id/timetable); nothing let a
// teacher see their own schedule across every class they teach today.
// Self-scoped by teacherUid — no special permission needed beyond being a
// signed-in staff member. Weekends resolve to no slots (Weekday enum only
// has Monday–Friday) rather than an error.
classesRouter.get('/my-timetable/today', verifyAuth, async (req, res) => {
  const ISO_TO_WEEKDAY: Record<number, string> = {
    1: 'MONDAY', 2: 'TUESDAY', 3: 'WEDNESDAY', 4: 'THURSDAY', 5: 'FRIDAY',
  }
  const today = ISO_TO_WEEKDAY[new Date().getDay()]
  if (!today) return res.json([]) // Saturday/Sunday

  const academicYear = await settingsService.get(SETTING_KEYS.CURRENT_ACADEMIC_YEAR)
  const term = await settingsService.get(SETTING_KEYS.CURRENT_TERM)

  const slots = await prisma.timetableSlot.findMany({
    where: {
      teacherUid: req.user!.uid,
      day: today as never,
      academicYear,
      term: Number(term),
    },
    include: { class: { select: { name: true } } },
    orderBy: { periodStart: 'asc' },
  })
  res.json(slots)
})

// GET /classes/:id/timetable
classesRouter.get(
  '/:id/timetable',
  requirePermission('timetable.view'),
  async (req, res) => {
    const id = String(req.params.id)
    const { term = '1' } = req.query
    let { academicYear } = req.query
    if (!academicYear) {
      academicYear = await settingsService.get(SETTING_KEYS.CURRENT_ACADEMIC_YEAR)
    }
    const slots = await classService.getTimetableForClass(id, Number(term), academicYear as string)
    res.json(slots)
  }
)

// POST /classes/:id/timetable — admin/high_rank/exam_officer (unchanged
// access gate — admin holds neither timetable.editDirect nor
// timetable.editWithApproval under the real permission matrix, so a
// permission-based gate here would incorrectly exclude admin; only the
// approval-state LOGIC changes, now decided inside classService.
// createTimetableSlot() based on actorRole).
classesRouter.post(
  '/:id/timetable',
  requireRole(['admin', 'high_rank', 'exam_officer']),
  async (req, res) => {
    const id = String(req.params.id)
    const parsed = CreateTimetableSlotSchema.safeParse({
      ...req.body,
      classId: id,
    })
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    const { user } = req
    if (!user) return res.status(401).json({ error: 'Not authenticated.' })

    const slot = await classService.createTimetableSlot(parsed.data, user.uid, user.role)
    res.status(201).json(slot)
  }
)

// PATCH /classes/:id/timetable/:slotId/approve — clears a pending
// exam_officer-created slot's approvedAt/approvedByUid.
classesRouter.patch(
  '/:id/timetable/:slotId/approve',
  requirePermission('timetable.approve'),
  async (req, res) => {
    const slotId = String(req.params.slotId)
    const { user } = req
    if (!user) return res.status(401).json({ error: 'Not authenticated.' })

    const slot = await classService.approveTimetableSlot(slotId, user.uid, user.role)
    res.json(slot)
  }
)

classesRouter.use('/:classId/assignments', assignmentsRouter)