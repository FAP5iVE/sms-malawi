import { Router }      from 'express'
import { verifyAuth, requireRole } from '@/lib/verifyAuth'
import { prisma }      from '@/lib/prisma'
import { z }           from 'zod'
import { startOfYear, endOfYear } from 'date-fns'

export const holidaysRouter = Router()

// ─── GET /holidays?year=2026 ─────────────────────────────────────────────────

holidaysRouter.get('/', verifyAuth, async (req, res) => {
  const year = Number(req.query.year ?? new Date().getFullYear())
  const holidays = await prisma.malawiPublicHoliday.findMany({
    where: {
      OR: [
        { year },
        { isRecurring: true },
      ],
    },
    orderBy: { date: 'asc' },
  })
  res.json(holidays)
})

// ─── POST /holidays — Admin only ─────────────────────────────────────────────

const HolidaySchema = z.object({
  name:        z.string().min(2).max(100),
  date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  isRecurring: z.boolean().default(false),
})

holidaysRouter.post('/',
  verifyAuth, requireRole(['admin']),
  async (req, res) => {
    const parsed = HolidaySchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })

    const date = new Date(parsed.data.date)
    const holiday = await prisma.malawiPublicHoliday.upsert({
      where:  { date },
      create: { name: parsed.data.name, date, year: date.getFullYear(), isRecurring: parsed.data.isRecurring },
      update: { name: parsed.data.name, isRecurring: parsed.data.isRecurring },
    })
    res.status(201).json(holiday)
  },
)

// ─── DELETE /holidays/:id — Admin only ───────────────────────────────────────

holidaysRouter.delete('/:id',
  verifyAuth, requireRole(['admin']),
  async (req, res) => {
    const id = String(req.params.id)
    await prisma.malawiPublicHoliday.delete({ where: { id } })
    res.json({ deleted: true })
  },
)