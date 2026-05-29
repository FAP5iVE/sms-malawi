'use client'
import { useQuery } from '@tanstack/react-query'
import { getAuth } from 'firebase/auth'

async function apiFetch<T>(path: string): Promise<T> {
  const token = await getAuth().currentUser?.getIdToken()
  const res = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `API error ${res.status}`)
  return res.json() as Promise<T>
}

export function useAdminReport()  { return useQuery({ queryKey: ['reports','admin'],   queryFn: () => apiFetch('/reports/admin') }) }
export function useSchoolReport(y: string, t: number)  { return useQuery({ queryKey: ['reports','school',y,t], queryFn: () => apiFetch(`/reports/school?academicYear=${y}&term=${t}`) }) }
export function useFinanceReport(y: string, t?: number){ return useQuery({ queryKey: ['reports','finance',y,t], queryFn: () => apiFetch(`/reports/finance?academicYear=${y}${t ? `&term=${t}` : ''}`) }) }
export function useLibraryReport() { return useQuery({ queryKey: ['reports','library'],  queryFn: () => apiFetch('/reports/library') }) }
export function useHRReport()       { return useQuery({ queryKey: ['reports','hr'],       queryFn: () => apiFetch('/reports/hr') }) }
export function useAcademicReport(y: string) { return useQuery({ queryKey: ['reports','academic',y], queryFn: () => apiFetch(`/reports/academic?academicYear=${y}`) }) }
export function useExamOfficerReport(y: string, t: number) { return useQuery({ queryKey: ['reports','exam_officer',y,t], queryFn: () => apiFetch(`/reports/exam-officer?academicYear=${y}&term=${t}`) }) }
export function useStudentReport(id: string) { return useQuery({ queryKey: ['reports','student',id], queryFn: () => apiFetch(`/reports/student?studentId=${id}`), enabled: !!id }) }

export function useAuditLog(filters: {
  entityType?: string; actorUid?: string; action?: string; from?: string; to?: string; page?: number
} = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => { if (v !== undefined) params.set(k, String(v)) })
  return useQuery({ queryKey: ['reports','audit',filters], queryFn: () => apiFetch(`/reports/audit?${params}`) })
}

export function useSystemHealth() { return useQuery({ queryKey: ['health'], queryFn: () => apiFetch('/health'), refetchInterval: 60_000 }) }
