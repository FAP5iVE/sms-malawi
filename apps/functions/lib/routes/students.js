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
export const studentsRouter = void 0
import { Router } from 'express'
import { verifyAuth, requireRole } from '../middleware/auth'
import { CreateStudentSchema, UpdateStudentSchema } from '@shared/schemas/student'
const studentService = __importStar(require('../services/studentService'))
export const studentsRouter = (0, Router)()
// GET /students — list with filters
studentsRouter.get(
  '/',
  verifyAuth,
  (0, requireRole)([
    'admin',
    'high_rank',
    'finance',
    'library',
    'lower_rank',
    'academic',
    'hr',
    'exam_officer',
  ]),
  async (req, res) => {
    const { classId, status, page, limit } = req.query
    const result = await studentService.listStudents({
      classId: classId,
      status: status,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    })
    res.json(result)
  }
)
// GET /students/:id — single student
studentsRouter.get(
  '/:id',
  verifyAuth,
  (0, requireRole)([
    'admin',
    'high_rank',
    'finance',
    'library',
    'lower_rank',
    'academic',
    'hr',
    'exam_officer',
  ]),
  async (req, res) => {
    const student = await studentService.getStudent(req.params.id)
    res.json(student)
  }
)
// POST /students — create
studentsRouter.post(
  '/',
  verifyAuth,
  (0, requireRole)(['admin', 'high_rank', 'lower_rank']),
  async (req, res) => {
    const parsed = CreateStudentSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.flatten() })
    }
    const student = await studentService.createStudent(parsed.data, req.user.uid, req.user.role)
    res.status(201).json(student)
  }
)
// PATCH /students/:id — update
studentsRouter.patch(
  '/:id',
  verifyAuth,
  (0, requireRole)(['admin', 'high_rank', 'lower_rank']),
  async (req, res) => {
    const parsed = UpdateStudentSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.flatten() })
    }
    const updated = await studentService.updateStudent(
      req.params.id,
      parsed.data,
      req.user.uid,
      req.user.role
    )
    res.json(updated)
  }
)
// DELETE /students/:id — archive only (never true delete)
studentsRouter.delete(
  '/:id',
  verifyAuth,
  (0, requireRole)(['admin', 'high_rank']), // lower_rank must go through approval workflow
  async (req, res) => {
    const result = await studentService.archiveStudent(req.params.id, req.user.uid, req.user.role)
    res.json({ archived: true, student: result })
  }
)
