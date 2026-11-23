/**
 * [FILE]: apps/web/src/server/services/guardian/guardianInvitationService.ts
 * [PURPOSE]: Issue and revoke one-time claim codes for an ACTIVE guardian link.
 *
 * [SECURITY NOTES]
 *   - A code can only be issued for a link staff already APPROVED. An invitation is the
 *     way an approved guardian creates their account; it never creates access itself.
 *   - Only a keyed hash of the secret is stored. The plaintext code is returned exactly
 *     once, to the staff member issuing it, and is never persisted, logged or audited
 *     (the audit entry carries the non-secret ref only).
 *   - One live code per link: issuing a new one revokes the previous one in the same
 *     transaction, so a lost slip is cancelled by reissuing.
 *   - A profile that already has an account needs no invitation: the new child simply
 *     appears when the link is approved. Refusing to issue avoids a second account.
 */
import { INVITATION_TTL_HOURS, type GuardianInvitationChannelValue } from '@shared/constants/guardianPortal'
import { generateInvitationCode, hashInvitationSecret } from '@/server/lib/guardian/invitationCode'
import { isUniqueViolation, type GuardianDb } from './db'
import { conflict, notFound, unprocessable } from './errors'
import { assertCan, type StaffCtx } from './guardianLinkService'

export interface IssueDeps {
  /** HMAC key (>= 32 chars). Injected so tests need no environment. */
  pepper: string
  random?: (max: number) => number
}

export interface IssuedInvitation {
  invitationId: string
  ref: string
  /** Plaintext code, shown to staff once. Not stored anywhere. */
  code: string
  channel: GuardianInvitationChannelValue
  expiresAt: Date
}

const MAX_REF_ATTEMPTS = 5

export async function issueInvitation(
  db: GuardianDb,
  linkId: string,
  input: { channel: unknown; contactId?: string | null },
  ctx: StaffCtx,
  deps: IssueDeps,
): Promise<IssuedInvitation> {
  assertCan(ctx, 'guardian.invite')
  const channel = input.channel
  if (channel !== 'EMAIL' && channel !== 'SLIP') throw unprocessable('INVALID_CHANNEL', 'Choose email or printed slip.')

  const link = await db.guardianLink.findUnique({ where: { id: linkId }, include: { profile: true } })
  if (!link) throw notFound('Guardian link')
  if (link.status !== 'ACTIVE') throw conflict('NOT_ACTIVE', 'Approve this guardian before issuing an invitation.')
  if (link.profile.status !== 'ACTIVE') throw conflict('PROFILE_NOT_ACTIVE', 'This guardian profile is suspended or merged.')
  if (link.profile.firebaseUid) throw conflict('ALREADY_CLAIMED', 'This guardian already has a guardian account. The child will appear there once access is approved.')
  if (link.reverifyRequired === true) throw conflict('NEEDS_REVERIFY', 'Re-verify this guardian before issuing an invitation: their details changed.')

  let contactId: string | null = null
  if (channel === 'EMAIL') {
    const contact = input.contactId ? await db.guardianContact.findUnique({ where: { id: input.contactId } }) : null
    if (!contact || contact.profileId !== link.profileId || contact.kind !== 'EMAIL') {
      throw unprocessable('INVALID_CONTACT', 'Choose one of this guardian\u2019s email addresses.')
    }
    contactId = contact.id as string
  }

  const now = (ctx.now ?? (() => new Date()))()
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_HOURS[channel] * 3_600_000)

  const issued = await db.$transaction(async (tx) => {
    await tx.guardianInvitation.updateMany({
      where: { linkId, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: now, revokedByUid: ctx.actor.uid },
    })
    for (let attempt = 0; attempt < MAX_REF_ATTEMPTS; attempt++) {
      const code = generateInvitationCode(deps.random)
      try {
        const row = await tx.guardianInvitation.create({
          data: {
            ref: code.ref,
            secretHash: hashInvitationSecret(code.ref, code.secret, deps.pepper),
            linkId, channel, contactId, expiresAt, issuedByUid: ctx.actor.uid, issuedAt: now,
          },
        })
        return { invitationId: row.id as string, ref: code.ref, code: code.display }
      } catch (err) {
        if (!isUniqueViolation(err)) throw err   // a ref collision just draws a new code
      }
    }
    throw new Error('Could not allocate a unique invitation reference.')
  })

  await ctx.audit({
    action: 'guardian.invitation_issued', entityType: 'GuardianLink', entityId: linkId,
    actorUid: ctx.actor.uid, actorRole: ctx.actor.role,
    // The ref is not a secret; the code and hash are never written here.
    metadata: { context: { studentId: link.studentId, channel, ref: issued.ref, expiresAt: expiresAt.toISOString() } },
  })
  return { invitationId: issued.invitationId, ref: issued.ref, code: issued.code, channel, expiresAt }
}

export async function revokeInvitation(db: GuardianDb, invitationId: string, ctx: StaffCtx) {
  assertCan(ctx, 'guardian.invite')
  const now = (ctx.now ?? (() => new Date()))()
  const inv = await db.guardianInvitation.findUnique({ where: { id: invitationId } })
  if (!inv) throw notFound('Invitation')
  const res = await db.guardianInvitation.updateMany({
    where: { id: invitationId, status: 'ACTIVE' },
    data: { status: 'REVOKED', revokedAt: now, revokedByUid: ctx.actor.uid },
  })
  if (res.count !== 1) throw conflict('NOT_ACTIVE', 'That invitation is no longer active.')
  await ctx.audit({
    action: 'guardian.invitation_revoked', entityType: 'GuardianLink', entityId: inv.linkId as string,
    actorUid: ctx.actor.uid, actorRole: ctx.actor.role, metadata: { context: { ref: inv.ref } },
  })
}

/** Marks ACTIVE invitations past their expiry as EXPIRED. Safe to run from a maintenance job. */
export async function expireStaleInvitations(db: GuardianDb, now: Date): Promise<number> {
  const res = await db.guardianInvitation.updateMany({
    where: { status: 'ACTIVE', expiresAt: { lt: now } },
    data: { status: 'EXPIRED' },
  })
  return res.count
}
