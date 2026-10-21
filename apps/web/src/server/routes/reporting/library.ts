/**
 * routes/reporting/library.ts — library reporting (mounted at /reporting/library).
 * Gated on report.viewLibraryUsage (library, high_rank), like the existing
 * library analytics routes.
 */
import { Router } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import { requirePermission } from '@/server/middleware/verifyPermission'
import * as library from '@/server/services/analytics/libraryAnalytics'
import { optionalDate, optionalEnum, optionalString, positiveInt } from './_shared'

export const libraryReportingRouter = Router()

const gate = [verifyAuth, requirePermission('report.viewLibraryUsage')] as const

libraryReportingRouter.get('/overview', ...gate, async (_req, res) => {
  res.json(await library.getLibraryOverview())
})

libraryReportingRouter.get('/attention', ...gate, async (_req, res) => {
  res.json(await library.getLibraryAttention())
})

libraryReportingRouter.get('/circulation', ...gate, async (req, res) => {
  res.json(await library.getLibraryCirculation(positiveInt(req.query.days, 90)))
})

libraryReportingRouter.get('/fines', ...gate, async (req, res) => {
  res.json(await library.getLibraryFines(positiveInt(req.query.months, 6)))
})

const DIGITAL_TYPES = ['EBOOK', 'PAST_PAPER', 'REFERENCE', 'STUDY_GUIDE'] as const
const DIGITAL_STATUSES = ['approved', 'pending'] as const
const BOOK_CATEGORIES = ['TEXTBOOK', 'REFERENCE', 'FICTION', 'NONFICTION', 'SCIENCE', 'MATHEMATICS', 'HUMANITIES', 'PAST_PAPER', 'OTHER'] as const
const MAX_DAYS = 730

const parseDate = (s: string | undefined) => (s ? new Date(`${s}T00:00:00.000Z`) : undefined)

/** Digital resources: approval backlog plus usage from recorded view events. Aggregate only — viewers are never named. */
libraryReportingRouter.get('/digital', ...gate, async (req, res) => {
  const type = optionalEnum(req.query.type, DIGITAL_TYPES)
  if (type === null) return res.status(400).json({ error: 'Unknown resource type.' })
  const status = optionalEnum(req.query.status, DIGITAL_STATUSES)
  if (status === null) return res.status(400).json({ error: 'Unknown status.' })
  const from = optionalDate(req.query.from)
  const to = optionalDate(req.query.to)
  if (from === null || to === null) return res.status(400).json({ error: 'Dates must be YYYY-MM-DD.' })
  if (from && to && from > to) return res.status(400).json({ error: '"from" must not be after "to".' })
  const rawForm = optionalString(req.query.form)
  const form = rawForm === undefined ? undefined : Number(rawForm)
  if (form !== undefined && (!Number.isInteger(form) || form < 1 || form > 4)) return res.status(400).json({ error: 'Form must be 1 to 4.' })
  const subject = optionalString(req.query.subject)

  res.json(await library.getLibraryDigital({
    days: Math.min(positiveInt(req.query.days, 90), MAX_DAYS),
    ...(parseDate(from) ? { from: parseDate(from) as Date } : {}),
    ...(parseDate(to) ? { to: parseDate(to) as Date } : {}),
    ...(type ? { type } : {}),
    ...(subject ? { subject } : {}),
    ...(form !== undefined ? { form } : {}),
    ...(status ? { status: status as 'approved' | 'pending' } : {}),
  }))
})

/** Physical stock: copies, availability, what is on loan and what cannot be borrowed. */
libraryReportingRouter.get('/stock', ...gate, async (req, res) => {
  const category = optionalEnum(req.query.category, BOOK_CATEGORIES)
  if (category === null) return res.status(400).json({ error: 'Unknown category.' })
  res.json(await library.getLibraryStock({
    days: Math.min(positiveInt(req.query.days, 90), MAX_DAYS),
    ...(category ? { category } : {}),
  }))
})
