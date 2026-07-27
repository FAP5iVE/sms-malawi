/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/server/routes/public.ts
 * [R-PHASE]: R5 — Academics I: Admissions & Student Records; further
 *   edited in R13 — Announcements, Timetable & Calendar Domain
 * [PURPOSE]: R5: /school-info: replaced the direct prisma.systemSettings
 *   query with settingsService.getPublicSettings() (Phase 1B, already
 *   cached). Fixed two settings keys that never matched anything in
 *   SETTING_KEYS ('school_founded', 'school_values') — mapped to the real
 *   keys that already exist in the typed registry,
 *   SETTING_KEYS.SCHOOL_FOUNDED_YEAR and SETTING_KEYS.SCHOOL_CORE_VALUES,
 *   rather than adding new ones. /newsletter/subscribe: confirmUrl's
 *   fallback domain is unified with userManagementService.ts's existing
 *   fallback ('sms-malawi.vercel.app') rather than the
 *   differently-hardcoded 'smsmalawi.edu.mw' this file used — both now
 *   derive from NEXT_PUBLIC_APP_URL first. The inline raw-HTML
 *   confirmation email is replaced with the newsletter-confirm template
 *   (server/templates/emails/newsletter-confirm.ts) via the shared
 *   getSchoolBranding() helper, matching the established render+sendEmail
 *   pattern.
 *   R13: /announcements repointed from prisma.announcement.findMany() to
 *   a Firestore query against COLLECTIONS.ANNOUNCEMENTS. The Prisma
 *   Announcement model this route previously read was a stopgap added
 *   purely to make this route and calendar.ts's now-also-fixed
 *   announcement source compile — nothing anywhere in the codebase ever
 *   wrote a row into it, so this endpoint had returned an empty array
 *   since the app's inception regardless of how many real announcements
 *   existed in the actual (Firestore-backed) system. Filtered to
 *   status === 'PUBLISHED' && targetAll === true, matching the old
 *   query's intent (targetAudience in ['ALL','PUBLIC']) of only surfacing
 *   genuinely public-facing announcements, not ones internally targeted
 *   at a specific staff role or class.
 * [DEPENDS ON]: apps/web/src/server/services/settingsService.ts,
 *   apps/web/src/server/services/notificationService.ts (getSchoolBranding),
 *   apps/web/src/server/templates/emails/newsletter-confirm.ts,
 *   @shared/constants/malawi (COLLECTIONS.ANNOUNCEMENTS)
 */
import { Router }          from 'express'
import * as admin          from 'firebase-admin'
import { prisma }          from '@/lib/prisma'
import { sendEmail }       from '@/lib/email'
import { randomBytes }     from 'crypto'
import { z }               from 'zod'
import * as settingsService  from '@/server/services/settingsService'
import { SETTING_KEYS }      from '@shared/types/settings'
import { COLLECTIONS }       from '@shared/constants/storage'
import { getSchoolBranding } from '@/server/services/notificationService'
import { renderNewsletterConfirm } from '@/server/templates/emails/newsletter-confirm'

export const publicRouter = Router()

// ─── SCHOOL PUBLIC INFO ───────────────────────────────────────────────────────
// GET /public/school-info
// Returns school name, slogan, contact details, vision, mission from SystemSettings.
// No auth required — consumed by landing page.

publicRouter.get('/school-info', async (_req, res) => {
  const settings = await settingsService.getPublicSettings()

  res.json({
    schoolName:  settings[SETTING_KEYS.SCHOOL_NAME]           ?? 'SMS Malawi',
    slogan:      settings[SETTING_KEYS.SCHOOL_SLOGAN]         ?? 'Where Minds Ignite & Futures Begin.',
    founded:     settings[SETTING_KEYS.SCHOOL_FOUNDED_YEAR]   ?? 1979,
    address:     settings[SETTING_KEYS.SCHOOL_ADDRESS]        ?? 'P.O. Box 123, Blantyre, Malawi',
    phone:       settings[SETTING_KEYS.SCHOOL_PHONE]          ?? '+265 999 123 456',
    email:       settings[SETTING_KEYS.SCHOOL_EMAIL]          ?? 'info@school.edu.mw',
    vision:      settings[SETTING_KEYS.SCHOOL_VISION]         ?? '',
    mission:     settings[SETTING_KEYS.SCHOOL_MISSION]        ?? '',
    coreValues:  settings[SETTING_KEYS.SCHOOL_CORE_VALUES]    ?? [],
    currentYear: settings[SETTING_KEYS.CURRENT_ACADEMIC_YEAR] ?? '2025/2026',
  })
})

// ─── PUBLIC MANEB STATISTICS ──────────────────────────────────────────────────
// GET /public/maneb-stats?year=2025/2026
// Returns aggregated MANEB pass rates for the landing page stats section.

publicRouter.get('/maneb-stats', async (req, res) => {
  const year = String(req.query.year ?? '2025/2026')

  const records = await prisma.manebRecord.findMany({
    where:  { academicYear: year },
    select: { examType: true, overallGrade: true },
  })

  if (records.length === 0) {
    return res.json({ year, stats: [] })
  }

  const byType: Record<string, { total: number; passed: number }> = {}
  for (const r of records) {
    // Capture into a local variable rather than re-indexing byType[r.examType]
    // on each line below: with noUncheckedIndexedAccess, every fresh index
    // expression is independently typed `{...} | undefined`, so the earlier
    // existence check doesn't narrow later `byType[r.examType]` accesses —
    // only a captured local binding narrows and stays narrowed.
    const entry = byType[r.examType] ?? (byType[r.examType] = { total: 0, passed: 0 })
    entry.total += 1
    if (r.overallGrade && !['F', 'U', 'X'].includes(r.overallGrade)) {
      entry.passed += 1
    }
  }

  res.json({
    year,
    stats: Object.entries(byType).map(([examType, b]) => ({
      examType,
      total:    b.total,
      passed:   b.passed,
      passRate: b.total > 0 ? Math.round((b.passed / b.total) * 100) : 0,
    })),
  })
})

// ─── PUBLIC ANNOUNCEMENTS ─────────────────────────────────────────────────────
// GET /public/announcements?limit=6
// Returns recent published announcements for the landing page news section.

publicRouter.get('/announcements', async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 6), 12)
  const snap = await admin.firestore()
    .collection(COLLECTIONS.ANNOUNCEMENTS)
    .where('status', '==', 'PUBLISHED')
    .where('targetAll', '==', true)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get()

  const announcements = snap.docs.map((d) => {
    const data = d.data() as {
      title: string
      body: string
      eventDate?: string | null
      createdAt: FirebaseFirestore.Timestamp
    }
    return {
      id: d.id,
      title: data.title,
      body: data.body,
      eventDate: data.eventDate ?? null,
      createdAt: data.createdAt.toDate(),
    }
  })

  res.json(announcements)
})

// ─── NEWSLETTER SUBSCRIBE ─────────────────────────────────────────────────────
// POST /public/newsletter/subscribe
// Adds a subscriber and sends a confirmation email.

const NewsletterSchema = z.object({
  email: z.string().email(),
  name:  z.string().min(1).max(100).optional(),
})

publicRouter.post('/newsletter/subscribe', async (req, res) => {
  const parsed = NewsletterSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Valid email address is required.' })
  }

  const { email, name } = parsed.data
  const token = randomBytes(32).toString('hex')

  // Upsert — re-subscribe if previously unsubscribed; ignore if already confirmed.
  const existing = await prisma.newsletterSubscriber.findUnique({ where: { email } })
  if (existing?.confirmed && !existing.unsubscribedAt) {
    return res.json({ message: 'You are already subscribed.' })
  }

  await prisma.newsletterSubscriber.upsert({
    where:  { email },
    create: { email, name: name ?? null, token, confirmed: false },
    update: { name: name ?? undefined, token, confirmed: false, unsubscribedAt: null },
  })

  const confirmUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://malawiedustack.eu.org'}/newsletter/confirm?token=${token}`

  const school = await getSchoolBranding()
  await sendEmail({
    to: email,
    ...renderNewsletterConfirm({ name, confirmUrl }, school),
  })

  res.status(201).json({ message: 'Please check your email to confirm your subscription.' })
})

// ─── NEWSLETTER CONFIRM ───────────────────────────────────────────────────────
// GET /public/newsletter/confirm?token=<token>

publicRouter.get('/newsletter/confirm', async (req, res) => {
  const token = String(req.query.token ?? '')
  if (!token) return res.status(400).json({ error: 'Invalid confirmation link.' })

  const subscriber = await prisma.newsletterSubscriber.findUnique({ where: { token } })
  if (!subscriber) return res.status(404).json({ error: 'This confirmation link is invalid or has already been used.' })

  await prisma.newsletterSubscriber.update({
    where: { token },
    data:  { confirmed: true, token: null },
  })

  res.json({ message: 'Your subscription has been confirmed. Welcome to the SMS Malawi newsletter!' })
})

// ─── NEWSLETTER UNSUBSCRIBE ───────────────────────────────────────────────────
// GET /public/newsletter/unsubscribe?email=<email>

publicRouter.get('/newsletter/unsubscribe', async (req, res) => {
  const email = String(req.query.email ?? '')
  if (!email) return res.status(400).json({ error: 'Email address is required.' })

  await prisma.newsletterSubscriber.updateMany({
    where: { email },
    data:  { unsubscribedAt: new Date() },
  })

  res.json({ message: 'You have been unsubscribed from the SMS Malawi newsletter.' })
})