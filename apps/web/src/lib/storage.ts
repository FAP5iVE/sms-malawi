/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/lib/storage.ts
 * [R-PHASE]: R6 — Academics II: Classes, Assignments & the Attendance Rebuild;
 *   further edited in R10 — Finance II
 * [PURPOSE]: Adds FILE_PREFIX.ASSIGNMENT_SUBMISSION and its READ_ROLES entry
 *   — the new POST /:classId/assignments/:id/submit route needs a real
 *   prefix to namespace uploaded submission files under the single shared
 *   Appwrite bucket; none of the existing prefixes fit (APPLICATION_DOC is
 *   for admissions intake, not coursework). Readable by the student who
 *   submitted it (__self) and by staff who can already view class
 *   assignments (admin, high_rank, academic).
 *   R10 adds FILE_PREFIX.FINANCIAL_REPORT — reportExportService.ts's four
 *   report types were uploading under STORAGE_BUCKETS.PAYSLIPS, which is
 *   not merely mislabeled but a genuine type mismatch (uploadFile()'s
 *   first parameter is a FilePrefix, not a StorageBucket — every
 *   StorageBucket value is the single literal 'school_files', not a
 *   member of the FilePrefix union) that also broke canReadFile()'s
 *   prefix-based access control for these files, since a
 *   school_files_-prefixed fileId matches no READ_ROLES category.
 * [R-PHASE, cont.]: R12 — Library Domain & the Storage API Contract Fix;
 *   adds FILE_PREFIX.DIGITAL_RESOURCE — libraryService.ts's
 *   uploadDigitalResource()/getDigitalResourceViewUrl() were passing
 *   STORAGE_BUCKETS.DIGITAL_LIBRARY (a StorageBucket, not a FilePrefix) to
 *   uploadFile()/calling a nonexistent getViewUrl(); this phase's fix
 *   repoints both onto a real FilePrefix category rather than either of
 *   the existing book-scoped ebook/past_paper prefixes, since
 *   DigitalResource's own type union (EBOOK/PAST_PAPER/REFERENCE/
 *   STUDY_GUIDE) is broader than either.
 * [DEPENDS ON]: none
 */
import 'server-only'
import * as sdk from 'node-appwrite'

// ─── BUCKET CONFIG ────────────────────────────────────────────────────────────
// Single Appwrite bucket enforced by free-tier constraint.
// All files are path-partitioned using fileId prefixes that encode the category.
//
// [PRODUCTION FIX] This must be the bucket's actual Appwrite $id, not a
// human-readable label. The bucket was created in the Appwrite Console as
// "School Files" without a custom ID, so Appwrite auto-generated one
// ("6a0c5723001522915a0f") rather than using the literal string
// "school_files" this constant previously held — every uploadFile/getFile/
// deleteFile call was pointing at a bucket ID that didn't exist, causing
// "Storage bucket with the requested ID could not be found."
export const SCHOOL_BUCKET = '6a0c5723001522915a0f' as const

export const STORAGE_BUCKETS = {
  STUDENT_FILES:   SCHOOL_BUCKET,
  DIGITAL_LIBRARY: SCHOOL_BUCKET,
  PAYSLIPS:        SCHOOL_BUCKET,
  REPORT_CARDS:    SCHOOL_BUCKET,
  RECEIPTS:        SCHOOL_BUCKET,
  STAFF_DOCS:      SCHOOL_BUCKET,
  TRANSCRIPTS:     SCHOOL_BUCKET,
} as const

export type StorageBucket = typeof SCHOOL_BUCKET

// ─── PATH PREFIX MAP ─────────────────────────────────────────────────────────
// fileId convention: <prefix>_<uid>  e.g. "payslip_cuid123abc"
// This partitions the single bucket into logical namespaces and enables
// server-side access control without multiple Appwrite buckets.

export const FILE_PREFIX = {
  STUDENT_PHOTO:    'student_photo',
  STAFF_PHOTO:      'staff_photo',
  PAYSLIP:          'payslip',
  REPORT_CARD:      'report_card',
  TRANSCRIPT:       'transcript',
  RECEIPT:          'receipt',
  EBOOK:            'ebook',
  PAST_PAPER:       'past_paper',
  EXPENSE_RECEIPT:  'expense_receipt',
  STAFF_CONTRACT:   'staff_contract',
  LOAN_DOCUMENT:    'loan_doc',
  APPLICATION_DOC:  'application_doc',
  ASSIGNMENT_SUBMISSION: 'assignment_submission',
  FINANCIAL_REPORT: 'financial_report',
  DIGITAL_RESOURCE: 'digital_resource',
  // [PRODUCTION FIX 2026-07-28] Public landing-page assets — served via
  // getPublicViewUrl() (direct Appwrite view URL, no signed-proxy/role
  // check), same pattern already documented there for the school logo.
  // Never put anything sensitive under these two prefixes.
  ANNOUNCEMENT_IMAGE: 'announcement_image',
  SCHOOL_GALLERY:     'school_gallery',
} as const

export type FilePrefix = typeof FILE_PREFIX[keyof typeof FILE_PREFIX]

// ─── ACCESS CONTROL MAP ───────────────────────────────────────────────────────
// Defines which roles may read each file category.
// Enforced at the API route level — Appwrite itself uses a single API key
// with full bucket access; role-gating happens here in the server layer.

const READ_ROLES: Record<FilePrefix, string[]> = {
  student_photo:    ['admin', 'high_rank', 'finance', 'library', 'lower_rank', 'academic', 'hr', 'exam_officer'],
  staff_photo:      ['admin', 'high_rank', 'hr'],
  payslip:          ['admin', 'finance', 'hr', '__self'],   // __self = the staff member who owns it
  report_card:      ['admin', 'high_rank', 'exam_officer', 'academic', '__self'],
  transcript:       ['admin', 'high_rank', 'exam_officer', '__self'],
  receipt:          ['admin', 'finance'],
  ebook:            ['admin', 'library', 'academic', 'student'],
  past_paper:       ['admin', 'library', 'academic', 'student'],
  expense_receipt:  ['admin', 'finance'],
  staff_contract:   ['admin', 'hr'],
  loan_doc:         ['admin', 'hr', 'finance'],
  application_doc:  ['admin', 'high_rank', 'lower_rank'],
  assignment_submission: ['admin', 'high_rank', 'academic', '__self'],
  financial_report: ['admin', 'finance', 'high_rank'],
  digital_resource: ['admin', 'high_rank', 'finance', 'library', 'academic', 'hr', 'exam_officer', 'student'],
  // Public assets — every internal role may view them too (used by any
  // future admin gallery/announcement management screen); the actual
  // public landing page never goes through this map at all, it calls
  // getPublicViewUrl() directly.
  announcement_image: ['admin', 'high_rank', 'finance', 'library', 'lower_rank', 'academic', 'hr', 'exam_officer', 'student'],
  school_gallery:     ['admin', 'high_rank', 'finance', 'library', 'lower_rank', 'academic', 'hr', 'exam_officer', 'student'],
}

export function canReadFile(fileId: string, userRole: string, userUid: string, ownerUid?: string): boolean {
  const prefix = fileId.split('_').slice(0, 2).join('_') as FilePrefix
  const allowed = READ_ROLES[prefix]
  if (!allowed) return userRole === 'admin'
  if (allowed.includes(userRole)) return true
  if (allowed.includes('__self') && ownerUid && userUid === ownerUid) return true
  return false
}

// ─── CLIENT ──────────────────────────────────────────────────────────────────

function getClient(): sdk.Client {
  const endpoint  = process.env.APPWRITE_ENDPOINT
  const projectId = process.env.APPWRITE_PROJECT_ID
  const apiKey    = process.env.APPWRITE_API_KEY

  if (!endpoint || !projectId || !apiKey) {
    throw new Error('[storage] Missing Appwrite environment variables: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY')
  }

  return new sdk.Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey)
}

/**
 * Public accessor for the validated node-appwrite server client.
 * Exported (R19) so systemHealthService.checkAppwrite() reuses this single,
 * env-validated builder instead of constructing its own client with unchecked
 * non-null assertions.
 */
export function getAppwriteClient(): sdk.Client {
  return getClient()
}

// ─── UPLOAD ───────────────────────────────────────────────────────────────────

export interface UploadResult {
  fileId:   string
  fileSize: number
  mimeType: string
}

/**
 * Upload a file to the Appwrite bucket.
 * @param prefix  - FilePrefix constant to namespace the file
 * @param buffer  - File content
 * @param filename - Original filename (used for Content-Disposition)
 * @param mimeType - MIME type of the file
 * @param customId - Optional: provide a full custom fileId (must start with prefix)
 */
export async function uploadFile(
  prefix:    FilePrefix,
  buffer:    Buffer,
  filename:  string,
  mimeType:  string,
  customId?: string,
): Promise<UploadResult> {
  const storage = new sdk.Storage(getClient())
  const fileId  = customId ?? `${prefix}_${sdk.ID.unique()}`
  const blob    = new Blob([new Uint8Array(buffer)], { type: mimeType })
  const file    = await storage.createFile(
    SCHOOL_BUCKET,
    fileId,
    new File([blob], filename, { type: mimeType }),
  )
  return { fileId: file.$id, fileSize: file.sizeOriginal, mimeType: file.mimeType }
}

// ─── SIGNED / PRESIGNED VIEW URL ─────────────────────────────────────────────

const SIGNED_URL_TTL_SECONDS = 3600 // 1 hour

/**
 * Returns a short-lived signed URL for viewing a file.
 * All sensitive file access must go through this — never expose raw Appwrite URLs.
 */
export async function getSignedViewUrl(fileId: string): Promise<string> {
  const storage = new sdk.Storage(getClient())
  // Appwrite Node SDK getFilePreview / getFileView returns a URL object.
  // For sensitive docs we use createFileDownload which allows TTL in newer SDKs.
  // Since Appwrite free tier doesn't support JWT-scoped URLs out of the box,
  // we proxy the download through our own API route (see /api/files/[fileId]/route.ts).
  // This function returns our internal proxy URL, not a direct Appwrite URL.
  const proxyBase = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sms-malawi.vercel.app'
  return `${proxyBase}/api/files/${encodeURIComponent(fileId)}?ttl=${SIGNED_URL_TTL_SECONDS}`
}

/**
 * Returns a direct Appwrite view URL. Use only for public assets (e.g. school logo).
 * Do NOT use for payslips, report cards, or any protected documents.
 */
export async function getPublicViewUrl(_bucket: string, fileId: string): Promise<string> {
  const storage = new sdk.Storage(getClient())
  return storage.getFileView(SCHOOL_BUCKET, fileId).toString()
}

/**
 * Returns a direct Appwrite download URL.
 * Internal use only — callers should prefer getSignedViewUrl for client-facing URLs.
 */
export async function getDownloadUrl(_bucket: string, fileId: string): Promise<string> {
  const storage = new sdk.Storage(getClient())
  return storage.getFileDownload(SCHOOL_BUCKET, fileId).toString()
}

// ─── STREAM FILE (for proxy route) ───────────────────────────────────────────

/**
 * Streams raw file bytes from Appwrite.
 * Called by the /api/files/[fileId] proxy route after verifying user permissions.
 */
export async function streamFile(fileId: string): Promise<{ buffer: ArrayBuffer; mimeType: string; filename: string }> {
  const storage  = new sdk.Storage(getClient())
  const meta     = await storage.getFile(SCHOOL_BUCKET, fileId)
  const buffer   = await storage.getFileDownload(SCHOOL_BUCKET, fileId)
  return {
    buffer:   buffer as unknown as ArrayBuffer,
    mimeType: meta.mimeType,
    filename: meta.name,
  }
}

// ─── DELETE ──────────────────────────────────────────────────────────────────

export async function deleteFile(_bucket: string, fileId: string): Promise<void> {
  const storage = new sdk.Storage(getClient())
  await storage.deleteFile(SCHOOL_BUCKET, fileId)
}

// ─── METADATA ────────────────────────────────────────────────────────────────

export async function getFileMetadata(_bucket: string, fileId: string) {
  const storage = new sdk.Storage(getClient())
  return storage.getFile(SCHOOL_BUCKET, fileId)
}

// ─── LIST FILES (admin only) ──────────────────────────────────────────────────

export async function listFiles(prefix?: FilePrefix, limit = 25, offset = 0) {
  const storage = new sdk.Storage(getClient())
  const queries: string[] = []
  if (prefix) queries.push(sdk.Query.startsWith('$id', prefix))
  queries.push(sdk.Query.limit(limit))
  queries.push(sdk.Query.offset(offset))
  return storage.listFiles(SCHOOL_BUCKET, queries)
}

// ─── STORAGE USAGE ───────────────────────────────────────────────────────────

export async function getStorageUsage(): Promise<{ totalFiles: number; totalSizeBytes: number }> {
  const storage = new sdk.Storage(getClient())
  const result  = await storage.listFiles(SCHOOL_BUCKET, [sdk.Query.limit(1)])
  return { totalFiles: result.total, totalSizeBytes: 0 }
}