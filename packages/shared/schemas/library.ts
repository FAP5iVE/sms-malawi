/*
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: packages/shared/schemas/library.ts
 * [R-PHASE]: R12 — Library Domain & the Storage API Contract Fix
 * [PURPOSE]: Adds CreateRecommendationSchema/ReviewRecommendationSchema and
 *   CreateFineWaiverSchema/ReviewFineWaiverSchema — libraryWorkflowService.ts's
 *   two workflows (this phase's fix) are now wired to real routes
 *   (library.ts, this phase) that need real request-body validation,
 *   matching the Create<Model>Schema/Update<Model>Schema pairing pattern
 *   established elsewhere in this file.
 * [DEPENDS ON]: apps/web/src/server/services/libraryWorkflowService.ts
 *   (CreateRecommendationInput/CreateFineWaiverInput — same phase, field
 *   shapes matched exactly)
 */
import { z } from 'zod'
import { getMaxPublishedYear } from '../constants/malawi'

export const CreateBookSchema = z.object({
  title:         z.string().min(1),
  author:        z.string().min(1),
  isbn:          z.string().optional(),
  category:      z.enum(['TEXTBOOK','REFERENCE','FICTION','NONFICTION','SCIENCE','MATHEMATICS','HUMANITIES','PAST_PAPER','OTHER']),
  publisher:     z.string().optional(),
  publishedYear: z.number().int().min(1900).max(getMaxPublishedYear()).optional(),
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

export const CreateRecommendationSchema = z.object({
  title:   z.string().min(1),
  author:  z.string().optional(),
  isbn:    z.string().optional(),
  type:    z.enum(['BOOK', 'EBOOK', 'JOURNAL', 'OTHER']),
  subject: z.string().optional(),
  reason:  z.string().min(1),
})

export const ReviewRecommendationSchema = z.object({
  notes: z.string().optional(),
})

export const RejectRecommendationSchema = z.object({
  reason: z.string().min(1, 'A rejection reason is required.'),
})

export const CreateFineWaiverSchema = z.object({
  fineId: z.string().min(1),
  reason: z.string().min(1),
})

export const RejectFineWaiverSchema = z.object({
  reason: z.string().min(1, 'A rejection reason is required.'),
})

export type CreateBookInput             = z.infer<typeof CreateBookSchema>
export type IssueBorrowingInput         = z.infer<typeof IssueBorrowingSchema>
export type ReturnBorrowingInput        = z.infer<typeof ReturnBorrowingSchema>
export type CreateDigitalResourceInput  = z.infer<typeof CreateDigitalResourceSchema>
export type CreateRecommendationInput   = z.infer<typeof CreateRecommendationSchema>
export type ReviewRecommendationInput   = z.infer<typeof ReviewRecommendationSchema>
export type RejectRecommendationInput   = z.infer<typeof RejectRecommendationSchema>
export type CreateFineWaiverInput       = z.infer<typeof CreateFineWaiverSchema>
export type RejectFineWaiverInput       = z.infer<typeof RejectFineWaiverSchema>
