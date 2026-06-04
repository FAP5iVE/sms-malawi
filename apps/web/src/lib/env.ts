import 'server-only'
import { z } from 'zod'

// ─── SERVER-SIDE SCHEMA ────────────────────────────────────
const serverSchema = z.object({
  // Neon / Prisma
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .refine(
      (v) => v.startsWith('postgresql://') || v.startsWith('postgres://'),
      'DATABASE_URL must be a valid PostgreSQL connection string'
    ),
  DIRECT_URL: z
    .string()
    .optional()
    .refine(
      (v) => !v || v.startsWith('postgresql://') || v.startsWith('postgres://'),
      'DIRECT_URL must be a valid PostgreSQL connection string'
    ),

  // Firebase Admin SDK
  FIREBASE_PROJECT_ID: z.string().min(1, 'FIREBASE_PROJECT_ID is required'),
  FIREBASE_CLIENT_EMAIL: z
    .string()
    .email('FIREBASE_CLIENT_EMAIL must be a valid service account email'),
  FIREBASE_PRIVATE_KEY: z
    .string()
    .min(1, 'FIREBASE_PRIVATE_KEY is required')
    .refine(
      (v) => v.includes('-----BEGIN') || v.includes('\\n'),
      'FIREBASE_PRIVATE_KEY does not look like a valid PEM key'
    ),

  // Appwrite (server SDK — node-appwrite)
  APPWRITE_ENDPOINT: z.string().url('APPWRITE_ENDPOINT must be a valid URL'),
  APPWRITE_PROJECT_ID: z.string().min(1, 'APPWRITE_PROJECT_ID is required'),
  APPWRITE_API_KEY: z.string().min(1, 'APPWRITE_API_KEY is required'),

  // Cron security — must be strong enough to resist brute force
  CRON_SECRET: z
    .string()
    .min(32, 'CRON_SECRET must be at least 32 characters for security'),

  // Optional services
  RESEND_API_KEY: z.string().optional(),
  ALGOLIA_APP_ID: z.string().optional(),
  ALGOLIA_API_KEY: z.string().optional(),

  // Runtime
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
})

// ─── CLIENT-SIDE / PUBLIC SCHEMA ──────────────────────────
const clientSchema = z.object({
  NEXT_PUBLIC_FIREBASE_API_KEY: z
    .string()
    .min(1, 'NEXT_PUBLIC_FIREBASE_API_KEY is required'),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z
    .string()
    .min(1, 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN is required'),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z
    .string()
    .min(1, 'NEXT_PUBLIC_FIREBASE_PROJECT_ID is required'),
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_APP_ID: z
    .string()
    .min(1, 'NEXT_PUBLIC_FIREBASE_APP_ID is required'),
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: z.string().optional(),
  // VAPID key for Firebase Cloud Messaging push notifications.
  // Generate in Firebase Console → Project Settings → Cloud Messaging → Web Push certificates.
  NEXT_PUBLIC_FIREBASE_VAPID_KEY: z.string().optional(),

  // App URLs
  NEXT_PUBLIC_APP_URL: z.string().url().optional().default('http://localhost:3000'),
  NEXT_PUBLIC_API_URL: z.string().optional().default(''),

  // Optional public Algolia credentials (search-only key — safe to expose)
  NEXT_PUBLIC_ALGOLIA_APP_ID: z.string().optional(),
  NEXT_PUBLIC_ALGOLIA_SEARCH_KEY: z.string().optional(),
})

// ─── VALIDATION ───────────────────────────────────────────
function validateServerEnv() {
  const result = serverSchema.safeParse(process.env)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(
      `\n╔══════════════════════════════════════════════════╗\n` +
        `║  FATAL: Missing / invalid server env variables  ║\n` +
        `╚══════════════════════════════════════════════════╝\n` +
        `${issues}\n`
    )
  }
  return result.data
}

function validateClientEnv() {
  const result = clientSchema.safeParse(process.env)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(
      `\n╔═════════════════════════════════════════════════════╗\n` +
        `║  FATAL: Missing / invalid public env variables     ║\n` +
        `╚═════════════════════════════════════════════════════╝\n` +
        `${issues}\n`
    )
  }
  return result.data
}

// Validate eagerly at module load — fails the build / server start immediately
// so misconfigurations are caught before the first request, not during it.
// Lazy validation — only runs at request time, not during Next.js build phase
let _server: z.infer<typeof serverSchema> | null = null
let _client: z.infer<typeof clientSchema> | null = null

function getServerEnv() {
  if (!_server) _server = validateServerEnv()
  return _server
}

function getClientEnv() {
  if (!_client) _client = validateClientEnv()
  return _client
}

// ─── EXPORTED ENV OBJECT ──────────────────────────────────
// Import `env` instead of `process.env` everywhere — type-safe & validated.
export const env = {
  get DATABASE_URL()                             { return getServerEnv().DATABASE_URL },
  get DIRECT_URL()                               { return getServerEnv().DIRECT_URL },
  get FIREBASE_PROJECT_ID()                      { return getServerEnv().FIREBASE_PROJECT_ID },
  get FIREBASE_CLIENT_EMAIL()                    { return getServerEnv().FIREBASE_CLIENT_EMAIL },
  get FIREBASE_PRIVATE_KEY()                     { return getServerEnv().FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') },
  get APPWRITE_ENDPOINT()                        { return getServerEnv().APPWRITE_ENDPOINT },
  get APPWRITE_PROJECT_ID()                      { return getServerEnv().APPWRITE_PROJECT_ID },
  get APPWRITE_API_KEY()                         { return getServerEnv().APPWRITE_API_KEY },
  get CRON_SECRET()                              { return getServerEnv().CRON_SECRET },
  get RESEND_API_KEY()                           { return getServerEnv().RESEND_API_KEY },
  get ALGOLIA_APP_ID()                           { return getServerEnv().ALGOLIA_APP_ID },
  get ALGOLIA_API_KEY()                          { return getServerEnv().ALGOLIA_API_KEY },
  get NODE_ENV()                                 { return getServerEnv().NODE_ENV },
  get IS_PRODUCTION()                            { return getServerEnv().NODE_ENV === 'production' },
  get IS_DEVELOPMENT()                           { return getServerEnv().NODE_ENV === 'development' },
  get VERCEL_ENV()                               { return getServerEnv().VERCEL_ENV },
  get NEXT_PUBLIC_FIREBASE_API_KEY()             { return getClientEnv().NEXT_PUBLIC_FIREBASE_API_KEY },
  get NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN()         { return getClientEnv().NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN },
  get NEXT_PUBLIC_FIREBASE_PROJECT_ID()          { return getClientEnv().NEXT_PUBLIC_FIREBASE_PROJECT_ID },
  get NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET()      { return getClientEnv().NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET },
  get NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID() { return getClientEnv().NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID },
  get NEXT_PUBLIC_FIREBASE_APP_ID()              { return getClientEnv().NEXT_PUBLIC_FIREBASE_APP_ID },
  get NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID()      { return getClientEnv().NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID },
  get NEXT_PUBLIC_FIREBASE_VAPID_KEY()           { return getClientEnv().NEXT_PUBLIC_FIREBASE_VAPID_KEY },
  get NEXT_PUBLIC_APP_URL()                      { return getClientEnv().NEXT_PUBLIC_APP_URL },
  get NEXT_PUBLIC_API_URL()                      { return getClientEnv().NEXT_PUBLIC_API_URL },
  get NEXT_PUBLIC_ALGOLIA_APP_ID()               { return getClientEnv().NEXT_PUBLIC_ALGOLIA_APP_ID },
  get NEXT_PUBLIC_ALGOLIA_SEARCH_KEY()           { return getClientEnv().NEXT_PUBLIC_ALGOLIA_SEARCH_KEY },
}

export type Env = typeof env