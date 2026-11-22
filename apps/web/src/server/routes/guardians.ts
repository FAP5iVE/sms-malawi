/**
 * [FILE]: apps/web/src/server/routes/guardians.ts
 * [PURPOSE]: Staff API for managing parent/guardian PORTAL ACCESS: the review queue,
 *   verification, approval, restriction, invitations, and the safeguarding access log.
 *   Mounted at /guardians. The school's guardian CONTACT CARDS stay at
 *   /students/:id/guardians (a card never grants access; only an ACTIVE link does).
 *
 *   Every route: verifyAuth (router-wide) + one named permission + a rate-limit policy.
 *   The services re-check the permission themselves, so this file cannot be the only guard.
 *
 * [SECURITY NOTES]
 *   - An EMAIL invitation's code is sent ONLY to the guardian's inbox and is never returned
 *     to the staff member. If the e-mail cannot be sent the invitation is revoked, so no
 *     live code exists that nobody has. A SLIP code is returned once so staff can hand it
 *     over in person.
 *   - Responses for staff include contact details of guardians (staff have guardian.view);
 *     they never include child welfare/exit/identity fields or invitation hashes.
 */
import 'server-only'
import { Router, type Request, type Response } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import { rateLimit } from '@/lib/ratelimit'
import { requirePermission } from '@/server/middleware/verifyPermission'
import { sendError } from '@/server/lib/sendError'
import * as auditService from '@/server/services/auditService'
import { logger } from '@/lib/logger'
import {
  AccessLogQuerySchema, ApproveLinkSchema, IssueInvitationSchema, NationalIdBackfillSchema, OnboardingApplySchema,
  OnboardingDryRunSchema, OnboardingReportQuerySchema, OptionalReasonSchema, QueueQuerySchema, RecentAccessQuerySchema,
  RepointLinkSchema, RequiredReasonSchema, SetCapabilitiesSchema, SetEvidenceSchema, StudentListQuerySchema,
} from '@shared/schemas/guardianPortal'
import { prismaGuardianDb } from '@/server/services/guardian/prismaDb'
import { GuardianError } from '@/server/services/guardian/errors'
import {
  approveLink, assertCan, confirmReverified, getStudentPortalView, listQueue, listRecentAccess, listStudentsForGuardians,
  reinstateProfile, repointLink, setCapabilities, setEvidence, suspendProfile, transitionLink, type StaffCtx,
} from '@/server/services/guardian/guardianLinkService'
import { backfillNationalIds } from '@/server/services/guardian/guardianNationalIdService'
import { issueInvitation, revokeInvitation } from '@/server/services/guardian/guardianInvitationService'
import * as onboarding from '@/server/services/guardian/guardianOnboardingService'
import { syncStudentDirectory } from '@/server/services/guardian/guardianIdentityService'
import { getClaimUrl, getInvitationPepper } from '@/server/services/guardian/config'
import { revokeGuardianSessions } from '@/server/services/guardian/firebaseIdentity'
import { buildInvitationEmail } from '@/server/lib/guardian/invitationEmail'
import { sendEmail } from '@/lib/email'

export const guardiansRouter = Router()
guardiansRouter.use(verifyAuth)

const db = () => prismaGuardianDb()

function ctxOf(req: Request): StaffCtx {
  const u = req.user!
  return {
    actor: { uid: u.uid, role: u.role, superUser: u.superUser === true },
    audit: async (r) => { await auditService.log(r) },
  }
}

const param = (req: Request, name: string) => String(req.params[name] ?? '')

/** Runs a handler and turns any error into a response. GuardianError carries its own status and reason. */
function handle(tag: string, fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res)
    } catch (err) {
      if (err instanceof GuardianError) {
        res.status(err.status).json({ error: err.message, code: err.code, ...(err.problems ? { problems: err.problems } : {}) })
        return
      }
      sendError(res, err, { tags: { module: 'guardians', route: tag } })
    }
  }
}

function badRequest(res: Response, message: string) {
  res.status(400).json({ error: message })
}

// ─── READ ─────────────────────────────────────────────────────────────────

guardiansRouter.get(
  '/queue',
  requirePermission('guardian.view'),
  handle('queue', async (req, res) => {
    const q = QueueQuerySchema.safeParse(req.query)
    if (!q.success) return badRequest(res, q.error.issues[0]?.message ?? 'Invalid query.')
    res.json(await listQueue(db(), {
      ...(q.data.status ? { status: q.data.status } : {}),
      ...(q.data.reverify === 'true' ? { reverify: true } : {}),
      ...(q.data.studentId ? { studentId: q.data.studentId } : {}),
      ...(q.data.search ? { search: q.data.search } : {}),
      ...(q.data.take ? { take: q.data.take } : {}),
      ...(q.data.skip ? { skip: q.data.skip } : {}),
    }, ctxOf(req)))
  }),
)

// The Student tab's list: current students by default, the whole school when searching.
guardiansRouter.get(
  '/students',
  requirePermission('guardian.view'),
  handle('student-list', async (req, res) => {
    const q = StudentListQuerySchema.safeParse(req.query)
    if (!q.success) return badRequest(res, q.error.issues[0]?.message ?? 'Invalid query.')
    res.json(await listStudentsForGuardians(db(), {
      ...(q.data.search ? { search: q.data.search } : {}),
      ...(q.data.sort ? { sort: q.data.sort } : {}),
      ...(q.data.take ? { take: q.data.take } : {}),
      ...(q.data.skip ? { skip: q.data.skip } : {}),
    }, ctxOf(req)))
  }),
)

guardiansRouter.get(
  '/students/:studentId',
  requirePermission('guardian.view'),
  handle('student-view', async (req, res) => {
    res.json(await getStudentPortalView(db(), param(req, 'studentId'), ctxOf(req)))
  }),
)

// The Access log's default view: one row per student, most recently opened first.
guardiansRouter.get(
  '/access-log/recent',
  requirePermission('guardian.viewAccessLog'),
  handle('access-log-recent', async (req, res) => {
    const q = RecentAccessQuerySchema.safeParse(req.query)
    if (!q.success) return badRequest(res, q.error.issues[0]?.message ?? 'Invalid query.')
    res.json(await listRecentAccess(db(), { ...(q.data.take ? { take: q.data.take } : {}) }, ctxOf(req)))
  }),
)

guardiansRouter.get(
  '/access-log',
  requirePermission('guardian.viewAccessLog'),
  handle('access-log', async (req, res) => {
    const q = AccessLogQuerySchema.safeParse(req.query)
    if (!q.success) return badRequest(res, q.error.issues[0]?.message ?? 'Invalid query.')
    const rows = await db().guardianAccessLog.findMany({
      where: { ...(q.data.studentId ? { studentId: q.data.studentId } : {}), ...(q.data.profileId ? { profileId: q.data.profileId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: q.data.take ?? 100,
    })
    res.json({
      items: rows.map((r) => ({
        id: r.id, profileId: r.profileId, linkId: r.linkId ?? null, studentId: r.studentId ?? null,
        module: r.module, outcome: r.outcome, reason: r.reason ?? null, createdAt: r.createdAt,
      })),
    })
  }),
)

// ─── PROPOSE / VERIFY ─────────────────────────────────────────────────────

guardiansRouter.post(
  '/students/:studentId/sync',
  rateLimit('guardian-staff'),
  requirePermission('guardian.propose'),
  handle('sync', async (req, res) => {
    const ctx = ctxOf(req)
    assertCan(ctx, 'guardian.propose')
    const result = await syncStudentDirectory(db(), param(req, 'studentId'), { actor: ctx.actor, source: 'STAFF' })
    for (const r of result.audit) await ctx.audit(r)
    res.json({ proposed: result.proposed, skipped: result.skipped, existing: result.existing, flagged: result.flagged })
  }),
)

guardiansRouter.post(
  '/links/:id/evidence',
  rateLimit('guardian-staff'),
  requirePermission('guardian.propose'),
  handle('evidence', async (req, res) => {
    const b = SetEvidenceSchema.safeParse(req.body)
    if (!b.success) return badRequest(res, b.error.issues[0]?.message ?? 'Invalid request.')
    res.json(await setEvidence(db(), param(req, 'id'), b.data.evidence, ctxOf(req)))
  }),
)

guardiansRouter.post(
  '/links/:id/repoint',
  rateLimit('guardian-staff'),
  requirePermission('guardian.propose'),
  handle('repoint', async (req, res) => {
    const b = RepointLinkSchema.safeParse(req.body)
    if (!b.success) return badRequest(res, b.error.issues[0]?.message ?? 'Invalid request.')
    res.json(await repointLink(db(), param(req, 'id'), b.data.profileId, ctxOf(req)))
  }),
)

// ─── DECIDE (easing access: guardian.approve) ─────────────────────────────

guardiansRouter.post(
  '/links/:id/approve',
  rateLimit('guardian-staff'),
  requirePermission('guardian.approve'),
  handle('approve', async (req, res) => {
    const b = ApproveLinkSchema.safeParse(req.body ?? {})
    if (!b.success) return badRequest(res, b.error.issues[0]?.message ?? 'Invalid request.')
    res.json(await approveLink(db(), param(req, 'id'), {
      ...(b.data.capabilities ? { capabilities: b.data.capabilities } : {}),
      ...(b.data.acknowledgeSuggestion !== undefined ? { acknowledgeSuggestion: b.data.acknowledgeSuggestion } : {}),
    }, ctxOf(req)))
  }),
)

guardiansRouter.post(
  '/links/:id/reject',
  rateLimit('guardian-staff'),
  requirePermission('guardian.approve'),
  handle('reject', async (req, res) => {
    const b = RequiredReasonSchema.safeParse(req.body)
    if (!b.success) return badRequest(res, b.error.issues[0]?.message ?? 'Give a reason.')
    res.json(await transitionLink(db(), param(req, 'id'), 'reject', b.data, ctxOf(req)))
  }),
)

guardiansRouter.post(
  '/links/:id/reinstate',
  rateLimit('guardian-staff'),
  requirePermission('guardian.approve'),
  handle('reinstate', async (req, res) => {
    const b = OptionalReasonSchema.safeParse(req.body ?? {})
    if (!b.success) return badRequest(res, b.error.issues[0]?.message ?? 'Invalid request.')
    res.json(await transitionLink(db(), param(req, 'id'), 'reinstate', b.data, ctxOf(req)))
  }),
)

guardiansRouter.post(
  '/links/:id/reopen',
  rateLimit('guardian-staff'),
  requirePermission('guardian.approve'),
  handle('reopen', async (req, res) => {
    const b = OptionalReasonSchema.safeParse(req.body ?? {})
    if (!b.success) return badRequest(res, b.error.issues[0]?.message ?? 'Invalid request.')
    res.json(await transitionLink(db(), param(req, 'id'), 'reopen', b.data, ctxOf(req)))
  }),
)

guardiansRouter.post(
  '/links/:id/reverified',
  rateLimit('guardian-staff'),
  requirePermission('guardian.approve'),
  handle('reverified', async (req, res) => {
    res.json(await confirmReverified(db(), param(req, 'id'), ctxOf(req)))
  }),
)

// ─── RESTRICT (tightening access: guardian.restrict) ──────────────────────

guardiansRouter.post(
  '/links/:id/suspend',
  rateLimit('guardian-staff'),
  requirePermission('guardian.restrict'),
  handle('suspend', async (req, res) => {
    const b = RequiredReasonSchema.safeParse(req.body)
    if (!b.success) return badRequest(res, b.error.issues[0]?.message ?? 'Give a reason.')
    res.json(await transitionLink(db(), param(req, 'id'), 'suspend', b.data, ctxOf(req)))
  }),
)

guardiansRouter.post(
  '/links/:id/revoke',
  rateLimit('guardian-staff'),
  requirePermission('guardian.restrict'),
  handle('revoke', async (req, res) => {
    const b = RequiredReasonSchema.safeParse(req.body)
    if (!b.success) return badRequest(res, b.error.issues[0]?.message ?? 'Give a reason.')
    res.json(await transitionLink(db(), param(req, 'id'), 'revoke', b.data, ctxOf(req)))
  }),
)

guardiansRouter.patch(
  '/links/:id/capabilities',
  rateLimit('guardian-staff'),
  requirePermission('guardian.restrict'),
  handle('capabilities', async (req, res) => {
    const b = SetCapabilitiesSchema.safeParse(req.body)
    if (!b.success) return badRequest(res, b.error.issues[0]?.message ?? 'Invalid request.')
    res.json(await setCapabilities(db(), param(req, 'id'), b.data.capabilities, ctxOf(req)))
  }),
)

// ─── INVITATIONS ──────────────────────────────────────────────────────────

guardiansRouter.post(
  '/links/:id/invitations',
  rateLimit('guardian-invite'),
  requirePermission('guardian.invite'),
  handle('invite', async (req, res) => {
    const b = IssueInvitationSchema.safeParse(req.body)
    if (!b.success) return badRequest(res, b.error.issues[0]?.message ?? 'Invalid request.')
    const ctx = ctxOf(req)
    const issued = await issueInvitation(
      db(), param(req, 'id'),
      { channel: b.data.channel, ...(b.data.contactId ? { contactId: b.data.contactId } : {}) },
      ctx, { pepper: getInvitationPepper() },
    )

    if (issued.channel === 'SLIP') {
      // Handed over in person: staff need the code once. It is not stored anywhere.
      res.status(201).json({ invitationId: issued.invitationId, ref: issued.ref, channel: 'SLIP', expiresAt: issued.expiresAt, code: issued.code })
      return
    }

    // EMAIL: the code goes ONLY to the guardian's inbox, never back to this response.
    const contact = await db().guardianContact.findUnique({ where: { id: b.data.contactId ?? '' } })
    const mail = buildInvitationEmail({
      schoolName: process.env.NEXT_PUBLIC_SCHOOL_NAME ?? 'Your school',
      code: issued.code, claimUrl: getClaimUrl(), expiresAt: issued.expiresAt,
    })
    const sent = contact ? await sendEmail({ to: String(contact.value), subject: mail.subject, html: mail.html, text: mail.text }) : null
    if (!sent || sent.ok !== true) {
      // Never leave a live code that nobody received.
      await revokeInvitation(db(), issued.invitationId, ctx).catch((err) =>
        logger.error({ event: 'guardian.invitation_revoke_after_mail_failure_failed', ref: issued.ref, err }, '[guardians] could not revoke after e-mail failure'))
      res.status(502).json({ error: 'The invitation e-mail could not be sent. Nothing was issued; try again or use a printed slip.', code: 'EMAIL_FAILED' })
      return
    }
    await db().guardianInvitation.update({ where: { id: issued.invitationId }, data: { sentAt: new Date() } })
    res.status(201).json({ invitationId: issued.invitationId, ref: issued.ref, channel: 'EMAIL', expiresAt: issued.expiresAt, emailed: true })
  }),
)

guardiansRouter.delete(
  '/invitations/:id',
  rateLimit('guardian-invite'),
  requirePermission('guardian.invite'),
  handle('invitation-revoke', async (req, res) => {
    await revokeInvitation(db(), param(req, 'id'), ctxOf(req))
    // JSON, not an empty 204: apiFetch parses every successful body, so a bodiless reply would
    // make a successful revoke look like a failure in the UI.
    res.json({ ok: true })
  }),
)

// ─── ONBOARDING (backfill of existing contact cards) ──────────────────────
// Dry run first, review the report, then apply (in resumable chunks). Everything it
// creates is PENDING: nothing here grants access. Rollback removes only untouched rows.

guardiansRouter.post(
  '/onboarding/dry-run',
  rateLimit('bulk-mutation'),
  requirePermission('guardian.backfill'),
  handle('onboarding-dry-run', async (req, res) => {
    const b = OnboardingDryRunSchema.safeParse(req.body ?? {})
    if (!b.success) return badRequest(res, b.error.issues[0]?.message ?? 'Invalid request.')
    res.status(201).json(await onboarding.dryRun(db(), {
      ...(b.data.classId ? { classId: b.data.classId } : {}),
      ...(b.data.studentIds ? { studentIds: b.data.studentIds } : {}),
      ...(b.data.includeNotEnrolled !== undefined ? { includeNotEnrolled: b.data.includeNotEnrolled } : {}),
    }, ctxOf(req)))
  }),
)

guardiansRouter.get(
  '/onboarding/:id',
  requirePermission('guardian.backfill'),
  handle('onboarding-report', async (req, res) => {
    const q = OnboardingReportQuerySchema.safeParse(req.query)
    if (!q.success) return badRequest(res, q.error.issues[0]?.message ?? 'Invalid query.')
    res.json(await onboarding.getBatch(db(), param(req, 'id'), {
      ...(q.data.action ? { action: q.data.action } : {}),
      ...(q.data.take ? { take: q.data.take } : {}),
      ...(q.data.skip ? { skip: q.data.skip } : {}),
    }, ctxOf(req)))
  }),
)

guardiansRouter.post(
  '/onboarding/:id/apply',
  rateLimit('bulk-mutation'),
  requirePermission('guardian.backfill'),
  handle('onboarding-apply', async (req, res) => {
    const b = OnboardingApplySchema.safeParse(req.body ?? {})
    if (!b.success) return badRequest(res, b.error.issues[0]?.message ?? 'Invalid request.')
    res.json(await onboarding.apply(db(), param(req, 'id'), b.data.maxItems !== undefined ? { maxItems: b.data.maxItems } : {}, ctxOf(req)))
  }),
)

guardiansRouter.post(
  '/onboarding/:id/rollback',
  rateLimit('bulk-mutation'),
  requirePermission('guardian.backfill'),
  handle('onboarding-rollback', async (req, res) => {
    res.json(await onboarding.rollback(db(), param(req, 'id'), ctxOf(req)))
  }),
)

// ─── NATIONAL IDs (catch-up for guardians created before IDs took part in matching) ──
// Preview by default (writes nothing); `apply: true` fills blank IDs and flags duplicates. It never
// merges, links or approves anyone.

guardiansRouter.post(
  '/national-ids/backfill',
  rateLimit('bulk-mutation'),
  requirePermission('guardian.backfill'),
  handle('national-ids-backfill', async (req, res) => {
    const b = NationalIdBackfillSchema.safeParse(req.body ?? {})
    if (!b.success) return badRequest(res, b.error.issues[0]?.message ?? 'Invalid request.')
    res.json(await backfillNationalIds(db(), { apply: b.data.apply === true }, ctxOf(req)))
  }),
)

// ─── WHOLE-PERSON HOLD ────────────────────────────────────────────────────

guardiansRouter.post(
  '/profiles/:id/suspend',
  rateLimit('guardian-staff'),
  requirePermission('guardian.restrict'),
  handle('profile-suspend', async (req, res) => {
    const b = RequiredReasonSchema.safeParse(req.body)
    if (!b.success) return badRequest(res, b.error.issues[0]?.message ?? 'Give a reason.')
    res.json(await suspendProfile(db(), param(req, 'id'), b.data, ctxOf(req), { revokeSessions: revokeGuardianSessions }))
  }),
)

guardiansRouter.post(
  '/profiles/:id/reinstate',
  rateLimit('guardian-staff'),
  requirePermission('guardian.approve'),
  handle('profile-reinstate', async (req, res) => {
    res.json(await reinstateProfile(db(), param(req, 'id'), ctxOf(req)))
  }),
)
