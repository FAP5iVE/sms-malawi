/**
 * tools/r2/provision.ts — creates the Cloudflare R2 buckets this app uses (one
 * per security domain, see src/lib/storage.ts) and applies the CORS rule
 * browsers need to upload straight to the buckets they upload to.
 *
 *   pnpm r2:provision
 *
 * Safe to run repeatedly: existing buckets are left alone, CORS is re-applied.
 *
 * Needs an R2 API token with "Admin Read & Write" (creating buckets and setting
 * CORS is an admin operation). Provide it as R2_ADMIN_ACCESS_KEY_ID /
 * R2_ADMIN_SECRET_ACCESS_KEY; if those are unset, R2_ACCESS_KEY_ID /
 * R2_SECRET_ACCESS_KEY are used. The app itself only needs an "Object Read &
 * Write" token at runtime.
 *
 * Environment: R2_ACCOUNT_ID, R2_BUCKET_PREFIX (optional), R2_CORS_ORIGINS
 * (comma-separated origins allowed to upload; defaults to NEXT_PUBLIC_APP_URL
 * and http://localhost:3000).
 */
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketCorsCommand,
} from '@aws-sdk/client-s3'
import { PUBLIC_URL_ENV, listBuckets } from '../../src/lib/storage'

const accountId = process.env.R2_ACCOUNT_ID
const accessKeyId = process.env.R2_ADMIN_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID
const secretAccessKey = process.env.R2_ADMIN_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY
const endpoint = process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined)

if (!accountId || !accessKeyId || !secretAccessKey || !endpoint) {
  console.error('Set R2_ACCOUNT_ID and an access key pair (R2_ADMIN_ACCESS_KEY_ID/R2_ADMIN_SECRET_ACCESS_KEY or R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY).')
  process.exit(1)
}

// storage.ts reads the runtime variables when it resolves bucket names; here the admin pair stands in for them.
process.env.R2_ACCESS_KEY_ID ||= accessKeyId
process.env.R2_SECRET_ACCESS_KEY ||= secretAccessKey

const origins = (process.env.R2_CORS_ORIGINS || [process.env.NEXT_PUBLIC_APP_URL, 'http://localhost:3000'].filter(Boolean).join(','))
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean)

const s3 = new S3Client({
  region: 'auto',
  endpoint,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
})

async function exists(bucket: string): Promise<boolean> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }))
    return true
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    if (status === 404) return false
    throw err
  }
}

async function main() {
  console.log(`R2 account ${accountId} — CORS origins: ${origins.join(', ')}\n`)
  let failures = 0
  for (const { bucket, isPublic, categories } of listBuckets()) {
    try {
      const existed = await exists(bucket)
      if (!existed) await s3.send(new CreateBucketCommand({ Bucket: bucket }))
      const uploads = categories.some((c) => c.browserUploadable)
      if (uploads) {
        await s3.send(new PutBucketCorsCommand({
          Bucket: bucket,
          CORSConfiguration: {
            CORSRules: [{
              AllowedOrigins: origins,
              AllowedMethods: ['PUT'],
              AllowedHeaders: ['content-type', 'cache-control', 'x-amz-meta-filename'],
              ExposeHeaders: ['ETag'],
              MaxAgeSeconds: 3600,
            }],
          },
        }))
      }
      console.log(`${existed ? 'exists ' : 'created'}  ${bucket}  [${isPublic ? 'PUBLIC' : 'private'}]${uploads ? ' + upload CORS' : ''}`)
      console.log(`           folders: ${categories.map((c) => `${c.folder}/`).join('  ')}`)
        } catch (err) {
      failures++
      const e = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } }
      console.error(`FAILED   ${bucket}: HTTP ${e.$metadata?.httpStatusCode ?? '?'} ${e.name} ${e.message}`)
    }
  }

  const publicBucket = listBuckets().find((b) => b.isPublic)
  console.log(`\nNext: make ONLY ${publicBucket?.bucket} publicly readable (dashboard → R2 → that bucket → Settings → Public access:`)
  console.log('  attach a Custom Domain (recommended) or enable the r2.dev subdomain), then set in Vercel:')
  console.log(`  ${PUBLIC_URL_ENV} = <public URL of ${publicBucket?.bucket}>   (no trailing slash)`)
  console.log('\nLeave every other bucket private — they are served only through /api/files.')
  if (failures) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
