/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/server/services/settingsService.ts
 * [R-PHASE]: R8 — Academics IV: Report Cards, Transcripts, Promotion & Risk
 *   Assessment; further edited in R13 — Announcements, Timetable &
 *   Calendar Domain
 * [PURPOSE]: R8: getIdentitySettings() now also fetches/returns
 *   SETTING_KEYS.SCHOOL_LOGO_URL as schoolLogoUrl — reportCardService.ts,
 *   transcriptService.ts, and PrintableReportCard.tsx all need this to
 *   replace their hardcoded identity-string fallbacks and the "CREST" text
 *   placeholder respectively. R13 adds getTermDates(), wiring the six
 *   TERM1_START..TERM3_END settings keys (which already existed with a
 *   real admin-panel write path but zero reader anywhere) to a real
 *   caller — calendar.ts's six hardcoded 2025/2026 TERM_PERIODS literals.
 * [DEPENDS ON]: none
 */
import 'server-only'

import { prisma } from '@/lib/prisma'
import { getRedis } from '@/lib/redis'
import type { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import * as auditService from '@/server/services/auditService'
import { assertNotSelfReview } from '@/server/lib/selfReview'
import type { UserRole } from '@shared/types/roles'
import {
  SETTING_KEYS,
  FINANCE_V2_FLAG_KEYS,
  FINANCE_V2_MODULES,
  type FinanceV2Module,
  type FinanceV2Proposal,
  type FinanceV2Proposals,
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

// In-process fallback — used only when Upstash Redis is not configured.
// When Upstash IS configured, the cache is Redis-backed and therefore shared
// across every Lambda instance: a write on one instance is immediately visible
// to reads on all others, and a cold instance no longer starts with an empty
// cache that re-fetches from Neon on every request until warmed.
const _cache = new Map<string, CacheEntry>()

// Namespace so settings entries never collide with other Upstash consumers.
const REDIS_PREFIX = 'settings:'

async function cacheGet<T>(key: string): Promise<T | undefined> {
  const redis = getRedis()
  if (redis) {
    try {
      const value = await redis.get<T>(REDIS_PREFIX + key)
      return value === null ? undefined : value
    } catch (err) {
      logger.error({ err, key }, '[settingsService] Redis GET failed — treating as cache miss')
      return undefined
    }
  }

  const entry = _cache.get(key)
  if (!entry) return undefined
  if (Date.now() > entry.expiresAt) {
    _cache.delete(key)
    return undefined
  }
  return entry.value as T
}

async function cacheSet(key: string, value: unknown, ttlMs: number): Promise<void> {
  const redis = getRedis()
  if (redis) {
    try {
      await redis.set(REDIS_PREFIX + key, value, { ex: Math.max(1, Math.ceil(ttlMs / 1000)) })
    } catch (err) {
      logger.error({ err, key }, '[settingsService] Redis SET failed — value not cached')
    }
    return
  }
  _cache.set(key, { value, expiresAt: Date.now() + ttlMs })
}

async function cacheDelete(key: string): Promise<void> {
  const redis = getRedis()
  if (redis) {
    try {
      await redis.del(REDIS_PREFIX + key)
    } catch (err) {
      logger.error({ err, key }, '[settingsService] Redis DEL failed — entry may be stale until TTL')
    }
    return
  }
  _cache.delete(key)
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
  const schema = SETTING_VALUE_SCHEMAS[key as keyof typeof SETTING_VALUE_SCHEMAS]
  if (!schema) return SETTING_META[key].defaultValue
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
  const cached = await cacheGet<SettingValueMap[K]>(key)
  if (cached !== undefined) return cached

  const row = await prisma.systemSettings.findUnique({ where: { key } })

  const value = row
    ? parseValue(key, row.value)
    : SETTING_META[key].defaultValue

  await cacheSet(key, value, getTtl(SETTING_META[key].category))
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
    const cached = await cacheGet<SettingValueMap[K]>(key)
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

    await cacheSet(key, value, getTtl(SETTING_META[key].category))
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
    if (!schema) {
    throw Object.assign(new Error(`No schema registered for setting "${key}".`), { status: 500 })
    }
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
  await cacheDelete(key)

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
  if (!schema) {
     throw Object.assign(
       new Error(`No schema registered for setting "${key}".`),
       { status: 500, key }
     )
   }
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
    await cacheDelete(key)
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
  const cached = await cacheGet<Partial<SettingValueMap>>(CACHE_KEY)
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

  await cacheSet(CACHE_KEY, partial, TTL_MS.ACADEMIC)
  return partial
}

/**
 * Get the six academic-calendar term-boundary settings
 * (TERM1_START/END, TERM2_START/END, TERM3_START/END).
 *
 * These keys and their admin-panel write path (settings.actions.ts) have
 * existed since before this phase, but had zero real reader anywhere in
 * the app — calendar.ts's TERM_PERIODS instead hardcoded six 2025/2026
 * date literals directly, meaning the admin-configurable term-dates panel
 * had no effect on the actual school calendar. This is the same
 * "Settings panel with zero effect on real computation" pattern the
 * Grading/Promotion/Risk/Library-fine phases (R7/R8/R12) each closed for
 * their own domain — R13 closes it here by giving calendar.ts a real
 * caller for these six keys instead of adding a redundant, differently-
 * named TERM_DATES key next to ones that already exist.
 */
export async function getTermDates(): Promise<{
  term1: { start: string; end: string }
  term2: { start: string; end: string }
  term3: { start: string; end: string }
}> {
  const CACHE_KEY = '__term_dates__'
  const cached = await cacheGet<{
    term1: { start: string; end: string }
    term2: { start: string; end: string }
    term3: { start: string; end: string }
  }>(CACHE_KEY)
  if (cached) return cached

  const vals = await getMany([
    SETTING_KEYS.TERM1_START,
    SETTING_KEYS.TERM1_END,
    SETTING_KEYS.TERM2_START,
    SETTING_KEYS.TERM2_END,
    SETTING_KEYS.TERM3_START,
    SETTING_KEYS.TERM3_END,
  ])

  const termDates = {
    term1: { start: vals[SETTING_KEYS.TERM1_START], end: vals[SETTING_KEYS.TERM1_END] },
    term2: { start: vals[SETTING_KEYS.TERM2_START], end: vals[SETTING_KEYS.TERM2_END] },
    term3: { start: vals[SETTING_KEYS.TERM3_START], end: vals[SETTING_KEYS.TERM3_END] },
  }

  await cacheSet(CACHE_KEY, termDates, TTL_MS.ACADEMIC)
  return termDates
}

// ─────────────────────────────────────────────────────────
//  CURRENT ACADEMIC PERIOD
//  The ONE server-side answer to "which academic year and term is it right
//  now". Any route or service that needs a default period calls these — it
//  must never fall back to a literal year or term, because a literal is
//  right for exactly as long as it takes the calendar to move on, and (as
//  the Finances summary cards showing MK 0.00 demonstrated) a wrong
//  default doesn't fail loudly, it just quietly queries an empty slice.
// ─────────────────────────────────────────────────────────

export interface AcademicPeriod {
  academicYear: string
  term: number
}

/** The school's current academic year + term, straight from SystemSettings
 *  (SETTING_KEYS.CURRENT_ACADEMIC_YEAR / CURRENT_TERM). */
export async function getCurrentPeriod(): Promise<AcademicPeriod> {
  const s = await getMany([SETTING_KEYS.CURRENT_ACADEMIC_YEAR, SETTING_KEYS.CURRENT_TERM])
  return {
    academicYear: s[SETTING_KEYS.CURRENT_ACADEMIC_YEAR],
    term:         s[SETTING_KEYS.CURRENT_TERM],
  }
}

/** Resolves the period a request is asking about: whatever the caller
 *  explicitly supplied (if it is well-formed — a "YYYY/YYYY" year, a term
 *  of 1–3), otherwise the school's current value for that half. Year and
 *  term fall back independently, so `?term=2` alone means "term 2 of the
 *  CURRENT year". Accepts raw query/body values (string | number |
 *  undefined) so route handlers can pass `req.query` fields straight in. */
export async function resolvePeriod(input: { academicYear?: unknown; term?: unknown } = {}): Promise<AcademicPeriod> {
  const current = await getCurrentPeriod()

  const year =
    typeof input.academicYear === 'string' && /^\d{4}\/\d{4}$/.test(input.academicYear)
      ? input.academicYear
      : current.academicYear

  const rawTerm = typeof input.term === 'string' || typeof input.term === 'number' ? Number(input.term) : NaN
  const term = Number.isInteger(rawTerm) && rawTerm >= 1 && rawTerm <= 3 ? rawTerm : current.term

  return { academicYear: year, term }
}

/**
 * Get school identity settings only.
 * Used by the public landing page (ISR — no auth required).
 * Suitable for exposure to unauthenticated users.
 */
export async function getIdentitySettings(): Promise<SchoolIdentitySettings> {
  const CACHE_KEY = '__identity_settings__'
  const cached = await cacheGet<SchoolIdentitySettings>(CACHE_KEY)
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
    SETTING_KEYS.SCHOOL_LOGO_URL,
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
    schoolLogoUrl:      vals[SETTING_KEYS.SCHOOL_LOGO_URL],
    currentAcademicYear:vals[SETTING_KEYS.CURRENT_ACADEMIC_YEAR],
    timezone:           vals[SETTING_KEYS.APP_TIMEZONE],
    currency:           vals[SETTING_KEYS.APP_CURRENCY],
    currencyLocale:     vals[SETTING_KEYS.APP_CURRENCY_LOCALE],
  }

  await cacheSet(CACHE_KEY, identity, TTL_MS.SCHOOL_IDENTITY)
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
export async function invalidate(key: SettingKey): Promise<void> {
  await cacheDelete(key)
  // Also invalidate compound cache keys that include this setting
  await cacheDelete('__public_settings__')
  if (SETTING_META[key].category === SETTING_CATEGORIES.SCHOOL_IDENTITY) {
    await cacheDelete('__identity_settings__')
  }
}

/**
 * Invalidate the entire settings cache.
 * Use sparingly — primarily for testing or after bulk imports.
 */
export async function invalidateAll(): Promise<void> {
  const redis = getRedis()
  if (redis) {
    const keys = Object.keys(SETTING_META)
    await Promise.all([
      ...keys.map((k) => cacheDelete(k)),
      cacheDelete('__public_settings__'),
      cacheDelete('__identity_settings__'),
      cacheDelete('__term_dates__'),
    ])
    return
  }
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

// ─────────────────────────────────────────────────────────
//  FINANCE v2 ROLLOUT FLAGS  (Finance Hardening Plan — D-28, P0-03)
//
//  One flag per module: `finance.v2.<module>`, default OFF. A module runs its
//  v1 code path until its go-live gate has passed and a flag flip has been
//  proposed by Finance and approved by High Rank (Part 6 §7).
//
//  Reading:  `const flags = await getFinanceV2Flags()` ONCE at the top of a
//            request, then `await isFinanceV2('payroll', flags)` wherever the
//            branch is needed — a request never sees two different answers.
//  Changing: only through proposeFinanceV2Change → decideFinanceV2Proposal.
//            The generic settings routes never write these keys.
// ─────────────────────────────────────────────────────────

export type FinanceV2Flags = Record<FinanceV2Module, boolean>

/** All ten flags in one cached read (one `getMany`). */
export async function getFinanceV2Flags(): Promise<FinanceV2Flags> {
  const keys = FINANCE_V2_MODULES.map((m) => FINANCE_V2_FLAG_KEYS[m])
  const vals = await getMany(keys)
  const flags = {} as FinanceV2Flags
  for (const m of FINANCE_V2_MODULES) {
    // Strictly `=== true`: anything unexpected is treated as OFF (fail to v1).
    flags[m] = vals[FINANCE_V2_FLAG_KEYS[m]] === true
  }
  return flags
}

/**
 * Is this module's v2 path switched on? Pass the snapshot from
 * getFinanceV2Flags() so one request reads the flags once; without a
 * snapshot it reads (cached) on its own.
 */
export async function isFinanceV2(
  module: FinanceV2Module,
  snapshot?: FinanceV2Flags,
): Promise<boolean> {
  const flags = snapshot ?? (await getFinanceV2Flags())
  return flags[module] === true
}

export interface FinanceV2RolloutRow {
  module: FinanceV2Module
  enabled: boolean
  /** When a person last changed this flag; null if it has never been changed (default OFF). */
  lastChangedAt: string | null
  lastChangedByUid: string | null
  /** Display name of lastChangedByUid, when a staff profile exists for it. */
  lastChangedByName: string | null
  pending: (FinanceV2Proposal & { proposedByName: string | null }) | null
}

/**
 * Current state of every module for the Feature rollout screen. Reads the
 * database directly (not the cache) so the screen is never stale.
 */
export async function getFinanceV2Rollout(): Promise<FinanceV2RolloutRow[]> {
  const flagKeys = FINANCE_V2_MODULES.map((m) => FINANCE_V2_FLAG_KEYS[m])
  const rows = await prisma.systemSettings.findMany({
    where: { key: { in: [...flagKeys, SETTING_KEYS.FINANCE_V2_PROPOSALS] } },
  })
  const byKey = new Map(rows.map((r) => [r.key, r]))
  const proposals = parseValue(
    SETTING_KEYS.FINANCE_V2_PROPOSALS,
    byKey.get(SETTING_KEYS.FINANCE_V2_PROPOSALS)?.value,
  )

  // One lookup for every person named on the screen.
  const uids = new Set<string>()
  for (const m of FINANCE_V2_MODULES) {
    const r = byKey.get(FINANCE_V2_FLAG_KEYS[m])
    if (r?.updatedByUid) uids.add(r.updatedByUid)
    const p = proposals[m]
    if (p) uids.add(p.proposedByUid)
  }
  const profiles = uids.size
    ? await prisma.staffProfile.findMany({
        where: { uid: { in: [...uids] } },
        select: { uid: true, firstName: true, lastName: true },
      })
    : []
  const nameOf = new Map(profiles.map((p) => [p.uid, `${p.firstName} ${p.lastName}`.trim()]))

  return FINANCE_V2_MODULES.map((module) => {
    const key = FINANCE_V2_FLAG_KEYS[module]
    const row = byKey.get(key)
    const enabled = row ? parseValue(key, row.value) === true : false
    // A row seeded by seedDefaults() has no updatedByUid: nobody changed it.
    const changed = row && row.updatedByUid ? row : null
    const pending = proposals[module]
    return {
      module,
      enabled,
      lastChangedAt: changed ? changed.updatedAt.toISOString() : null,
      lastChangedByUid: changed ? changed.updatedByUid : null,
      lastChangedByName: changed?.updatedByUid ? nameOf.get(changed.updatedByUid) ?? null : null,
      pending: pending
        ? { ...pending, proposedByName: nameOf.get(pending.proposedByUid) ?? null }
        : null,
    }
  })
}

function rolloutError(message: string, status: number): Error {
  return Object.assign(new Error(message), { status })
}

/**
 * Serialises every proposal read-modify-write on the proposals row. The row
 * is created if missing, then locked FOR UPDATE for the rest of the
 * transaction, so two concurrent proposals/decisions queue behind each other
 * and only one can claim a given proposal.
 */
async function withLockedProposals<T>(
  fn: (
    tx: Prisma.TransactionClient,
    proposals: FinanceV2Proposals,
  ) => Promise<T>,
): Promise<T> {
  const key = SETTING_KEYS.FINANCE_V2_PROPOSALS
  const meta = SETTING_META[key]
  return prisma.$transaction(async (tx) => {
    await tx.systemSettings.upsert({
      where: { key },
      update: {},
      create: {
        key,
        value: {},
        description: meta.description,
        category: meta.category,
        isPublic: meta.isPublic,
        updatedByUid: null,
      },
    })
    const locked = await tx.$queryRaw<Array<{ value: unknown }>>`
      SELECT "value" FROM "system_settings" WHERE "key" = ${key} FOR UPDATE
    `
    const proposals = parseValue(key, locked[0]?.value)
    return fn(tx, proposals)
  })
}

async function saveProposals(
  tx: Prisma.TransactionClient,
  proposals: FinanceV2Proposals,
  actorUid: string,
): Promise<void> {
  await tx.systemSettings.update({
    where: { key: SETTING_KEYS.FINANCE_V2_PROPOSALS },
    data: { value: proposals as object, updatedByUid: actorUid },
  })
}

export interface FinanceV2Actor {
  uid: string
  role: UserRole
}

/**
 * Finance proposes switching a module's flag. One pending proposal per
 * module; a proposal that would not change anything is refused.
 */
export async function proposeFinanceV2Change(
  input: { module: FinanceV2Module; enabled: boolean; reason: string },
  actor: FinanceV2Actor,
): Promise<FinanceV2Proposal> {
  const fm = input.module
  if (!FINANCE_V2_MODULES.includes(fm)) {
    throw rolloutError(`Unknown finance module "${String(fm)}".`, 400)
  }
  const reason = (input.reason ?? '').trim()
  if (!reason) throw rolloutError('A reason is required for every flag change.', 400)
  if (reason.length > 500) throw rolloutError('The reason must be 500 characters or fewer.', 400)

  const flagKey = FINANCE_V2_FLAG_KEYS[fm]
  const current = (await getFinanceV2Rollout()).find((r) => r.module === fm)
  if (current && current.enabled === input.enabled) {
    throw rolloutError(
      `Finance v2 "${fm}" is already ${input.enabled ? 'ON' : 'OFF'}.`,
      409,
    )
  }

  const proposal = await withLockedProposals(async (tx, proposals) => {
    if (proposals[fm]) {
      throw rolloutError(`A change for "${fm}" is already waiting for approval.`, 409)
    }
    const created: FinanceV2Proposal = {
      module: fm,
      enabled: input.enabled,
      reason,
      proposedByUid: actor.uid,
      proposedAt: new Date().toISOString(),
    }
    await saveProposals(tx, { ...proposals, [fm]: created }, actor.uid)
    return created
  })

  await cacheDelete(SETTING_KEYS.FINANCE_V2_PROPOSALS)
  await auditService.log({
    action: 'finance.flag_proposed',
    entityType: 'FinanceV2Flag',
    entityId: flagKey,
    actorUid: actor.uid,
    actorRole: actor.role,
    metadata: { context: { module: fm, requestedState: input.enabled, reason } },
  })
  logger.info({ module: fm, enabled: input.enabled, actorUid: actor.uid }, '[settingsService] Finance v2 flag change proposed')
  return proposal
}

/**
 * High Rank approves or rejects a pending proposal. The proposer can never
 * decide their own proposal (segregation of duties). Approval flips the flag
 * and clears the proposal in ONE transaction; rejection only clears it.
 */
export async function decideFinanceV2Proposal(
  input: { module: FinanceV2Module; decision: 'APPROVE' | 'REJECT'; note?: string },
  actor: FinanceV2Actor,
): Promise<{ module: FinanceV2Module; enabled: boolean; decision: 'APPROVE' | 'REJECT' }> {
  const fm = input.module
  if (!FINANCE_V2_MODULES.includes(fm)) {
    throw rolloutError(`Unknown finance module "${String(fm)}".`, 400)
  }
  const flagKey = FINANCE_V2_FLAG_KEYS[fm]
  const flagMeta = SETTING_META[flagKey]

  const decided = await withLockedProposals(async (tx, proposals) => {
    const pending = proposals[fm]
    if (!pending) {
      throw rolloutError(`There is no pending change for "${fm}" (it may already have been decided).`, 409)
    }
    assertNotSelfReview(pending.proposedByUid, actor.uid, 'feature-flag change')

    const { [fm]: _removed, ...rest } = proposals
    void _removed
    await saveProposals(tx, rest, actor.uid)

    if (input.decision === 'APPROVE') {
      await tx.systemSettings.upsert({
        where: { key: flagKey },
        update: { value: pending.enabled, updatedByUid: actor.uid },
        create: {
          key: flagKey,
          value: pending.enabled,
          description: flagMeta.description,
          category: flagMeta.category,
          isPublic: flagMeta.isPublic,
          updatedByUid: actor.uid,
        },
      })
    }
    return pending
  })

  await cacheDelete(SETTING_KEYS.FINANCE_V2_PROPOSALS)
  if (input.decision === 'APPROVE') await cacheDelete(flagKey)

  await auditService.log({
    action: input.decision === 'APPROVE' ? 'finance.flag_approved' : 'finance.flag_rejected',
    entityType: 'FinanceV2Flag',
    entityId: flagKey,
    actorUid: actor.uid,
    actorRole: actor.role,
    metadata: {
      context: {
        module: fm,
        requestedState: decided.enabled,
        proposedByUid: decided.proposedByUid,
        proposalReason: decided.reason,
        ...(input.note ? { decisionNote: input.note } : {}),
      },
    },
  })
  logger.info(
    { module: fm, decision: input.decision, actorUid: actor.uid },
    '[settingsService] Finance v2 flag proposal decided',
  )
  return { module: fm, enabled: decided.enabled, decision: input.decision }
}
