import { onRequest } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import * as Sentry from '@sentry/node'
import express from 'express'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { studentsRouter } from './routes/students'
import { classesRouter } from './routes/classes'
import { applicationsRouter } from './routes/applications'
import { timetableRouter } from './routes/timetable'
import { financesRouter } from './routes/finances'
import { payrollRouter } from './routes/payroll'

// Initialise Firebase Admin SDK once
admin.initializeApp()

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',
})

const app = express()

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  validate: { creationStack: false },
})

// ── Security middleware ────────────────────────────────────
app.use(helmet())
app.use(express.json({ limit: '2mb' }))
app.use(globalLimiter)

// ── CORS for local dev + production domain ────────────────
app.use((req, res, next) => {
  const allowed = [
  'http://localhost:3000',
  'https://sms-malawi-52a44.web.app',
  'https://sms-malawi.vercel.app',   
]
  const origin = req.headers.origin ?? ''
  if (allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

// ── Routes ────────────────────────────────────────────────
app.use('/students', studentsRouter)
app.use('/classes', classesRouter)
app.use('/applications', applicationsRouter)
app.use('/timetable', timetableRouter)
app.use('/finances', financesRouter)
app.use('/payroll', payrollRouter)
// ── Health check ──────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }))

// ── Error handler ─────────────────────────────────────────
app.use((err: any, _req: any, res: any, _next: any) => {
  Sentry.captureException(err)
  console.error(err)
  res.status(err.status ?? 500).json({ error: err.message ?? 'Internal error' })
})

// ── Export as Cloud Function ───────────────────────────────
export const api = onRequest({ region: 'africa-south1', memory: '512MiB', timeoutSeconds: 60 }, app)
