import { Router }   from 'express'
import { verifyAuth, requireRole } from '@/lib/verifyAuth'
import { prisma }   from '@/lib/prisma'
import {
  bulkIndexStudents,
  bulkIndexStaff,
  bulkIndexBooks,
  configureAllIndices,
  type AlgoliaStudent,
  type AlgoliaStaff,
  type AlgoliaBook,
  type BulkIndexResult,
} from '@/server/services/algoliaService'
import { seedAllUserAccountsToAlgolia } from '@/server/services/userManagementService'
import { seedAllApplicationsToAlgolia } from '@/server/services/applicationService'
import { seedAllInvoicesToAlgolia } from '@/server/services/feeService'
import { seedAllPlacementsToAlgolia } from '@/server/services/placementService'
import { seedAllAssetsToAlgolia } from '@/server/services/assetService'
import { seedAllAnnouncementsToAlgolia } from '@/server/services/announcementService'

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
        district:       true,
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
      // [ALGOLIA ROLLOUT — Tier 1 item 3] previously collected but never
      // indexed — see the plan's "New fields needed" note for this item.
      district:       s.district ?? null,
      // riskLevel is deliberately NOT set here. Note this bulk seed uses
      // saveObjects (full record replace, not a merge) — so re-running this
      // seed DOES clear any riskLevel riskJob.ts previously wrote via
      // partialUpdateObject, until the next Monday 02:00 UTC cron run
      // repopulates it. Accepted trade-off: it's self-healing within a
      // week, and this bulk seed is an occasional admin action, not a
      // steady-state code path — not worth fetching+merging existing
      // Algolia records just to preserve a value that recomputes weekly
      // anyway.
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
        id:             true,
        uid:            true,
        firstName:      true,
        lastName:       true,
        role:           true,
        department:     true,
        status:         true,
        email:          true,
        // [ALGOLIA ROLLOUT — Tier 1 item 4] previously omitted here too.
        jobTitle:       true,
        employmentType: true,
        contractExpiry: true,
        dateJoined:     true,
      },
    })

    const records: AlgoliaStaff[] = staff.map((s) => ({
      objectID:       s.id,
      uid:            s.uid,
      firstName:      s.firstName,
      lastName:       s.lastName,
      fullName:       `${s.firstName} ${s.lastName}`,
      role:           s.role,
      department:     s.department,
      status:         s.status,
      email:          s.email ?? null,
      jobTitle:       s.jobTitle,
      employmentType: s.employmentType,
      contractExpiry: s.contractExpiry ? s.contractExpiry.toISOString() : null,
      dateJoined:     s.dateJoined.toISOString(),
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
        // [ALGOLIA ROLLOUT — Tier 1 item 5] previously omitted here too.
        publisher:       true,
        publishedYear:   true,
        shelf:           true,
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
      publisher:       b.publisher ?? null,
      publishedYear:   b.publishedYear ?? null,
      shelf:           b.shelf ?? null,
    }))

    respondSeed(res, await bulkIndexBooks(records))
  },
)

/**
 * POST /algolia-admin/seed-user-accounts
 * [ALGOLIA ROLLOUT — Tier 1 item 2] Bulk-pushes every Firebase Auth account
 * into the new user_accounts index. Unlike the Accounts tab's own
 * useUsers() (fixed separately, see hooks/useAdmin.ts), this loops every
 * listUsers() pageToken — seeding must not reproduce the "only page 1" bug
 * this item exists to fix.
 */
algoliaAdminRouter.post('/seed-user-accounts',
  verifyAuth, requireRole(['admin']),
  async (_req, res) => {
    respondSeed(res, await seedAllUserAccountsToAlgolia())
  },
)

/**
 * POST /algolia-admin/seed-applications
 * [ALGOLIA ROLLOUT — Tier 1 item 6]
 */
algoliaAdminRouter.post('/seed-applications',
  verifyAuth, requireRole(['admin']),
  async (_req, res) => {
    respondSeed(res, await seedAllApplicationsToAlgolia())
  },
)

/**
 * POST /algolia-admin/seed-invoices
 * [ALGOLIA ROLLOUT — Tier 2 item 7]
 */
algoliaAdminRouter.post('/seed-invoices',
  verifyAuth, requireRole(['admin']),
  async (_req, res) => {
    respondSeed(res, await seedAllInvoicesToAlgolia())
  },
)

/**
 * POST /algolia-admin/seed-placements
 * [ALGOLIA ROLLOUT — Tier 1/2 item 10]
 */
algoliaAdminRouter.post('/seed-placements',
  verifyAuth, requireRole(['admin']),
  async (_req, res) => {
    respondSeed(res, await seedAllPlacementsToAlgolia())
  },
)

/**
 * POST /algolia-admin/seed-assets
 * [ALGOLIA ROLLOUT — Tier 1/2 item 11]
 */
algoliaAdminRouter.post('/seed-assets',
  verifyAuth, requireRole(['admin']),
  async (_req, res) => {
    respondSeed(res, await seedAllAssetsToAlgolia())
  },
)

/**
 * POST /algolia-admin/seed-announcements
 * [ALGOLIA ROLLOUT — Tier 2 item 8] Firestore-backed — see
 * seedAllAnnouncementsToAlgolia()'s own comment for why this paginates
 * differently from the Prisma-backed seed functions above.
 */
algoliaAdminRouter.post('/seed-announcements',
  verifyAuth, requireRole(['admin']),
  async (_req, res) => {
    respondSeed(res, await seedAllAnnouncementsToAlgolia())
  },
)

/**
 * POST /algolia-admin/configure-indices
 * [ALGOLIA ROLLOUT — Tier 0] Pushes searchableAttributes/
 * attributesForFaceting/replicas for every index declared in
 * algoliaService.ts's INDEX_CONFIGS. Idempotent — re-run any time a facet
 * or sort order is added to that list. Must be run at least once before
 * any faceted-filter or sort-order UI is built against these indices, or
 * Algolia will reject those queries outright (filtering on an attribute
 * never declared in attributesForFaceting errors; querying a replica index
 * name that hasn't been created 404s).
 */
algoliaAdminRouter.post('/configure-indices',
  verifyAuth, requireRole(['admin']),
  async (_req, res) => {
    const results = await configureAllIndices()
    const failed = Object.entries(results).filter(([, r]) => !r.ok)
    if (failed.length > 0) {
      return res.status(502).json({
        results,
        error: `${failed.length} index(es) failed to configure: ${failed.map(([name]) => name).join(', ')}`,
      })
    }
    res.json({ results })
  },
)

/**
 * GET /algolia-admin/status
 * Returns record counts from Postgres to verify against Algolia dashboard.
 */
algoliaAdminRouter.get('/status',
  verifyAuth, requireRole(['admin']),
  async (_req, res) => {
    const [students, staff, books, userAccounts, applications, invoices, placements, assets] = await Promise.all([
      prisma.student.count({ where: { status: { not: 'ARCHIVED' } } }),
      prisma.staffProfile.count({ where: { status: 'ACTIVE' } }),
      prisma.book.count(),
      // Firebase doesn't expose a cheap count() — approximate from Postgres-
      // linked accounts only; the true total (incl. unlinked accounts) is
      // only knowable by paging listUsers(), which /seed-user-accounts
      // already does. Good enough for a sanity check, not exact.
      prisma.staffProfile.count({ where: { uid: { not: '' } } }),
      prisma.application.count(),
      prisma.invoice.count(),
      prisma.universityPlacement.count(),
      prisma.asset.count(),
    ])
    res.json({
      postgres: { students, staff, books, userAccounts, applications, invoices, placements, assets },
      message:  'Compare these counts against your Algolia index record counts. userAccounts is an undercount (staff-linked accounts only, Firebase has no cheap count()) — see the /seed-user-accounts response for the real total. announcements isn\'t included here (Firestore, no cheap count() either) — see the /seed-announcements response for its total.',
    })
  },
)