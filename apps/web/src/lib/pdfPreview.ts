/**
 * apps/web/src/lib/pdfPreview.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: One shared way to open a stored PDF in the browser's own PDF
 *   viewer, so the user can read it first and then download or print it with
 *   the browser's controls.
 *
 *   Before this file, every screen hand-rolled its own `window.open(url)`:
 *   report cards (ReportCardGenerator), payslips (usePayroll), payment
 *   receipts (InvoicesTab / StudentPortalStatementTab) and expense receipts
 *   (useFinances). Only the first of those knew that /api/files/[fileId]
 *   needs the caller's Firebase ID token in `?token=` (a plain browser
 *   navigation cannot send an Authorization header — see verifyAuth.ts), so
 *   the others opened a tab that answered 401. ReportCardGenerator also had a
 *   second action that forced a download with the `download` attribute.
 *
 *   The server side needs no change: /api/files/[fileId] already replies with
 *   `Content-Type: application/pdf` and `Content-Disposition: inline`, and
 *   it still performs the same token check and canReadFile() ownership/role
 *   check as before. This file only standardises how the client opens it.
 *
 *   Not for Library digital resources. Those are deliberately view-only and
 *   are rendered by DigitalResourceViewer.tsx (PDF.js on a canvas, no
 *   download control). openPdfPreview() refuses their file categories so it
 *   can never be used to bypass that viewer.
 * [DEPENDS ON]: firebase/auth; the /api/files/[fileId] proxy route
 */
'use client'

import { getAuth } from 'firebase/auth'

/** Same-origin path of the authenticated file proxy (app/api/files/[fileId]). */
const FILE_PROXY_PATH = '/api/files/'

/**
 * File-ID prefixes owned by the Library's protected viewer (storage.ts:
 * FILE_PREFIX.DIGITAL_RESOURCE / EBOOK / PAST_PAPER). Duplicated here as
 * plain strings on purpose — importing storage.ts would pull the server-only
 * Appwrite SDK into the client bundle.
 */
const LIBRARY_PROTECTED_PREFIXES = ['digital_resource_', 'ebook_', 'past_paper_'] as const

/** A failure with a message that is safe to show to the user. */
export class PdfPreviewError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PdfPreviewError'
  }
}

/** A URL, or a function that produces one (e.g. after asking the API for it). */
export type PdfPreviewSource = string | (() => string | Promise<string>)

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * Pure helper: validates a proxy URL and returns the absolute URL to navigate
 * to, with the caller's ID token attached as `?token=`.
 *
 * Throws PdfPreviewError when the URL is not a same-origin /api/files/<id>
 * path, or when it points at a Library-protected resource.
 */
export function buildPdfPreviewUrl(rawUrl: string, token: string, origin: string): string {
  let parsed: URL
  try {
    parsed = new URL(rawUrl, origin)
  } catch {
    throw new PdfPreviewError('This document link is not valid.')
  }

  if (parsed.origin !== origin || !parsed.pathname.startsWith(FILE_PROXY_PATH)) {
    throw new PdfPreviewError('This document cannot be opened in the preview.')
  }

  const fileId = safeDecode(parsed.pathname.slice(FILE_PROXY_PATH.length)).toLowerCase()
  if (!fileId || fileId.includes('/') || fileId.includes('\\')) {
    throw new PdfPreviewError('This document link is not valid.')
  }
  if (LIBRARY_PROTECTED_PREFIXES.some((prefix) => fileId.startsWith(prefix))) {
    throw new PdfPreviewError('This resource is view-only and cannot be opened as a document.')
  }

  parsed.searchParams.set('token', token)
  return parsed.toString()
}

/**
 * Opens a stored PDF in a new browser tab, in the browser's native viewer.
 *
 * Call it directly from a click handler (or from a mutationFn started by one).
 * It opens the tab immediately, while the click is still fresh, and only then
 * resolves the URL — so pop-up blockers (Safari in particular) do not treat
 * the tab as unsolicited, even when the URL needs an API round-trip first.
 *
 * Rejects with a PdfPreviewError (message safe to show) if the session is gone,
 * the URL is not an allowed proxy path, or the browser blocks the new tab.
 * The empty tab is closed on any failure.
 */
export async function openPdfPreview(source: PdfPreviewSource): Promise<void> {
  const tab = window.open('', '_blank')
  if (tab) {
    try {
      tab.opener = null
      tab.document.title = 'Opening document…'
      tab.document.body.style.fontFamily = 'system-ui, sans-serif'
      tab.document.body.style.padding = '24px'
      tab.document.body.textContent = 'Opening document…'
    } catch {
      // Cosmetic only — never let it block the navigation below.
    }
  }

  try {
    const rawUrl = typeof source === 'function' ? await source() : source

    const user = getAuth().currentUser
    if (!user) throw new PdfPreviewError('Your session has expired. Please sign in again.')
    const token = await user.getIdToken()

    const target = buildPdfPreviewUrl(rawUrl, token, window.location.origin)

    if (tab && !tab.closed) {
      tab.location.replace(target)
      return
    }

    // The placeholder tab was blocked or closed — one best-effort attempt.
    const fallback = window.open(target, '_blank', 'noopener,noreferrer')
    if (!fallback) {
      throw new PdfPreviewError(
        'Your browser blocked the new tab. Allow pop-ups for this site and try again.',
      )
    }
  } catch (err) {
    if (tab && !tab.closed) tab.close()
    throw err
  }
}
