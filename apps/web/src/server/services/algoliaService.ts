import 'server-only'
import { algoliasearch } from 'algoliasearch'

const APP_ID     = process.env.ALGOLIA_APP_ID      ?? ''
const ADMIN_KEY  = process.env.ALGOLIA_ADMIN_KEY   ?? ''

const adminClient = algoliasearch(APP_ID, ADMIN_KEY)

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
  try {
    await adminClient.saveObject({ indexName: STUDENTS_INDEX, body: record })
  } catch (err) {
    console.error('[algoliaService] indexStudent failed', err)
  }
}

export async function updateStudent(record: Partial<AlgoliaStudent> & { objectID: string }): Promise<void> {
  try {
    await adminClient.partialUpdateObject({
      indexName:  STUDENTS_INDEX,
      objectID:   record.objectID,
      attributesToUpdate: record,
    })
  } catch (err) {
    console.error('[algoliaService] updateStudent failed', err)
  }
}

export async function deleteStudent(studentId: string): Promise<void> {
  try {
    await adminClient.deleteObject({ indexName: STUDENTS_INDEX, objectID: studentId })
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
  try {
    await adminClient.saveObject({ indexName: STAFF_INDEX, body: record })
  } catch (err) {
    console.error('[algoliaService] indexStaff failed', err)
  }
}

export async function updateStaff(record: Partial<AlgoliaStaff> & { objectID: string }): Promise<void> {
  try {
    await adminClient.partialUpdateObject({
      indexName:  STAFF_INDEX,
      objectID:   record.objectID,
      attributesToUpdate: record,
    })
  } catch (err) {
    console.error('[algoliaService] updateStaff failed', err)
  }
}

export async function deleteStaff(staffId: string): Promise<void> {
  try {
    await adminClient.deleteObject({ indexName: STAFF_INDEX, objectID: staffId })
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
  try {
    await adminClient.saveObject({ indexName: BOOKS_INDEX, body: record })
  } catch (err) {
    console.error('[algoliaService] indexBook failed', err)
  }
}

export async function updateBook(record: Partial<AlgoliaBook> & { objectID: string }): Promise<void> {
  try {
    await adminClient.partialUpdateObject({
      indexName:  BOOKS_INDEX,
      objectID:   record.objectID,
      attributesToUpdate: record,
    })
  } catch (err) {
    console.error('[algoliaService] updateBook failed', err)
  }
}

export async function deleteBook(bookId: string): Promise<void> {
  try {
    await adminClient.deleteObject({ indexName: BOOKS_INDEX, objectID: bookId })
  } catch (err) {
    console.error('[algoliaService] deleteBook failed', err)
  }
}

// ─── BULK SEED ───────────────────────────────────────────────────────────────
// Called once from admin panel or CLI to populate indices from Postgres.

export async function bulkIndexStudents(records: AlgoliaStudent[]): Promise<void> {
  if (records.length === 0) return
  try {
    await adminClient.saveObjects({ indexName: STUDENTS_INDEX, objects: records })
  } catch (err) {
    console.error('[algoliaService] bulkIndexStudents failed', err)
  }
}

export async function bulkIndexStaff(records: AlgoliaStaff[]): Promise<void> {
  if (records.length === 0) return
  try {
    await adminClient.saveObjects({ indexName: STAFF_INDEX, objects: records })
  } catch (err) {
    console.error('[algoliaService] bulkIndexStaff failed', err)
  }
}

export async function bulkIndexBooks(records: AlgoliaBook[]): Promise<void> {
  if (records.length === 0) return
  try {
    await adminClient.saveObjects({ indexName: BOOKS_INDEX, objects: records })
  } catch (err) {
    console.error('[algoliaService] bulkIndexBooks failed', err)
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