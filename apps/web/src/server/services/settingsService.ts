import 'server-only'

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import {
  SETTING_KEYS,
  SETTING_META,
  SETTING_CATEGORIES,
  type SettingKey,
  type SettingValueMap,
  type SettingCategory,
  type SettingRow,
  type CategoryGroupedSettings,
  type SchoolIdentitySettings,
} from '@shared/types/settings'
import { SETTING_VALUE_SCHEMAS } from '@shared/schemas/settings'

// ─────────────────────────────────────────────────────────
//  MODULE-LEVEL TTL CACHE
//  Persists within a warm Vercel Lambda instance.
//  Different categories get different TTLs based on how often
//  the data changes in production.
//
//  Phase B5 note: Replace with Upstash Redis (@upstash/ratelimit
//  / ioredis) for cross-instance cache sharing.
// ─────────────────────────────────────────────────────────

const TTL_MS = {
  SCHOOL_IDENTITY: 24 * 60 * 60 * 1000,  // 24 h — name, slogan, vision rarely change
  ACADEMIC:         1 * 60 * 60 * 1000,  // 1 h  — current year/term, term dates
  EXAM:            30 * 60 * 1000,        // 30 m — pass mark, MANEB config
  FINANCE:         30 * 60 * 1000,        // 30 m — penalty rates, payroll day
  LIBRARY:         30 * 60 * 1000,        // 30 m — loan periods, fine rates
  HR:              30 * 60 * 1000,        // 30 m — leave entitlements
  SECURITY:         5 * 60 * 1000,        // 5 m  — session timeouts (security-sensitive)
  SYSTEM:           5 * 60 * 1000,        // 5 m  — maintenance mode flag
} as const

function getTtl(category: SettingCategory): number {
  switch (category) {
    case SETTING_CATEGORIES.SCHOOL_IDENTITY: return TTL_MS.SCHOOL_IDENTITY
    case SETTING_CATEGORIES.ACADEMIC:        return TTL_MS.ACADEMIC
    case SETTING_CATEGORIES.EXAM:            return TTL_MS.EXAM
    case SETTING_CATEGORIES.FINANCE:         return TTL_MS.FINANCE
    case SETTING_CATEGORIES.LIBRARY:         return TTL_MS.LIBRARY
    case SETTING_CATEGORIES.HR:              return TTL_MS.HR
    case SETTING_CATEGORIES.SECURITY:        return TTL_MS.SECURITY
    default:                                 return TTL_MS.SYSTEM
  }
}

interface CacheEntry {
  value: unknown
  expiresAt: number
}

// Module-level singleton — one cache per warm Lambda instance
const _cache = new Map<string, CacheEntry>()

function cacheGet<T>(key: string): T | undefined {
  const entry = _cache.get(key)
  if (!entry) return undefined
  if (Date.now() > entry.expiresAt) {
    _cache.delete(key)
    return undefined
  }
  return entry.value as T
}

function cacheSet(key: string, value: unknown, ttlMs: number): void {
  _cache.set(key, { value, expiresAt: Date.now() + ttlMs })
}

// ─────────────────────────────────────────────────────────
//  INTERNAL HELPERS
// ─────────────────────────────────────────────────────────

/**
 * Parse a raw Prisma JSON value to the correct TypeScript type.
 * Prisma returns JsonValue (string | number | boolean | null | object | array).
 * The generic cast is safe because the DB value was validated by Zod at write-time.
 */
function parseValue<K extends SettingKey>(
  key: K,
  rawValue: unknown
): SettingValueMap[K] {
  // If raw value is undefined / null, fall back to the default
  if (rawValue === undefined || rawValue === null) {
    return SETTING_META[key].defaultValue
  }
  // Runtime validation ensures the stored JSON is still valid
  const schema = SETTING_VALUE_SCHEMAS[key]
  const result = schema.safeParse(rawValue)
  if (!result.success) {
    logger.warn(
      { key, rawValue, issues: result.error.issues },
      '[settingsService] Stored setting failed schema validation — using default'
    )
    return SETTING_META[key].defaultValue
  }
  return result.data as SettingValueMap[K]
}

function toSettingRow<K extends SettingKey>(
  key: K,
  row: {
    value: unknown
    description: string | null
    category: string
    isPublic: boolean
    updatedByUid: string | null
    updatedAt: Date
  }
): SettingRow<K> {
  return {
    key,
    value: parseValue(key, row.value),
    category: row.category as SettingCategory,
    isPublic: row.isPublic,
    description: row.description,
    updatedByUid: row.updatedByUid,
    updatedAt: row.updatedAt,
  }
}

// ─────────────────────────────────────────────────────────
//  PUBLIC API
// ─────────────────────────────────────────────────────────

/**
 * Get a single setting value.
 * Returns the cached value if valid, otherwise queries Neon.
 * Falls back to the SETTING_META default if the key does not exist in the DB.
 */
export async function get<K extends SettingKey>(
  key: K
): Promise<SettingValueMap[K]> {
  const cached = cacheGet<SettingValueMap[K]>(key)
  if (cached !== undefined) return cached

  const row = await prisma.systemSettings.findUnique({ where: { key } })

  const value = row
    ? parseValue(key, row.value)
    : SETTING_META[key].defaultValue

  cacheSet(key, value, getTtl(SETTING_META[key].category))
  return value
}

/**
 * Get multiple settings in a single Neon query.
 * Returns an object keyed by SettingKey with strongly-typed values.
 * Keys not found in the DB are filled with their defaults.
 *
 * @example
 *   const { current_academic_year, current_term } = await getMany([
 *     SETTING_KEYS.CURRENT_ACADEMIC_YEAR,
 *     SETTING_KEYS.CURRENT_TERM,
 *   ])
 */
export async function getMany<K extends SettingKey>(
  keys: readonly K[]
): Promise<{ [P in K]: SettingValueMap[P] }> {
  const result = {} as { [P in K]: SettingValueMap[P] }
  const uncached: K[] = []

  // Serve what we have in cache
  for (const key of keys) {
    const cached = cacheGet<SettingValueMap[K]>(key)
    if (cached !== undefined) {
      result[key] = cached as SettingValueMap[typeof key]
    } else {
      uncached.push(key)
    }
  }

  if (uncached.length === 0) return result

  // Batch-fetch uncached keys in one query
  const rows = await prisma.systemSettings.findMany({
    where: { key: { in: uncached } },
  })

  const rowMap = new Map(rows.map((r) => [r.key, r]))

  for (const key of uncached) {
    const row = rowMap.get(key)
    const value = row
      ? parseValue(key, row.value)
      : SETTING_META[key].defaultValue

    cacheSet(key, value, getTtl(SETTING_META[key].category))
    result[key] = value as SettingValueMap[typeof key]
  }

  return result
}

/**
 * Update a single setting value.
 * Validates the new value against the Zod schema.
 * Invalidates the cache entry after a successful write.
 * Writes an audit-friendly log entry.
 */
export async function set<K extends SettingKey>(
  key: K,
  value: SettingValueMap[K],
  updatedByUid: string
): Promise<void> {
  // Runtime validation before writing to DB
  const schema = SETTING_VALUE_SCHEMAS[key]
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw Object.assign(new Error(`Invalid value for setting "${key}".`), {
      status: 400,
      validationErrors: parsed.error.flatten(),
    })
  }

  const meta = SETTING_META[key]

  await prisma.systemSettings.upsert({
    where: { key },
    update: {
      value: parsed.data as object,
      updatedByUid,
      // updatedAt is managed by Prisma @updatedAt
    },
    create: {
      key,
      value: parsed.data as object,
      description: meta.description,
      category: meta.category,
      isPublic: meta.isPublic,
      updatedByUid,
    },
  })

  // Invalidate cache so the next read fetches the fresh value
  _cache.delete(key)

  logger.info(
    { key, category: meta.category, updatedByUid },
    '[settingsService] Setting updated'
  )
}

/**
 * Update multiple settings in a single database transaction.
 * All updates succeed or all fail — no partial writes.
 * Validates every value before starting the transaction.
 */
export async function setMany(
  updates: Array<{ key: SettingKey; value: unknown }>,
  updatedByUid: string
): Promise<void> {
  // Validate all values first — fail fast before touching the DB
  const validated: Array<{ key: SettingKey; value: unknown }> = []

  for (const { key, value } of updates) {
    const schema = SETTING_VALUE_SCHEMAS[key]
    const parsed = schema.safeParse(value)
    if (!parsed.success) {
      throw Object.assign(
        new Error(`Invalid value for setting "${key}": ${parsed.error.message}`),
        { status: 400, key, validationErrors: parsed.error.flatten() }
      )
    }
    validated.push({ key, value: parsed.data })
  }

  // Prisma $transaction with the HTTP adapter sends all operations
  // as a single HTTP request to Neon, minimising round-trips.
  await prisma.$transaction(
    validated.map(({ key, value }) => {
      const meta = SETTING_META[key]
      return prisma.systemSettings.upsert({
        where: { key },
        update: { value: value as object, updatedByUid },
        create: {
          key,
          value: value as object,
          description: meta.description,
          category: meta.category,
          isPublic: meta.isPublic,
          updatedByUid,
        },
      })
    })
  )

  // Invalidate all updated keys from cache
  for (const { key } of updates) {
    _cache.delete(key)
  }

  logger.info(
    { keys: updates.map((u) => u.key), count: updates.length, updatedByUid },
    '[settingsService] Batch settings update'
  )
}

/**
 * Get all settings grouped by category.
 * Intended for the admin / high_rank settings management UI.
 * Bypasses cache — always fetches fresh from DB.
 */
export async function getAll(): Promise<CategoryGroupedSettings> {
  const rows = await prisma.systemSettings.findMany({
    orderBy: [{ category: 'asc' }, { key: 'asc' }],
  })

  const rowMap = new Map(rows.map((r) => [r.key, r]))
  const grouped: CategoryGroupedSettings = {}

  for (const key of Object.keys(SETTING_META) as SettingKey[]) {
    const meta = SETTING_META[key]
    const dbRow = rowMap.get(key)

    const settingRow: SettingRow = {
      key,
      value: dbRow ? parseValue(key, dbRow.value) : meta.defaultValue,
      category: meta.category,
      isPublic: meta.isPublic,
      description: dbRow?.description ?? meta.description,
      updatedByUid: dbRow?.updatedByUid ?? null,
      updatedAt: dbRow?.updatedAt ?? new Date(0),
    }

    const category = meta.category as SettingCategory
    if (!grouped[category]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      grouped[category] = [] as any
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(grouped[category] as any[]).push(settingRow)
  }

  return grouped
}

/**
 * Get all settings where isPublic = true.
 * Any authenticated user may request these.
 * Results are cached with the ACADEMIC TTL as a conservative default.
 */
export async function getPublicSettings(): Promise<Partial<SettingValueMap>> {
  const CACHE_KEY = '__public_settings__'
  const cached = cacheGet<Partial<SettingValueMap>>(CACHE_KEY)
  if (cached) return cached

  const publicKeys = (Object.keys(SETTING_META) as SettingKey[]).filter(
    (k) => SETTING_META[k].isPublic
  )

  const result = await getMany(publicKeys)
  const partial: Partial<SettingValueMap> = {}
  for (const key of publicKeys) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(partial as any)[key] = result[key]
  }

  cacheSet(CACHE_KEY, partial, TTL_MS.ACADEMIC)
  return partial
}

/**
 * Get school identity settings only.
 * Used by the public landing page (ISR — no auth required).
 * Suitable for exposure to unauthenticated users.
 */
export async function getIdentitySettings(): Promise<SchoolIdentitySettings> {
  const CACHE_KEY = '__identity_settings__'
  const cached = cacheGet<SchoolIdentitySettings>(CACHE_KEY)
  if (cached) return cached

  const vals = await getMany([
    SETTING_KEYS.SCHOOL_NAME,
    SETTING_KEYS.SCHOOL_SLOGAN,
    SETTING_KEYS.SCHOOL_VISION,
    SETTING_KEYS.SCHOOL_MISSION,
    SETTING_KEYS.SCHOOL_CORE_VALUES,
    SETTING_KEYS.SCHOOL_ADDRESS,
    SETTING_KEYS.SCHOOL_PHONE,
    SETTING_KEYS.SCHOOL_EMAIL,
    SETTING_KEYS.SCHOOL_WEBSITE,
    SETTING_KEYS.SCHOOL_FOUNDED_YEAR,
    SETTING_KEYS.CURRENT_ACADEMIC_YEAR,
    SETTING_KEYS.APP_TIMEZONE,
    SETTING_KEYS.APP_CURRENCY,
    SETTING_KEYS.APP_CURRENCY_LOCALE,
  ])

  const identity: SchoolIdentitySettings = {
    schoolName:         vals[SETTING_KEYS.SCHOOL_NAME],
    schoolSlogan:       vals[SETTING_KEYS.SCHOOL_SLOGAN],
    schoolVision:       vals[SETTING_KEYS.SCHOOL_VISION],
    schoolMission:      vals[SETTING_KEYS.SCHOOL_MISSION],
    schoolCoreValues:   vals[SETTING_KEYS.SCHOOL_CORE_VALUES],
    schoolAddress:      vals[SETTING_KEYS.SCHOOL_ADDRESS],
    schoolPhone:        vals[SETTING_KEYS.SCHOOL_PHONE],
    schoolEmail:        vals[SETTING_KEYS.SCHOOL_EMAIL],
    schoolWebsite:      vals[SETTING_KEYS.SCHOOL_WEBSITE],
    schoolFoundedYear:  vals[SETTING_KEYS.SCHOOL_FOUNDED_YEAR],
    currentAcademicYear:vals[SETTING_KEYS.CURRENT_ACADEMIC_YEAR],
    timezone:           vals[SETTING_KEYS.APP_TIMEZONE],
    currency:           vals[SETTING_KEYS.APP_CURRENCY],
    currencyLocale:     vals[SETTING_KEYS.APP_CURRENCY_LOCALE],
  }

  cacheSet(CACHE_KEY, identity, TTL_MS.SCHOOL_IDENTITY)
  return identity
}

/**
 * Seed all settings with their default values for any key not yet in the DB.
 * Idempotent — safe to run on every deployment.
 * Existing rows are NOT overwritten.
 */
export async function seedDefaults(): Promise<{ seeded: number }> {
  const allKeys = Object.keys(SETTING_META) as SettingKey[]

  // Find which keys are already in the database
  const existingRows = await prisma.systemSettings.findMany({
    select: { key: true },
  })
  const existingKeys = new Set(existingRows.map((r) => r.key))

  const missing = allKeys.filter((k) => !existingKeys.has(k))

  if (missing.length === 0) {
    logger.info('[settingsService] seedDefaults: all settings already present')
    return { seeded: 0 }
  }

  // Use createMany with skipDuplicates for efficiency
  // Note: Prisma's Neon HTTP adapter handles createMany as a batch insert
  await prisma.systemSettings.createMany({
    data: missing.map((key) => {
      const meta = SETTING_META[key]
      return {
        key,
        value: meta.defaultValue as object,
        description: meta.description,
        category: meta.category,
        isPublic: meta.isPublic,
        updatedByUid: null,
      }
    }),
    skipDuplicates: true,
  })

  logger.info(
    { count: missing.length, keys: missing },
    '[settingsService] seedDefaults: seeded missing settings'
  )

  return { seeded: missing.length }
}

/**
 * Invalidate a specific key from the cache.
 * Call this after an external system updates a setting directly.
 */
export function invalidate(key: SettingKey): void {
  _cache.delete(key)
  // Also invalidate compound cache keys that include this setting
  _cache.delete('__public_settings__')
  if (SETTING_META[key].category === SETTING_CATEGORIES.SCHOOL_IDENTITY) {
    _cache.delete('__identity_settings__')
  }
}

/**
 * Invalidate the entire settings cache.
 * Use sparingly — primarily for testing or after bulk imports.
 */
export function invalidateAll(): void {
  _cache.clear()
}

/**
 * Returns a convenience object mapping common settings keys to their
 * current values. Designed for use in server-side route handlers and
 * cron jobs that need quick access to the most frequently read settings.
 */
export async function getCommonSettings() {
  return getMany([
    SETTING_KEYS.CURRENT_ACADEMIC_YEAR,
    SETTING_KEYS.CURRENT_TERM,
    SETTING_KEYS.EXAM_PASS_MARK_THRESHOLD,
    SETTING_KEYS.PROMOTION_MIN_AVERAGE,
    SETTING_KEYS.PROMOTION_REQUIRED_PASSES,
    SETTING_KEYS.FINANCE_LATE_PENALTY_PER_DAY,
    SETTING_KEYS.FINANCE_LATE_PENALTY_GRACE_DAYS,
    SETTING_KEYS.APP_TIMEZONE,
    SETTING_KEYS.APP_CURRENCY,
    SETTING_KEYS.APP_CURRENCY_LOCALE,
    SETTING_KEYS.APP_MAINTENANCE_MODE,
  ])
}