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
  secret:    string
  userId:    string
  endpoint:  string
  projectId: string
  bucketId:  string
  fileId:    string
}

/**
 * @param ticketPath - route-relative path (passed to apiFetch) that mints
 *   the upload credential, e.g. '/gallery/upload-ticket'.
 * @param file - the File the user picked.
 * @returns the Appwrite fileId to attach to the follow-up metadata call.
 */
export async function uploadFileDirectly(ticketPath: string, file: File): Promise<string> {
  const ticket = await apiFetch<DirectUploadTicket>(ticketPath, { method: 'POST' })

  const client = new Client().setEndpoint(ticket.endpoint).setProject(ticket.projectId)
  await new Account(client).createSession(ticket.userId, ticket.secret)
  await new Storage(client).createFile(ticket.bucketId, ticket.fileId, file)

  return ticket.fileId
}