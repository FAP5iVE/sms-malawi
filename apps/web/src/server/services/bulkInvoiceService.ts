/**
 * apps/web/src/server/services/bulkInvoiceService.ts — Phase D5
 *
 * Generates term invoices in bulk for all active students in a class
 * (or the entire school) based on active FeeStructure records.
 *
 * Logic per student:
 *   1. Fetch all active FeeStructures matching (academicYear, term | null, classId | null).
 *   2. Sum applicable line items → subtotal.
 *   3. Look up any active Scholarship for the student → compute discount.
 *   4. Upsert Invoice (unique: studentId + academicYear + term).
 *      Skip (EXISTING) if already exists with status != UNPAID to avoid
 *      overwriting a PARTIAL/PAID invoice.
 *   5. Return per-student outcome: CREATED | EXISTING | SKIPPED | ERROR.
 *
 * Fee structure matching priority:
 *   class-specific AND term-specific    → highest priority
 *   class-specific AND term = null      → applies to all terms for that class
 *   classId = null AND term-specific    → school-wide for that term
 *   classId = null AND term = null      → school-wide all-term fee
 */

import 'server-only'
import { Decimal }    from '@prisma/client/runtime/library'
import { prisma }     from '@/lib/prisma'
import { logger }     from '@/lib/logger'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type InvoiceOutcome = 'CREATED' | 'EXISTING' | 'SKIPPED' | 'ERROR'

export interface StudentInvoiceResult {
  studentId:      string
  registrationNo: string
  fullName:       string
  classId:        string
  className:      string
  outcome:        InvoiceOutcome
  invoiceId?:     string
  totalAmount?:   number
  discount?:      number
  error?:         string
}

export interface BulkInvoiceResult {
  academicYear:  string
  term:          number
  created:       number
  existing:      number
  skipped:       number
  errors:        number
  totalRevenue:  number
  students:      StudentInvoiceResult[]
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

const INVOICE_DUE_DAYS = 30   // due 30 days after generation

// ─────────────────────────────────────────────────────────────────────────────
// CORE
// ─────────────────────────────────────────────────────────────────────────────

export async function bulkGenerateInvoices(
  classId:      string | 'ALL',
  academicYear: string,
  term:         number,
  actorUid:     string,
): Promise<BulkInvoiceResult> {
  // Fetch all fee structures applicable to this year/term
  const feeStructures = await prisma.feeStructure.findMany({
    where: {
      academicYear,
      isActive: true,
      OR: [
        { term },
        { term: null },
      ],
    },
  })

  if (feeStructures.length === 0) {
    logger.warn(
      { event: 'bulk-invoice.no-fee-structures', academicYear, term },
      'No active fee structures found — cannot generate invoices',
    )
  }

  // Fetch active students (optionally scoped to a class)
  const students = await prisma.student.findMany({
    where: {
      status:  'ACTIVE',
      ...(classId !== 'ALL' ? { classId } : {}),
    },
    include: {
      class: { select: { id: true, name: true } },
    },
  })

  // Fetch all active scholarships keyed by studentId
  const scholarships = await prisma.scholarship.findMany({
    where: { isActive: true, academicYear },
  })
  const scholarshipByStudent = new Map(
    scholarships.map((s) => [s.studentId, s]),
  )

  const results: StudentInvoiceResult[] = []
  let created = 0, existing = 0, skipped = 0, errors = 0, totalRevenue = 0

  for (const student of students) {
    try {
      const sClass = student.class
      if (!sClass) {
        results.push({
          studentId:      student.id,
          registrationNo: student.registrationNo,
          fullName:       `${student.firstName} ${student.lastName}`,
          classId:        '',
          className:      '—',
          outcome:        'SKIPPED',
          error:          'No class assigned',
        })
        skipped++
        continue
      }

      // Check for existing invoice
      const existingInvoice = await prisma.invoice.findUnique({
        where: {
          studentId_academicYear_term: {
            studentId: student.id,
            academicYear,
            term,
          },
        },
      })

      if (existingInvoice) {
        // Don't overwrite a partially/fully paid invoice
        if (existingInvoice.status !== 'UNPAID') {
          results.push({
            studentId:      student.id,
            registrationNo: student.registrationNo,
            fullName:       `${student.firstName} ${student.lastName}`,
            classId:        sClass.id,
            className:      sClass.name,
            outcome:        'SKIPPED',
            invoiceId:      existingInvoice.id,
          })
          skipped++
          continue
        }

        results.push({
          studentId:      student.id,
          registrationNo: student.registrationNo,
          fullName:       `${student.firstName} ${student.lastName}`,
          classId:        sClass.id,
          className:      sClass.name,
          outcome:        'EXISTING',
          invoiceId:      existingInvoice.id,
          totalAmount:    Number(existingInvoice.totalAmount),
        })
        existing++
        continue
      }

      // Calculate subtotal from applicable fee structures
      const applicable = feeStructures.filter(
        (f) => f.classId === null || f.classId === sClass.id,
      )
      const subtotal = applicable.reduce(
        (sum, f) => sum + Number(f.amount),
        0,
      )

      // Apply scholarship discount
      const scholarship = scholarshipByStudent.get(student.id)
      let discount = 0
      if (scholarship) {
        if (scholarship.discountType === 'PERCENTAGE') {
          discount = (subtotal * Number(scholarship.value)) / 100
        } else {
          discount = Math.min(Number(scholarship.value), subtotal)
        }
      }

      const totalAmount  = Math.max(0, subtotal - discount)
      const balance      = totalAmount
      const dueDate      = addDays(new Date(), INVOICE_DUE_DAYS)

      const invoice = await prisma.invoice.create({
        data: {
          studentId:    student.id,
          academicYear,
          term,
          subtotal:     new Decimal(subtotal),
          discount:     new Decimal(discount),
          totalAmount:  new Decimal(totalAmount),
          balance:      new Decimal(balance),
          paidAmount:   new Decimal(0),
          status:       'UNPAID',
          dueDate,
          scholarshipId: scholarship?.id,
        },
      })

      results.push({
        studentId:      student.id,
        registrationNo: student.registrationNo,
        fullName:       `${student.firstName} ${student.lastName}`,
        classId:        sClass.id,
        className:      sClass.name,
        outcome:        'CREATED',
        invoiceId:      invoice.id,
        totalAmount,
        discount,
      })
      created++
      totalRevenue += totalAmount
    } catch (err) {
      results.push({
        studentId:      student.id,
        registrationNo: student.registrationNo,
        fullName:       `${student.firstName} ${student.lastName}`,
        classId:        student.classId ?? '',
        className:      student.class?.name ?? '—',
        outcome:        'ERROR',
        error:          err instanceof Error ? err.message : 'Unknown error',
      })
      errors++
      logger.error({ event: 'bulk-invoice.student-error', studentId: student.id, err })
    }
  }

  logger.info(
    { event: 'bulk-invoice.done', academicYear, term, classId, created, existing, skipped, errors, totalRevenue, actorUid },
    'Bulk invoice generation complete',
  )

  return { academicYear, term, created, existing, skipped, errors, totalRevenue, students: results }
}