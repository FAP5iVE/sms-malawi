/**
 * apps/web/src/server/services/userManagementService.ts
 *
 * [CHANGE TYPE]: TARGETED EDIT (two changes)
 * [R-PHASE]: R2 — Auth Session & Login Flow Correctness
 * [PURPOSE]:
 *   (1) New export clearPasswordChangeRequirement(uid) — the server-side
 *       half of the requiresPasswordChange claim lifecycle. createUser()
 *       sets this claim to true at account creation, but no code path
 *       anywhere previously cleared it, permanently locking every new
 *       account out of the app after its first password change. Reads the
 *       user's CURRENT custom claims and merges in requiresPasswordChange:
 *       false — never a bare { requiresPasswordChange: false } call, since
 *       Admin SDK's setCustomUserClaims() replaces the entire claims
 *       object and a bare call would silently wipe the user's role claim.
 *   (2) toggleUserDisabled(uid, disabled, actorUid): when disabling a user,
 *       also clears any FCM tokens registered for that uid, so a disabled
 *       account stops receiving push notifications immediately rather than
 *       until push.ts's removeInvalidTokens() eventually garbage-collects
 *       a send failure.
 * [DEPENDS ON]: none
 *
 * [CHANGE TYPE]: TARGETED EDIT (R4 — Auth/Security Domain), a further edit
 *   on top of R1/R2's changes to this file. createUser() now sets the
 *   subtitle custom claim at creation time, resolved from the linked
 *   StaffProfile's jobTitle when data.staffId is supplied — CreateUserInput
 *   itself carries no title field directly (confirmed by reading
 *   packages/shared/schemas/admin.ts), only the staffId link; StaffProfile
 *   is where jobTitle actually lives (confirmed in schema.prisma).
 *   AuthProvider.tsx has read idTokenResult.claims.subtitle since Phase 1A
 *   with no code path that ever populated it — this is that path.
 *
 * [CHANGE TYPE]: TARGETED EDIT (production fix, 2026-07-26). createUser()
 *   now writes the newly-minted Firebase Auth UID back onto the linked
 *   StaffProfile.uid when data.staffId is supplied. Previously the two
 *   identity records were never connected: the StaffProfile kept whatever
 *   placeholder uid was typed at profile-creation time (CreateStaffSchema.uid
 *   is free-text), while every self-service HR action resolves the caller by
 *   their real Firebase UID (req.user.uid). The mismatch made
 *   POST /hr/loans/request, POST /hr/leave/apply, and GET /hr/loans/mine all
 *   fail with "Staff profile not found." for every staff member. A companion
 *   one-off backfill (apps/web/scripts/backfill-staff-uids.mjs) re-links
 *   staff accounts already created before this fix, matched by email.
 */
import * as admin from 'firebase-admin'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { clearTokensForUser } from '@/lib/push'
import { generateTempPassword } from '@/lib/tempPassword'
import { sendEmail } from '@/lib/email'
import type { CreateUserInput, NotificationPrefInput } from '@shared/schemas/admin'
import type { UserRole } from '@shared/types/roles'

function getAuth() { return admin.auth() }

// ─── CREATE USER ─────────────────────────────────────────
export async function createUser(data: CreateUserInput, actorUid: string) {
  const tempPassword = generateTempPassword()
  // 1. Create Firebase Auth account
  const userRecord = await getAuth().createUser({
    email:        data.email,
    password:     tempPassword,
    displayName:  data.displayName,
    phoneNumber:  data.phone,
    emailVerified: false,
  })

  // 1a. Resolve the subtitle claim from the linked StaffProfile's jobTitle,
  // when one was supplied. CreateUserInput itself carries no title field
  // directly (confirmed by reading packages/shared/schemas/admin.ts — only
  // email/displayName/role/phone/studentId/staffId exist there); staffId is
  // the link to the StaffProfile record that actually holds the title
  // (StaffProfile.jobTitle, confirmed in schema.prisma). AuthProvider.tsx
  // has read idTokenResult.claims.subtitle since Phase 1A with no code path
  // that ever populated it — this is that path.
  let subtitle: string | null = null
  if (data.staffId) {
    const staffProfile = await prisma.staffProfile.findUnique({
      where: { id: data.staffId },
      select: { jobTitle: true },
    })
    subtitle = staffProfile?.jobTitle ?? null

    // Link the StaffProfile to the Firebase Auth account just created:
    // write the real Auth UID onto StaffProfile.uid. Every self-service HR
    // lookup resolves the caller's profile by req.user.uid (loan requests in
    // hr.ts POST /loans/request, leave applications in POST /leave/apply, and
    // GET /loans/mine). Without this write the profile keeps whatever
    // placeholder uid was entered at profile-creation time — which never
    // equals the Firebase Auth UID minted here — so every one of those
    // actions fails with "Staff profile not found." updateMany (not update)
    // is deliberate: a missing/stale staffId is a silent no-op instead of a
    // throw, which would otherwise orphan the Auth account we already created
    // above. userRecord.uid is freshly minted and globally unique, so this
    // can never collide with the StaffProfile.uid @unique constraint.
    await prisma.staffProfile.updateMany({
      where: { id: data.staffId },
      data:  { uid: userRecord.uid },
    })
  }

  // 2. Set custom claims: role + requiresPasswordChange flag + subtitle
  await getAuth().setCustomUserClaims(userRecord.uid, {
    role: data.role,
    requiresPasswordChange: true,
    subtitle,
  })
  // 3. Send welcome email with temp password via the email.ts singleton.
  //    `from` is deliberately omitted — the singleton applies
  //    EMAIL_FROM_ADDRESS/EMAIL_FROM_NAME from env (FROM_ADDRESS/FROM_NAME in
  //    lib/email.ts), so this never hardcodes a domain again. Same for the
  //    login link, which now reads NEXT_PUBLIC_APP_URL instead of a literal
  //    Vercel preview URL.
  const emailResult = await sendEmail({
    to:      data.email,
    subject: 'Welcome to SMS Malawi — Your Login Details',
    html: `<p>Dear ${data.displayName},</p>
      <p>Your account has been created on the School Management System.</p>
      <p><strong>Email:</strong> ${data.email}<br>
         <strong>Temporary Password:</strong> <code>${tempPassword}</code></p>
      <p>You will be required to change your password on first login.</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? ''}/login">Login here</a></p>`,
    tags: [{ name: 'type', value: 'user-welcome' }],
  })
  if (!emailResult.ok) {
    logger.warn(
      { uid: userRecord.uid, email: data.email, reason: emailResult.error },
      '[userManagementService.createUser] welcome email failed to send; temp password still returned to caller',
    )
  }
  logger.info({ event: 'user.created', uid: userRecord.uid, role: data.role, subtitle, actorUid })
  return { uid: userRecord.uid, email: data.email, role: data.role, subtitle }
}

// ─── LIST USERS ──────────────────────────────────────────
export async function listUsers(pageToken?: string) {
  const result = await getAuth().listUsers(100, pageToken)
  const uids = result.users.map((u) => u.uid)

  // [PRODUCTION FIX 2026-07-28] User Management previously showed only raw
  // Firebase Auth fields — no employment/registration number, even though
  // that's exactly the kind of identifier an admin filters/sorts by. Batch
  // join against StaffProfile/Student by uid rather than N+1 queries.
  const [staff, students] = await Promise.all([
    prisma.staffProfile.findMany({ where: { uid: { in: uids } }, select: { uid: true, employeeNo: true } }),
    prisma.student.findMany({ where: { firebaseUid: { in: uids } }, select: { firebaseUid: true, registrationNo: true } }),
  ])
  const employeeNoByUid = new Map(staff.map((s) => [s.uid, s.employeeNo]))
  const registrationNoByUid = new Map(students.filter((s) => s.firebaseUid).map((s) => [s.firebaseUid as string, s.registrationNo]))

  return {
    users: result.users.map((u) => ({
      uid:         u.uid,
      email:       u.email,
      displayName: u.displayName,
      role:        u.customClaims?.['role'] as UserRole | undefined,
      requiresPasswordChange: u.customClaims?.['requiresPasswordChange'] === true,
      disabled:    u.disabled,
      createdAt:   u.metadata.creationTime,
      lastSignIn:  u.metadata.lastSignInTime,
      employeeNo:     employeeNoByUid.get(u.uid) ?? null,
      registrationNo: registrationNoByUid.get(u.uid) ?? null,
    })),
    pageToken: result.pageToken,
  }
}

// ─── UPDATE ROLE ─────────────────────────────────────────
export async function updateUserRole(uid: string, role: UserRole, actorUid: string) {
  const existing = await getAuth().getUser(uid)
  await getAuth().setCustomUserClaims(uid, { ...existing.customClaims, role })
  logger.info({ event: 'user.role_updated', uid, role, actorUid })
  return { uid, role }
}

// ─── DISABLE / ENABLE USER ───────────────────────────────
export async function toggleUserDisabled(uid: string, disabled: boolean, actorUid: string) {
  await getAuth().updateUser(uid, { disabled })
  if (disabled) {
    // Stop push notifications immediately for a disabled account rather
    // than waiting for push.ts's removeInvalidTokens() to clean up stale
    // tokens after a future failed send.
    await clearTokensForUser(uid)
  }
  logger.info({ event: disabled ? 'user.disabled' : 'user.enabled', uid, actorUid })
}

// ─── CLEAR PASSWORD-CHANGE-REQUIRED FLAG ─────────────────
/**
 * Clears the requiresPasswordChange custom claim for a user, after they
 * have successfully changed their password client-side via
 * updatePassword(). Called by the self-service
 * POST /users/me/clear-password-change-flag route.
 *
 * Merges into the user's EXISTING claims rather than replacing them —
 * setCustomUserClaims() replaces the whole claims object, so a bare
 * { requiresPasswordChange: false } call would silently wipe the user's
 * role (and any other claim) alongside it.
 */
export async function clearPasswordChangeRequirement(uid: string): Promise<void> {
  const existing = await getAuth().getUser(uid)
  await getAuth().setCustomUserClaims(uid, {
    ...existing.customClaims,
    requiresPasswordChange: false,
  })
  logger.info({ event: 'user.passwordChangeCleared', uid })
}

// ─── RESET PASSWORD ──────────────────────────────────────
export async function sendPasswordReset(uid: string) {
  const user = await getAuth().getUser(uid)
  if (!user.email) throw new Error('User has no email address.')
  const link = await getAuth().generatePasswordResetLink(user.email)
  // `from` deliberately omitted — see createUser() above; the email.ts
  // singleton supplies it from EMAIL_FROM_ADDRESS/EMAIL_FROM_NAME.
  const emailResult = await sendEmail({
    to:      user.email,
    subject: 'Password Reset — SMS Malawi',
    html:    `<p>Click <a href="${link}">here</a> to reset your password. This link expires in 1 hour.</p>`,
    tags: [{ name: 'type', value: 'password-reset' }],
  })
  if (!emailResult.ok) {
    logger.warn(
      { uid, email: user.email, reason: emailResult.error },
      '[userManagementService.sendPasswordReset] reset email failed to send',
    )
    throw new Error('Failed to send password reset email.')
  }
}

// ─── NOTIFICATION PREFERENCES ────────────────────────────
export async function getNotificationPrefs(uid: string) {
  return prisma.userNotificationPref.upsert({
    where: { uid },
    create: { uid },   // defaults from schema
    update: {},
  })
}

export async function updateNotificationPrefs(uid: string, data: NotificationPrefInput) {
  return prisma.userNotificationPref.upsert({
    where: { uid },
    create: { uid, ...data },
    update: data,
  })
}