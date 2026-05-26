'use client'

import { useState, useEffect } from 'react'
import { doc, onSnapshot, setDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuthStore } from '@/store/authStore'
import { CheckCircle, XCircle } from 'lucide-react'
import { format } from 'date-fns'

interface Student {
  id: string
  firstName: string
  lastName: string
}

interface AttendanceSheetProps {
  classId: string
  students: Student[]
  date?: Date
}

type AttendanceRecord = Record<string, 'PRESENT' | 'ABSENT'>

export function AttendanceSheet({ classId, students, date = new Date() }: AttendanceSheetProps) {
  const { user } = useAuthStore()
  const dateStr = format(date, 'yyyy-MM-dd')
  const docPath = `attendance/${classId}/records/${dateStr}`

  const [record, setRecord] = useState<AttendanceRecord>({})
  const [saving, setSaving] = useState(false)

  // Real-time listener for today's attendance
  useEffect(() => {
    const ref = doc(db!, docPath)
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        const rec: AttendanceRecord = {}
        students.forEach((s) => {
          rec[s.id] = data[s.id] ?? 'ABSENT'
        })
        setRecord(rec)
      }
    })
    return unsub
  }, [docPath, students])

  async function toggle(studentId: string) {
    const current = record[studentId] ?? 'ABSENT'
    const next =( current === 'PRESENT' ? 'ABSENT' : 'PRESENT') as 'PRESENT' | 'ABSENT'
    const newRecord = { ...record, [studentId]: next }
    setRecord(newRecord)

    setSaving(true)
    await setDoc(
      doc(db!, docPath),
      {
        ...newRecord,
        markedByUid: user?.uid,
        markedAt: Timestamp.now(),
        classId,
        date: dateStr,
      },
      { merge: true }
    )
    setSaving(false)
  }

  const presentCount = Object.values(record).filter((v) => v === 'PRESENT').length

  return (
    <div className="bg-surface border border-base rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-base">
        <p className="font-heading font-semibold text-sm text-brand-navy">
          Attendance — {format(date, 'dd MMM yyyy')}
        </p>
        <p className="text-xs text-muted">
          {presentCount} / {students.length} present
          {saving && ' · saving…'}
        </p>
      </div>
      <div className="divide-y divide-base">
        {students.map((student) => {
          const status = record[student.id] ?? 'ABSENT'
          const present = status === 'PRESENT'
          return (
            <div
              key={student.id}
              className="flex items-center justify-between px-5 py-2.5 hover:bg-page transition-colors"
            >
              <p className="text-sm font-medium">
                {student.firstName} {student.lastName}
              </p>
              <button
                onClick={() => toggle(student.id)}
                aria-label={`Mark ${student.firstName} as ${present ? 'absent' : 'present'}`}
                className="flex items-center gap-1.5 text-sm font-medium transition-colors"
              >
                {present ? (
                  <>
                    <CheckCircle className="w-5 h-5 text-emerald-500" />
                    <span className="text-emerald-600">Present</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-5 h-5 text-brand-coral/60" />
                    <span className="text-muted">Absent</span>
                  </>
                )}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
