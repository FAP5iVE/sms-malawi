/**
 * tools/r2/smoke.ts — end-to-end check of the storage layer against REAL R2
 * (or any S3-compatible endpoint set through R2_ENDPOINT).
 *
 *   pnpm r2:smoke
 *
 * Uses the app's own code paths: browser-style presigned upload (a plain fetch
 * PUT, exactly what the browser does), server-side upload, metadata, read-back,
 * public URL, size/type enforcement, delete and the bucket health probe. Every
 * object it creates is deleted again. Needs the same R2_* variables as the app.
 *
 * Real R2 enforces the signed Content-Type and Content-Length, and two checks
 * prove it. Some simple local S3 emulators ignore signed headers; against one
 * of those set R2_SMOKE_LAX=1 to skip just those two checks.
 */
import {
  FILE_PREFIX,
  checkStorageBuckets,
  createDirectUploadTicket,
  deleteFile,
  getFileMetadata,
  getPublicViewUrl,
  streamFile,
  uploadFile,
} from '../../src/lib/storage'

const lax = process.env.R2_SMOKE_LAX === '1'
let failed = 0
const created: string[] = []
const ok = (name: string) => console.log(`  ok    ${name}`)
const bad = (name: string, why: unknown) => {
  failed++
  console.error(`  FAIL  ${name}: ${why instanceof Error ? why.message : String(why)}`)
}
async function check(name: string, fn: () => Promise<void | 'skipped'>) {
  try {
    if ((await fn()) === 'skipped') return console.log(`  skip  ${name} (R2_SMOKE_LAX=1)`)
    ok(name)
  } catch (err) {
    bad(name, err)
  }
}

// A valid 1x1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function browserPut(ticket: Awaited<ReturnType<typeof createDirectUploadTicket>>, body: Buffer) {
  return fetch(ticket.uploadUrl, { method: ticket.method, headers: ticket.headers, body: new Uint8Array(body) })
}

async function main() {
  console.log('Bucket health')
  await check('every bucket answers a listing', async () => {
    const h = await checkStorageBuckets()
    if (h.failed.length) throw new Error(`unreachable: ${h.failed.join(', ')} — run pnpm r2:provision`)
    console.log(`        ${h.reachable}/${h.total} buckets reachable`)
  })

  console.log('Browser-style direct upload (private: student-records/student-photos)')
  let privateId = ''
  await check('ticket + presigned PUT + metadata + read-back', async () => {
    const ticket = await createDirectUploadTicket(FILE_PREFIX.STUDENT_PHOTO, { filename: 'smoke test é.png', contentType: 'image/png', size: PNG.length })
    privateId = ticket.fileId
    created.push(privateId)
    if (ticket.publicUrl !== null) throw new Error('private file must not have a public URL')
    const res = await browserPut(ticket, PNG)
    if (!res.ok) throw new Error(`PUT answered ${res.status} ${await res.text()}`)
    const meta = await getFileMetadata(privateId)
    if (meta.name !== 'smoke test é.png' || meta.mimeType !== 'image/png' || meta.sizeBytes !== PNG.length) throw new Error(`metadata mismatch: ${JSON.stringify(meta)}`)
    const back = await streamFile(privateId)
    if (!Buffer.from(back.buffer).equals(PNG) || back.filename !== 'smoke test é.png') throw new Error('bytes or filename differ')
  })
  await check('a PUT with the wrong size is refused', async () => {
    if (lax) return 'skipped'
    const ticket = await createDirectUploadTicket(FILE_PREFIX.STUDENT_PHOTO, { filename: 'a.png', contentType: 'image/png', size: PNG.length })
    created.push(ticket.fileId)
    const res = await browserPut(ticket, Buffer.concat([PNG, Buffer.from('extra')]))
    if (res.ok) throw new Error('an upload larger than the ticketed size was accepted')
  })
  await check('a PUT with the wrong content type is refused', async () => {
    if (lax) return 'skipped'
    const ticket = await createDirectUploadTicket(FILE_PREFIX.STUDENT_PHOTO, { filename: 'a.png', contentType: 'image/png', size: PNG.length })
    created.push(ticket.fileId)
    const res = await fetch(ticket.uploadUrl, { method: 'PUT', headers: { ...ticket.headers, 'Content-Type': 'text/html' }, body: new Uint8Array(PNG) })
    if (res.ok) throw new Error('an upload with a different content type was accepted')
  })
  await check('disallowed type / oversize / empty requests never get a ticket', async () => {
    for (const bodyReq of [
      { filename: 'x.svg', contentType: 'image/svg+xml', size: 10 },
      { filename: 'x.png', contentType: 'image/png', size: 26 * 1024 * 1024 },
      { filename: 'x.png', contentType: 'image/png', size: 0 },
    ]) {
      let refused = false
      try { await createDirectUploadTicket(FILE_PREFIX.STUDENT_PHOTO, bodyReq) } catch { refused = true }
      if (!refused) throw new Error(`ticket issued for ${JSON.stringify(bodyReq)}`)
    }
  })

  console.log('Browser-style direct upload (public: public-media/gallery)')
  await check('ticket + PUT + public URL serves the image', async () => {
    const ticket = await createDirectUploadTicket(FILE_PREFIX.SCHOOL_GALLERY, { filename: 'smoke.png', contentType: 'image/png', size: PNG.length })
    created.push(ticket.fileId)
    const put = await browserPut(ticket, PNG)
    if (!put.ok) throw new Error(`PUT answered ${put.status} ${await put.text()}`)
    const url = await getPublicViewUrl(ticket.fileId)
    if (url !== ticket.publicUrl) throw new Error('ticket.publicUrl differs from getPublicViewUrl()')
    const res = await fetch(url)
    if (!res.ok) throw new Error(`GET ${url} answered ${res.status} — is the public-media bucket public and R2_PUBLIC_URL_MEDIA set?`)
    if (!Buffer.from(await res.arrayBuffer()).equals(PNG)) throw new Error('public bytes differ')
    if (!(res.headers.get('content-type') ?? '').startsWith('image/png')) throw new Error(`content-type is ${res.headers.get('content-type')}`)
  })
  await check('private files never get a public URL', async () => {
    let refused = false
    try { await getPublicViewUrl(privateId) } catch { refused = true }
    if (!refused) throw new Error('getPublicViewUrl() answered for a private file')
  })

  console.log('Server-side upload (generated documents)')
  await check('uploadFile + read-back + delete', async () => {
    const pdf = Buffer.from('%PDF-1.4 smoke')
    const up = await uploadFile(FILE_PREFIX.PAYSLIP, pdf, 'payslip smoke.pdf', 'application/pdf')
    created.push(up.fileId)
    const back = await streamFile(up.fileId)
    if (!Buffer.from(back.buffer).equals(pdf) || back.mimeType !== 'application/pdf' || back.filename !== 'payslip smoke.pdf') throw new Error('round trip differs')
    await deleteFile(up.fileId)
    let gone = false
    try { await getFileMetadata(up.fileId) } catch { gone = true }
    if (!gone) throw new Error('object still exists after delete')
  })

  console.log('Cleanup')
  for (const id of created) await deleteFile(id).catch(() => undefined)
  ok(`removed ${created.length} test object(s)`)

  console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll storage checks passed.')
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
