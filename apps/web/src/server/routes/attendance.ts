/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/server/routes/attendance.ts
 * [R-PHASE]: R6 — Academics II: Classes, Assignments & the Attendance Rebuild
 * [PURPOSE]: Express router for the Postgres-backed attendance rebuild,
 *   matching students.ts's router convention exactly (Router(), verifyAuth
 *   first, thin handlers delegating to * as attendanceService).
 *     - GET /class/:classId  — a day's attendance for a class. READ-ONLY
 *       and deliberately NOT ownership-scoped: gated only by
 *       class.viewAttendance (admin, high_rank, lower_rank, academic,
 *       exam_officer), so oversight staff and teachers who are not this
 *       class's teacher can all open and read any class's register.
 *     - POST /class/:classId — mark attendance (one or many students).
 *       Gated by class.markAttendance (academic) AND an ownership check —
 *       only the class's own assigned teacher may write. This is the only
 *       place ownership is enforced; viewing never requires it.
 *     - GET /student/:studentId — a student's own attendance history.
 *       Self-scoped (report.viewOwnAttendance + Student.firebaseUid match)
 *       or staff-scoped (class.markAttendance or class.viewAnalytics —
 *       school-wide oversight roles) — scoping happens inside the handler
 *       since the two cases need different checks, not a single
 *       middleware gate.
 * [DEPENDS ON]: apps/web/src/server/services/attendanceService.ts,
 *   @shared/schemas/student (MarkAttendanceSchema)
 */
import 'server-only'
import { Router, type Request, type Response, type NextFunction } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import { requirePermission } from '@/server/middleware/verifyPermission'
import { hasAnyPermission } from '@shared/types/permissions'
import { prisma } from '@/lib/prisma'
import { MarkAttendanceSchema } from '@shared/schemas/student'
import * as attendanceService from '@/server/services/attendanceService'

export const attendanceRouter = Router()
attendanceRouter.use(verifyAuth)

// ─────────────────────────────────────────────────────────
//  OWNERSHIP GUARD — mirrors assignments.ts's established pattern.
//  An 'academic' (teacher) requester must actually teach the target class.
//  Applied to WRITES only (POST). Reading a register is governed solely by
//  class.viewAttendance — see the GET handler below.
//  Must run after requirePermission('class.markAttendance'), which already
//  excludes every role other than academic from reaching this point.
// ─────────────────────────────────────────────────────────

async function requireClassOwnership(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { classId } = req.params as { classId: string }
  const user = req.user!

  if (user.role !== 'academic') {
    next()
    return
  }

  const targetClass = await prisma.class.findUnique({
    where: { id: classId },
    select: { teacherId: true },
  })
  if (!targetClass) {
    res.status(404).json({ error: 'Class not found.' })
    return
  }
  if (targetClass.teacherId !== user.uid) {
    res.status(403).json({ error: 'You are not the assigned teacher for this class.' })
    return
  }
  next()
}

// GET /attendance/class/:classId?date=YYYY-MM-DD
// Read-only. No ownership check — any role holding class.viewAttendance may
// read any class's register; only POST (below) is restricted to the class's
// own assigned teacher.
attendanceRouter.get(
  '/class/:classId',
  requirePermission('class.viewAttendance'),
  async (req: Request, res: Response) => {
    const { classId } = req.params as { classId: string }
    const { date } = req.query as { date?: string }
    if (!date) {
      res.status(400).json({ error: 'date query parameter (YYYY-MM-DD) is required.' })
      return
    }
    const records = await attendanceService.getForClass(classId, date)
    res.json(records)
  }
)

// POST /attendance/class/:classId — mark attendance for one or many students
attendanceRouter.post(
  '/class/:classId',
  requirePermission('class.markAttendance'),
  requireClassOwnership,
  async (req: Request, res: Response) => {
    const { classId } = req.params as { classId: string }
    const parsed = MarkAttendanceSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ errors: parsed.error.flatten() })
      return
    }

    const user = req.user!
    await attendanceService.markAttendance(
      classId,
      parsed.data.date,
      parsed.data.entries,
      user.uid,
      user.role
    )
    res.status(200).json({ message: 'Attendance recorded.' })
  }
)

// GET /attendance/student/:studentId — self/staff scoping inside handler
attendanceRouter.get(
  '/student/:studentId',
  async (req: Request, res: Response) => {
    const { studentId } = req.params as { studentId: string }
    const user = req.user!

    const staffHasAccess = hasAnyPermission(user.role, ['class.markAttendance', 'class.viewAttendance', 'class.viewAnalytics'])

    if (!staffHasAccess) {
      // Not a staff oversight role — only allowed to view their own record,
      // and only if they hold report.viewOwnAttendance (the student role).
      if (!hasAnyPermission(user.role, ['report.viewOwnAttendance'])) {
        res.status(403).json({ error: 'You do not have access to this attendance record.' })
        return
      }
      const student = await prisma.student.findUnique({
        where: { id: studentId },
        select: { firebaseUid: true },
      })
      if (!student || student.firebaseUid !== user.uid) {
        res.status(403).json({ error: 'You may only view your own attendance record.' })
        return
      }
    }

    const records = await attendanceService.getForStudent(studentId)
    res.json(records)
  }
)
