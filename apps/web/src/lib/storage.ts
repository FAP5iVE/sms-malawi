/**
 * [FILE]: apps/web/src/lib/storage.ts
 * [PURPOSE]: The ONE storage layer: Cloudflare R2 through its S3-compatible API.
 *
 *   FILES ARE GROUPED BY SECURITY DOMAIN, THEN BY CATEGORY:
 *     bucket  = who may touch the data and how it lives (public vs private,
 *               staff-confidential vs student records, ...). Separate buckets
 *               can have separate API tokens, CORS rules, retention rules and
 *               public/private settings, and limit the blast radius of a leak.
 *     folder  = the file category inside its bucket (payslips/, report-cards/,
 *               ...), which keeps a bucket browsable and lets lifecycle rules
 *               target one category.
 *   A file id is `<prefix>_<unique>` (for example `payslip_k3j9x0a2b1cd`). The
 *   prefix decides the bucket + folder (LOCATION), the access rule (READ_ROLES)
 *   and the upload policy, and the object key is `<folder>/<file id>`. The id
 *   stored in the database never changes with where a file lives, and because
 *   the folder comes from the prefix and ids cannot contain "/", an id can only
 *   ever address its own category's folder.
 *
 *   Two ways to read a file:
 *     - PRIVATE buckets are never reachable from the internet. Bytes only leave
 *       through /api/files/<id>, which verifies the caller (canReadFile + the
 *       route's own ownership checks) before streamFile() reads the object.
 *     - The one PUBLIC bucket (public-media) holds landing-page / <img> assets
 *       (PUBLIC_FILE_PREFIXES) and nothing else; its public URL is
 *       R2_PUBLIC_URL_MEDIA, resolved by getPublicViewUrl().
 *
 *   Two ways to write a file:
 *     - Server-generated documents (PDFs, spreadsheets) use uploadFile().
 *     - Browser uploads never pass through a Vercel function (4.5MB request cap,
 *       no retry): createDirectUploadTicket() validates the request and returns a
 *       short-lived presigned PUT URL the browser uploads to directly.
 *
 *   Required environment (see docs/storage/r2-setup.md):
 *     R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL_MEDIA
 *   Optional: R2_BUCKET_PREFIX (default "sms-malawi"), R2_ENDPOINT (local testing).
 * [DEPENDS ON]: @aws-sdk/client-s3, @aws-sdk/s3-request-presigner,
 *   @shared/utils/assignment (assignment file rules)
 */
import 'server-only'
import crypto from 'node:crypto'
import { z } from 'zod'
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { checkFileAgainstRules, type AssignmentFileKind } from '@shared/utils/assignment'

// ─── FILE PREFIXES ───────────────────────────────────────────────────────────
// fileId convention: <prefix>_<uid>  e.g. "payslip_cuid123abc".
// canReadFile() only ever inspects the prefix, so a new prefix needs a bucket +
// folder (LOCATION), a READ_ROLES entry and, if browsers upload it, an UPLOAD_POLICY.

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
  // Teacher-side assignment material.
  //   ASSIGNMENT_FILE  - attached documents (private; class members only, via
  //                      the /api/files proxy + assignmentService.canAccessAssignmentFile).
  //   ASSIGNMENT_IMAGE - pictures attached to / embedded in an assignment. These
  //                      must load in an <img> tag (no Authorization header), so
  //                      they sit in PUBLIC_FILE_PREFIXES like announcement
  //                      images: readable by anyone holding the unguessable
  //                      file URL, listed nowhere. Keep exam papers out of
  //                      pictures if that matters - attach them as files.
  ASSIGNMENT_FILE:  'assignment_file',
  ASSIGNMENT_IMAGE: 'assignment_image',
  FINANCIAL_REPORT: 'financial_report',
  DIGITAL_RESOURCE: 'digital_resource',
  // Public landing-page assets, served from their public bucket URL (no proxy,
  // no role check). Never put anything sensitive under these prefixes.
  ANNOUNCEMENT_IMAGE: 'announcement_image',
  SCHOOL_GALLERY:     'school_gallery',
  // Leadership team member photo — LeadershipMember.photoKey.
  LEADERSHIP_PHOTO:   'leadership_photo',
  // Discover-section card preview photo — DiscoverCardImage.photoKey. Two
  // underscore-segments ('discover', 'photo') like every other prefix value.
  DISCOVER_PHOTO:     'discover_photo',
} as const

export type FilePrefix = typeof FILE_PREFIX[keyof typeof FILE_PREFIX]

// ─── BUCKETS AND FOLDERS ─────────────────────────────────────────────────────
// Bucket name = `${R2_BUCKET_PREFIX}-${suffix}` (R2 bucket names: 3-63 chars,
// lowercase letters, digits and hyphens). Buckets are split by SECURITY DOMAIN:
//
//   public-media    world-readable assets that already appear on the public site
//                   or inside <img> tags (the ONLY public bucket).
//   student-records learner identity + academic records and admission papers:
//                   personal data about children. Served only through the
//                   role-checked proxy (staff, the student, linked guardians).
//   finance         fee receipts, expense receipts and financial reports: money
//                   records that finance/admin audit and that may need long,
//                   uniform retention.
//   hr              staff-confidential files: photos, payslips, contracts and
//                   loan papers. A far smaller audience than student records.
//   coursework      teacher material and student submissions: high-churn, scoped
//                   to a class, and a natural candidate for term-based clean-up.
//   library         shared learning resources: long-lived, read by many.
//
// Keeping them apart means a credential, CORS rule, public-access switch or
// retention rule that is right for one domain is never inherited by another,
// and a mistake in one cannot expose the rest.

const BUCKETS = {
  media:      { suffix: 'public-media',    isPublic: true  },
  students:   { suffix: 'student-records', isPublic: false },
  finance:    { suffix: 'finance',         isPublic: false },
  hr:         { suffix: 'hr',              isPublic: false },
  coursework: { suffix: 'coursework',      isPublic: false },
  library:    { suffix: 'library',         isPublic: false },
} as const

type BucketKey = keyof typeof BUCKETS

/** Where each file category lives: its bucket and the folder inside it. */
const LOCATION: Record<FilePrefix, { bucket: BucketKey; folder: string }> = {
  // public-media — intentionally public
  announcement_image:    { bucket: 'media',      folder: 'announcements' },
  school_gallery:        { bucket: 'media',      folder: 'gallery' },
  leadership_photo:      { bucket: 'media',      folder: 'leadership' },
  discover_photo:        { bucket: 'media',      folder: 'discover' },
  assignment_image:      { bucket: 'media',      folder: 'assignment-images' },
  // student-records
  student_photo:         { bucket: 'students',   folder: 'student-photos' },
  report_card:           { bucket: 'students',   folder: 'report-cards' },
  transcript:            { bucket: 'students',   folder: 'transcripts' },
  application_doc:       { bucket: 'students',   folder: 'applications' },
  // finance
  receipt:               { bucket: 'finance',    folder: 'receipts' },
  expense_receipt:       { bucket: 'finance',    folder: 'expense-receipts' },
  financial_report:      { bucket: 'finance',    folder: 'financial-reports' },
  // hr
  staff_photo:           { bucket: 'hr',         folder: 'staff-photos' },
  payslip:               { bucket: 'hr',         folder: 'payslips' },
  staff_contract:        { bucket: 'hr',         folder: 'contracts' },
  loan_doc:              { bucket: 'hr',         folder: 'loan-documents' },
  // coursework
  assignment_file:       { bucket: 'coursework', folder: 'assignment-files' },
  assignment_submission: { bucket: 'coursework', folder: 'submissions' },
  // library
  digital_resource:      { bucket: 'library',    folder: 'digital-resources' },
  ebook:                 { bucket: 'library',    folder: 'ebooks' },
  past_paper:            { bucket: 'library',    folder: 'past-papers' },
}

// ─── ACCESS CONTROL MAP ───────────────────────────────────────────────────────
// Which roles may read each file category. Enforced at the API route level
// (/api/files/[fileId]) — the R2 credentials have full access to every bucket;
// role-gating happens in the server layer.

const READ_ROLES: Record<FilePrefix, string[]> = {
  student_photo:    ['admin', 'high_rank', 'finance', 'library', 'lower_rank', 'academic', 'hr', 'exam_officer'],
  staff_photo:      ['admin', 'high_rank', 'hr'],
  payslip:          ['admin', 'finance', 'hr', '__self'],   // __self = the staff member who owns it
  report_card:      ['admin', 'high_rank', 'exam_officer', 'academic', '__self'],
  transcript:       ['admin', 'high_rank', 'exam_officer', '__self'],
  receipt:          ['admin', 'high_rank', 'finance', '__self'],   // __self = the student whose invoice was paid
  ebook:            ['admin', 'library', 'academic', 'student'],
  past_paper:       ['admin', 'library', 'academic', 'student'],
  expense_receipt:  ['admin', 'finance'],
  staff_contract:   ['admin', 'hr'],
  loan_doc:         ['admin', 'hr', 'finance'],
  application_doc:  ['admin', 'high_rank', 'lower_rank'],
  assignment_submission: ['admin', 'high_rank', 'academic', '__self'],
  // Role gate only - the route ALSO verifies class membership / teaching
  // relationship (assignmentService.canAccessAssignmentFile).
  assignment_file:  ['admin', 'high_rank', 'academic', 'exam_officer', 'student'],
  assignment_image: ['admin', 'high_rank', 'finance', 'library', 'lower_rank', 'academic', 'hr', 'exam_officer', 'student'],
  financial_report: ['admin', 'finance', 'high_rank'],
  digital_resource: ['admin', 'high_rank', 'finance', 'library', 'academic', 'hr', 'exam_officer', 'student'],
  // Public assets — every internal role may view them too; the public landing
  // page never goes through this map, it calls getPublicViewUrl() directly.
  announcement_image: ['admin', 'high_rank', 'finance', 'library', 'lower_rank', 'academic', 'hr', 'exam_officer', 'student'],
  school_gallery:     ['admin', 'high_rank', 'finance', 'library', 'lower_rank', 'academic', 'hr', 'exam_officer', 'student'],
  leadership_photo:   ['admin', 'high_rank', 'finance', 'library', 'lower_rank', 'academic', 'hr', 'exam_officer', 'student'],
  discover_photo:     ['admin', 'high_rank', 'finance', 'library', 'lower_rank', 'academic', 'hr', 'exam_officer', 'student'],
}

// Prefixes whose files are meant to be viewed directly (getPublicViewUrl(), no
// proxy). Their buckets are the only ones that get a public URL. Everything
// else must stay private and is served by the role-checked proxy.
export const PUBLIC_FILE_PREFIXES = [
  FILE_PREFIX.ANNOUNCEMENT_IMAGE,
  FILE_PREFIX.SCHOOL_GALLERY,
  FILE_PREFIX.LEADERSHIP_PHOTO,
  FILE_PREFIX.DISCOVER_PHOTO,
  // Assignment pictures render inside rich-text <img> tags - see FILE_PREFIX.ASSIGNMENT_IMAGE.
  FILE_PREFIX.ASSIGNMENT_IMAGE,
] as const

export type PublicFilePrefix = typeof PUBLIC_FILE_PREFIXES[number]

/** The environment variable holding the public base URL of the public-media bucket. */
export const PUBLIC_URL_ENV = 'R2_PUBLIC_URL_MEDIA'

export function isPublicPrefix(prefix: FilePrefix): prefix is PublicFilePrefix {
  return (PUBLIC_FILE_PREFIXES as readonly string[]).includes(prefix)
}

/** Longest-prefix match: no two prefixes collide today, but a future "receipt_reversal" must not read as "receipt". */
export function resolvePrefix(fileId: string): FilePrefix | undefined {
  return (Object.values(FILE_PREFIX) as string[])
    .filter((p) => fileId === p || fileId.startsWith(`${p}_`))
    .sort((a, b) => b.length - a.length)[0] as FilePrefix | undefined
}

export function canReadFile(fileId: string, userRole: string, userUid: string, ownerUid?: string): boolean {
  // [Guardian portal] A parent is never authorised by role or by the __self rule.
  // Their access is decided per request from a verified guardian link (see the
  // guardian branch in app/api/files/[fileId]/route.ts), so this role-based table
  // must stay closed to them even if a uid were ever (wrongly) shared with an owner.
  if (userRole === 'parent') return false
  const prefix = resolvePrefix(fileId)
  const allowed = prefix ? READ_ROLES[prefix] : undefined
  if (!allowed) return userRole === 'admin'
  if (allowed.includes(userRole)) return true
  if (allowed.includes('__self') && ownerUid && userUid === ownerUid) return true
  return false
}

// ─── CONFIGURATION ───────────────────────────────────────────────────────────

/** A misconfigured or unusable storage setup — an operator problem, never the caller's. */
export class StorageConfigError extends Error {
  readonly status = 500
  constructor(message: string) {
    super(`[storage] ${message}`)
    this.name = 'StorageConfigError'
  }
}

/** A client-side upload request that is refused. The message is written for the user, hence status 400. */
export class UploadRejectedError extends Error {
  readonly status = 400
  constructor(message: string) {
    super(message)
    this.name = 'UploadRejectedError'
  }
}

const r2Schema = z.object({
  R2_ACCOUNT_ID:        z.string().min(1),
  R2_ACCESS_KEY_ID:     z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_PREFIX:     z.string().regex(/^[a-z0-9][a-z0-9-]{0,30}$/).default('sms-malawi'),
  R2_ENDPOINT:          z.string().url().optional(),
})
type R2Config = z.infer<typeof r2Schema>

let cachedConfig: R2Config | null = null
let cachedClient: S3Client | null = null

function getConfig(): R2Config {
  if (cachedConfig) return cachedConfig
  const parsed = r2Schema.safeParse({
    R2_ACCOUNT_ID:        process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID:     process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_PREFIX:     process.env.R2_BUCKET_PREFIX || undefined,
    R2_ENDPOINT:          process.env.R2_ENDPOINT || undefined,
  })
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join('.')).join(', ')
    throw new StorageConfigError(`Missing or invalid R2 environment variables: ${names}`)
  }
  cachedConfig = parsed.data
  return cachedConfig
}

function getClient(): S3Client {
  if (cachedClient) return cachedClient
  const cfg = getConfig()
  cachedClient = new S3Client({
    region: 'auto',
    endpoint: cfg.R2_ENDPOINT ?? `https://${cfg.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: { accessKeyId: cfg.R2_ACCESS_KEY_ID, secretAccessKey: cfg.R2_SECRET_ACCESS_KEY },
    // R2 does not implement the SDK's optional default checksums; without these
    // the SDK signs a checksum of an empty body into presigned upload URLs and R2
    // rejects the real upload.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
  return cachedClient
}

function bucketName(key: BucketKey): string {
  return `${getConfig().R2_BUCKET_PREFIX}-${BUCKETS[key].suffix}`
}

/** The R2 bucket that holds files of this category. */
export function bucketNameFor(prefix: FilePrefix): string {
  return bucketName(LOCATION[prefix].bucket)
}

/** The folder inside its bucket where files of this category are kept. */
export function folderFor(prefix: FilePrefix): string {
  return LOCATION[prefix].folder
}

export interface BucketInfo {
  bucket:       string
  isPublic:     boolean
  /** The file categories stored in this bucket, with the folder each one uses. */
  categories:   Array<{ prefix: FilePrefix; folder: string; browserUploadable: boolean }>
}

/** Every bucket this app uses — what tools/r2/provision.ts creates. */
export function listBuckets(): BucketInfo[] {
  return (Object.keys(BUCKETS) as BucketKey[]).map((key) => ({
    bucket: bucketName(key),
    isPublic: BUCKETS[key].isPublic,
    categories: (Object.values(FILE_PREFIX) as FilePrefix[])
      .filter((prefix) => LOCATION[prefix].bucket === key)
      .map((prefix) => ({ prefix, folder: LOCATION[prefix].folder, browserUploadable: isBrowserUploadable(prefix) })),
  }))
}

const FILE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

/**
 * Resolves a file id to its bucket + object key, refusing ids that are malformed
 * or belong to no category. The folder comes from the id's prefix and an id can
 * never contain "/", so an id can only ever address its own category's folder.
 */
function locate(fileId: string): { bucket: string; key: string; prefix: FilePrefix } {
  if (!FILE_ID_PATTERN.test(fileId)) throw new UploadRejectedError('Invalid file id.')
  const prefix = resolvePrefix(fileId)
  if (!prefix) throw new UploadRejectedError('Unknown file category.')
  const { bucket, folder } = LOCATION[prefix]
  // A file may only ever live in a public bucket if it is meant to be public.
  if (BUCKETS[bucket].isPublic !== isPublicPrefix(prefix)) {
    throw new StorageConfigError(`Category "${prefix}" is mapped to a bucket with the wrong visibility.`)
  }
  return { bucket: bucketName(bucket), key: `${folder}/${fileId}`, prefix }
}

function publicBaseUrl(): string {
  const raw = (process.env[PUBLIC_URL_ENV] ?? '').trim()
  if (!raw) throw new StorageConfigError(`Missing ${PUBLIC_URL_ENV} — the public URL of the ${bucketName('media')} bucket.`)
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new StorageConfigError(`${PUBLIC_URL_ENV} is not a valid URL.`)
  }
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new StorageConfigError(`${PUBLIC_URL_ENV} must be an https:// URL.`)
  return raw.replace(/\/+$/, '')
}

// ─── UPLOAD POLICY ───────────────────────────────────────────────────────────
// What a browser may upload under each prefix. Server-generated documents
// (payslips, receipts, report cards, transcripts, financial reports) are written
// by uploadFile() and are NOT listed: a prefix without a policy cannot be
// uploaded to from the browser at all.

const MB = 1024 * 1024
const WEB_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'] as const
const DOCUMENT_OR_IMAGE_MIMES = ['application/pdf', ...WEB_IMAGE_MIMES] as const

interface UploadMeta { name: string; mimeType: string; sizeBytes: number }
interface UploadPolicy {
  check(meta: UploadMeta): string | null
  /** false = validated by assertUploadAllowed() but received by our own API (multer), never via a presigned URL. */
  direct?: boolean
}

const normMime = (m: string) => (m.split(';')[0] ?? '').trim().toLowerCase()

function mimePolicy(allowed: readonly string[], maxBytes: number, direct = true): UploadPolicy {
  return {
    direct,
    check(meta) {
      if (meta.sizeBytes <= 0) return `"${meta.name}" is empty.`
      if (meta.sizeBytes > maxBytes) return `"${meta.name}" is larger than ${Math.round(maxBytes / MB)} MB.`
      if (!allowed.includes(normMime(meta.mimeType))) return `"${meta.name}" is not an allowed file type.`
      return null
    },
  }
}

const assignmentPolicy = (kind: AssignmentFileKind): UploadPolicy => ({ check: (meta) => checkFileAgainstRules(meta, kind) })

const UPLOAD_POLICY: Partial<Record<FilePrefix, UploadPolicy>> = {
  student_photo:         mimePolicy(WEB_IMAGE_MIMES, 25 * MB),
  staff_photo:           mimePolicy(WEB_IMAGE_MIMES, 25 * MB),
  announcement_image:    mimePolicy(WEB_IMAGE_MIMES, 25 * MB),
  school_gallery:        mimePolicy(WEB_IMAGE_MIMES, 25 * MB),
  leadership_photo:      mimePolicy(WEB_IMAGE_MIMES, 25 * MB),
  discover_photo:        mimePolicy(WEB_IMAGE_MIMES, 25 * MB),
  digital_resource:      mimePolicy(DOCUMENT_OR_IMAGE_MIMES, 100 * MB),
  // Received by the finance route through multer (see finances.ts), not by presigned upload.
  expense_receipt:       mimePolicy(DOCUMENT_OR_IMAGE_MIMES, 10 * MB, false),
  assignment_image:      assignmentPolicy('IMAGE'),
  assignment_file:       assignmentPolicy('ATTACHMENT'),
  assignment_submission: assignmentPolicy('SUBMISSION'),
}

/** True when browsers may upload to this category (it has an upload policy) — those buckets need CORS for presigned PUTs. */
export function isBrowserUploadable(prefix: FilePrefix): boolean {
  const policy = UPLOAD_POLICY[prefix]
  return policy !== undefined && policy.direct !== false
}

/** Throws UploadRejectedError (HTTP 400, user-facing message) unless this upload is allowed under the prefix. */
export function assertUploadAllowed(prefix: FilePrefix, meta: UploadMeta): void {
  const policy = UPLOAD_POLICY[prefix]
  if (!policy) throw new UploadRejectedError('Files of this type cannot be uploaded from the browser.')
  const problem = policy.check(meta)
  if (problem) throw new UploadRejectedError(problem)
}

// ─── IDS ─────────────────────────────────────────────────────────────────────

// Short fixed-length random suffix. 12 characters of [a-z0-9] matches
// extractEmbeddedFileIds()'s pattern and keeps every id well under 128 characters.
function shortUniqueId(length = 12): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes    = crypto.randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) out += alphabet[bytes.readUInt8(i) % alphabet.length]
  return out
}

const newFileId = (prefix: FilePrefix) => `${prefix}_${shortUniqueId()}`

// Public objects are immutable (ids are never reused), so browsers/CDNs may cache them for good.
const PUBLIC_CACHE_CONTROL = 'public, max-age=31536000, immutable'

function encodeFilename(name: string): string {
  return encodeURIComponent(name.slice(0, 255))
}
function decodeFilename(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback
  try {
    return decodeURIComponent(raw)
  } catch {
    return fallback
  }
}

// ─── SERVER-SIDE UPLOAD ──────────────────────────────────────────────────────

export interface UploadResult {
  fileId:   string
  fileSize: number
  mimeType: string
}

/**
 * Upload a server-held buffer (generated PDFs, spreadsheets, multipart uploads).
 * @param prefix  - FilePrefix constant; picks the bucket
 * @param buffer  - File content
 * @param filename - Original filename (served back as Content-Disposition)
 * @param mimeType - MIME type of the file
 * @param customId - Optional full fileId (must start with `${prefix}_`)
 */
export async function uploadFile(
  prefix:    FilePrefix,
  buffer:    Buffer,
  filename:  string,
  mimeType:  string,
  customId?: string,
): Promise<UploadResult> {
  const fileId = customId ?? newFileId(prefix)
  if (resolvePrefix(fileId) !== prefix) throw new UploadRejectedError('File id does not match its category.')
  const { bucket, key } = locate(fileId)
  await getClient().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
    ContentLength: buffer.length,
    Metadata: { filename: encodeFilename(filename) },
    ...(isPublicPrefix(prefix) ? { CacheControl: PUBLIC_CACHE_CONTROL } : {}),
  }))
  return { fileId, fileSize: buffer.length, mimeType }
}

// ─── DIRECT-FROM-BROWSER UPLOAD TICKET ───────────────────────────────────────
// Lets the browser upload file bytes straight to R2 instead of through this
// app's own API/Vercel function:
//   - Vercel Functions cap a request body at 4.5MB, before this app's code runs.
//   - A single giant request has no retry if the connection drops mid-upload.
// The server decides everything that matters (bucket, file id, content type,
// exact size, filename); the browser only gets a presigned PUT URL that is valid
// for those exact values for DIRECT_UPLOAD_TTL_SECS, for one object key.
//
// Callers MUST already have run their own requireRole/verifyAuth checks — this
// function does no authorization itself, it assumes the caller has already
// decided this specific request may upload into this prefix.

export const DIRECT_UPLOAD_TTL_SECS = 900

export interface DirectUploadTicket {
  method:           'PUT'
  /** Presigned URL — PUT the file bytes here. */
  uploadUrl:        string
  /** Headers the browser MUST send unchanged (they are part of the signature). */
  headers:          Record<string, string>
  fileId:           string
  expiresInSeconds: number
  /** Final public URL for public prefixes (for inline <img>), null for private files. */
  publicUrl:        string | null
}

const uploadRequestSchema = z.object({
  filename:    z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(255),
  size:        z.number().int().positive(),
})

export async function createDirectUploadTicket(prefix: FilePrefix, request: unknown): Promise<DirectUploadTicket> {
  if (!isBrowserUploadable(prefix)) throw new UploadRejectedError('Files of this type cannot be uploaded from the browser.')
  const parsed = uploadRequestSchema.safeParse(request)
  if (!parsed.success) throw new UploadRejectedError('Upload request must include the file name, type and size.')
  const { filename, contentType, size } = parsed.data
  const mimeType = normMime(contentType)
  assertUploadAllowed(prefix, { name: filename, mimeType, sizeBytes: size })

  const fileId = newFileId(prefix)
  const { bucket, key } = locate(fileId)
  const isPublic = isPublicPrefix(prefix)
  // Resolve (and so validate) the public URL BEFORE issuing the ticket, so a
  // misconfigured public bucket fails here and not after the file is uploaded.
  const publicUrl = isPublic ? `${publicBaseUrl()}/${folderFor(prefix)}/${encodeURIComponent(fileId)}` : null

  const headers: Record<string, string> = {
    'Content-Type': mimeType,
    'x-amz-meta-filename': encodeFilename(filename),
  }
  const signable = new Set(['content-type', 'content-length'])
  if (isPublic) {
    headers['Cache-Control'] = PUBLIC_CACHE_CONTROL
    signable.add('cache-control')
  }

  const uploadUrl = await getSignedUrl(
    getClient(),
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: mimeType,
      ContentLength: size,
      Metadata: { filename: encodeFilename(filename) },
      ...(isPublic ? { CacheControl: PUBLIC_CACHE_CONTROL } : {}),
    }),
    {
      expiresIn: DIRECT_UPLOAD_TTL_SECS,
      signableHeaders: signable,
      // Keep the filename metadata as a signed HEADER (the presigner would otherwise move x-amz-* into the query string).
      unhoistableHeaders: new Set(['x-amz-meta-filename']),
    },
  )

  return { method: 'PUT', uploadUrl, headers, fileId, expiresInSeconds: DIRECT_UPLOAD_TTL_SECS, publicUrl }
}

// ─── VIEW URLS ───────────────────────────────────────────────────────────────

/**
 * Returns the protected same-origin proxy URL used for viewing a file.
 * All sensitive file access must go through this — private buckets have no
 * public URL. The browser fetches /api/files/[fileId] with its Firebase Bearer
 * token; keeping it relative avoids coupling local development to the
 * production domain and keeps credentials out of the URL.
 */
export async function getSignedViewUrl(fileId: string): Promise<string> {
  return `/api/files/${encodeURIComponent(fileId)}`
}

/**
 * The URL prefix every public file of this category starts with, e.g. for
 * allow-listing embedded <img src> values. Undefined when R2_PUBLIC_URL_MEDIA
 * is not set.
 */
export function getPublicUrlPrefix(prefix: PublicFilePrefix): string | undefined {
  try {
    return `${publicBaseUrl()}/${folderFor(prefix)}/${prefix}_`
  } catch {
    return undefined
  }
}

/**
 * Returns the direct public URL of a file in a public bucket (landing-page
 * assets, school gallery, ...). Refuses every other category: payslips, report
 * cards and other protected documents must go through getSignedViewUrl().
 */
export async function getPublicViewUrl(fileId: string): Promise<string> {
  const { prefix } = locate(fileId)
  if (!isPublicPrefix(prefix)) throw new UploadRejectedError('This file is not public.')
  return `${publicBaseUrl()}/${folderFor(prefix)}/${encodeURIComponent(fileId)}`
}

// ─── READ ────────────────────────────────────────────────────────────────────

/**
 * Reads raw file bytes. Called by the /api/files/[fileId] proxy route after
 * verifying user permissions, and by document generators that embed images.
 */
export async function streamFile(fileId: string): Promise<{ buffer: ArrayBuffer; mimeType: string; filename: string }> {
  const { bucket, key } = locate(fileId)
  const res = await getClient().send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  if (!res.Body) throw new Error(`[storage] Empty response for ${fileId}`)
  const bytes = await res.Body.transformToByteArray()
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return {
    buffer,
    mimeType: res.ContentType ?? 'application/octet-stream',
    filename: decodeFilename(res.Metadata?.filename, fileId),
  }
}

export interface FileMetadata {
  name:      string
  mimeType:  string
  sizeBytes: number
  createdAt: Date
}

/** Metadata of the STORED object (not of what a request claimed). Throws if it does not exist. */
export async function getFileMetadata(fileId: string): Promise<FileMetadata> {
  const { bucket, key } = locate(fileId)
  const head = await getClient().send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
  return {
    name:      decodeFilename(head.Metadata?.filename, fileId),
    mimeType:  head.ContentType ?? 'application/octet-stream',
    sizeBytes: head.ContentLength ?? 0,
    createdAt: head.LastModified ?? new Date(0),
  }
}

// ─── DELETE ──────────────────────────────────────────────────────────────────

export async function deleteFile(fileId: string): Promise<void> {
  const { bucket, key } = locate(fileId)
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}

// ─── HEALTH ──────────────────────────────────────────────────────────────────

/** Probes every bucket with a one-key listing (needs only object-read permission). */
export async function checkStorageBuckets(): Promise<{ total: number; reachable: number; failed: string[] }> {
  const client = getClient()
  const buckets = listBuckets()
  const results = await Promise.allSettled(
    buckets.map((b) => client.send(new ListObjectsV2Command({ Bucket: b.bucket, MaxKeys: 1 }))),
  )
  const failed = buckets.filter((_, i) => results[i]?.status === 'rejected').map((b) => b.bucket)
  return { total: buckets.length, reachable: buckets.length - failed.length, failed }
}
