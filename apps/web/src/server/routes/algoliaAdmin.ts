import { Router }   from 'express'
import { verifyAuth, requireRole } from '@/lib/verifyAuth'
import { prisma }   from '@/lib/prisma'
import {
  bulkIndexStudents,
  bulkIndexStaff,
  bulkIndexBooks,
  type AlgoliaStudent,
  type AlgoliaStaff,
  type AlgoliaBook,
  type BulkIndexResult,
} from '@/server/services/algoliaService'

export const algoliaAdminRouter = Router()

// [FIX] These routes used to respond `{ indexed: records.length }`
// unconditionally — that's the Postgres record count, not a confirmation
// that Algolia actually received anything. bulkIndexStudents/Staff/Books
// silently no-op when ALGOLIA_APP_ID/ALGOLIA_ADMIN_KEY aren't set, so the
// old code reported "125 records indexed" even when zero records reached
// Algolia. This helper turns the accurate BulkIndexResult into a response
// that distinguishes "not configured" from "configured but the write
// failed" so the admin panel (and the person reading it) can tell what's
// actually wrong instead of getting a false success.
function respondSeed(res: import('express').Response, result: BulkIndexResult) {
  if (!result.configured) {
    return res.status(503).json({
      indexed: 0,
      error: 'Algolia is not configured on the server (ALGOLIA_APP_ID / ALGOLIA_ADMIN_KEY missing).',
    })
  }
  if (result.error) {
    return res.status(502).json({ indexed: 0, error: result.error })
  }
  res.json({ indexed: result.indexed })
}

/**
 * POST /algolia-admin/seed-students
 * Bulk-pushes all active students from Postgres into the Algolia students index.
 * Admin-only. Idempotent — safe to re-run.
 */
algoliaAdminRouter.post('/seed-students',
  verifyAuth, requireRole(['admin']),
  async (_req, res) => {
    const students = await prisma.student.findMany({
      where: { status: { not: 'ARCHIVED' } },
      select: {
        id:             true,
        registrationNo: true,
        firstName:      true,
        lastName:       true,
        otherNames:     true,
        status:         true,
        sex:            true,
        class:          { select: { name: true, form: true, academicYear: true } },
      },
    })

    const records: AlgoliaStudent[] = students.map((s) => ({
      objectID:       s.id,
      registrationNo: s.registrationNo,
      firstName:      s.firstName,
      lastName:       s.lastName,
      otherNames:     s.otherNames ?? null,
      fullName:       `${s.firstName} ${s.lastName}`,
      className:      s.class?.name ?? null,
      form:           s.class?.form ?? null,
      status:         s.status,
      sex:            s.sex,
      academicYear:   s.class?.academicYear ?? null,
    }))

    respondSeed(res, await bulkIndexStudents(records))
  },
)

/**
 * POST /algolia-admin/seed-staff
 * Bulk-pushes all active staff profiles into the Algolia staff_profiles index.
 */
algoliaAdminRouter.post('/seed-staff',
  verifyAuth, requireRole(['admin']),
  async (_req, res) => {
    const staff = await prisma.staffProfile.findMany({
      where:  { status: 'ACTIVE' },
      select: {
        id:         true,
        uid:        true,
        firstName:  true,
        lastName:   true,
        role:       true,
        department: true,
        status:     true,
        email:      true,
      },
    })

    const records: AlgoliaStaff[] = staff.map((s) => ({
      objectID:   s.id,
      uid:        s.uid,
      firstName:  s.firstName,
      lastName:   s.lastName,
      fullName:   `${s.firstName} ${s.lastName}`,
      role:       s.role,
      department: s.department,
      status:     s.status,
      email:      s.email ?? null,
    }))

    respondSeed(res, await bulkIndexStaff(records))
  },
)

/**
 * POST /algolia-admin/seed-books
 * Bulk-pushes all books from Postgres into the Algolia books index.
 */
algoliaAdminRouter.post('/seed-books',
  verifyAuth, requireRole(['admin']),
  async (_req, res) => {
    const books = await prisma.book.findMany({
      select: {
        id:              true,
        title:           true,
        author:          true,
        isbn:            true,
        category:        true,
        availableCopies: true,
        totalCopies:     true,
      },
    })

    const records: AlgoliaBook[] = books.map((b) => ({
      objectID:        b.id,
      title:           b.title,
      author:          b.author,
      isbn:            b.isbn ?? null,
      category:        b.category,
      availableCopies: b.availableCopies,
      totalCopies:     b.totalCopies,
    }))

    respondSeed(res, await bulkIndexBooks(records))
  },
)

/**
 * GET /algolia-admin/status
 * Returns record counts from Postgres to verify against Algolia dashboard.
 */
algoliaAdminRouter.get('/status',
  verifyAuth, requireRole(['admin']),
  async (_req, res) => {
    const [students, staff, books] = await Promise.all([
      prisma.student.count({ where: { status: { not: 'ARCHIVED' } } }),
      prisma.staffProfile.count({ where: { status: 'ACTIVE' } }),
      prisma.book.count(),
    ])
    res.json({
      postgres: { students, staff, books },
      message:  'Compare these counts against your Algolia index record counts.',
    })
  },
)