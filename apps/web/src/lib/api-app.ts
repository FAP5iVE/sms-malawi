// apps/web/src/lib/api-app.ts
// Fixed: replaced any types with proper Express types
import express, { type Request, type Response, type NextFunction } from 'express'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { studentsRouter } from '@/server/routes/students'
import { classesRouter } from '@/server/routes/classes'
import { applicationsRouter } from '@/server/routes/applications'
import { timetableRouter } from '@/server/routes/timetable'
import { financesRouter } from '@/server/routes/finances'
import { payrollRouter } from '@/server/routes/payroll'
import { announcementsRouter } from '@/server/routes/announcements'

export function createApiApp() {
  const app = express()

  app.use(helmet())
  app.use(express.json({ limit: '10mb' }))
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300, validate: { creationStack: false } }))

  // CORS — same-domain on Vercel, localhost in dev
  app.use((req: Request, res: Response, next: NextFunction) => {
    const allowed = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '',
      process.env.NEXT_PUBLIC_APP_URL ?? '',
    ].filter(Boolean)
    const origin = req.headers.origin ?? ''
    if (allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    if (req.method === 'OPTIONS') { res.sendStatus(204); return }
    next()
  })

  app.use('/students', studentsRouter)
  app.use('/classes', classesRouter)
  app.use('/applications', applicationsRouter)
  app.use('/timetable', timetableRouter)
  app.use('/finances', financesRouter)
  app.use('/payroll', payrollRouter)
  app.use('/announcements', announcementsRouter)
  app.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok', ts: Date.now() }))

  // Error handler — typed properly to avoid any
  app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err)
    res.status(err.status ?? 500).json({ error: err.message ?? 'Internal error' })
  })

  return app
}