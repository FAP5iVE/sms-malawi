/*
 * apps/web/src/server/services/libraryService.ts
 *
 * [CHANGE TYPE]: MAJOR REWRITE of the digital-resource and fine-lifecycle
 *   functions — borrowing/return core logic (issueBorrowing, listBorrowings,
 *   markOverdueBorrowings, the catalog functions) is otherwise correct and
 *   unaffected.
 * [R-PHASE]: R12 — Library Domain & the Storage API Contract Fix
 *   (previously R10 — Finance II: Payroll, Forecasting & the
 *   Finance↔Library Reconciliation)
 * [PURPOSE]:
 *   1. uploadDigitalResource()/getDigitalResourceViewUrl(): fixed the
 *      build-breaking storage-contract bug — uploadFile() was called with
 *      STORAGE_BUCKETS.DIGITAL_LIBRARY (a StorageBucket, the literal
 *      'school_files', not a FilePrefix) and getDigitalResourceViewUrl()
 *      imported a `getViewUrl` export that does not exist in storage.ts.
 *      Repointed at FILE_PREFIX.DIGITAL_RESOURCE (added this phase) and
 *      getSignedViewUrl() respectively — the correct choice per that
 *      function's own doc comment ("All sensitive file access must go
 *      through this"), not getPublicViewUrl (explicitly documented as
 *      forbidden for protected categories). Also fixed
 *      uploadDigitalResource() assigning uploadFile()'s whole UploadResult
 *      object directly to the `fileKey` string column instead of its
 *      `.fileId` — the identical class of defect R10 fixed in
 *      receiptService.ts/reportExportService.ts.
 *   2. returnBook(): removed the `borrowing.borrowerType === 'STUDENT'`
 *      gate on LibraryFine creation — a staff borrower now accrues a real
 *      LibraryFine row the same as a student would (previously a staff
 *      borrower's computed fineAmount was written to Borrowing.fineAmount
 *      only, with no LibraryFine row ever created, so no finance-module
 *      consequence ever reached them). The new LibraryFine row also links
 *      back to its Borrowing via the new borrowingId relation (schema,
 *      this phase).
 *   3. returnBook(): FINE_PER_DAY_MWK is no longer a hardcoded module
 *      constant — the per-day rate now comes from
 *      settingsService.get(SETTING_KEYS.LIBRARY_FINE_PER_DAY), so an
 *      admin editing the Library Settings panel actually changes what
 *      returnBook() charges on the very next return.
 *   4. returnBook(): a DAMAGED condition is now persisted on the
 *      Borrowing row's new `condition` field (schema, this phase) instead
 *      of collapsing into the identical RETURNED status a clean return
 *      produces — the returned status/condition pair is now
 *      (RETURNED, GOOD) for a clean return, (RETURNED, DAMAGED) for a
 *      damaged-but-returned copy, and (LOST, LOST) for a lost copy.
 *   5. returnBook(): marking a copy LOST now decrements Book.totalCopies
 *      (not only availableCopies) — getLibraryStats().totalBooks
 *      previously kept counting a lost, unreplaced copy as part of the
 *      collection indefinitely.
 *   6. Added `import 'server-only'`.
 * [DEPENDS ON]: apps/web/src/lib/storage.ts (FILE_PREFIX.DIGITAL_RESOURCE,
 *   same phase), apps/web/prisma/schema.prisma (LibraryFine.staffId/
 *   borrowingId, Borrowing.condition — same phase),
 *   apps/web/src/server/services/settingsService.ts (SETTING_KEYS.
 *   LIBRARY_FINE_PER_DAY — already existed prior to this phase)
 */
import 'server-only'
import { prisma }   from '@/lib/prisma'
import { logger }   from '@/lib/logger'
import { uploadFile, getSignedViewUrl, FILE_PREFIX } from '@/lib/storage'
import { differenceInDays }   from 'date-fns'
import type { CreateBookInput, IssueBorrowingInput, ReturnBorrowingInput, CreateDigitalResourceInput } from '@shared/schemas/library'
import * as algolia from '@/server/services/algoliaService'
import * as settingsService from '@/server/services/settingsService'
import { SETTING_KEYS } from '@shared/types/settings'

// ─── CATALOG ─────────────────────────────────────────────
export async function listBooks(filters: {
  category?: string; search?: string; available?: boolean
} = {}) {
  return prisma.book.findMany({
    where: {
      ...(filters.category  ? { category: filters.category as never } : {}),
      ...(filters.available ? { availableCopies: { gt: 0 } } : {}),
      ...(filters.search    ? {
        OR: [
          { title:  { contains: filters.search, mode: 'insensitive' } },
          { author: { contains: filters.search, mode: 'insensitive' } },
          { isbn:   { contains: filters.search } },
        ]
      } : {}),
    },
    orderBy: { title: 'asc' },
  })
}

export async function getBook(id: string) {
  return prisma.book.findUniqueOrThrow({
    where: { id },
    include: { borrowings: { where: { status: 'ACTIVE' }, orderBy: { issuedAt: 'desc' } } },
  })
}

export async function createBook(data: CreateBookInput, actorUid: string) {
  const book = await prisma.book.create({
    data: {
      title:         data.title,
      author:        data.author,
      isbn:          data.isbn ?? null,
      category:      data.category,
      publisher:     data.publisher ?? null,
      publishedYear: data.publishedYear ?? null,
      totalCopies:   data.totalCopies,
      availableCopies: data.totalCopies,
      barcode:       data.barcode ?? null,
    },
  })
  logger.info({ event: 'book.create', bookId: book.id, actorUid })
  void algolia.indexBook({
    objectID:       book.id,
    title:          book.title,
    author:         book.author,
    isbn:           book.isbn ?? null,
    category:       book.category,
    totalCopies:    book.totalCopies,
    availableCopies: book.availableCopies,
  })
  return book
}

export async function findBookByBarcode(barcode: string) {
  return prisma.book.findFirst({ where: { barcode } })
}

// ─── BORROWING ───────────────────────────────────────────
export async function issueBorrowing(data: IssueBorrowingInput, actorUid: string) {
  const book = await prisma.book.findUniqueOrThrow({ where: { id: data.bookId } })
  if (book.availableCopies <= 0) throw new Error(`"${book.title}" has no copies available.`)

  // Check borrower has no overdue books
  const overdue = await prisma.borrowing.count({
    where: {
    ...(data.borrowerType === 'STUDENT' ? { studentId: data.studentId } : { staffId: data.staffId }),
    status: 'OVERDUE',
    },
    })
  if (overdue > 0) throw new Error('This borrower has overdue books. Return them first.')

  const [borrowing] = await prisma.$transaction([
    prisma.borrowing.create({
      data: {
        bookId: data.bookId, 
        borrowerType: data.borrowerType, 
        studentId:    data.studentId ?? null,
        staffId:      data.staffId  ?? null,
        issuedByUid:  actorUid, 
        dueDate:      new Date(data.dueDate), 
        notes:        data.notes ?? null,
      },
    }),
    prisma.book.update({
      where: { id: data.bookId },
      data: { availableCopies: { decrement: 1 } },
    }),
  ])
  logger.info({ event: 'book.issued', borrowingId: borrowing.id, bookId: data.bookId, borrowerId: data.studentId ?? data.staffId, actorUid })
  return borrowing}

export async function returnBook(borrowingId: string, data: ReturnBorrowingInput, actorUid: string) {
  const borrowing = await prisma.borrowing.findUniqueOrThrow({
    where: { id: borrowingId },
    include: { book: true },
  })
  if (borrowing.status === 'RETURNED') throw new Error('Book already returned.')

  const finePerDayMwk = await settingsService.get(SETTING_KEYS.LIBRARY_FINE_PER_DAY)

  const now        = new Date()
  const overdueDays = Math.max(0, differenceInDays(now, borrowing.dueDate))
  const fineAmount  = overdueDays * finePerDayMwk

  let fineId: string | undefined

  await prisma.$transaction(async (tx) => {
    // Create fine in LibraryFine table if overdue (bridges to Finance module)
    // — a STUDENT and a STAFF borrower both accrue a real fine row; there
    // is no borrower-type gate here any more (R12).
    if (fineAmount > 0) {
      const fine = await tx.libraryFine.create({
        data: {
          studentId:     borrowing.studentId,
          staffId:       borrowing.staffId,
          bookTitle:     borrowing.book.title,
          borrowingId:   borrowing.id,
          amount:        fineAmount,
          reason:        `${overdueDays} overdue day(s) at MWK ${finePerDayMwk}/day`,
          markedByUid:   actorUid,
        },
      })
      fineId = fine.id
    }

    const status    = data.condition === 'LOST' ? 'LOST' : 'RETURNED'
    const condition = data.condition ?? 'GOOD'

    await tx.borrowing.update({
      where: { id: borrowingId },
      data: { returnedAt: now, status, condition, fineAmount: fineAmount || null, fineId: fineId ?? null, notes: data.notes ?? null },
    })

    if (data.condition === 'LOST') {
      // A lost copy leaves the collection entirely — decrement both
      // totalCopies and (implicitly, by not restoring it) availableCopies,
      // so getLibraryStats().totalBooks stops overstating the collection.
      await tx.book.update({
        where: { id: borrowing.bookId },
        data: { totalCopies: { decrement: 1 } },
      })
    } else {
      // GOOD or DAMAGED — the physical copy is back on the shelf either way.
      await tx.book.update({
        where: { id: borrowing.bookId },
        data: { availableCopies: { increment: 1 } },
      })
    }
  })

  logger.info({ event: 'book.returned', borrowingId, overdueDays, fineAmount, condition: data.condition ?? 'GOOD', actorUid })
  return { overdueDays, fineAmount, fineId }
}

export async function listBorrowings(filters: {
  studentId?: string; staffId?: string; status?: string; overdue?: boolean
} = {}) {
  const now = new Date()
  return prisma.borrowing.findMany({
    where: {
      ...(filters.studentId  ? { studentId: filters.studentId } : {}),
      ...(filters.staffId   ? { staffId: filters.staffId } : {}),
      ...(filters.status     ? { status: filters.status as never } : {}),
      ...(filters.overdue    ? { dueDate: { lt: now }, status: 'ACTIVE' } : {}),
    },
    include: { book: { select: { title: true, author: true, isbn: true } } },
    orderBy: { dueDate: 'asc' },
  })
}

// ─── OVERDUE CHECK (called by cron job) ──────────────────
export async function markOverdueBorrowings(): Promise<number> {
  const result = await prisma.borrowing.updateMany({
    where: { status: 'ACTIVE', dueDate: { lt: new Date() } },
    data: { status: 'OVERDUE' },
  })
  logger.info({ event: 'borrowings.overdue_marked', count: result.count })
  return result.count
}

// ─── DIGITAL LIBRARY ─────────────────────────────────────
export async function listDigitalResources(filters: {
  type?: string; form?: number; subject?: string; approvedOnly?: boolean
} = {}) {
  return prisma.digitalResource.findMany({
    where: {
      ...(filters.type         ? { type: filters.type as never } : {}),
      ...(filters.form         ? { form: filters.form } : {}),
      ...(filters.subject      ? { subject: { contains: filters.subject, mode: 'insensitive' } } : {}),
      ...(filters.approvedOnly ? { approved: true } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function uploadDigitalResource(
  data: CreateDigitalResourceInput,
  buffer: Buffer,
  filename: string,
  mimeType: string,
  fileSize: number,
  uploaderUid: string
) {
  const uploaded = await uploadFile(FILE_PREFIX.DIGITAL_RESOURCE, buffer, filename, mimeType)
  const resource = await prisma.digitalResource.create({
    data: {
      title:        data.title,
      type:         data.type,
      subject:      data.subject ?? null,
      form:         data.form ?? null,
      academicYear: data.academicYear ?? null,
      fileKey:      uploaded.fileId,
      fileSize,
      mimeType,
      uploadedByUid: uploaderUid,
      approved:     false, // must be approved before student access
    },
  })
  logger.info({ event: 'digital_resource.upload', resourceId: resource.id, uploaderUid })
  return resource
}

export async function approveDigitalResource(resourceId: string, actorUid: string) {
  return prisma.digitalResource.update({
    where: { id: resourceId },
    data: { approved: true, approvedByUid: actorUid, approvedAt: new Date() },
  })
}

export async function getDigitalResourceViewUrl(resourceId: string, actorRole: string): Promise<string> {
  const resource = await prisma.digitalResource.findUniqueOrThrow({ where: { id: resourceId } })
  if (!resource.approved && actorRole === 'student')
    throw Object.assign(new Error('Resource not yet approved.'), { status: 403 })
  return getSignedViewUrl(resource.fileKey)
}

// ─── LIBRARY REPORTS ─────────────────────────────────────
export async function getLibraryStats() {
  const [totalBooks, activeBorrowings, overdueBorrowings, pendingFines, digitalCount] = await prisma.$transaction([
    prisma.book.aggregate({ _sum: { totalCopies: true } }),
    prisma.borrowing.count({ where: { status: 'ACTIVE' } }),
    prisma.borrowing.count({ where: { status: 'OVERDUE' } }),
    prisma.libraryFine.count({ where: { status: 'PENDING' } }),
    prisma.digitalResource.count({ where: { approved: true } }),
  ])
  return { totalBooks: totalBooks._sum.totalCopies ?? 0, activeBorrowings, overdueBorrowings, pendingFines, digitalCount }
}
