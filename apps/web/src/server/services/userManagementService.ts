import * as admin from 'firebase-admin'
import { Resend } from 'resend'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import type { CreateUserInput, NotificationPrefInput } from '@shared/schemas/admin'
import type { UserRole } from '@shared/types/roles'

function getAuth() { return admin.auth() }

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$'
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

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
  // 2. Set custom claims: role + requiresPasswordChange flag
  await getAuth().setCustomUserClaims(userRecord.uid, {
    role: data.role,
    requiresPasswordChange: true,
  })
  // 3. Send welcome email with temp password via Resend
  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({
    from:    'noreply@school.edu.mw',
    to:      [data.email],
    subject: 'Welcome to SMS Malawi — Your Login Details',
    html: `<p>Dear ${data.displayName},</p>
      <p>Your account has been created on the School Management System.</p>
      <p><strong>Email:</strong> ${data.email}<br>
         <strong>Temporary Password:</strong> <code>${tempPassword}</code></p>
      <p>You will be required to change your password on first login.</p>
      <p><a href="https://sms-malawi.vercel.app/login">Login here</a></p>`,
  })
  logger.info({ event: 'user.created', uid: userRecord.uid, role: data.role, actorUid })
  return { uid: userRecord.uid, email: data.email, role: data.role }
}

// ─── LIST USERS ──────────────────────────────────────────
export async function listUsers(pageToken?: string) {
  const result = await getAuth().listUsers(100, pageToken)
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
  logger.info({ event: disabled ? 'user.disabled' : 'user.enabled', uid, actorUid })
}

// ─── RESET PASSWORD ──────────────────────────────────────
export async function sendPasswordReset(uid: string) {
  const user = await getAuth().getUser(uid)
  if (!user.email) throw new Error('User has no email address.')
  const link = await getAuth().generatePasswordResetLink(user.email)
  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({
    from:    'noreply@school.edu.mw',
    to:      [user.email],
    subject: 'Password Reset — SMS Malawi',
    html:    `<p>Click <a href="${link}">here</a> to reset your password. This link expires in 1 hour.</p>`,
  })
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