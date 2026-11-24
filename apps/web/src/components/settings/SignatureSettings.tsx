'use client'

/*
 * apps/web/src/components/settings/SignatureSettings.tsx: phase 17 (digital signature)
 * "My signature" for staff: upload once, see it as it will print, replace or remove it. The head or an
 * administrator also gets the school-wide switch. The image is never shown again after saving because the
 * server never sends it back; only the document PDFs carry it.
 */
import { useEffect, useRef, useState } from 'react'
import { Loader2, Upload, Trash2 } from 'lucide-react'
import { StatusText } from '@/components/shared/StatusText'
import { useAuthStore } from '@/store/authStore'
import { useRemoveSignature, useSaveSignature, useSetUseSignatures, useSignatureStatus } from '@/hooks/useSignature'
import { SIGNATURE_MAX_BYTES, SIGNATURE_TYPES, signatureProblem } from '@shared/constants/signature'

/** Roles that produce or approve documents. Students and parents have no signature. */
const SIGNER_ROLES = ['admin', 'high_rank', 'finance', 'academic', 'hr', 'exam_officer', 'lower_rank', 'library'] as const
const SWITCH_ROLES = ['admin', 'high_rank'] as const

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso))
}

function readSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('That file could not be read as an image.'))
    img.src = url
  })
}

export function SignatureSettings() {
  const role = useAuthStore((s) => s.role)
  const isSigner = !!role && (SIGNER_ROLES as readonly string[]).includes(role)
  const canSwitch = !!role && (SWITCH_ROLES as readonly string[]).includes(role)
  const { data: status } = useSignatureStatus(isSigner)
  const save = useSaveSignature()
  const remove = useRemoveSignature()
  const setSwitch = useSetUseSignatures()
  const input = useRef<HTMLInputElement>(null)
  const [picked, setPicked] = useState<{ file: File; url: string } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  // Free the preview's memory when it is replaced or the screen closes.
  useEffect(() => () => { if (picked) URL.revokeObjectURL(picked.url) }, [picked])

  if (!isSigner || !status) return null

  async function choose(file: File | undefined) {
    if (!file) return
    setProblem(null)
    if (!(SIGNATURE_TYPES as readonly string[]).includes(file.type)) { setProblem('Use a PNG or JPG image.'); return }
    const url = URL.createObjectURL(file)
    try {
      const { width, height } = await readSize(url)
      const bad = signatureProblem({ bytes: file.size, width, height })
      if (bad) { URL.revokeObjectURL(url); setProblem(bad); return }
      setPicked({ file, url })
    } catch (err) {
      URL.revokeObjectURL(url)
      setProblem(err instanceof Error ? err.message : 'That file could not be read as an image.')
    }
  }

  function submit() {
    if (!picked) return
    save.mutate(picked.file, { onSuccess: () => { setPicked(null); if (input.current) input.current.value = '' } })
  }

  const btn = 'min-h-11 px-5 rounded-xl text-sm font-heading font-semibold flex items-center gap-2 disabled:opacity-60'

  return (
    <section className="pt-4 border-t border-base space-y-4" aria-labelledby="my-signature-heading">
      <div>
        <h3 id="my-signature-heading" className="font-heading font-semibold text-sm text-body">My signature</h3>
        <p className="text-xs text-muted mt-0.5 max-w-prose">
          Upload a picture of your signature once. It prints above your name on the report cards you approve, the receipts and payslips
          you issue, and the transcripts you certify. It is a picture of your signature, not a legal electronic signature.
        </p>
      </div>

      {!picked && (
        <p className="text-sm text-body">
          {status.hasSignature && status.updatedAt
            ? <>Saved on {fmtDate(status.updatedAt)}. Upload a new picture to replace it.</>
            : <>You have not added a signature yet. Documents keep a blank line for you.</>}
        </p>
      )}

      {picked && (
        <div>
          <p className="text-xs font-heading font-semibold text-muted mb-1.5">How it will print</p>
          <div className="bg-white rounded-xl px-4 pt-3 pb-2 max-w-xs">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file */}
            <img src={picked.url} alt="Your signature, as it will print" className="h-16 w-auto max-w-full object-contain object-left-bottom" />
            <div className="h-px bg-neutral-400 mt-1" />
            <p className="text-[11px] text-neutral-600 mt-1">Your name</p>
          </div>
        </div>
      )}

      {problem && <p className="text-sm text-tone-coral" role="alert">{problem}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={input}
          type="file"
          accept={SIGNATURE_TYPES.join(',')}
          className="sr-only"
          id="signature-file"
          onChange={(e) => { void choose(e.target.files?.[0]) }}
        />
        {picked ? (
          <>
            <button type="button" onClick={submit} disabled={save.isPending} className={`${btn} bg-brand-deep text-white hover:brightness-110`}>
              {save.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Save signature'}
            </button>
            <button type="button" onClick={() => { setPicked(null); if (input.current) input.current.value = '' }} className={`${btn} border border-base text-muted hover:bg-page hover:text-body`}>
              Choose another
            </button>
          </>
        ) : (
          <label htmlFor="signature-file" className={`${btn} cursor-pointer border border-base text-body hover:bg-page`}>
            <Upload className="w-4 h-4" /> {status.hasSignature ? 'Replace signature' : 'Upload signature'}
          </label>
        )}
        {status.hasSignature && !picked && (
          <button type="button" onClick={() => remove.mutate()} disabled={remove.isPending} className={`${btn} text-tone-coral hover:bg-page`}>
            {remove.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Remove signature
          </button>
        )}
      </div>
      <p className="text-xs text-muted">PNG or JPG, wider than it is tall, up to {SIGNATURE_MAX_BYTES / 1024} KB. A dark signature on a white or clear background works best.</p>

      {canSwitch && (
        <div className="pt-3 space-y-1">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={status.useOnDocuments}
              disabled={setSwitch.isPending}
              onChange={(e) => setSwitch.mutate(e.target.checked)}
            />
            <span>
              <span className="block text-sm font-heading font-semibold text-body">Print signatures on documents</span>
              <span className="block text-xs text-muted">
                Turn this off and every document goes back to a blank signature line. Documents already issued do not change.
              </span>
            </span>
          </label>
          {!status.useOnDocuments && <StatusText tone="warning" size="md">Signatures are switched off for the whole school.</StatusText>}
        </div>
      )}
    </section>
  )
}
