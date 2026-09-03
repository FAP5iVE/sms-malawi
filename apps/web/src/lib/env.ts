import 'server-only'
import { z } from 'zod'

// ─── SERVER-SIDE SCHEMA ───────────────────────────────────
const serverSchema = z.object({
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
  APPWRITE_ENDPOINT: z.string().url('APPWRITE_ENDPOINT must be a valid URL'),
  APPWRITE_PROJECT_ID: z.string().min(1, 'APPWRITE_PROJECT_ID is required'),
  APPWRITE_API_KEY: z.string().min(1, 'APPWRITE_API_KEY is required'),
  CRON_SECRET: z
    .string()
    .min(32, 'CRON_SECRET must be at least 32 characters for security'),
  SENTRY_API_TOKEN: z
    .string()
    .min(1, 'SENTRY_API_TOKEN is required for the monitoring dashboard'),
  SENTRY_WEBHOOK_SECRET: z
    .string()
    .min(1, 'SENTRY_WEBHOOK_SECRET is required to verify Sentry webhooks'),
  // Vercel-native monitoring (deployments, runtime logs, Web Analytics) —
  // see docs/vercel-native-monitoring-research.md. All optional: this
  // panel degrades to "not configured" rather than breaking the rest of
  // /monitoring if these aren't set yet.
  VERCEL_API_TOKEN: z.string().optional(),
  VERCEL_PROJECT_ID: z.string().optional(),
  VERCEL_TEAM_ID: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  ALGOLIA_APP_ID: z.string().optional(),
  ALGOLIA_ADMIN_KEY: z.string().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
})

// ─── CLIENT-SIDE / PUBLIC SCHEMA ─────────────────────────
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
  NEXT_PUBLIC_FIREBASE_VAPID_KEY: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional().default('http://localhost:3000'),
  NEXT_PUBLIC_API_URL: z.string().optional().default(''),
  NEXT_PUBLIC_ALGOLIA_APP_ID: z.string().optional(),
  NEXT_PUBLIC_ALGOLIA_SEARCH_KEY: z.string().optional(),
})

// ─── VALIDATION ───────────────────────────────────────────
function validateServerEnv(): z.infer<typeof serverSchema> {
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

function validateClientEnv(): z.infer<typeof clientSchema> {
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

// ─── LAZY SINGLETONS WITH BUILD-PHASE GUARD ───────────────
// During `next build`'s static analysis phase, NEXT_PHASE is set to
// 'phase-production-build'. Env vars are not available then, so we
// skip validation entirely. It runs on the first real request instead.
const isBuildPhase =
  process.env.NEXT_PHASE === 'phase-production-build' ||
  process.env.NEXT_PHASE === 'phase-export'

let _server: z.infer<typeof serverSchema> | null = null
let _client: z.infer<typeof clientSchema> | null = null

function getServerEnv(): z.infer<typeof serverSchema> {
  if (isBuildPhase) return process.env as unknown as z.infer<typeof serverSchema>
  if (!_server) _server = validateServerEnv()
  return _server
}

function getClientEnv(): z.infer<typeof clientSchema> {
  if (isBuildPhase) return process.env as unknown as z.infer<typeof clientSchema>
  if (!_client) _client = validateClientEnv()
  return _client
}

// ─── EXPORTED ENV OBJECT ──────────────────────────────────
export const env = {
  // ── Database
  get DATABASE_URL()    { return getServerEnv().DATABASE_URL },
  get DIRECT_URL()      { return getServerEnv().DIRECT_URL },

  // ── Firebase Admin
  get FIREBASE_PROJECT_ID()   { return getServerEnv().FIREBASE_PROJECT_ID },
  get FIREBASE_CLIENT_EMAIL() { return getServerEnv().FIREBASE_CLIENT_EMAIL },
  get FIREBASE_PRIVATE_KEY()  {
    const key = getServerEnv().FIREBASE_PRIVATE_KEY
    return key ? key.replace(/\\n/g, '\n') : key
  },

  // ── Appwrite
  get APPWRITE_ENDPOINT()   { return getServerEnv().APPWRITE_ENDPOINT },
  get APPWRITE_PROJECT_ID() { return getServerEnv().APPWRITE_PROJECT_ID },
  get APPWRITE_API_KEY()    { return getServerEnv().APPWRITE_API_KEY },

  // ── Cron
  get CRON_SECRET() { return getServerEnv().CRON_SECRET },

  // ── Sentry monitoring
  get SENTRY_API_TOKEN()      { return getServerEnv().SENTRY_API_TOKEN },
  get SENTRY_WEBHOOK_SECRET() { return getServerEnv().SENTRY_WEBHOOK_SECRET },
  get VERCEL_API_TOKEN()      { return getServerEnv().VERCEL_API_TOKEN },
  get VERCEL_PROJECT_ID()     { return getServerEnv().VERCEL_PROJECT_ID },
  get VERCEL_TEAM_ID()        { return getServerEnv().VERCEL_TEAM_ID },

  // ── Optional
  get RESEND_API_KEY()  { return getServerEnv().RESEND_API_KEY },
  get ALGOLIA_APP_ID()  { return getServerEnv().ALGOLIA_APP_ID },
  get ALGOLIA_ADMIN_KEY() { return getServerEnv().ALGOLIA_ADMIN_KEY },

  // ── Runtime
  get NODE_ENV()       { return getServerEnv().NODE_ENV },
  get IS_PRODUCTION()  { return getServerEnv().NODE_ENV === 'production' },
  get IS_DEVELOPMENT() { return getServerEnv().NODE_ENV === 'development' },
  get VERCEL_ENV()     { return getServerEnv().VERCEL_ENV },

  // ── Public / client-safe
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