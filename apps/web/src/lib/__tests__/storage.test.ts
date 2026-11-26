/**
 * storage.test.ts
 * The R2 storage layer's rules that must never drift: one valid bucket per file
 * category, only the five public categories ever get a public URL, access
 * control by prefix, and direct-upload tickets that sign exactly what the server
 * decided. (The real upload/download round trip is checked by `pnpm r2:smoke`.)
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { FILE_PREFIX } from '../storage'

const PUBLIC_URL = 'https://media.cdn.example/'

let s: typeof import('../storage')
beforeAll(async () => {
  process.env.R2_ACCOUNT_ID = 'acct123'
  process.env.R2_ACCESS_KEY_ID = 'AKIAEXAMPLE'
  process.env.R2_SECRET_ACCESS_KEY = 'secretexample'
  process.env.R2_BUCKET_PREFIX = 'sms-malawi'
  process.env.R2_PUBLIC_URL_MEDIA = PUBLIC_URL
  s = await import('../storage')
})

const png = { filename: 'photo.png', contentType: 'image/png', size: 1000 }

describe('buckets and folders', () => {
  const prefixes = Object.values(FILE_PREFIX)

  it('groups files into six security-domain buckets with valid, unique R2 names', () => {
    const buckets = s.listBuckets()
    expect(buckets.map((b) => b.bucket).sort()).toEqual([
      'sms-malawi-coursework', 'sms-malawi-finance', 'sms-malawi-hr',
      'sms-malawi-library', 'sms-malawi-public-media', 'sms-malawi-student-records',
    ])
    for (const { bucket } of buckets) expect(bucket).toMatch(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/)
  })

  it('places every file category in exactly one bucket and folder, with no folder shared inside a bucket', () => {
    const placed = s.listBuckets().flatMap((b) => b.categories.map((c) => ({ ...c, bucket: b.bucket })))
    expect(placed.map((c) => c.prefix).sort()).toEqual([...prefixes].sort())
    for (const b of s.listBuckets()) {
      const folders = b.categories.map((c) => c.folder)
      expect(new Set(folders).size, b.bucket).toBe(folders.length)
      for (const f of folders) expect(f).toMatch(/^[a-z][a-z-]*$/)
    }
  })

  it('keeps each domain together: the allocation the docs promise', () => {
    const where = (p: (typeof prefixes)[number]) => s.bucketNameFor(p).replace('sms-malawi-', '') + '/' + s.folderFor(p)
    expect(where('payslip')).toBe('hr/payslips')
    expect(where('staff_photo')).toBe('hr/staff-photos')
    expect(where('student_photo')).toBe('student-records/student-photos')
    expect(where('report_card')).toBe('student-records/report-cards')
    expect(where('transcript')).toBe('student-records/transcripts')
    expect(where('receipt')).toBe('finance/receipts')
    expect(where('expense_receipt')).toBe('finance/expense-receipts')
    expect(where('financial_report')).toBe('finance/financial-reports')
    expect(where('assignment_submission')).toBe('coursework/submissions')
    expect(where('assignment_file')).toBe('coursework/assignment-files')
    expect(where('digital_resource')).toBe('library/digital-resources')
    expect(where('school_gallery')).toBe('public-media/gallery')
  })

  it('SECURITY: only the public-media bucket is public, and it holds exactly the public categories', () => {
    const publicBuckets = s.listBuckets().filter((b) => b.isPublic)
    expect(publicBuckets.map((b) => b.bucket)).toEqual(['sms-malawi-public-media'])
    expect(publicBuckets[0]!.categories.map((c) => c.prefix).sort()).toEqual([...s.PUBLIC_FILE_PREFIXES].sort())
    // ...and no non-public category is stored in it.
    for (const p of prefixes) {
      const inPublicBucket = s.bucketNameFor(p) === 'sms-malawi-public-media'
      expect(inPublicBucket, p).toBe(s.isPublicPrefix(p))
    }
  })

  it('resolves a file id to its category by the longest matching prefix', () => {
    expect(s.resolvePrefix('payslip_abc123def456')).toBe('payslip')
    expect(s.resolvePrefix('report_card_abc123def456')).toBe('report_card')
    expect(s.resolvePrefix('assignment_submission_abc123def456')).toBe('assignment_submission')
    expect(s.resolvePrefix('mystery_abc123def456')).toBeUndefined()
  })
})

describe('access control', () => {
  it('lets owners read their own payslip, other staff not', () => {
    expect(s.canReadFile('payslip_abc123def456', 'academic', 'u1', 'u1')).toBe(true)
    expect(s.canReadFile('payslip_abc123def456', 'academic', 'u2', 'u1')).toBe(false)
    expect(s.canReadFile('payslip_abc123def456', 'hr', 'u2', 'u1')).toBe(true)
  })
  it('never lets a parent through by role, and leaves unknown categories to admin', () => {
    expect(s.canReadFile('payslip_abc123def456', 'parent', 'u1', 'u1')).toBe(false)
    expect(s.canReadFile('mystery_abc123def456', 'admin', 'u1')).toBe(true)
    expect(s.canReadFile('mystery_abc123def456', 'hr', 'u1')).toBe(false)
  })
})

describe('public URLs', () => {
  it('builds each public file URL as <public bucket URL>/<folder>/<id> (trailing slash tolerated)', async () => {
    await expect(s.getPublicViewUrl('school_gallery_abc123def456')).resolves.toBe('https://media.cdn.example/gallery/school_gallery_abc123def456')
    await expect(s.getPublicViewUrl('announcement_image_abc123def456')).resolves.toBe('https://media.cdn.example/announcements/announcement_image_abc123def456')
    expect(s.getPublicUrlPrefix(s.FILE_PREFIX.ASSIGNMENT_IMAGE)).toBe('https://media.cdn.example/assignment-images/assignment_image_')
  })
  it('refuses to make a public URL for private, unknown or malformed ids', async () => {
    await expect(s.getPublicViewUrl('payslip_abc123def456')).rejects.toThrow()
    await expect(s.getPublicViewUrl('student_photo_abc123def456')).rejects.toThrow()
    await expect(s.getPublicViewUrl('mystery_abc123def456')).rejects.toThrow()
    await expect(s.getPublicViewUrl('school_gallery_../payslip_x')).rejects.toThrow()
    await expect(s.getPublicViewUrl('')).rejects.toThrow()
  })
  it('private files are served through the same-origin proxy', async () => {
    await expect(s.getSignedViewUrl('payslip_abc123def456')).resolves.toBe('/api/files/payslip_abc123def456')
  })
})

describe('direct upload tickets', () => {
  it('signs content type, size and filename, and tells the browser which headers to send', async () => {
    const t = await s.createDirectUploadTicket(s.FILE_PREFIX.STUDENT_PHOTO, { ...png, filename: 'Chikondi Banda.png' })
    const url = new URL(t.uploadUrl)
    expect(url.origin).toBe('https://acct123.r2.cloudflarestorage.com')
    expect(url.pathname).toBe(`/sms-malawi-student-records/student-photos/${t.fileId}`)
    expect(t.fileId).toMatch(/^student_photo_[a-z0-9]{12}$/)
    const signed = (url.searchParams.get('X-Amz-SignedHeaders') ?? '').split(';')
    expect(signed).toEqual(expect.arrayContaining(['content-type', 'content-length', 'host', 'x-amz-meta-filename']))
    expect(url.searchParams.get('X-Amz-Expires')).toBe(String(s.DIRECT_UPLOAD_TTL_SECS))
    expect(t.headers['Content-Type']).toBe('image/png')
    expect(t.headers['x-amz-meta-filename']).toBe('Chikondi%20Banda.png')
    expect(t.publicUrl).toBeNull()
    expect(t.headers['Cache-Control']).toBeUndefined()
    // No SDK checksum parameters that R2 would reject.
    expect([...url.searchParams.keys()].some((k) => k.toLowerCase().includes('checksum') && k !== 'X-Amz-Content-Sha256')).toBe(false)
  })

  it('public categories get their public URL and long-lived cache headers', async () => {
    const t = await s.createDirectUploadTicket(s.FILE_PREFIX.SCHOOL_GALLERY, png)
    expect(t.publicUrl).toBe(`https://media.cdn.example/gallery/${t.fileId}`)
    expect(t.headers['Cache-Control']).toContain('immutable')
    expect(new URL(t.uploadUrl).searchParams.get('X-Amz-SignedHeaders')).toContain('cache-control')
  })

  it('refuses requests the upload policy does not allow (all with a user-facing 400)', async () => {
    const reject = async (prefix: Parameters<typeof s.createDirectUploadTicket>[0], req: unknown) => {
      const err = await s.createDirectUploadTicket(prefix, req).then(() => null, (e: unknown) => e as { status?: number; message: string })
      expect(err, JSON.stringify(req)).not.toBeNull()
      expect(err?.status).toBe(400)
    }
    await reject(s.FILE_PREFIX.STUDENT_PHOTO, { ...png, contentType: 'image/svg+xml', filename: 'x.svg' })   // scriptable image
    await reject(s.FILE_PREFIX.STUDENT_PHOTO, { ...png, contentType: 'text/html' })
    await reject(s.FILE_PREFIX.STUDENT_PHOTO, { ...png, size: 26 * 1024 * 1024 })
    await reject(s.FILE_PREFIX.STUDENT_PHOTO, { ...png, size: 0 })
    await reject(s.FILE_PREFIX.STUDENT_PHOTO, { filename: 'x.png' })                                         // no size/type
    await reject(s.FILE_PREFIX.STUDENT_PHOTO, undefined)
    await reject(s.FILE_PREFIX.DIGITAL_RESOURCE, { filename: 'x.exe', contentType: 'application/x-msdownload', size: 10 })
    await reject(s.FILE_PREFIX.ASSIGNMENT_SUBMISSION, { filename: 'evil.html', contentType: 'text/html', size: 10 })
    await reject(s.FILE_PREFIX.ASSIGNMENT_SUBMISSION, { filename: 'big.pdf', contentType: 'application/pdf', size: 21 * 1024 * 1024 })
    // Expense receipts arrive through our own API (multer), never a presigned URL.
    await reject(s.FILE_PREFIX.EXPENSE_RECEIPT, { filename: 'r.pdf', contentType: 'application/pdf', size: 10 })
    // Server-generated documents can never be uploaded by a browser.
    await reject(s.FILE_PREFIX.PAYSLIP, { filename: 'p.pdf', contentType: 'application/pdf', size: 10 })
    await reject(s.FILE_PREFIX.REPORT_CARD, { filename: 'p.pdf', contentType: 'application/pdf', size: 10 })
    await reject(s.FILE_PREFIX.FINANCIAL_REPORT, { filename: 'p.pdf', contentType: 'application/pdf', size: 10 })
  })

  it('accepts what each category legitimately takes', async () => {
    await expect(s.createDirectUploadTicket(s.FILE_PREFIX.DIGITAL_RESOURCE, { filename: 'notes.pdf', contentType: 'application/pdf', size: 90 * 1024 * 1024 })).resolves.toBeTruthy()
    await expect(s.createDirectUploadTicket(s.FILE_PREFIX.ASSIGNMENT_FILE, { filename: 'sheet.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 5000 })).resolves.toBeTruthy()
    await expect(s.createDirectUploadTicket(s.FILE_PREFIX.ASSIGNMENT_IMAGE, { filename: 'diagram.png', contentType: 'image/png', size: 5000 })).resolves.toBeTruthy()
    await expect(s.createDirectUploadTicket(s.FILE_PREFIX.STAFF_PHOTO, { filename: 'me.webp', contentType: 'image/webp; charset=binary', size: 5000 })).resolves.toBeTruthy()
  })

  it('a file id can only address its own folder (no path tricks)', async () => {
    await expect(s.getPublicViewUrl('school_gallery_/../hr/payslips/payslip_x')).rejects.toThrow()
    await expect(s.streamFile('payslip_../student-records/x')).rejects.toThrow()
  })

  it('only the categories browsers upload to are flagged as uploadable (they get CORS)', () => {
    const uploadable = (Object.values(s.FILE_PREFIX) as Array<typeof s.FILE_PREFIX[keyof typeof s.FILE_PREFIX]>).filter(s.isBrowserUploadable).sort()
    expect(uploadable).toEqual([
      'announcement_image', 'assignment_file', 'assignment_image', 'assignment_submission', 'digital_resource',
      'discover_photo', 'leadership_photo', 'school_gallery', 'staff_photo', 'student_photo',
    ])
  })
})

describe('server-side uploads', () => {
  it('refuses a custom id that does not belong to the category', async () => {
    await expect(s.uploadFile(s.FILE_PREFIX.PAYSLIP, Buffer.from('x'), 'p.pdf', 'application/pdf', 'receipt_abc123def456')).rejects.toThrow()
  })
})
