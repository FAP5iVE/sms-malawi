/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/hooks/useExams.ts
 * [R-PHASE]: R1 — API Client & Query-Key Singleton Consolidation; further
 *   edited in R7 — Academics III: Exam Pipeline Repair & Grading Engine
 *   Unification; and R8 — Academics IV: Report Cards, Transcripts,
 *   Promotion & Risk Assessment
 * [PURPOSE]: R1 repointed these hooks at the canonical apiFetch/queryKeys
 *   singleton. R7 adds useExamMarks(examId) — backs MarksEntrySheet.tsx's
 *   new requirement to load previously-saved draft marks when the sheet
 *   opens instead of always resetting to blank; consumes the new GET
 *   /exams/:id/marks route via the already-defined-but-previously-unused
 *   queryKeys.exams.marks(examId) key. R8 fixes useGenerateReportCard()'s
 *   response type to match POST /exams/report-card's real response shape
 *   (a full BatchGenerationResult, not just {fileId, url} — the route now
 *   calls reportCardService.generateSingleReportCard(), this same phase)
 *   and adds useReportCardData() for the new GET /exams/report-card/
 *   :studentId/data route backing PrintableReportCard.tsx's in-browser
 *   preview.
 * [DEPENDS ON]: W/lib/api-client.ts
 */
'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiExam, ApiExamMark, ApiTermResult, ApiManebRecord, ApiExamAnalytics, ApiStudentClassStanding } from '@shared/types/api'
import type { CreateExamInput, UpdateExamInput, BulkMarkEntryInput, CreateManebRecordInput } from '@shared/schemas/exam'
import type { ReportCardData } from '@/components/shared/PrintableReportCard'
import { apiFetch, newIdempotencyKey, queryKeys } from '@/lib/api-client'

export function useExams(classId: string | undefined, academicYear: string, term: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.exams.list({ classId: classId ?? null, academicYear, term }),
    queryFn:  () =>
      apiFetch<ApiExam[]>(
        classId
          ? `/exams?classId=${classId}&academicYear=${academicYear}&term=${term}`
          : `/exams?academicYear=${academicYear}&term=${term}`
      ),
    enabled: enabled && !!academicYear && !!term,
  })
}

// Continuous-assessment configuration (any signed-in user may read it).
// Backs the CA-slot picker in ExamForm and the CA breakdown on results.
export function useCaConfig() {
  return useQuery({
    queryKey: [...queryKeys.exams.all(), 'ca-config'] as const,
    queryFn:  () => apiFetch<{ enabled: boolean; count: number; weights: number[] }>('/settings/exam/ca-config'),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateExam() {
  const qc = useQueryClient()
  return useMutation({
    meta: { successMessage: 'Exam scheduled', failureTitle: 'Could not schedule the exam' },
    mutationFn: (data: CreateExamInput) =>
      apiFetch<ApiExam>('/exams', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.exams.all() }),
  })
}

// PATCH /exams/:id - the owner may change an exam's details until the teacher
// confirms (finalizes) its marks; the server refuses after that.
export function useUpdateExam() {
  const qc = useQueryClient()
  return useMutation({
    meta: { successMessage: 'Exam updated', failureTitle: 'Could not update the exam' },
    mutationFn: ({ examId, data }: { examId: string; data: UpdateExamInput }) =>
      apiFetch<ApiExam>(`/exams/${examId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.exams.all() }),
  })
}

// DELETE /exams/:id - same window as editing. Unconfirmed draft marks are
// discarded with the exam; the response says how many.
export function useDeleteExam() {
  const qc = useQueryClient()
  return useMutation({
    meta: { successMessage: 'Exam deleted', failureTitle: 'Could not delete the exam' },
    mutationFn: (examId: string) =>
      apiFetch<{ success: boolean; discardedDraftMarks: number }>(`/exams/${examId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.exams.all() }),
  })
}

// "Save Draft" on the marks sheet.
export function useEnterMarks(examId: string) {
  const qc = useQueryClient()
  return useMutation({
    meta: { successMessage: 'Draft saved', failureTitle: 'Could not save the draft' },
    mutationFn: (data: BulkMarkEntryInput) =>
      apiFetch<unknown[]>(`/exams/${examId}/marks`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.exams.all() })
      qc.invalidateQueries({ queryKey: queryKeys.exams.marks(examId) })
    },
  })
}

// RW-1: exam_officer / high_rank correct individual marks during review
// (finalized/approved, pre-release) via POST /exams/:id/correct-marks.
export function useCorrectMarks(examId: string) {
  const qc = useQueryClient()
  return useMutation({
    meta: {
      affectsRisk: true,   // refreshes student risk badges (see QueryProvider)
      successMessage: 'Corrections saved',
      failureTitle: 'Could not save the corrections',
    },
    mutationFn: (data: BulkMarkEntryInput) =>
      apiFetch<unknown[]>(`/exams/${examId}/correct-marks`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.exams.all() })
      qc.invalidateQueries({ queryKey: queryKeys.exams.marks(examId) })
    },
  })
}

export function useExamMarks(examId: string) {
  return useQuery({
    queryKey: queryKeys.exams.marks(examId),
    queryFn:  () => apiFetch<ApiExamMark[]>(`/exams/${examId}/marks`),
    enabled:  !!examId,
  })
}

// "Finalize Marks": the sheet as the teacher sees it is sent WITH the confirm
// request, so saving and confirming are one atomic server step. (Previously
// this was "save as final" followed by a second "finalize" call - if the
// first was rejected, the click appeared to do nothing at all.)
export function useFinalizeMarks() {
  const qc = useQueryClient()
  return useMutation({
    meta: { successMessage: 'Marks finalized and locked', failureTitle: 'Could not finalize the marks' },
    mutationFn: ({ examId, entries }: { examId: string; entries?: BulkMarkEntryInput['entries'] }) =>
      apiFetch<{ success: boolean }>(`/exams/${examId}/finalize`, {
        method: 'POST',
        body:   JSON.stringify(entries ? { entries } : {}),
      }),
    onSuccess: (_data, { examId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.exams.all() })
      qc.invalidateQueries({ queryKey: queryKeys.exams.marks(examId) })
    },
  })
}

export function useApproveResults() {
  const qc = useQueryClient()
  return useMutation({
    meta: { successMessage: 'Results approved', failureTitle: 'Could not approve the results' },
    mutationFn: (examId: string) => apiFetch<{ success: boolean }>(`/exams/${examId}/approve`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.exams.all() }),
  })
}

export function useReleaseResults() {
  const qc = useQueryClient()
  return useMutation({
    meta: {
      affectsRisk: true,   // refreshes student risk badges (see QueryProvider)
      successMessage: 'Results released to students',
      failureTitle: 'Could not release the results',
    },
    mutationFn: (examId: string) => apiFetch<{ success: boolean }>(`/exams/${examId}/release`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.exams.all() }),
  })
}

export function useStudentResults(studentId: string, academicYear: string, term: number) {
  return useQuery({
    queryKey: queryKeys.exams.termResults({ studentId, academicYear, term }),
    queryFn:  () => apiFetch<ApiTermResult | null>(`/exams/results/${studentId}?academicYear=${academicYear}&term=${term}`),
    enabled:  !!studentId,
    retry:    false, // never retry 403 fee gate
  })
}

// AN-1 (top/bottom, filters, tie-safe) + AN-3 (pass rate, grade distribution,
// at-risk). Oversight sees any class; teachers are scoped server-side.
export function useExamAnalytics(
  academicYear: string, term: number,
  opts: { classId?: string; form?: number; subject?: string; limit?: number } = {},
) {
  const params = new URLSearchParams({ academicYear, term: String(term) })
  if (opts.classId) params.set('classId', opts.classId)
  else if (opts.form) params.set('form', String(opts.form))
  if (opts.subject) params.set('subject', opts.subject)
  if (opts.limit)   params.set('limit', String(opts.limit))
  return useQuery({
    queryKey: ['exams', 'analytics', 'top-bottom', academicYear, term, opts.classId ?? '', opts.form ?? 0, opts.subject ?? '', opts.limit ?? 10],
    queryFn:  () => apiFetch<ApiExamAnalytics>(`/exams/analytics/top-bottom?${params.toString()}`),
    enabled:  !!academicYear && !!term,
  })
}

// A student's standing inside their own class: class top ten + best / average /
// lowest comparison, overall and per subject. Fee-gated like useStudentResults.
export function useStudentClassStanding(studentId: string, academicYear: string, term: number) {
  return useQuery({
    queryKey: ['exams', 'class-standing', studentId, academicYear, term],
    queryFn:  () => apiFetch<ApiStudentClassStanding | null>(
      `/exams/results/${studentId}/class-standing?academicYear=${academicYear}&term=${term}`,
    ),
    enabled:  !!studentId && !!academicYear && !!term,
    retry:    false, // never retry a 403 fee gate
  })
}

export function useClassAnalytics(classId: string, academicYear: string, term: number) {
  return useQuery({
    queryKey: queryKeys.exams.analytics.class(classId, academicYear, term),
    queryFn:  () => apiFetch<{
      totalStudents: number
      passRate: number
      classAverage: number
      top10: Array<{ studentId: string; average: number; grade: string; position: number | null }>
    } | null>(`/exams/analytics/class?classId=${classId}&academicYear=${academicYear}&term=${term}`),
    enabled:  !!classId,
  })
}

export function useManebRecords(academicYear: string) {
  return useQuery({
    queryKey: queryKeys.exams.manebRecords({ academicYear }),
    queryFn:  () => apiFetch<ApiManebRecord[]>(`/exams/maneb?academicYear=${academicYear}`),
  })
}

/** [R18] Bulk MANEB record import. Posts an array of records to
 *  POST /exams/maneb/bulk and returns { created, errors } for partial-success
 *  reporting. Invalidates the MANEB list on success. */
export interface BulkManebResult {
  created: ApiManebRecord[]
  errors:  Array<{ index: number; candidateNo: string; error: string }>
}

export function useBulkCreateManebRecords(academicYear: string) {
  const qc = useQueryClient()
  return useMutation({
    meta: { successMessage: 'MANEB records imported', failureTitle: 'Could not import the MANEB records' },
    mutationFn: (rows: CreateManebRecordInput[]) =>
      apiFetch<BulkManebResult>('/exams/maneb/bulk', { method: 'POST', body: JSON.stringify(rows) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.exams.manebRecords({ academicYear }) }),
    onError:   (err) => console.error('Failed to bulk-import MANEB records', err),
  })
}

// [PRODUCTION FIX 2026-07-28] POST /exams/maneb (individual) already
// existed and worked — only the bulk hook existed on the frontend, so the
// only entry path anyone actually had was bulk import, even for a single
// candidate.
export function useCreateManebRecord(academicYear: string) {
  const qc = useQueryClient()
  return useMutation({
    meta: { successMessage: 'MANEB record added', failureTitle: 'Could not add the MANEB record' },
    mutationFn: (data: CreateManebRecordInput) =>
      apiFetch<ApiManebRecord>('/exams/maneb', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.exams.manebRecords({ academicYear }) }),
    onError:   (err) => console.error('Failed to create MANEB record', err),
  })
}

export interface ReportCardGenerationResult {
  studentId:      string
  registrationNo: string
  fullName:       string
  fileId?:        string
  url?:           string
  error?:         string
}

// SR-3: a student generates + downloads their OWN report card.
export function useGenerateMyReportCard() {
  return useMutation({
    meta: { feedback: 'manual' },
    mutationFn: (vars: { academicYear: string; term: number }) =>
      apiFetch<ReportCardGenerationResult>('/exams/report-card/mine', {
        method: 'POST', body: JSON.stringify(vars),
      }),
    onError: (err) => console.error('[useGenerateMyReportCard] failed:', err),
  })
}

export function useGenerateReportCard() {
  return useMutation({
    meta: { feedback: 'manual' },
    mutationFn: ({ studentId, academicYear, term }: { studentId: string; academicYear: string; term: number }) =>
      apiFetch<ReportCardGenerationResult>('/exams/report-card', {
        method: 'POST',
        // [Issue 6] One key per click: a retried generation replays the first result.
        headers: { 'Idempotency-Key': newIdempotencyKey() },
        body:   JSON.stringify({ studentId, academicYear, term }),
      }),
  })
}

export function useReportCardData(studentId: string, academicYear: string, term: number) {
  return useQuery({
    queryKey: ['exams', 'report-card', 'data', studentId, academicYear, term],
    queryFn:  () =>
      apiFetch<ReportCardData>(`/exams/report-card/${studentId}/data?academicYear=${academicYear}&term=${term}`),
    enabled:  !!studentId && !!academicYear && !!term,
    retry:    false, // never retry a 403 fee gate
  })
}
