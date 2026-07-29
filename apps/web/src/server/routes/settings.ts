/*
 * apps/web/src/server/routes/settings.ts — Phase D15
 *
 * [CHANGE TYPE]: TARGETED EDIT (the /exam route group only — every other
 *   route group in this file is unaffected)
 * [R-PHASE]: R8 — Academics IV: Report Cards, Transcripts, Promotion &
 *   Risk Assessment
 * [PURPOSE]: GET/PATCH /exam previously read and wrote promotion_min_average/
 *   promotion_required_passes via this file's own raw readSettings()/
 *   writeSettings() helpers — direct prisma.systemSettings queries that
 *   completely bypass settingsService.ts's cache. Since promotionService.ts
 *   (this same phase) now reads these two keys through settingsService.get()
 *   (which cache the value for up to 30 minutes — TTL_MS.EXAM), a PATCH
 *   through this route's old raw-bypass path would write the new value to
 *   the database correctly but leave settingsService's in-memory cache
 *   stale, so promotionService.ts's next read could still return the old
 *   value — the settings panel would appear to save successfully while the
 *   next promotion run silently used the previous threshold. Both GET and
 *   PATCH now go through settingsService.get()/setMany(), the same cached,
 *   validated path everything else in this domain uses, so admin edits to
 *   ExamGradingSettings.tsx's promotion fields are guaranteed to affect the
 *   very next runPromotion() call.
 * [DEPENDS ON]: apps/web/src/server/services/settingsService.ts
 *
 * [R-PHASE, cont.]: R12 — Library Domain & the Storage API Contract Fix.
 *   GET/PATCH /library's fine_per_day_mwk field is now backed by the real
 *   SETTING_KEYS.LIBRARY_FINE_PER_DAY (via settingsService.get/set)
 *   instead of the raw settings table — libraryService.ts's returnBook()
 *   (this phase) reads its per-day fine rate from that same setting, so
 *   an admin's edit in the panel now actually reaches the fine
 *   calculation. The other 8 /library fields are unchanged.
 *
 * Settings API for all role-contextual sections.
 *
 * Route groups:
 *   GET/PATCH  /settings/system             — Admin: school identity, calendar, security
 *   GET/PATCH  /settings/academic-policy    — Admin, High Rank: term dates, CA weights
 *   GET/PATCH  /settings/exam               — Admin, High Rank, Exam Officer: thresholds
 *   GET        /settings/grading-scales     — All (read); Admin, High Rank (write via PATCH /:id)
 *   PATCH      /settings/grading-scales/:id — Admin, High Rank: update single row
 *   POST       /settings/grading-scales/reset — Admin: reset all to MANEB defaults
 *   GET/PATCH  /settings/finance            — Admin, Finance: fee / payroll preferences
 *   GET/PATCH  /settings/hr                 — Admin, HR, High Rank: department/job-title taxonomy
 *   GET/PATCH  /settings/library            — Admin, Library: borrowing / fine rules
 *   GET/PATCH  /settings/classroom          — Academic: classroom preferences (per-user)
 *   GET/PATCH  /settings/notifications      — All: per-user push/email toggles
 *
 * All settings are stored as key-value pairs in the SystemSettings table.
 * Per-user settings are keyed as `{uid}:{key}` so each user has independent prefs.
 *
 * Mounted in api-app.ts:
 *   app.use('/settings', verifyAuth, settingsRouter)
 */

import 'server-only'
import { Router }            from 'express'
import { z }                 from 'zod'
import { prisma }            from '@/lib/prisma'
import { requireRole }       from '@/lib/verifyAuth'
import {
  listGradingScales,
  updateGradeScale,
  resetToDefaults,
  invalidateGradeCache,
}                            from '@/server/services/gradeService'
import * as settingsService  from '@/server/services/settingsService'
import { SETTING_KEYS, SETTING_META } from '@shared/types/settings'
import type { SettingKey, DepartmentTitles } from '@shared/types/settings'
import { logger }            from '@/lib/logger'

export const settingsRouter = Router()

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Read a set of settings keys, returning a key→value map */
async function readSettings(keys: string[]): Promise<Record<string, string>> {
  const rows = await prisma.systemSettings.findMany({ where: { key: { in: keys } } })
  return Object.fromEntries(rows.map((r) => [r.key, r.value as string]))
}

/** Upsert a set of key-value pairs */
async function writeSettings(
  pairs:    Record<string, string>,
  actorUid: string,
): Promise<void> {
  await prisma.$transaction(
    Object.entries(pairs).map(([key, value]) =>
      prisma.systemSettings.upsert({
        where:  { key },
        create: { key, value, updatedByUid: actorUid },
        update: { value, updatedByUid: actorUid },
      }),
    ),
  )
  logger.info({ event: 'settings.updated', keys: Object.keys(pairs), actorUid })
}

/** Per-user key prefix */
const userKey = (uid: string, key: string) => `${uid}:${key}`

async function readUserSettings(
  uid:  string,
  keys: string[],
): Promise<Record<string, string>> {
  const prefixed = keys.map((k) => userKey(uid, k))
  const rows     = await prisma.systemSettings.findMany({ where: { key: { in: prefixed } } })
  const map: Record<string, string> = {}
  for (const r of rows) {
    const shortKey = (r.key as string).replace(`${uid}:`, '')
    map[shortKey]  = r.value as string
  }
  return map
}

async function writeUserSettings(
  uid:      string,
  pairs:    Record<string, string>,
  actorUid: string,
): Promise<void> {
  const prefixed = Object.fromEntries(
    Object.entries(pairs).map(([k, v]) => [userKey(uid, k), v]),
  )
  await writeSettings(prefixed, actorUid)
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM CONFIG  (admin only)
// ─────────────────────────────────────────────────────────────────────────────

// [PRODUCTION FIX 2026-07-28] Was 'school_name', 'school_motto',
// 'school_address', 'school_phone', 'school_email', 'current_term',
// 'current_year', 'next_term_date', 'session_timeout_hr' — a confirmed
// duplicate of the dedicated School Identity panel (same school_name/
// address/phone/email keys, editable from two different forms) PLUS a
// dead field (school_motto, which nothing ever reads — the real slogan
// field is school_slogan) PLUS a broken one (current_year wrote to a key
// nobody reads; the real key is current_academic_year, SETTING_KEYS.
// CURRENT_ACADEMIC_YEAR). Calendar fields moved to Academic Policy below,
// using the corrected key name. Only genuinely system-level config remains.
const SYSTEM_KEYS = [
  'session_timeout_hr',
]

settingsRouter
  .route('/system')
  .get(requireRole(['admin']), async (req, res) => {
    const data = await readSettings(SYSTEM_KEYS)
    return res.json(data)
  })
  .patch(requireRole(['admin']), async (req, res) => {
    const allowed = Object.fromEntries(
      Object.entries(req.body as Record<string, string>)
        .filter(([k]) => SYSTEM_KEYS.includes(k)),
    )
    await writeSettings(allowed, req.user!.uid)
    return res.json({ ok: true })
  })

// ─────────────────────────────────────────────────────────────────────────────
// ACADEMIC POLICY  (admin | high_rank)
// ─────────────────────────────────────────────────────────────────────────────

// [PRODUCTION FIX 2026-07-28] current_academic_year (corrected — was
// current_year, a dead key nobody read), current_term, and next_term_date
// moved here from System Configuration, where they didn't semantically
// belong (this IS academic policy, not system config).
const ACADEMIC_KEYS = [
  'term1_start', 'term1_end', 'term2_start', 'term2_end',
  'term3_start', 'term3_end', 'min_attendance_pct',
  'report_card_comment_required', 'ca_weight_pct', 'exam_weight_pct',
  'current_academic_year', 'current_term', 'next_term_date',
]

settingsRouter
  .route('/academic-policy')
  .get(requireRole(['admin', 'high_rank']), async (req, res) => {
    return res.json(await readSettings(ACADEMIC_KEYS))
  })
  .patch(requireRole(['admin', 'high_rank']), async (req, res) => {
    const allowed = Object.fromEntries(
      Object.entries(req.body as Record<string, string>)
        .filter(([k]) => ACADEMIC_KEYS.includes(k)),
    )
    await writeSettings(allowed, req.user!.uid)
    return res.json({ ok: true })
  })

// ─────────────────────────────────────────────────────────────────────────────
// EXAM SETTINGS  (admin | high_rank | exam_officer)
// ─────────────────────────────────────────────────────────────────────────────

settingsRouter
  .route('/exam')
  .get(requireRole(['admin', 'high_rank', 'exam_officer']), async (req, res) => {
    const vals = await settingsService.getMany([
      SETTING_KEYS.PROMOTION_MIN_AVERAGE,
      SETTING_KEYS.PROMOTION_REQUIRED_PASSES,
    ])
    return res.json({
      promotion_min_average:     vals[SETTING_KEYS.PROMOTION_MIN_AVERAGE],
      promotion_required_passes: vals[SETTING_KEYS.PROMOTION_REQUIRED_PASSES],
    })
  })
  .patch(requireRole(['admin', 'high_rank']), async (req, res) => {
    const body = req.body as { promotion_min_average?: number; promotion_required_passes?: number }
    const updates: Array<{ key: typeof SETTING_KEYS.PROMOTION_MIN_AVERAGE | typeof SETTING_KEYS.PROMOTION_REQUIRED_PASSES; value: number }> = []
    if (body.promotion_min_average     !== undefined) updates.push({ key: SETTING_KEYS.PROMOTION_MIN_AVERAGE,     value: body.promotion_min_average })
    if (body.promotion_required_passes !== undefined) updates.push({ key: SETTING_KEYS.PROMOTION_REQUIRED_PASSES, value: body.promotion_required_passes })

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update.' })
    }

    try {
      await settingsService.setMany(updates, req.user!.uid)
    } catch (err) {
      const e = err as Error & { status?: number; validationErrors?: unknown }
      return res.status(e.status ?? 500).json({ error: e.message, validationErrors: e.validationErrors })
    }
    return res.json({ ok: true })
  })

// ─────────────────────────────────────────────────────────────────────────────
// GRADING SCALES  (admin | high_rank — write; all authenticated — read)
// ─────────────────────────────────────────────────────────────────────────────

settingsRouter.get('/grading-scales', async (_req, res) => {
  return res.json(await listGradingScales())
})

settingsRouter.patch(
  '/grading-scales/:id',
  requireRole(['admin', 'high_rank']),
  async (req, res) => {
    const schema = z.object({
      minPercent: z.number().int().min(0).max(100),
      maxPercent: z.number().int().min(0).max(100),
      pass:       z.boolean(),
      label:      z.string().optional(),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

    await updateGradeScale(String(req.params['id'] ?? ''), parsed.data, req.user!.uid)
    return res.json({ ok: true })
  },
)

settingsRouter.post(
  '/grading-scales/reset',
  requireRole(['admin']),
  async (req, res) => {
    await resetToDefaults(req.user!.uid)
    invalidateGradeCache()
    return res.json(await listGradingScales())
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// FINANCE SETTINGS  (admin | finance)
// ─────────────────────────────────────────────────────────────────────────────

const FINANCE_KEYS = [
  'fee_reminder_days_before', 'late_payment_penalty_pct',
  'late_payment_grace_days',  'invoice_due_days',
  'payroll_day_of_month',     'enable_usd_display',
  'receipt_prefix',
]

settingsRouter
  .route('/finance')
  .get(requireRole(['admin', 'finance']), async (req, res) => {
    const [scalars, payeBrackets, pensionPercent, loanInterestRate] = await Promise.all([
      readSettings(FINANCE_KEYS),
      settingsService.get(SETTING_KEYS.FINANCE_PAYE_BRACKETS),
      settingsService.get(SETTING_KEYS.FINANCE_PENSION_PERCENT),
      // [PRODUCTION FIX 2026-07-28] PAYE brackets and pension percent were
      // real settings, correctly READ by payrollService.ts, but never
      // exposed through this route at all — confirmed FINANCE_KEYS never
      // included either key. Loan interest rate is a genuinely new
      // setting (nothing like it existed anywhere before). All three go
      // through the typed settingsService (not the generic string-only
      // readSettings/writeSettings helpers) since payeBrackets is a real
      // JSON array, matching the pattern already used for /settings/school.
      settingsService.get(SETTING_KEYS.STAFF_LOAN_INTEREST_RATE),
    ])
    return res.json({ ...scalars, payeBrackets, pensionPercent, loanInterestRate })
  })
  .patch(requireRole(['admin', 'finance']), async (req, res) => {
    const body = req.body as Record<string, unknown>
    const allowed = Object.fromEntries(
      Object.entries(body as Record<string, string>)
        .filter(([k]) => FINANCE_KEYS.includes(k)),
    )
    if (Object.keys(allowed).length > 0) {
      await writeSettings(allowed, req.user!.uid)
    }
    try {
      if (body.payeBrackets !== undefined) {
        await settingsService.set(SETTING_KEYS.FINANCE_PAYE_BRACKETS, body.payeBrackets as never, req.user!.uid)
      }
      if (body.pensionPercent !== undefined) {
        await settingsService.set(SETTING_KEYS.FINANCE_PENSION_PERCENT, Number(body.pensionPercent) as never, req.user!.uid)
      }
      if (body.loanInterestRate !== undefined) {
        await settingsService.set(SETTING_KEYS.STAFF_LOAN_INTEREST_RATE, Number(body.loanInterestRate) as never, req.user!.uid)
      }
    } catch (err) {
      const status = (err as { status?: number })?.status ?? 400
      const message = err instanceof Error ? err.message : 'Invalid finance settings data.'
      return res.status(status).json({ error: message })
    }
    return res.json({ ok: true })
  })

// ─────────────────────────────────────────────────────────────────────────────
// HR SETTINGS  (admin | hr | high_rank) — production fix, 2026-07-27
// ─────────────────────────────────────────────────────────────────────────────
// Department -> job-title taxonomy. Goes through settingsService.get()/set()
// directly (not the readSettings/writeSettings string-map helpers above) —
// this value is a real JSON object (Record<department, title[]>), not a flat
// scalar, and settingsService.set() carries its own Zod validation
// (SETTING_VALUE_SCHEMAS) which the generic helpers don't apply.
settingsRouter
  .route('/hr')
  .get(requireRole(['admin', 'hr', 'high_rank']), async (req, res) => {
    const departmentTitles = await settingsService.get(SETTING_KEYS.HR_DEPARTMENT_TITLES)
    return res.json({ departmentTitles })
  })
  .patch(requireRole(['admin', 'hr', 'high_rank']), async (req, res) => {
    const { departmentTitles } = req.body as { departmentTitles?: unknown }
    if (!departmentTitles || typeof departmentTitles !== 'object') {
      return res.status(400).json({ error: 'departmentTitles is required.' })
    }
    try {
      await settingsService.set(SETTING_KEYS.HR_DEPARTMENT_TITLES, departmentTitles as DepartmentTitles, req.user!.uid)
    } catch (err) {
      const status = (err as { status?: number })?.status ?? 400
      const message = err instanceof Error ? err.message : 'Invalid department/title data.'
      return res.status(status).json({ error: message })
    }
    return res.json({ ok: true })
  })

// ─────────────────────────────────────────────────────────────────────────────
// SCHOOL IDENTITY SETTINGS  (admin | hr | high_rank) — production fix, 2026-07-28
// ─────────────────────────────────────────────────────────────────────────────
// [PRODUCTION FIX 2026-07-28] SCHOOL_NAME/SLOGAN/VISION/MISSION/etc. were all
// real, publicly-read SETTING_KEYS with sensible defaults — but genuinely no
// route or UI anywhere ever let an admin change them. This is the missing
// write path. Scalar string fields go through the generic readSettings/
// writeSettings helpers; coreValues and leadershipTeam are real JSON
// arrays and go through settingsService.get/set directly (typed, with its
// own Zod validation), same split as the /hr route above.

const SCHOOL_SCALAR_KEYS = [
  SETTING_KEYS.SCHOOL_NAME,
  SETTING_KEYS.SCHOOL_SLOGAN,
  SETTING_KEYS.SCHOOL_SYSTEM_TAGLINE,
  SETTING_KEYS.SCHOOL_HERO_SUBTITLE,
  SETTING_KEYS.SCHOOL_VISION,
  SETTING_KEYS.SCHOOL_MISSION,
  SETTING_KEYS.SCHOOL_ADDRESS,
  SETTING_KEYS.SCHOOL_PHONE,
  SETTING_KEYS.SCHOOL_EMAIL,
  SETTING_KEYS.SOCIAL_FACEBOOK_URL,
  SETTING_KEYS.SOCIAL_TWITTER_URL,
  SETTING_KEYS.SOCIAL_INSTAGRAM_URL,
  SETTING_KEYS.SOCIAL_YOUTUBE_URL,
  SETTING_KEYS.SOCIAL_LINKEDIN_URL,
]

settingsRouter
  .route('/school')
  .get(requireRole(['admin', 'hr', 'high_rank']), async (req, res) => {
    const [scalars, coreValues, leadershipTeam, foundedYear] = await Promise.all([
      readSettings(SCHOOL_SCALAR_KEYS),
      settingsService.get(SETTING_KEYS.SCHOOL_CORE_VALUES),
      settingsService.get(SETTING_KEYS.SCHOOL_LEADERSHIP_TEAM),
      // [PRODUCTION FIX 2026-07-28] The "Years of excellence" figure on the
      // landing page is genuinely computed live from this setting — but the
      // setting itself had no write path anywhere, so in practice it was
      // stuck at its default forever. A number, so it goes through the
      // typed settingsService (like coreValues/leadershipTeam) rather than
      // the generic string-only readSettings/writeSettings helpers.
      settingsService.get(SETTING_KEYS.SCHOOL_FOUNDED_YEAR),
    ])
    return res.json({ ...scalars, coreValues, leadershipTeam, foundedYear })
  })
  .patch(requireRole(['admin', 'hr', 'high_rank']), async (req, res) => {
    const body = req.body as Record<string, unknown>
    const scalarUpdates = Object.fromEntries(
      Object.entries(body as Record<string, string>)
        .filter(([k]) => SCHOOL_SCALAR_KEYS.includes(k as never)),
    )
    if (Object.keys(scalarUpdates).length > 0) {
      await writeSettings(scalarUpdates, req.user!.uid)
    }
    try {
      if (body.coreValues !== undefined) {
        await settingsService.set(SETTING_KEYS.SCHOOL_CORE_VALUES, body.coreValues as never, req.user!.uid)
      }
      if (body.leadershipTeam !== undefined) {
        await settingsService.set(SETTING_KEYS.SCHOOL_LEADERSHIP_TEAM, body.leadershipTeam as never, req.user!.uid)
      }
      if (body.foundedYear !== undefined) {
        await settingsService.set(SETTING_KEYS.SCHOOL_FOUNDED_YEAR, Number(body.foundedYear) as never, req.user!.uid)
      }
    } catch (err) {
      const status = (err as { status?: number })?.status ?? 400
      const message = err instanceof Error ? err.message : 'Invalid school identity data.'
      return res.status(status).json({ error: message })
    }
    return res.json({ ok: true })
  })

// ─────────────────────────────────────────────────────────────────────────────
// LIBRARY SETTINGS  (admin | library)
// ─────────────────────────────────────────────────────────────────────────────

const LIBRARY_KEYS = [
  'max_borrow_days_student', 'max_borrow_days_staff',
  'max_books_student',       'max_books_staff',
  'fine_grace_days',
  'max_fine_per_book_mwk',   'allow_student_upload',
  'require_approval',
]

settingsRouter
  .route('/library')
  .get(requireRole(['admin', 'library']), async (req, res) => {
    const [raw, finePerDay] = await Promise.all([
      readSettings(LIBRARY_KEYS),
      settingsService.get(SETTING_KEYS.LIBRARY_FINE_PER_DAY),
    ])
    return res.json({ ...raw, fine_per_day_mwk: String(finePerDay) })
  })
  .patch(requireRole(['admin', 'library']), async (req, res) => {
    const body = req.body as Record<string, string>
    const allowed = Object.fromEntries(
      Object.entries(body).filter(([k]) => LIBRARY_KEYS.includes(k)),
    )
    const writes: Promise<unknown>[] = [writeSettings(allowed, req.user!.uid)]
    if (body.fine_per_day_mwk !== undefined) {
      const n = Number(body.fine_per_day_mwk)
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ error: 'fine_per_day_mwk must be a non-negative number.' })
      }
      writes.push(settingsService.set(SETTING_KEYS.LIBRARY_FINE_PER_DAY, n, req.user!.uid))
    }
    await Promise.all(writes)
    return res.json({ ok: true })
  })

// ─────────────────────────────────────────────────────────────────────────────
// CLASSROOM SETTINGS  (academic — per-user)
// ─────────────────────────────────────────────────────────────────────────────

const CLASSROOM_KEYS = [
  'default_assignment_days',  'marks_entry_reminder_hrs',
  'show_class_averages',      'lab_booking_advance_days',
  'default_exam_duration_min',
]

settingsRouter
  .route('/classroom')
  .get(requireRole(['academic', 'admin']), async (req, res) => {
    return res.json(await readUserSettings(req.user!.uid, CLASSROOM_KEYS))
  })
  .patch(requireRole(['academic', 'admin']), async (req, res) => {
    const allowed = Object.fromEntries(
      Object.entries(req.body as Record<string, string>)
        .filter(([k]) => CLASSROOM_KEYS.includes(k)),
    )
    await writeUserSettings(req.user!.uid, allowed, req.user!.uid)
    return res.json({ ok: true })
  })

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION PREFERENCES  (all roles — per-user)
// ─────────────────────────────────────────────────────────────────────────────

const NOTIF_KEYS = [
  'notif_announcements_push',    'notif_announcements_email',
  'notif_results_released_push', 'notif_results_released_email',
  'notif_fees_due_push',         'notif_fees_due_email',
  'notif_leave_status_push',     'notif_leave_status_email',
  'notif_library_overdue_push',  'notif_library_overdue_email',
  'notif_payslip_ready_push',    'notif_payslip_ready_email',
  'notif_pending_actions_push',  'notif_pending_actions_email',
  'notif_system_alerts_push',    'notif_system_alerts_email',
]

settingsRouter
  .route('/notifications')
  .get(async (req, res) => {
    const raw = await readUserSettings(req.user!.uid, NOTIF_KEYS)
    // Parse stored "true"/"false" strings → booleans
    const parsed: Record<string, boolean> = {}
    for (const k of NOTIF_KEYS) {
      parsed[k] = raw[k] !== 'false'   // default true if not set
    }
    return res.json(parsed)
  })
  .patch(async (req, res) => {
    const body    = req.body as Record<string, boolean>
    const allowed = Object.fromEntries(
      Object.entries(body)
        .filter(([k]) => NOTIF_KEYS.includes(k))
        .map(([k, v]) => [k, String(v)]),
    )
    await writeUserSettings(req.user!.uid, allowed, req.user!.uid)
    return res.json({ ok: true })
  })
// ─────────────────────────────────────────────────────────────────────────────
// SINGLE SETTING BY KEY  (R15 — must stay the LAST route in this file so the
// param pattern never shadows the named routes above)
//
// W/hooks/useSettings.ts's useSetting()/useAcademicSettings() have always
// called GET /settings/{key}, but no such route existed — every single-key
// read (including the SETTING_KEYS.CURRENT_ACADEMIC_YEAR /
// SETTING_KEYS.CURRENT_TERM reads R15's PageHeader term badge and dashboard
// year/term wiring depend on) fell through to the 404 handler. Access is
// metadata-driven: SETTING_META[key].isPublic keys are readable by any
// authenticated user (verifyAuth is applied at the /settings mount); all
// other keys require admin or high_rank, matching the category routes above.
// Per-user (`{uid}:{key}`) settings are not reachable here — the key must be
// a declared SettingKey, and those keys never contain a ':' prefix.
// ─────────────────────────────────────────────────────────────────────────────

settingsRouter.get('/:key', async (req, res) => {
  const rawKey = String(req.params['key'] ?? '')

  // Only declared setting keys are readable — anything else (including
  // per-user prefixed keys) is a 404, not a metadata leak.
  const isDeclaredKey = (k: string): k is SettingKey =>
    Object.prototype.hasOwnProperty.call(SETTING_META, k)

  if (!isDeclaredKey(rawKey)) {
    return res.status(404).json({ error: 'Unknown setting key.' })
  }

  const meta = SETTING_META[rawKey]
  if (!meta.isPublic) {
    const role = req.user?.role
    if (role !== 'admin' && role !== 'high_rank') {
      return res.status(403).json({ error: 'Access denied for your role' })
    }
  }

  const value = await settingsService.get(rawKey)
  return res.json({
    key:      rawKey,
    value,
    category: meta.category,
    isPublic: meta.isPublic,
  })
})