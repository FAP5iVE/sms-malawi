/**
 * apps/web/src/server/services/signatureService.ts
 *
 * [CHANGE TYPE]: NEW (phase 17, owner request 2026-11-22: digital signature)
 * [PURPOSE]: A staff member uploads a scanned signature once. The server embeds it in the PDFs they
 *   produced or approved (report card, receipt, payslip, transcript). It is a picture of a signature,
 *   not a legal e-signature.
 * [SAFETY]:
 *   - The image bytes are read only by loadSignatureImage(), for the PDF writers. No route returns them.
 *   - Only the owner can save or remove their own signature (the route passes req.user.uid).
 *   - A head switch (SystemSettings `documents_use_signatures`, default on) stops every document using
 *     signatures. Removing a signature never changes a PDF that was already issued.
 *   - Each time a signature is printed, a low-severity audit entry records who signed and on what.
 */
import 'server-only'

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import * as auditService from '@/server/services/auditService'
import type { PdfSignatureImage } from '@/server/services/pdfBranding'
import { SIGNATURE_MAX_BYTES, signatureProblem } from '@shared/constants/signature'

export const USE_SIGNATURES_KEY = 'documents_use_signatures'

export class SignatureError extends Error {
  readonly status = 400
  constructor(message: string) { super(message); this.name = 'SignatureError' }
}

export interface SignatureStatus { hasSignature: boolean; updatedAt: string | null; sizeBytes: number | null; useOnDocuments: boolean }

export interface ParsedImage { mime: 'image/png' | 'image/jpeg'; width: number; height: number }

/** Reads the type and size from the file's own bytes; the declared type is never trusted. */
export function parseImage(buf: Buffer): ParsedImage {
  if (buf.length >= 24 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue }
      const marker = buf[i + 1] as number
      if (marker === 0xff) { i++; continue }
      // Start-of-frame markers carry the size (not DHT 0xC4, JPG 0xC8, DAC 0xCC).
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { mime: 'image/jpeg', height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
      }
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue }
      i += 2 + buf.readUInt16BE(i + 2)
    }
  }
  throw new SignatureError('Use a PNG or JPG image.')
}

/** Throws a SignatureError, in plain words, when the file is not a usable signature. */
export function validateSignature(buf: Buffer): ParsedImage {
  if (buf.length === 0) throw new SignatureError('The file is empty.')
  // Size first: a huge file is refused before anything reads it.
  if (buf.length > SIGNATURE_MAX_BYTES) throw new SignatureError(signatureProblem({ bytes: buf.length, width: 0, height: 0 }) as string)
  const img = parseImage(buf)
  const problem = signatureProblem({ bytes: buf.length, width: img.width, height: img.height })
  if (problem) throw new SignatureError(problem)
  return img
}

// ── the head switch ─────────────────────────────────────────────────────────

let switchCache: { value: boolean; at: number } | null = null
const SWITCH_TTL_MS = 30_000

export async function isUsingSignatures(): Promise<boolean> {
  if (switchCache && Date.now() - switchCache.at < SWITCH_TTL_MS) return switchCache.value
  const row = await prisma.systemSettings.findUnique({ where: { key: USE_SIGNATURES_KEY }, select: { value: true } })
  const raw = row?.value
  const value = raw === undefined || raw === null ? true : !(raw === false || raw === 'false')
  switchCache = { value, at: Date.now() }
  return value
}

export async function setUsingSignatures(on: boolean, actorUid: string, actorRole: string): Promise<void> {
  await prisma.systemSettings.upsert({
    where: { key: USE_SIGNATURES_KEY },
    create: { key: USE_SIGNATURES_KEY, value: on, category: 'documents', updatedByUid: actorUid },
    update: { value: on, updatedByUid: actorUid },
  })
  switchCache = null
  await auditService.log({
    action: 'settings.updated', entityType: 'SystemSettings', entityId: USE_SIGNATURES_KEY, actorUid, actorRole,
    metadata: { context: { key: USE_SIGNATURES_KEY, value: on } },
  })
}

// ── owner actions ───────────────────────────────────────────────────────────

export async function getStatus(uid: string): Promise<SignatureStatus> {
  const [row, useOnDocuments] = await Promise.all([
    prisma.userSignature.findUnique({ where: { uid }, select: { updatedAt: true, sizeBytes: true } }),
    isUsingSignatures(),
  ])
  return { hasSignature: !!row, updatedAt: row?.updatedAt.toISOString() ?? null, sizeBytes: row?.sizeBytes ?? null, useOnDocuments }
}

export async function saveSignature(uid: string, actorRole: string, buf: Buffer): Promise<SignatureStatus> {
  const img = validateSignature(buf)
  const data = new Uint8Array(buf)
  await prisma.userSignature.upsert({
    where: { uid },
    create: { uid, mime: img.mime, data, sizeBytes: buf.length, width: img.width, height: img.height },
    update: { mime: img.mime, data, sizeBytes: buf.length, width: img.width, height: img.height },
  })
  await auditService.log({
    action: 'signature.uploaded', entityType: 'UserSignature', entityId: uid, actorUid: uid, actorRole,
    metadata: { context: { sizeBytes: buf.length, width: img.width, height: img.height } },
  })
  return getStatus(uid)
}

export async function removeSignature(uid: string, actorRole: string): Promise<SignatureStatus> {
  const { count } = await prisma.userSignature.deleteMany({ where: { uid } })
  if (count > 0) {
    await auditService.log({ action: 'signature.removed', entityType: 'UserSignature', entityId: uid, actorUid: uid, actorRole })
  }
  return getStatus(uid)
}

// ── used by the PDF writers only ────────────────────────────────────────────

/**
 * The signature of one person, ready to embed. Returns null when the switch is off or the person has
 * none, so the line stays blank as before. Never throws: a document must not fail over a signature.
 * `document` says what is being signed (for the audit entry), for example "receipt".
 */
export async function loadSignatureImage(uid: string | null | undefined, document: string): Promise<PdfSignatureImage | null> {
  if (!uid) return null
  try {
    if (!(await isUsingSignatures())) return null
    const row = await prisma.userSignature.findUnique({ where: { uid }, select: { mime: true, data: true, width: true, height: true } })
    if (!row) return null
    auditService.logAsync({
      action: 'signature.printed', entityType: 'UserSignature', entityId: uid, actorUid: uid, actorRole: 'signer',
      metadata: { context: { document } },
    })
    return {
      dataUri: `data:${row.mime};base64,${Buffer.from(row.data).toString('base64')}`,
      format: row.mime === 'image/png' ? 'PNG' : 'JPEG',
      width: row.width,
      height: row.height,
    }
  } catch (err) {
    logger.warn({ event: 'signature.load_failed', document, err }, 'Signature skipped')
    return null
  }
}
