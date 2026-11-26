/**
 * [FILE]: apps/web/src/lib/directUpload.ts
 * [PURPOSE]: Shared helper for uploading a file straight to Cloudflare R2,
 *   bypassing this app's own API/Vercel function for the actual bytes.
 *
 *   An upload that went through our own API as multipart/form-data would hit two
 *   hard limits:
 *     - Vercel Functions cap a request body at 4.5MB, before our route code runs.
 *     - A single giant request has no retry if the connection drops mid-upload.
 *
 *   The flow:
 *     1. Ask our own API for an upload ticket (an "upload-ticket" route —
 *        Firebase-authenticated and role-checked). The request names the file's
 *        name, type and size; the server validates them against that category's
 *        upload policy and returns a presigned PUT URL plus the exact headers
 *        that must accompany it.
 *     2. PUT the file to that URL (retried on network failures / 5xx).
 *     3. Hand the resulting fileId to whichever of our own routes records the
 *        upload's metadata (e.g. POST /gallery with { fileId, caption }).
 *   See lib/storage.ts's createDirectUploadTicket() for the server side.
 * [DEPENDS ON]: W/lib/api-client.ts (apiFetch)
 */
'use client'

import { apiFetch } from '@/lib/api-client'

interface DirectUploadTicket {
  method:           'PUT'
  uploadUrl:        string
  headers:          Record<string, string>
  fileId:           string
  expiresInSeconds: number
  publicUrl:        string | null
}

const MAX_ATTEMPTS = 3
const RETRY_BASE_MS = 800

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * @param ticketPath - route-relative path (passed to apiFetch) that mints
 *   the upload ticket, e.g. '/gallery/upload-ticket'.
 * @param file - the File the user picked.
 * @returns the file id to attach to the follow-up metadata call.
 */
export async function uploadFileDirectly(ticketPath: string, file: File): Promise<string> {
  const { fileId } = await uploadFileDirectlyInternal(ticketPath, file)
  return fileId
}

/**
 * Same upload as uploadFileDirectly(), but also returns the file's public URL —
 * for inline images embedded directly in RichTextEditor body HTML
 * (`<img src="...">`), which (unlike a cover-image key stored in its own field)
 * needs a real URL at insert time, not just a file id to resolve later.
 *
 * Only ever call this with a ticketPath whose FILE_PREFIX is in storage.ts's
 * PUBLIC_FILE_PREFIXES (e.g. '/announcements/image/upload-ticket') — private
 * categories have no public URL and this throws for them.
 */
export async function uploadFileDirectlyWithUrl(
  ticketPath: string,
  file: File
): Promise<{ fileId: string; url: string }> {
  const { fileId, ticket } = await uploadFileDirectlyInternal(ticketPath, file)
  if (!ticket.publicUrl) throw new Error('This upload has no public URL.')
  return { fileId, url: ticket.publicUrl }
}

async function putWithRetry(ticket: DirectUploadTicket, file: File): Promise<void> {
  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(ticket.uploadUrl, { method: ticket.method, headers: ticket.headers, body: file })
      if (res.ok) return
      // 4xx (expired/forbidden/size mismatch) will not succeed on retry.
      if (res.status < 500) throw new Error(`Upload was refused (${res.status}). Please try again.`)
      lastError = new Error(`Upload failed (${res.status}).`)
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Upload was refused')) throw err
      lastError = err
    }
    if (attempt < MAX_ATTEMPTS) await wait(RETRY_BASE_MS * 2 ** (attempt - 1))
  }
  throw lastError instanceof Error && lastError.message.startsWith('Upload failed')
    ? lastError
    : new Error('Could not upload the file. Check your connection and try again.')
}

async function uploadFileDirectlyInternal(
  ticketPath: string,
  file: File
): Promise<{ fileId: string; ticket: DirectUploadTicket }> {
  const ticket = await apiFetch<DirectUploadTicket>(ticketPath, {
    method: 'POST',
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      size: file.size,
    }),
  })
  await putWithRetry(ticket, file)
  return { fileId: ticket.fileId, ticket }
}
