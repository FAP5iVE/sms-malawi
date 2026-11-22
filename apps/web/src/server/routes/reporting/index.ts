/**
 * routes/reporting/index.ts
 *
 * Domain reporting API (mounted at /reporting). One router per analytics
 * domain; each endpoint names the single permission that governs it
 * (requirePermission / requireAnyPermission) so the permission matrix stays
 * the only allowlist. The older /analytics and /reports routers are unchanged.
 */
import { Router } from 'express'
import { financeReportingRouter } from './finance'
import { examsReportingRouter } from './exams'
import { academicReportingRouter } from './academic'
import { hrReportingRouter } from './hr'
import { libraryReportingRouter } from './library'
import { operationsReportingRouter } from './operations'
import { admissionsReportingRouter } from './admissions'
import { adminReportingRouter } from './admin'
import { studentReportingRouter } from './student'
import { executiveReportingRouter } from './executive'
import { attendanceReportingRouter } from './attendance'

export const reportingRouter = Router()

reportingRouter.use('/finance', financeReportingRouter)
reportingRouter.use('/exams', examsReportingRouter)
reportingRouter.use('/academic', academicReportingRouter)
reportingRouter.use('/hr', hrReportingRouter)
reportingRouter.use('/library', libraryReportingRouter)
reportingRouter.use('/operations', operationsReportingRouter)
reportingRouter.use('/admissions', admissionsReportingRouter)
reportingRouter.use('/admin', adminReportingRouter)
reportingRouter.use('/student', studentReportingRouter)
reportingRouter.use('/executive', executiveReportingRouter)
reportingRouter.use('/attendance', attendanceReportingRouter)
