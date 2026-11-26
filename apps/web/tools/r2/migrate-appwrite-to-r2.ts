/**
 * ONE-TIME CUTOVER TOOL — copy to apps/web/tools/r2/migrate-appwrite-to-r2.ts, run, then DELETE it.
 * It is the only thing that still talks to Appwrite, which is why it is NOT part of the repo.
 *
 *   pnpm exec cross-env NODE_OPTIONS=--require=./tools/r2/stub-server-only.cjs tsx tools/r2/migrate-appwrite-to-r2.ts --dry-run
 *   pnpm exec cross-env NODE_OPTIONS=--require=./tools/r2/stub-server-only.cjs tsx tools/r2/migrate-appwrite-to-r2.ts
 *
 * What it does (each step is idempotent — re-run it as often as you like):
 *   1. COPY    every file in the old Appwrite bucket to the R2 bucket of its category, under the SAME id
 *              (so no id stored in the database changes), keeping its filename and content type.
 *              Skips files already in R2 with the same size. Verifies the size of every copy.
 *   2. REWRITE image URLs saved inside rich text (announcement bodies in Firestore, assignment
 *              description/requirements in Postgres) from Appwrite URLs to the new public R2 URLs, and
 *              converts a school logo that points at Appwrite into an inline data: URI.
 *   3. VERIFY  every file id referenced anywhere in the database exists in R2.
 *
 * Environment (read from the shell / .env.local — nothing is written to the repo):
 *   Old storage : APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_BUCKET_ID
 *   New storage : R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_PREFIX, R2_PUBLIC_URL_*
 *   Database    : DATABASE_URL (or DIRECT_URL), FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *   Optional    : UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (to drop the cached logo setting)
 * Flags: --dry-run (change nothing)  --skip-copy  --skip-rewrite  --skip-verify  --allow-unmapped
 */
import { PrismaClient, Prisma } from '@prisma/client'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import {
  FILE_PREFIX,
  getFileMetadata,
  getPublicViewUrl,
  isPublicPrefix,
  resolvePrefix,
  uploadFile,
} from '../../src/lib/storage'

const args = new Set(process.argv.slice(2))
const DRY = args.has('--dry-run')
const need = (name: string) => {
  const v = process.env[name]
  if (!v) throw new Error(`Missing environment variable ${name}`)
  return v
}

const APPWRITE_ENDPOINT = need('APPWRITE_ENDPOINT').replace(/\/+$/, '')
const APPWRITE_PROJECT_ID = need('APPWRITE_PROJECT_ID')
const APPWRITE_API_KEY = need('APPWRITE_API_KEY')
const APPWRITE_BUCKET_ID = need('APPWRITE_BUCKET_ID')
const aw = (path: string) =>
  fetch(`${APPWRITE_ENDPOINT}${path}`, { headers: { 'X-Appwrite-Project': APPWRITE_PROJECT_ID, 'X-Appwrite-Key': APPWRITE_API_KEY } })

interface SourceFile { $id: string; name: string; mimeType: string; sizeOriginal: number }

async function* listSourceFiles(): AsyncGenerator<SourceFile> {
  let cursor: string | undefined
  for (;;) {
    const queries = [{ method: 'limit', values: [100] }, ...(cursor ? [{ method: 'cursorAfter', values: [cursor] }] : [])]
    const qs = queries.map((q) => `queries[]=${encodeURIComponent(JSON.stringify(q))}`).join('&')
    const res = await aw(`/storage/buckets/${APPWRITE_BUCKET_ID}/files?${qs}`)
    if (!res.ok) throw new Error(`Listing Appwrite files failed: ${res.status} ${await res.text()}`)
    const page = (await res.json()) as { files: SourceFile[] }
    if (page.files.length === 0) return
    yield* page.files
    cursor = page.files[page.files.length - 1]!.$id
    if (page.files.length < 100) return
  }
}

async function downloadSource(id: string): Promise<Buffer> {
  const res = await aw(`/storage/buckets/${APPWRITE_BUCKET_ID}/files/${encodeURIComponent(id)}/download`)
  if (!res.ok) throw new Error(`Downloading ${id} failed: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

// ─── 1. COPY ─────────────────────────────────────────────────────────────────
async function copyFiles(): Promise<void> {
  console.log('\n[1/3] Copying files Appwrite → R2')
  const unmapped: string[] = []
  const failed: string[] = []
  let copied = 0, skipped = 0, total = 0
  const queue: SourceFile[] = []
  for await (const f of listSourceFiles()) queue.push(f)

  async function one(f: SourceFile) {
    total++
    const prefix = resolvePrefix(f.$id)
    if (!prefix) { unmapped.push(`${f.$id} (${f.name})`); return }
    try {
      const existing = await getFileMetadata(f.$id).catch(() => null)
      if (existing && existing.sizeBytes === f.sizeOriginal) { skipped++; return }
      if (DRY) { console.log(`  would copy ${f.$id} → ${prefix} (${f.sizeOriginal} bytes)`); copied++; return }
      const bytes = await downloadSource(f.$id)
      if (bytes.length !== f.sizeOriginal) throw new Error(`downloaded ${bytes.length} bytes, expected ${f.sizeOriginal}`)
      await uploadFile(prefix, bytes, f.name, f.mimeType, f.$id)
      const back = await getFileMetadata(f.$id)
      if (back.sizeBytes !== f.sizeOriginal) throw new Error(`R2 holds ${back.sizeBytes} bytes, expected ${f.sizeOriginal}`)
      copied++
    } catch (err) {
      failed.push(`${f.$id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  const workers = Array.from({ length: 4 }, async () => { for (let f = queue.shift(); f; f = queue.shift()) await one(f) })
  await Promise.all(workers)

  console.log(`  ${total} file(s) in Appwrite: ${copied} ${DRY ? 'to copy' : 'copied'}, ${skipped} already in R2, ${unmapped.length} unmapped, ${failed.length} failed`)
  if (unmapped.length) {
    console.log('  UNMAPPED (id has no known category prefix, so no bucket to put it in):')
    unmapped.forEach((u) => console.log(`    ${u}`))
  }
  failed.forEach((f) => console.error(`  FAILED ${f}`))
  if (failed.length || (unmapped.length && !args.has('--allow-unmapped'))) {
    throw new Error('Copy step incomplete — fix the items above (or pass --allow-unmapped once you have checked the unmapped list is unused) and re-run.')
  }
}

// ─── 2. REWRITE ──────────────────────────────────────────────────────────────
const APPWRITE_FILE_URL = /https?:\/\/[^\s"'<>]+?\/storage\/buckets\/[^/\s"'<>]+\/files\/([A-Za-z0-9_-]+)\/(?:view|download|preview)(?:\?[^\s"'<>]*)?/g

async function rewriteHtml(html: string, unresolved: Set<string>): Promise<string> {
  const matches = [...html.matchAll(APPWRITE_FILE_URL)]
  let out = html
  for (const m of matches) {
    const id = m[1]!
    const prefix = resolvePrefix(id)
    if (prefix && isPublicPrefix(prefix)) out = out.split(m[0]).join(await getPublicViewUrl(id))
    else unresolved.add(m[0])
  }
  return out
}

async function rewriteUrls(prisma: PrismaClient): Promise<void> {
  console.log('\n[2/3] Rewriting stored image URLs')
  const unresolved = new Set<string>()

  // Assignments (Postgres)
  let assignments = 0
  const rows = await prisma.assignment.findMany({ select: { id: true, description: true, requirements: true } })
  for (const a of rows) {
    const description = a.description ? await rewriteHtml(a.description, unresolved) : a.description
    const requirements = a.requirements ? await rewriteHtml(a.requirements, unresolved) : a.requirements
    if (description !== a.description || requirements !== a.requirements) {
      assignments++
      if (!DRY) await prisma.assignment.update({ where: { id: a.id }, data: { description, requirements } })
    }
  }
  console.log(`  assignments rewritten: ${assignments}`)

  // Announcements (Firestore)
  if (!getApps().length) {
    initializeApp({ credential: cert({ projectId: need('FIREBASE_PROJECT_ID'), clientEmail: need('FIREBASE_CLIENT_EMAIL'), privateKey: need('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n') }) })
  }
  const fs = getFirestore()
  let announcements = 0
  const snap = await fs.collection('announcements').get()
  for (const doc of snap.docs) {
    const body = doc.get('body')
    if (typeof body !== 'string') continue
    const next = await rewriteHtml(body, unresolved)
    if (next !== body) {
      announcements++
      if (!DRY) await doc.ref.update({ body: next })
    }
  }
  console.log(`  announcements rewritten: ${announcements}`)

  // School logo setting: inline it if it points at Appwrite.
  const logo = await prisma.systemSettings.findUnique({ where: { key: 'school_logo_url' } }).catch(() => null)
  const logoValue = typeof logo?.value === 'string' ? logo.value : ''
  const lm = logoValue ? [...logoValue.matchAll(APPWRITE_FILE_URL)][0] : undefined
  if (logo && lm) {
    const bytes = await downloadSource(lm[1]!)
    const meta = await (await aw(`/storage/buckets/${APPWRITE_BUCKET_ID}/files/${encodeURIComponent(lm[1]!)}`)).json() as { mimeType: string }
    if (bytes.length > 2 * 1024 * 1024) console.error('  school logo is over 2 MB — the app falls back to the built-in logo; upload a smaller one in Settings.')
    else if (!DRY) {
      await prisma.systemSettings.update({ where: { key: logo.key }, data: { value: `data:${meta.mimeType};base64,${bytes.toString('base64')}` } })
      if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/del/settings:${logo.key}`, { headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` } })
      }
    }
    console.log('  school logo converted to an inline data: URI')
  }

  if (unresolved.size) {
    console.log('  Appwrite URLs left untouched (their file is not in a public category):')
    unresolved.forEach((u) => console.log(`    ${u}`))
  }
}

// ─── 3. VERIFY ───────────────────────────────────────────────────────────────
const KEY_VALUE = new RegExp(`^(?:${Object.values(FILE_PREFIX).join('|')})_[A-Za-z0-9_-]+$`)

async function collectDatabaseKeys(prisma: PrismaClient): Promise<Map<string, string>> {
  const keys = new Map<string, string>() // id → where it was found
  for (const model of Prisma.dmmf.datamodel.models) {
    const fields = model.fields.filter((f) => f.kind === 'scalar' && f.type === 'String' && /key$/i.test(f.name)).map((f) => f.name)
    if (!fields.length) continue
    const delegate = (prisma as unknown as Record<string, { findMany(a: unknown): Promise<Record<string, unknown>[]> } | undefined>)[model.name[0]!.toLowerCase() + model.name.slice(1)]
    if (!delegate) continue
    const rows = await delegate.findMany({ select: Object.fromEntries(fields.map((f) => [f, true])) })
    for (const row of rows) for (const f of fields) {
      const v = row[f]
      if (typeof v === 'string' && KEY_VALUE.test(v)) keys.set(v, `${model.name}.${f}`)
    }
  }
  // Keys inside settings JSON (leadership / discover photos).
  for (const s of await prisma.systemSettings.findMany()) {
    for (const m of JSON.stringify(s.value ?? null).matchAll(/"photoKey":"([^"]+)"/g)) if (KEY_VALUE.test(m[1]!)) keys.set(m[1]!, `SystemSettings.${s.key}`)
  }
  // Cover images on announcements (Firestore).
  for (const doc of (await getFirestore().collection('announcements').get()).docs) {
    const k = doc.get('imageKey')
    if (typeof k === 'string' && KEY_VALUE.test(k)) keys.set(k, `announcements/${doc.id}.imageKey`)
  }
  return keys
}

async function verify(prisma: PrismaClient): Promise<void> {
  console.log('\n[3/3] Verifying every file id referenced by the database exists in R2')
  const keys = await collectDatabaseKeys(prisma)
  const missing: string[] = []
  for (const [id, where] of keys) await getFileMetadata(id).catch(() => missing.push(`${id}  (${where})`))
  console.log(`  ${keys.size} referenced file id(s) checked, ${missing.length} missing`)
  missing.forEach((m) => console.error(`  MISSING ${m}`))
  if (missing.length) throw new Error('Some referenced files are not in R2. They were not in Appwrite either, or the copy step was skipped.')
}

async function main() {
  console.log(DRY ? 'DRY RUN — nothing will be changed.' : 'LIVE RUN')
  const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL || need('DATABASE_URL') })
  try {
    if (!args.has('--skip-copy')) await copyFiles()
    if (!args.has('--skip-rewrite')) await rewriteUrls(prisma)
    if (!args.has('--skip-verify')) await verify(prisma)
  } finally {
    await prisma.$disconnect()
  }
  console.log('\nDone. After you have checked the app on R2, delete this tool and revoke the Appwrite API key.')
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
