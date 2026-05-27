'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAuth } from 'firebase/auth'
import type { ApiExam, ApiTermResult, ApiManebRecord } from '@shared/types/api'
import type { CreateExamInput, BulkMarkEntryInput } from '@shared/schemas/exam'

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = await getAuth().currentUser?.getIdToken()
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token ?? ''}`,
      ...(opts?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(e.error ?? `API error ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const examKeys = {
  all:       ()                              => ['exams'] as const,
  list:      (f: object)                    => ['exams', 'list', f] as const,
  results:   (sid: string, y: string, t: number) => ['exams', 'results', sid, y, t] as const,
  analytics: (cid: string, y: string, t: number) => ['exams', 'analytics', cid, y, t] as const,
  maneb:     (y: string)                    => ['exams', 'maneb', y] as const,
}

export function useExams(classId: string, academicYear: string, term: number) {
  return useQuery({
    queryKey: examKeys.list({ classId, academicYear, term }),
    queryFn:  () => apiFetch<ApiExam[]>(`/exams?classId=${classId}&academicYear=${academicYear}&term=${term}`),
    enabled:  !!classId,
  })
}

export function useCreateExam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateExamInput) =>
      apiFetch<ApiExam>('/exams', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: examKeys.all() }),
  })
}

export function useEnterMarks(examId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: BulkMarkEntryInput) =>
      apiFetch<unknown[]>(`/exams/${examId}/marks`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: examKeys.all() }),
  })
}

export function useFinalizeMarks() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (examId: string) => apiFetch<{ success: boolean }>(`/exams/${examId}/finalize`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: examKeys.all() }),
  })
}

export function useApproveResults() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (examId: string) => apiFetch<{ success: boolean }>(`/exams/${examId}/approve`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: examKeys.all() }),
  })
}

export function useReleaseResults() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (examId: string) => apiFetch<{ success: boolean }>(`/exams/${examId}/release`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: examKeys.all() }),
  })
}

export function useStudentResults(studentId: string, academicYear: string, term: number) {
  return useQuery({
    queryKey: examKeys.results(studentId, academicYear, term),
    queryFn:  () => apiFetch<ApiTermResult | null>(`/exams/results/${studentId}?academicYear=${academicYear}&term=${term}`),
    enabled:  !!studentId,
    retry:    false, // never retry 403 fee gate
  })
}

export function useClassAnalytics(classId: string, academicYear: string, term: number) {
  return useQuery({
    queryKey: examKeys.analytics(classId, academicYear, term),
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
    queryKey: examKeys.maneb(academicYear),
    queryFn:  () => apiFetch<ApiManebRecord[]>(`/exams/maneb?academicYear=${academicYear}`),
  })
}

export function useGenerateReportCard() {
  return useMutation({
    mutationFn: ({ studentId, academicYear, term }: { studentId: string; academicYear: string; term: number }) =>
      apiFetch<{ fileId: string; url: string }>('/exams/report-card', {
        method: 'POST',
        body:   JSON.stringify({ studentId, academicYear, term }),
      }),
  })
}