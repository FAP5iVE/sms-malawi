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
Object.defineProperty(exports, '__esModule', { value: true })
export const applicationsRouter = void 0
import { Router } from 'express'
import { verifyAuth, requireRole } from '../middleware/auth'
import { CreateApplicationSchema } from '@shared/schemas/student'
const appService = __importStar(require('../services/applicationService'))
export const applicationsRouter = (0, Router)()
// GET /applications
applicationsRouter.get(
  '/',
  verifyAuth,
  (0, requireRole)(['admin', 'high_rank', 'lower_rank']),
  async (req, res) => {
    const { status } = req.query
    const apps = await appService.listApplications(status)
    res.json(apps)
  }
)
// POST /applications — public endpoint (application form page)
applicationsRouter.post('/', async (req, res) => {
  const parsed = CreateApplicationSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
  const app = await appService.createApplication(parsed.data)
  res.status(201).json(app)
})
// PATCH /applications/:id/status — approve / deny / await admission
applicationsRouter.patch(
  '/:id/status',
  verifyAuth,
  (0, requireRole)(['admin', 'high_rank', 'lower_rank']),
  async (req, res) => {
    const { status, notes } = req.body
    if (!['APPROVED', 'DENIED', 'AWAITING_ADMISSION'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }
    const updated = await appService.updateApplicationStatus(
      req.params.id,
      status,
      req.user.uid,
      notes
    )
    res.json(updated)
  }
)
// POST /applications/:id/convert — convert approved application to Student record
applicationsRouter.post(
  '/:id/convert',
  verifyAuth,
  (0, requireRole)(['admin', 'high_rank']),
  async (req, res) => {
    const { classId } = req.body
    const student = await appService.convertToStudent(
      req.params.id,
      classId,
      req.user.uid,
      req.user.role
    )
    res.status(201).json(student)
  }
)
