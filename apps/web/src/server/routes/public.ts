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
import { getPublicViewUrl } from '@/lib/storage'

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
    // [PRODUCTION FIX 2026-07-28] Previously hardcoded in page.tsx.
    systemTagline: settings[SETTING_KEYS.SCHOOL_SYSTEM_TAGLINE] ?? 'Secondary School Management System',
    heroSubtitle:  settings[SETTING_KEYS.SCHOOL_HERO_SUBTITLE]  ?? 'Excellence in Education — from Form 1 through MSCE.',
    founded:     settings[SETTING_KEYS.SCHOOL_FOUNDED_YEAR]   ?? 1979,
    address:     settings[SETTING_KEYS.SCHOOL_ADDRESS]        ?? 'P.O. Box 123, Blantyre, Malawi',
    phone:       settings[SETTING_KEYS.SCHOOL_PHONE]          ?? '+265 999 123 456',
    email:       settings[SETTING_KEYS.SCHOOL_EMAIL]          ?? 'info@school.edu.mw',
    vision:      settings[SETTING_KEYS.SCHOOL_VISION]         ?? '',
    mission:     settings[SETTING_KEYS.SCHOOL_MISSION]        ?? '',
    coreValues:  settings[SETTING_KEYS.SCHOOL_CORE_VALUES]    ?? [],
    currentYear: settings[SETTING_KEYS.CURRENT_ACADEMIC_YEAR] ?? '2025/2026',
    // [PRODUCTION FIX 2026-07-28] Footer social icons — real URLs now,
    // editable under Settings -> School Identity. Empty string = hide icon.
    social: {
      facebook:  settings[SETTING_KEYS.SOCIAL_FACEBOOK_URL]  || null,
      twitter:   settings[SETTING_KEYS.SOCIAL_TWITTER_URL]   || null,
      instagram: settings[SETTING_KEYS.SOCIAL_INSTAGRAM_URL] || null,
      youtube:   settings[SETTING_KEYS.SOCIAL_YOUTUBE_URL]   || null,
      linkedin:  settings[SETTING_KEYS.SOCIAL_LINKEDIN_URL]  || null,
    },
  })
})

// ─── PUBLIC MANEB STATISTICS ──────────────────────────────────────────────────
// GET /public/maneb-stats?year=2025/2026
// Returns aggregated MANEB pass rates for the landing page stats section.

publicRouter.get('/maneb-stats', async (req, res) => {
  const year = String(req.query.year ?? '2025/2026')

  const [records, enrolledStudents] = await Promise.all([
    prisma.manebRecord.findMany({
      where:  { academicYear: year },
      select: { examType: true, overallGrade: true },
    }),
    // [PRODUCTION FIX 2026-07-28] "Learners enrolled" on the public
    // Performance section previously had no live source and was replaced
    // with a "Total MANEB candidates" substitute. This is the real number
    // — a live count, not sensitive (just a total), safe to expose
    // publicly. Computed unconditionally (not inside the records.length
    // check below) so it still shows even in a year with no MANEB
    // records published yet.
    prisma.student.count({ where: { status: 'ACTIVE' } }),
  ])

  if (records.length === 0) {
    return res.json({ year, stats: [], enrolledStudents })
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
    enrolledStudents,
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
  // [PRODUCTION FIX 2026-07-28] page/pageSize added for a real "browse all
  // news/announcements" page (previously every caller was capped at 12,
  // fine for a homepage teaser strip but not for actually browsing the
  // full archive). Homepage callers are unaffected — they just don't pass
  // `page`, so page defaults to 1 and behaviour is unchanged for them.
  const pageSize = Math.min(Number(req.query.limit ?? 6), 100)
  const page = Math.max(1, Number(req.query.page ?? 1))
  // [PRODUCTION FIX 2026-07-28] Was filtering on targetAll, which conflates
  // "addressed to everyone inside the school" with "safe to publish on the
  // public marketing site" — an internal all-staff notice could leak here
  // with no way to opt out. publicWebsite is a distinct, explicit opt-in
  // (see announcementService.ts's CreateAnnouncementInput comment).
  const baseQuery = admin.firestore()
    .collection(COLLECTIONS.ANNOUNCEMENTS)
    .where('status', '==', 'PUBLISHED')
    .where('publicWebsite', '==', true)
    .orderBy('createdAt', 'desc')

  const [snap, countSnap] = await Promise.all([
    baseQuery.offset((page - 1) * pageSize).limit(pageSize).get(),
    baseQuery.count().get(),
  ])

  const announcements = await Promise.all(
    snap.docs.map(async (d) => {
      const data = d.data() as {
        title: string
        body: string
        eventDate?: string | null
        imageKey?: string | null
        createdAt: FirebaseFirestore.Timestamp
      }
      return {
        id: d.id,
        title: data.title,
        body: data.body,
        eventDate: data.eventDate ?? null,
        // [PRODUCTION FIX 2026-07-28] Resolve to a real, directly-usable
        // view URL here (same getPublicViewUrl() pattern as /public/gallery)
        // rather than handing back the raw Appwrite file ID and leaving the
        // frontend with no way to turn it into an <img src>.
        imageUrl: data.imageKey ? await getPublicViewUrl('', data.imageKey) : null,
        createdAt: data.createdAt.toDate(),
      }
    }),
  )

  res.json({ announcements, total: countSnap.data().count, page, pageSize })
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

// ─── PUBLIC CONTACT FORM ──────────────────────────────────────────────────────
// POST /public/contact
// [PRODUCTION FIX 2026-07-28] The landing page's "Send us a message" form had
// no backend at all — in both the previous design and the redesign, the form
// was pure decoration (no onSubmit, no state binding). This gives it a real
// destination: the message is emailed to the school's own contact address
// (SETTING_KEYS.SCHOOL_EMAIL, the same address shown elsewhere on this page),
// with Reply-To set to the visitor so the office can reply directly.

const ContactMessageSchema = z.object({
  name:    z.string().min(1, 'Name is required').max(150),
  email:   z.string().email('Enter a valid email address'),
  subject: z.string().min(1, 'Subject is required').max(200),
  message: z.string().min(1, 'Message is required').max(5000),
})

publicRouter.post('/contact', async (req, res) => {
  const parsed = ContactMessageSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Please check the form for errors.' })
  }
  const { name, email, subject, message } = parsed.data

  const settings = await settingsService.getPublicSettings()
  const schoolEmail = settings[SETTING_KEYS.SCHOOL_EMAIL] ?? 'info@school.edu.mw'

  const emailResult = await sendEmail({
    to:      schoolEmail,
    replyTo: email,
    subject: `[Website enquiry] ${subject}`,
    html: `<p><strong>From:</strong> ${name} (${email})</p>
      <p><strong>Subject:</strong> ${subject}</p>
      <p><strong>Message:</strong></p>
      <p>${message.replace(/\n/g, '<br />')}</p>`,
    tags: [{ name: 'type', value: 'public-contact' }],
  })

  if (!emailResult.ok) {
    return res.status(502).json({ error: 'Failed to send your message. Please try again or contact us by phone.' })
  }

  res.status(201).json({ message: 'Thank you — the admissions office will respond within two working days.' })
})

// ─── PUBLIC PLACEMENT STATISTICS ──────────────────────────────────────────────
// GET /public/placement-stats?year=2025/2026
// [PRODUCTION FIX 2026-07-28] University placement outcomes were tracked
// (placementService.ts / UniversityPlacement) but every route in placements.ts
// requires auth — nothing was ever exposed publicly for the landing page's
// "University Placement" performance card. Mirrors /public/maneb-stats'
// pattern exactly: same default academic year, same aggregate-and-round shape.
// "Qualified" = MSCE leavers who reached the placement process (one
// UniversityPlacement row is created per certified MSCE record); "selected"
// = those whose placement outcome is PLACED or CONFIRMED.

publicRouter.get('/placement-stats', async (req, res) => {
  const year = String(req.query.year ?? '2025/2026')

  const placements = await prisma.universityPlacement.findMany({
    where:  { manebRecord: { academicYear: year } },
    select: { status: true },
  })

  const qualified = placements.length
  const selected = placements.filter((p) => p.status === 'PLACED' || p.status === 'CONFIRMED').length

  res.json({
    year,
    qualified,
    selected,
    selectionRate: qualified > 0 ? Math.round((selected / qualified) * 100) : 0,
  })
})

// ─── PUBLIC GALLERY ────────────────────────────────────────────────────────
// GET /public/gallery?limit=5&page=1
// [PRODUCTION FIX 2026-07-28] "Life at our school" had no live source at
// all (permanent placeholder icons). Real photos, managed via
// gallery.ts (admin/high_rank upload), served here as direct Appwrite view
// URLs — getPublicViewUrl() is the storage layer's existing, documented
// pattern for public assets, same one used for the school logo.

publicRouter.get('/gallery', async (req, res) => {
  const pageSize = Math.min(Number(req.query.limit ?? 5), 60)
  const page = Math.max(1, Number(req.query.page ?? 1))

  const [rows, total] = await Promise.all([
    prisma.galleryPhoto.findMany({
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.galleryPhoto.count(),
  ])

  const photos = await Promise.all(
    rows.map(async (p) => ({
      id: p.id,
      url: await getPublicViewUrl('', p.fileKey),
      caption: p.caption,
      category: p.category,
    })),
  )

  res.json({ photos, total, page, pageSize })
})

// ─── PUBLIC LEADERSHIP TEAM ────────────────────────────────────────────────
// GET /public/leadership
// [PRODUCTION FIX 2026-07-28] For the Discover -> Leadership page. Reads
// SETTING_KEYS.SCHOOL_LEADERSHIP_TEAM (admin/hr/high_rank-curated — see
// that key's comment for why this isn't real StaffProfile data).

publicRouter.get('/leadership', async (_req, res) => {
  const settings = await settingsService.getPublicSettings()
  const team = settings[SETTING_KEYS.SCHOOL_LEADERSHIP_TEAM] ?? []
  res.json({ team })
})

// ─── PUBLIC FEE STRUCTURE ──────────────────────────────────────────────────
// GET /public/fee-structure?year=2025/2026
// [PRODUCTION FIX 2026-07-28] For the Admissions page's fee section — real
// FeeStructure rows (name + amount) rather than fabricated figures.
// Deliberately narrow: only school-wide items (classId null, term null),
// since a public page can't sensibly show every class/term-specific
// variant — those belong in the real application/enrolment flow.

publicRouter.get('/fee-structure', async (req, res) => {
  const year = String(req.query.year ?? '2025/2026')
  const items = await prisma.feeStructure.findMany({
    where: { academicYear: year, classId: null, term: null, isActive: true },
    select: { name: true, amount: true },
    orderBy: { name: 'asc' },
  })
  res.json({ year, items: items.map((i) => ({ name: i.name, amount: Number(i.amount) })) })
})