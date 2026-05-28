import { z } from 'zod'

export const CreateBookSchema = z.object({
  title:         z.string().min(1),
  author:        z.string().min(1),
  isbn:          z.string().optional(),
  category:      z.enum(['TEXTBOOK','REFERENCE','FICTION','NONFICTION','SCIENCE','MATHEMATICS','HUMANITIES','PAST_PAPER','OTHER']),
  publisher:     z.string().optional(),
  publishedYear: z.number().int().min(1900).max(2030).optional(),
  totalCopies:   z.number().int().positive().default(1),
  barcode:       z.string().optional(),
})

export const IssueBorrowingSchema = z.object({
  bookId:       z.string().min(1),
  studentId:    z.string().min(1).optional(),
  staffId:      z.string().min(1).optional(),
  borrowerType: z.enum(['STUDENT','STAFF']),
  dueDate:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes:        z.string().optional(),
}).refine(
  (data) => {
    if (data.borrowerType === 'STUDENT') return !!data.studentId
    if (data.borrowerType === 'STAFF')   return !!data.staffId
    return false
  },
  {
    message: 'studentId is required for STUDENT borrowers, staffId is required for STAFF borrowers',
    path: ['borrowerType'],
  }
)

export const ReturnBorrowingSchema = z.object({
  condition: z.enum(['GOOD','DAMAGED','LOST']).default('GOOD'),
  notes:     z.string().optional(),
})

export const CreateDigitalResourceSchema = z.object({
  title:        z.string().min(1),
  type:         z.enum(['EBOOK','PAST_PAPER','REFERENCE','STUDY_GUIDE']),
  subject:      z.string().optional(),
  form:         z.number().int().min(1).max(4).optional(),
  academicYear: z.string().optional(),
})

export type CreateBookInput            = z.infer<typeof CreateBookSchema>
export type IssueBorrowingInput        = z.infer<typeof IssueBorrowingSchema>
export type ReturnBorrowingInput       = z.infer<typeof ReturnBorrowingSchema>
export type CreateDigitalResourceInput = z.infer<typeof CreateDigitalResourceSchema>
