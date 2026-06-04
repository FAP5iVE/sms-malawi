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
const _server = validateServerEnv()
const _client = validateClientEnv()

// ─── EXPORTED ENV OBJECT ──────────────────────────────────
// Import `env` instead of `process.env` everywhere — type-safe & validated.
export const env = {
  // ── Database
  DATABASE_URL: _server.DATABASE_URL,
  DIRECT_URL: _server.DIRECT_URL,

  // ── Firebase Admin
  FIREBASE_PROJECT_ID: _server.FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL: _server.FIREBASE_CLIENT_EMAIL,
  // Normalise escaped newlines that Vercel injects into private keys
  FIREBASE_PRIVATE_KEY: _server.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),

  // ── Appwrite
  APPWRITE_ENDPOINT: _server.APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID: _server.APPWRITE_PROJECT_ID,
  APPWRITE_API_KEY: _server.APPWRITE_API_KEY,

  // ── Cron
  CRON_SECRET: _server.CRON_SECRET,

  // ── Optional services
  RESEND_API_KEY:           _server.RESEND_API_KEY,
  ALGOLIA_APP_ID: _server.ALGOLIA_APP_ID,
  ALGOLIA_API_KEY: _server.ALGOLIA_API_KEY,

  // ── Runtime flags
  NODE_ENV: _server.NODE_ENV,
  IS_PRODUCTION: _server.NODE_ENV === 'production',
  IS_DEVELOPMENT: _server.NODE_ENV === 'development',
  VERCEL_ENV: _server.VERCEL_ENV,

  // ── Public (client-safe — safe to expose to the browser)
  NEXT_PUBLIC_FIREBASE_API_KEY: _client.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: _client.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: _client.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: _client.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:
    _client.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: _client.NEXT_PUBLIC_FIREBASE_APP_ID,
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: _client.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  NEXT_PUBLIC_FIREBASE_VAPID_KEY: _client.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
  NEXT_PUBLIC_APP_URL: _client.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_API_URL: _client.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_ALGOLIA_APP_ID: _client.NEXT_PUBLIC_ALGOLIA_APP_ID,
  NEXT_PUBLIC_ALGOLIA_SEARCH_KEY: _client.NEXT_PUBLIC_ALGOLIA_SEARCH_KEY,
} as const

export type Env = typeof env