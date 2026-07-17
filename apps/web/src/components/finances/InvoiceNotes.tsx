/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/components/finances/InvoiceNotes.tsx
 * [R-PHASE]: R9 — Finance I: Invoicing, Fees & the Accounting Ledger
 *   Reconnection (originally R1 — API Client & Query-Key Singleton
 *   Consolidation)
 * [PURPOSE]: Replaced `note.authorUid.slice(0,8)` with the note's joined
 *   author name (ApiInvoiceNote.author, sourced the same way as
 *   InvoicesTab.tsx's "Student" column — a real display name instead of a
 *   raw truncated ID). Switched the local `InvoiceNote` interface for the
 *   shared `ApiInvoiceNote` type now that the route returns a joined
 *   `author` field.
 * [DEPENDS ON]: W/lib/api-client.ts; finances.ts's GET /invoices/:id/notes
 *   (this phase's author-join addition)
 */
'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { StickyNote, Send, Loader2 } from 'lucide-react'
import { apiFetch, queryKeys } from '@/lib/api-client'
import type { ApiInvoiceNote } from '@shared/types/api'

export function InvoiceNotes({ invoiceId }: { invoiceId: string }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState('')

  const { data: notes = [], isLoading } = useQuery({
    queryKey: queryKeys.finances.invoiceNotes(invoiceId),
    queryFn: () => apiFetch<ApiInvoiceNote[]>(`/finances/invoices/${invoiceId}/notes`),
  })

  const { mutate: addNote, isPending } = useMutation({
    mutationFn: (body: string) =>
      apiFetch<ApiInvoiceNote>(`/finances/invoices/${invoiceId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => {
      setDraft('')
      void qc.invalidateQueries({ queryKey: queryKeys.finances.invoiceNotes(invoiceId) })
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
                {note.author ? `${note.author.firstName} ${note.author.lastName}` : 'Staff member'}{' '}
                ·{' '}
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
