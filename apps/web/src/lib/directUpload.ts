/**
 * [NEW FILE]
 * [PURPOSE]: Shared helper for uploading a file straight to Appwrite,
 *   bypassing this app's own API/Vercel function entirely for the actual
 *   bytes.
 *
 *   Every upload that used to go through our own API as multipart/
 *   form-data (gallery photos, announcement images, leadership photos,
 *   library resources, ...) was subject to two hard limits neither multer
 *   config nor Express config can move:
 *     - Vercel Functions cap a request body at 4.5MB, full stop, before
 *       our own route code even runs (413: FUNCTION_PAYLOAD_TOO_LARGE).
 *     - Below that cap, a single giant request has no retry if the
 *       connection drops mid-upload — the "Request aborted" seen in
 *       production logs for the gallery/leadership-photo routes.
 *   Appwrite's client SDK uploads large files in chunks with built-in
 *   per-chunk retry, and talks to Appwrite's servers directly — neither
 *   limit applies once the bytes never pass through our Vercel function.
 *
 *   The flow:
 *     1. Ask our own API for a short-lived, single-purpose upload
 *        credential (an "upload-ticket" route — Firebase-authenticated
 *        and role-checked exactly like the old multipart route was).
 *     2. Exchange that credential for an Appwrite session.
 *     3. Upload the file straight to Appwrite with that session.
 *     4. Hand the resulting fileId to whichever of our own routes records
 *        the upload's metadata (e.g. POST /gallery with { fileId, caption }).
 *   See lib/storage.ts's createDirectUploadTicket() for the server side of
 *   this and the Appwrite Console setup it depends on.
 * [DEPENDS ON]: W/lib/api-client.ts (apiFetch), the 'appwrite' package
 */
'use client'

import { Client, Account, Storage } from 'appwrite'
import { apiFetch } from '@/lib/api-client'

interface DirectUploadTicket {
  secret:          string
  userId:          string
  endpoint:        string
  projectId:       string
  bucketId:        string
  fileId:          string
  filePermissions: string[]
}

/**
 * @param ticketPath - route-relative path (passed to apiFetch) that mints
 *   the upload credential, e.g. '/gallery/upload-ticket'.
 * @param file - the File the user picked.
 * @returns the Appwrite fileId to attach to the follow-up metadata call.
 */
export async function uploadFileDirectly(ticketPath: string, file: File): Promise<string> {
  const { fileId } = await uploadFileDirectlyInternal(ticketPath, file)
  return fileId
}

/**
 * [NEW] Same upload as uploadFileDirectly(), but also returns a ready-to-use
 * public view URL — for inline images embedded directly in RichTextEditor
 * body HTML (`<img src="...">`), which (unlike a cover-image imageKey
 * stored in its own field) needs a real URL at insert time, not just a
 * file ID to resolve later.
 *
 * The URL is built client-side from the ticket's own endpoint/projectId/
 * bucketId — no extra server round-trip — using the exact same format
 * lib/storage.ts's getPublicViewUrl() constructs server-side:
 *   `${endpoint}/storage/buckets/${bucketId}/files/${fileId}/view?project=${projectId}`
 * Only ever call this with a ticketPath whose FILE_PREFIX is in
 * storage.ts's PUBLIC_FILE_PREFIXES (e.g. '/announcements/image/upload-ticket')
 * — anything else would produce a URL that 403s for anonymous visitors.
 */
export async function uploadFileDirectlyWithUrl(
  ticketPath: string,
  file: File
): Promise<{ fileId: string; url: string }> {
  const { fileId, ticket } = await uploadFileDirectlyInternal(ticketPath, file)
  const url = `${ticket.endpoint}/storage/buckets/${ticket.bucketId}/files/${encodeURIComponent(fileId)}/view?project=${ticket.projectId}`
  return { fileId, url }
}

async function uploadFileDirectlyInternal(
  ticketPath: string,
  file: File
): Promise<{ fileId: string; ticket: DirectUploadTicket }> {
  const ticket = await apiFetch<DirectUploadTicket>(ticketPath, { method: 'POST' })

  const client  = new Client().setEndpoint(ticket.endpoint).setProject(ticket.projectId)
  const account = new Account(client)

  // [PRODUCTION FIX] "Creation of a session is prohibited when a session is
  // active" — the browser keeps this project's session as a cookie, so it
  // survives across separate calls to this function. The first upload in a
  // browser worked; every one after it failed here, because a session from
  // the previous upload was still sitting there when this one tried to
  // create a new one. Clear it first (a no-op, safely ignored, on the very
  // first upload where none exists yet).
  try {
    await account.deleteSession('current')
  } catch {
    // No existing session to clear — expected on the first upload.
  }
  await account.createSession(ticket.userId, ticket.secret)

  try {
    // filePermissions is decided server-side, per upload prefix — see
    // storage.ts's createDirectUploadTicket(). Public assets (gallery,
    // announcements, leadership photos) get read("any") here so anonymous
    // visitors can actually load the image; anything else gets none, same
    // as before.
    await new Storage(client).createFile(ticket.bucketId, ticket.fileId, file, ticket.filePermissions)
  } finally {
    // Don't leave this session sitting in the browser until the next
    // upload — clear it as soon as this one is done, success or failure.
    await account.deleteSession('current').catch(() => {})
  }

  return { fileId: ticket.fileId, ticket }
}