/**
 * [FILE]: apps/web/src/components/classes/assignments/AssignmentBody.tsx
 * [PURPOSE]: Read-only view of one assignment: when it is due, the marking note, the
 *   content and requirements (server-sanitised rich text, formulas drawn by KaTeX) and
 *   the attachments. Pictures open in a new tab; documents download through the
 *   authorised file proxy (the viewer must belong to the class).
 */
import { Award, CalendarClock, Download, FileText } from 'lucide-react'
import type { ApiAssignmentDetail } from '@shared/types/api'
import { RichContent } from '@/components/shared/RichTextEditor'
import { downloadAssignmentAttachment } from '@/hooks/useClasses'
import { notifyError } from '@/lib/feedback'
import { dueLabel, formatBytes, formatDay } from './assignmentFormat'
import { schoolDayOf } from '@shared/utils/assignment'

const SECTION_TITLE = 'mb-1.5 font-heading text-xs font-bold uppercase tracking-wider text-muted'

export function AssignmentBody({ d }: { d: ApiAssignmentDetail }) {
  const due = dueLabel(d.dueDate)
  const images = d.attachments.filter((a) => a.kind === 'IMAGE')
  const files = d.attachments.filter((a) => a.kind === 'FILE')
  const edited = d.updatedAt && Date.parse(d.updatedAt) - Date.parse(d.createdAt) > 60_000

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        <span className={`inline-flex items-center gap-1 font-medium ${due.overdue ? 'text-status-danger' : 'text-status-info'}`}>
          <CalendarClock className="h-3.5 w-3.5" aria-hidden /> {due.text}
        </span>
        {d.createdByName && <span className="text-muted">Posted by {d.createdByName} · {formatDay(schoolDayOf(d.createdAt))}</span>}
        {edited && <span className="text-muted">Edited {formatDay(schoolDayOf(d.updatedAt))}</span>}
      </div>

      {d.marksEnabled && (
        <p className="flex items-start gap-2 rounded-xl border border-base bg-page px-3 py-2 text-xs text-muted">
          <Award className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Marked out of {d.maxMarks}. These are session marks to check that students are keeping up they do not count toward exam results or C.A.
        </p>
      )}

      <section aria-label="Content">
        <h4 className={SECTION_TITLE}>Content</h4>
        <RichContent html={d.description} />
      </section>

      {d.requirements && (
        <section aria-label="Requirements">
          <h4 className={SECTION_TITLE}>Requirements</h4>
          <RichContent html={d.requirements} />
        </section>
      )}

      {d.attachments.length > 0 && (
        <section aria-label="Attachments">
          <h4 className={SECTION_TITLE}>Attachments</h4>
          {images.length > 0 && (
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {images.map((img) => (
                <a key={img.id} href={img.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border border-base" title={img.fileName}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- remote storage URL, not optimised by next/image */}
                  <img src={img.url} alt={img.fileName} className="h-32 w-full object-cover" loading="lazy" />
                </a>
              ))}
            </div>
          )}
          {files.length > 0 && (
            <ul className="space-y-1.5">
              {files.map((f) => (
                <li key={f.id} className="flex items-center gap-2 rounded-lg border border-base bg-page px-3 py-2 text-sm">
                  <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block break-all">{f.fileName}</span>
                    <span className="block text-xs text-muted">{formatBytes(f.sizeBytes)}</span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Download ${f.fileName}`}
                    onClick={() => void downloadAssignmentAttachment(f.url, f.fileName).catch((e) => notifyError('Could not download the file', e))}
                    className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-base px-3 text-xs font-semibold text-tone-teal hover:bg-surface"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden /> Download
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
