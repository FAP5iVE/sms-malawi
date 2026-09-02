import 'server-only'
import { algoliasearch, type Algoliasearch } from 'algoliasearch'
import { logger } from '@/lib/logger'

// ─────────────────────────────────────────────────────────
//  CLIENT INITIALISATION
//  Lazy singleton — mirrors lib/email.ts's getResendClient() pattern.
//  The Algolia v5 SDK's algoliasearch() factory throws synchronously
//  ("`appId` is missing.") when constructed with an empty appId. Building
//  the client eagerly at module scope meant this module — pulled in
//  transitively by api-app.ts via search.ts/algoliaAdmin.ts/studentService.ts/
//  hrService.ts/libraryService.ts — crashed Next.js's build-time "Collecting
//  page data" step for the /api/[[...slug]] catch-all route whenever
//  ALGOLIA_APP_ID/ALGOLIA_ADMIN_KEY weren't present in the build environment.
//  Deferring construction to first real use (request time, when env vars are
//  actually populated) avoids the build-time crash; every call site below
//  already degrades gracefully to fallbackSearch() when Algolia is
//  unavailable, so returning null here rather than throwing is consistent
//  with this file's own existing error-handling design.
// ─────────────────────────────────────────────────────────

let _adminClient: Algoliasearch | null = null

function getAlgoliaAdminClient(): Algoliasearch | null {
  if (_adminClient) return _adminClient
  const appId    = process.env.ALGOLIA_APP_ID
  const adminKey = process.env.ALGOLIA_ADMIN_KEY
  if (!appId || !adminKey) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('[algoliaService] ALGOLIA_APP_ID/ALGOLIA_ADMIN_KEY not set — search indexing is disabled, fallbackSearch() will be used')
    }
    return null
  }
  _adminClient = algoliasearch(appId, adminKey)
  return _adminClient
}

export const STUDENTS_INDEX  = 'students'
export const STAFF_INDEX     = 'staff_profiles'
export const BOOKS_INDEX     = 'books'

// ─── STUDENT RECORDS ─────────────────────────────────────────────────────────

export interface AlgoliaStudent {
  objectID:       string
  registrationNo: string
  firstName:      string
  lastName:       string
  otherNames:     string | null
  fullName:       string
  className:      string | null
  form:           number | null
  status:         string
  sex:            string
  academicYear:   string | null
}

export async function indexStudent(record: AlgoliaStudent): Promise<void> {
  const client = getAlgoliaAdminClient()
  if (!client) return
  try {
    await client.saveObject({ indexName: STUDENTS_INDEX, body: record })
  } catch (err) {
    console.error('[algoliaService] indexStudent failed', err)
  }
}

export async function updateStudent(record: Partial<AlgoliaStudent> & { objectID: string }): Promise<void> {
  const client = getAlgoliaAdminClient()
  if (!client) return
  try {
    await client.partialUpdateObject({
      indexName:  STUDENTS_INDEX,
      objectID:   record.objectID,
      attributesToUpdate: record,
    })
  } catch (err) {
    console.error('[algoliaService] updateStudent failed', err)
  }
}

export async function deleteStudent(studentId: string): Promise<void> {
  const client = getAlgoliaAdminClient()
  if (!client) return
  try {
    await client.deleteObject({ indexName: STUDENTS_INDEX, objectID: studentId })
  } catch (err) {
    console.error('[algoliaService] deleteStudent failed', err)
  }
}

// ─── STAFF RECORDS ───────────────────────────────────────────────────────────

export interface AlgoliaStaff {
  objectID:   string
  uid:        string
  firstName:  string
  lastName:   string
  fullName:   string
  role:       string
  department: string
  status:     string
  email:      string | null
}

export async function indexStaff(record: AlgoliaStaff): Promise<void> {
  const client = getAlgoliaAdminClient()
  if (!client) return
  try {
    await client.saveObject({ indexName: STAFF_INDEX, body: record })
  } catch (err) {
    console.error('[algoliaService] indexStaff failed', err)
  }
}

export async function updateStaff(record: Partial<AlgoliaStaff> & { objectID: string }): Promise<void> {
  const client = getAlgoliaAdminClient()
  if (!client) return
  try {
    await client.partialUpdateObject({
      indexName:  STAFF_INDEX,
      objectID:   record.objectID,
      attributesToUpdate: record,
    })
  } catch (err) {
    console.error('[algoliaService] updateStaff failed', err)
  }
}

export async function deleteStaff(staffId: string): Promise<void> {
  const client = getAlgoliaAdminClient()
  if (!client) return
  try {
    await client.deleteObject({ indexName: STAFF_INDEX, objectID: staffId })
  } catch (err) {
    console.error('[algoliaService] deleteStaff failed', err)
  }
}

// ─── BOOK RECORDS ────────────────────────────────────────────────────────────

export interface AlgoliaBook {
  objectID:        string
  title:           string
  author:          string
  isbn:            string | null
  category:        string
  availableCopies: number
  totalCopies:     number
}

export async function indexBook(record: AlgoliaBook): Promise<void> {
  const client = getAlgoliaAdminClient()
  if (!client) return
  try {
    await client.saveObject({ indexName: BOOKS_INDEX, body: record })
  } catch (err) {
    console.error('[algoliaService] indexBook failed', err)
  }
}

export async function updateBook(record: Partial<AlgoliaBook> & { objectID: string }): Promise<void> {
  const client = getAlgoliaAdminClient()
  if (!client) return
  try {
    await client.partialUpdateObject({
      indexName:  BOOKS_INDEX,
      objectID:   record.objectID,
      attributesToUpdate: record,
    })
  } catch (err) {
    console.error('[algoliaService] updateBook failed', err)
  }
}

export async function deleteBook(bookId: string): Promise<void> {
  const client = getAlgoliaAdminClient()
  if (!client) return
  try {
    await client.deleteObject({ indexName: BOOKS_INDEX, objectID: bookId })
  } catch (err) {
    console.error('[algoliaService] deleteBook failed', err)
  }
}

// ─── BULK SEED ───────────────────────────────────────────────────────────────
// Called once from admin panel or CLI to populate indices from Postgres.

// BulkIndexResult distinguishes two very different failure modes that a
// caller (the admin seed routes) needs to report differently:
//  - configured: false  → ALGOLIA_APP_ID/ALGOLIA_ADMIN_KEY aren't set, so
//    nothing was ever attempted. This used to be silently swallowed and the
//    route reported `indexed: records.length` anyway, which is how the
//    Algolia dashboard could show 0 records while the admin UI claimed
//    success.
//  - configured: true, error set → client existed but the Algolia API call
//    itself failed (bad key, network, index perms, etc).
export interface BulkIndexResult {
  indexed:    number
  configured: boolean
  error?:     string
}

export async function bulkIndexStudents(records: AlgoliaStudent[]): Promise<BulkIndexResult> {
  const client = getAlgoliaAdminClient()
  if (!client) return { indexed: 0, configured: false }
  if (records.length === 0) return { indexed: 0, configured: true }
  try {
    // AlgoliaStudent (and AlgoliaStaff / AlgoliaBook below) is a plain,
    // JSON-serializable interface — string/number/null fields only, no
    // methods or symbols. The Algolia v5 SDK's SaveObjectsOptions.objects
    // requires an index signature (Record<string, unknown>[]), which a
    // named-property interface never structurally satisfies regardless of
    // its field types — a nominal-typing gap in the SDK's own types, not a
    // real safety concern here, so the cast below is safe.
    await client.saveObjects({ indexName: STUDENTS_INDEX, objects: records as unknown as Record<string, unknown>[] })
    return { indexed: records.length, configured: true }
  } catch (err) {
    console.error('[algoliaService] bulkIndexStudents failed', err)
    return { indexed: 0, configured: true, error: err instanceof Error ? err.message : 'Algolia write failed' }
  }
}

export async function bulkIndexStaff(records: AlgoliaStaff[]): Promise<BulkIndexResult> {
  const client = getAlgoliaAdminClient()
  if (!client) return { indexed: 0, configured: false }
  if (records.length === 0) return { indexed: 0, configured: true }
  try {
    // See the comment on bulkIndexStudents above — same nominal-typing gap.
    await client.saveObjects({ indexName: STAFF_INDEX, objects: records as unknown as Record<string, unknown>[] })
    return { indexed: records.length, configured: true }
  } catch (err) {
    console.error('[algoliaService] bulkIndexStaff failed', err)
    return { indexed: 0, configured: true, error: err instanceof Error ? err.message : 'Algolia write failed' }
  }
}

export async function bulkIndexBooks(records: AlgoliaBook[]): Promise<BulkIndexResult> {
  const client = getAlgoliaAdminClient()
  if (!client) return { indexed: 0, configured: false }
  if (records.length === 0) return { indexed: 0, configured: true }
  try {
    // See the comment on bulkIndexStudents above — same nominal-typing gap.
    await client.saveObjects({ indexName: BOOKS_INDEX, objects: records as unknown as Record<string, unknown>[] })
    return { indexed: records.length, configured: true }
  } catch (err) {
    console.error('[algoliaService] bulkIndexBooks failed', err)
    return { indexed: 0, configured: true, error: err instanceof Error ? err.message : 'Algolia write failed' }
  }
}

// ─── LIVE SEARCH ─────────────────────────────────────────────────────────────
// This is the actual read path GlobalSearch.tsx / library BorrowerPicker hit.
//
// Historically nothing in the app ever called search()/searchSingleIndex()
// on the Algolia client — indexStudent/indexStaff/indexBook etc. only ever
// WROTE to Algolia. The route at server/routes/search.ts always called
// fallbackSearch() (Postgres `contains`) unconditionally, so despite records
// being indexed, no query ever reached Algolia. algoliaSearch() below is the
// missing read side; the route now tries this first and only drops to
// fallbackSearch() when Algolia is unconfigured or the request fails.
//
// Uses the admin client rather than a public search-only key: there is no
// NEXT_PUBLIC_ALGOLIA_SEARCH_KEY configured for this project, this call is
// server-side only (the admin key never reaches the browser), and the route
// calling it is already gated by verifyAuth + 'search.globalSearch'.
export interface SearchAllResult {
  students: { id: string; fullName: string; registrationNo: string; className: string | null }[]
  staff:    { id: string; fullName: string; role: string; department: string }[]
  books:    { id: string; title: string; author: string; category: string }[]
}

export async function algoliaSearch(query: string, limit = 8): Promise<SearchAllResult | null> {
  const client = getAlgoliaAdminClient()
  if (!client) return null
  try {
    const { results } = await client.search<Record<string, unknown>>({
      requests: [
        { indexName: STUDENTS_INDEX, query, hitsPerPage: limit },
        { indexName: STAFF_INDEX,    query, hitsPerPage: limit },
        { indexName: BOOKS_INDEX,    query, hitsPerPage: limit },
      ],
    })

    // v5 SDK: each entry in `results` is a per-request result carrying its
    // own `hits` array, in the same order the requests were submitted.
    const [studentRes, staffRes, bookRes] = results as unknown as {
      hits: Record<string, unknown>[]
    }[]

    return {
      students: (studentRes?.hits ?? []).map((h) => ({
        id:             String(h.objectID),
        fullName:       String(h.fullName ?? ''),
        registrationNo: String(h.registrationNo ?? ''),
        className:      (h.className as string | null) ?? null,
      })),
      staff: (staffRes?.hits ?? []).map((h) => ({
        id:         String(h.objectID),
        fullName:   String(h.fullName ?? ''),
        role:       String(h.role ?? ''),
        department: String(h.department ?? ''),
      })),
      books: (bookRes?.hits ?? []).map((h) => ({
        id:       String(h.objectID),
        title:    String(h.title ?? ''),
        author:   String(h.author ?? ''),
        category: String(h.category ?? ''),
      })),
    }
  } catch (err) {
    console.error('[algoliaService] algoliaSearch failed', err)
    return null
  }
}

// ─── GRACEFUL FALLBACK SEARCH ────────────────────────────────────────────────
// Used when Algolia is unavailable — falls back to Prisma contains queries.

import { prisma } from '@/lib/prisma'

export async function fallbackSearch(query: string, limit = 8): Promise<{
  students: { id: string; fullName: string; registrationNo: string; className: string | null }[]
  staff:    { id: string; fullName: string; role: string; department: string }[]
  books:    { id: string; title: string; author: string; category: string }[]
}> {
  const q = query.trim()
  if (!q) return { students: [], staff: [], books: [] }

  const [students, staff, books] = await Promise.all([
    prisma.student.findMany({
      where: {
        OR: [
          { firstName:      { contains: q, mode: 'insensitive' } },
          { lastName:       { contains: q, mode: 'insensitive' } },
          { registrationNo: { contains: q, mode: 'insensitive' } },
        ],
      },
      include: { class: { select: { name: true } } },
      take: limit,
    }),
    prisma.staffProfile.findMany({
      where: {
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName:  { contains: q, mode: 'insensitive' } },
        ],
      },
      take: limit,
    }),
    prisma.book.findMany({
      where: {
        OR: [
          { title:  { contains: q, mode: 'insensitive' } },
          { author: { contains: q, mode: 'insensitive' } },
          { isbn:   { contains: q, mode: 'insensitive' } },
        ],
      },
      take: limit,
    }),
  ])

  return {
    students: students.map((s) => ({
      id:             s.id,
      fullName:       `${s.firstName} ${s.lastName}`,
      registrationNo: s.registrationNo,
      className:      (s as typeof s & { class: { name: string } | null }).class?.name ?? null,
    })),
    staff: staff.map((s) => ({
      id:         s.id,
      fullName:   `${s.firstName} ${s.lastName}`,
      role:       s.role,
      department: s.department,
    })),
    books: books.map((b) => ({
      id:       b.id,
      title:    b.title,
      author:   b.author,
      category: b.category,
    })),
  }
}