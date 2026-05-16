'use strict'
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k
        var desc = Object.getOwnPropertyDescriptor(m, k)
        if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k]
            },
          }
        }
        Object.defineProperty(o, k2, desc)
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k
        o[k2] = m[k]
      })
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, 'default', { enumerable: true, value: v })
      }
    : function (o, v) {
        o['default'] = v
      })
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = []
          for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k
          return ar
        }
      return ownKeys(o)
    }
    return function (mod) {
      if (mod && mod.__esModule) return mod
      var result = {}
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++)
          if (k[i] !== 'default') __createBinding(result, mod, k[i])
      __setModuleDefault(result, mod)
      return result
    }
  })()
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod }
  }
Object.defineProperty(exports, '__esModule', { value: true })
export const api = void 0
import { onRequest } from 'firebase-functions/v2/https'
const admin = __importStar(require('firebase-admin'))
const express_1 = __importDefault(require('express'))
const helmet_1 = __importDefault(require('helmet'))
const express_rate_limit_1 = __importDefault(require('express-rate-limit'))
import { studentsRouter } from './routes/students'
import { classesRouter } from './routes/classes'
import { applicationsRouter } from './routes/applications'
import { timetableRouter } from './routes/timetable'
// Initialise Firebase Admin SDK once
admin.initializeApp()
const app = (0, express_1.default)()
// ── Security middleware ────────────────────────────────────
app.use((0, helmet_1.default)())
app.use(express_1.default.json({ limit: '2mb' }))
app.use((0, express_rate_limit_1.default)({ windowMs: 15 * 60 * 1000, max: 300 }))
// ── CORS for local dev + production domain ────────────────
app.use((req, res, next) => {
  const allowed = ['http://localhost:3000', 'https://sms-malawi-52a44.web.app']
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
// ── Health check ──────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }))
// ── Error handler ─────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(err.status ?? 500).json({ error: err.message ?? 'Internal error' })
})
export const api = (0, onRequest)(
  { region: 'africa-south1', memory: '512MiB', timeoutSeconds: 60 },
  app
)
