'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAuth } from 'firebase/auth'
import { formatDistanceToNow } from 'date-fns'
import { StickyNote, Send, Loader2 } from 'lucide-react'

interface InvoiceNote {
  id: string
  body: string
  authorUid: string
  createdAt: string
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = await getAuth().currentUser?.getIdToken()
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers ?? {}),
    },
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export function InvoiceNotes({ invoiceId }: { invoiceId: string }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState('')

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['invoice-notes', invoiceId],
    queryFn: () => apiFetch<InvoiceNote[]>(`/finances/invoices/${invoiceId}/notes`),
  })

  const { mutate: addNote, isPending } = useMutation({
    mutationFn: (body: string) =>
      apiFetch<InvoiceNote>(`/finances/invoices/${invoiceId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => {
      setDraft('')
      void qc.invalidateQueries({ queryKey: ['invoice-notes', invoiceId] })
    },
  })

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <StickyNote className="w-4 h-4 text-brand-amber" />
        <p className="font-heading font-semibold text-sm text-brand-navy">Transaction Notes</p>
      </div>

      {isLoading ? (
        <div className="skeleton h-10 rounded" />
      ) : notes.length === 0 ? (
        <p className="text-xs text-muted">No notes yet. Add one below.</p>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <div key={note.id} className="bg-white rounded-lg px-3 py-2 border border-amber-100">
              <p className="text-sm text-body">{note.body}</p>
              <p className="text-xs text-muted mt-1">
                {note.authorUid.slice(0, 8)} ·{' '}
                {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a note…"
          className="flex-1 border border-amber-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-amber/30"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) addNote(draft.trim())
          }}
        />
        <button
          onClick={() => {
            if (draft.trim()) addNote(draft.trim())
          }}
          disabled={isPending || !draft.trim()}
          aria-label="Add note"
          className="bg-brand-amber text-white p-2 rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors"
          type="button"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}
