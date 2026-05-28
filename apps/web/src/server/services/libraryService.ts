import { prisma }   from '@/lib/prisma'
import { logger }   from '@/lib/logger'
import { uploadFile, getViewUrl, STORAGE_BUCKETS } from '@/lib/storage'
import { differenceInDays }   from 'date-fns'
import type { CreateBookInput, IssueBorrowingInput, ReturnBorrowingInput, CreateDigitalResourceInput } from '@shared/schemas/library'

// ─── FINE RATE ─────────────────────────────────────────
const FINE_PER_DAY_MWK = 50  // MWK 50 per overdue day

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

  const now        = new Date()
  const overdueDays = Math.max(0, differenceInDays(now, borrowing.dueDate))
  const fineAmount  = overdueDays * FINE_PER_DAY_MWK

  let fineId: string | undefined

  await prisma.$transaction(async (tx) => {
    // Create fine in LibraryFine table if overdue (bridges to Finance module)
    if (fineAmount > 0 && borrowing.borrowerType === 'STUDENT') {
      const fine = await tx.libraryFine.create({
        data: {
          studentId:     borrowing.studentId!,
          bookTitle:     borrowing.book.title,
          amount:        fineAmount,
          reason:        `${overdueDays} overdue day(s) at MWK ${FINE_PER_DAY_MWK}/day`,
          firestoreDocId: borrowingId, // re-use borrowingId as reference
          markedByUid:   actorUid,
        },
      })
      fineId = fine.id
    }

    const status = data.condition === 'LOST'     ? 'LOST'
                 : data.condition === 'DAMAGED'  ? 'RETURNED'
                 : 'RETURNED'

    await tx.borrowing.update({
      where: { id: borrowingId },
      data: { returnedAt: now, status, fineAmount: fineAmount || null, fineId: fineId ?? null, notes: data.notes ?? null },
    })

    // Only restore copy if not lost
    if (data.condition !== 'LOST') {
      await tx.book.update({
        where: { id: borrowing.bookId },
        data: { availableCopies: { increment: 1 } },
      })
    }
  })

  logger.info({ event: 'book.returned', borrowingId, overdueDays, fineAmount, actorUid })
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
  const fileKey = await uploadFile(STORAGE_BUCKETS.DIGITAL_LIBRARY, buffer, filename, mimeType)
  const resource = await prisma.digitalResource.create({
    data: {
      title:        data.title,
      type:         data.type,
      subject:      data.subject ?? null,
      form:         data.form ?? null,
      academicYear: data.academicYear ?? null,
      fileKey,
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
  return getViewUrl(STORAGE_BUCKETS.DIGITAL_LIBRARY, resource.fileKey)
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