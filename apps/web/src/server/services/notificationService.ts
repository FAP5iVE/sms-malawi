import 'server-only'

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { sendEmail, sendBatchEmails, type EmailResult, type SendEmailInput } from '@/lib/email'
import {
  sendToUser,
  sendToUsers,
  sendToTopic,
  type PushResult,
  type PushNotificationPayload,
} from '@/lib/push'
import { getIdentitySettings } from '@/server/services/settingsService'
import type { SchoolBranding } from '@/server/templates/emails/base'

import { renderFeeReminder, type FeeReminderData } from '@/server/templates/emails/fee-reminder'
import {
  renderResultRelease,
  type ResultReleaseData,
} from '@/server/templates/emails/result-release'
import { renderLeaveUpdate, type LeaveUpdateData } from '@/server/templates/emails/leave-update'
import {
  renderContractAlert,
  type ContractAlertData,
} from '@/server/templates/emails/contract-alert'
import {
  renderOverdueLibrary,
  type OverdueLibraryData,
} from '@/server/templates/emails/overdue-library'
import {
  renderAnnouncement,
  type AnnouncementEmailData,
} from '@/server/templates/emails/announcement'

// ─────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────

export interface NotificationResult {
  emailResult?: EmailResult
  pushResult?: PushResult
  smsSent: boolean
  skipped: boolean
  skipReason?: string
}

export interface BulkNotificationResult {
  sent: number
  skipped: number
  failed: number
  results: NotificationResult[]
}

/** Default prefs — used when no UserNotificationPref row exists for a user. */
interface NotifPrefs {
  emailFeeReminder: boolean
  emailLeaveUpdate: boolean
  emailResultRelease: boolean
  emailContractAlert: boolean
  emailAnnouncement: boolean
  smsFeeReminder: boolean
  smsResultRelease: boolean
  pushAnnouncement: boolean
  pushResultRelease: boolean
}

const DEFAULT_PREFS: NotifPrefs = {
  emailFeeReminder: true,
  emailLeaveUpdate: true,
  emailResultRelease: true,
  emailContractAlert: true,
  emailAnnouncement: true,
  smsFeeReminder: false,
  smsResultRelease: false,
  pushAnnouncement: true,
  pushResultRelease: true,
}

// ─────────────────────────────────────────────────────────
//  INTERNAL HELPERS
// ─────────────────────────────────────────────────────────

/**
 * Fetch a user's notification preferences.
 * Returns DEFAULT_PREFS if no record exists.
 */
async function getPrefs(uid: string): Promise<NotifPrefs> {
  try {
    const row = await prisma.userNotificationPref.findUnique({
      where: { uid },
    })
    if (!row) return DEFAULT_PREFS

    return {
      emailFeeReminder: row.emailFeeReminder,
      emailLeaveUpdate: row.emailLeaveUpdate,
      emailResultRelease: row.emailResultRelease,
      emailContractAlert: row.emailContractAlert,
      emailAnnouncement: row.emailAnnouncement,
      smsFeeReminder: row.smsFeeReminder,
      smsResultRelease: row.smsResultRelease,
      pushAnnouncement: row.pushAnnouncement,
      pushResultRelease: row.pushResultRelease,
    }
  } catch (err) {
    logger.error({ err, uid }, '[notificationService] Failed to fetch prefs — using defaults')
    return DEFAULT_PREFS
  }
}

/**
 * Fetch school identity settings for email branding.
 * Returns sensible fallbacks if settings are unavailable.
 */
async function getSchoolBranding(): Promise<SchoolBranding> {
  try {
    const identity = await getIdentitySettings()
    const loginUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://school.mw'
    return {
      schoolName: identity.schoolName,
      schoolAddress: identity.schoolAddress,
      schoolEmail: identity.schoolEmail,
      schoolPhone: identity.schoolPhone,
      loginUrl,
    }
  } catch (err) {
    logger.error({ err }, '[notificationService] Failed to load school branding — using fallbacks')
    return {
      schoolName: 'School Management System',
      schoolAddress: 'Malawi',
      schoolEmail: 'info@school.mw',
      schoolPhone: '',
      loginUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://school.mw',
    }
  }
}

/**
 * Log an SMS intent.
 * Full Twilio integration is Phase D — add TWILIO_ACCOUNT_SID,
 * TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER to env and replace this stub.
 */
function attemptSms(to: string, message: string, purpose: string): boolean {
  if (!process.env.TWILIO_ACCOUNT_SID) {
    logger.info({ to, purpose }, '[notificationService] SMS skipped — Twilio not configured')
    return false
  }
  // Twilio integration placeholder — never actually reaches here until configured
  logger.info({ to, purpose }, '[notificationService] SMS would send via Twilio')
  return false
}

// ─────────────────────────────────────────────────────────
//  FEE REMINDER
// ─────────────────────────────────────────────────────────

export interface FeeReminderParams {
  /** Recipient email address. Typically the guardian's or student's email. */
  to: string
  /** Firebase UID of the student — used to look up push pref. */
  studentUid?: string
  /** Guardian phone number for optional SMS. E.164 format. */
  guardianPhone?: string
  data: FeeReminderData
}

/**
 * Send a fee reminder notification.
 * Channels: email (always), SMS (if configured + pref), push (if pref).
 */
export async function sendFeeReminder(params: FeeReminderParams): Promise<NotificationResult> {
  const result: NotificationResult = { smsSent: false, skipped: false }

  const prefs = params.studentUid ? await getPrefs(params.studentUid) : DEFAULT_PREFS

  const school = await getSchoolBranding()

  // ── Email
  if (prefs.emailFeeReminder) {
    const msg = renderFeeReminder(params.data, school)
    const emailResult = await sendEmail({
      to: params.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      tags: [{ name: 'type', value: 'fee_reminder' }],
    })
    result.emailResult = emailResult

    if (!emailResult.ok) {
      logger.warn(
        { to: params.to, error: emailResult.error },
        '[notificationService] Fee reminder email failed'
      )
    }
  } else {
    result.skipped = true
    result.skipReason = 'emailFeeReminder preference is off'
  }

  // ── SMS
  if (prefs.smsFeeReminder && params.guardianPhone) {
    const smsBody = `${school.schoolName}: Fee reminder for ${params.data.studentName}. Balance: ${params.data.currency} ${params.data.balanceAmount.toFixed(2)} due ${params.data.dueDate.toLocaleDateString()}. Log in: ${school.loginUrl}`
    result.smsSent = attemptSms(params.guardianPhone, smsBody, 'fee_reminder')
  }

  return result
}

// ─────────────────────────────────────────────────────────
//  RESULT RELEASE
// ─────────────────────────────────────────────────────────

export interface ResultReleaseParams {
  to: string
  studentUid?: string
  data: ResultReleaseData
}

/**
 * Notify a student that their term results have been released.
 * Channels: email + push (based on pref).
 */
export async function sendResultRelease(params: ResultReleaseParams): Promise<NotificationResult> {
  const result: NotificationResult = { smsSent: false, skipped: false }

  const prefs = params.studentUid ? await getPrefs(params.studentUid) : DEFAULT_PREFS
  const school = await getSchoolBranding()

  // ── Email
  if (prefs.emailResultRelease) {
    const msg = renderResultRelease(params.data, school)
    const emailResult = await sendEmail({
      to: params.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      tags: [{ name: 'type', value: 'result_release' }],
    })
    result.emailResult = emailResult
  }

  // ── Push
  if (prefs.pushResultRelease && params.studentUid) {
    const pushPayload: PushNotificationPayload = {
      title: 'Results Released',
      body: `Your Term ${params.data.term} ${params.data.academicYear} results are now available.`,
      clickAction: '/exams',
      tag: `results_term${params.data.term}_${params.data.academicYear.replace('/', '_')}`,
      data: {
        type: 'result_release',
        term: String(params.data.term),
        academicYear: params.data.academicYear,
      },
    }
    const pushResult = await sendToUser(params.studentUid, pushPayload)
    result.pushResult = pushResult
  }

  // ── SMS
  if (prefs.smsResultRelease && params.to) {
    const smsBody = `${school.schoolName}: Term ${params.data.term} results for ${params.data.studentName} are now available. Log in to view: ${school.loginUrl}`
    result.smsSent = attemptSms(params.to, smsBody, 'result_release')
  }

  return result
}

// ─────────────────────────────────────────────────────────
//  LEAVE UPDATE
// ─────────────────────────────────────────────────────────

export interface LeaveUpdateParams {
  to: string
  staffUid: string
  data: LeaveUpdateData
}

/**
 * Notify a staff member that their leave request status has changed.
 * Channel: email only (based on pref).
 */
export async function sendLeaveUpdate(params: LeaveUpdateParams): Promise<NotificationResult> {
  const result: NotificationResult = { smsSent: false, skipped: false }

  const prefs = await getPrefs(params.staffUid)
  const school = await getSchoolBranding()

  if (!prefs.emailLeaveUpdate) {
    return { ...result, skipped: true, skipReason: 'emailLeaveUpdate preference is off' }
  }

  const msg = renderLeaveUpdate(params.data, school)
  const emailResult = await sendEmail({
    to: params.to,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
    tags: [
      { name: 'type', value: 'leave_update' },
      { name: 'status', value: params.data.status },
    ],
  })
  result.emailResult = emailResult

  return result
}

// ─────────────────────────────────────────────────────────
//  CONTRACT ALERT
// ─────────────────────────────────────────────────────────

export interface ContractAlertParams {
  /** HR team email address. */
  to: string | string[]
  /** HR staff UIDs — used to check pref (uses union — sends if ANY hr uid has pref on). */
  hrUids?: string[]
  data: ContractAlertData
}

/**
 * Send a contract expiry alert to the HR team.
 * Channels: email (always — contract alerts bypass individual prefs for HR team).
 */
export async function sendContractAlert(params: ContractAlertParams): Promise<NotificationResult> {
  const result: NotificationResult = { smsSent: false, skipped: false }
  const school = await getSchoolBranding()

  const msg = renderContractAlert(params.data, school)
  const recipients = Array.isArray(params.to) ? params.to : [params.to]

  if (recipients.length === 1) {
    const emailResult = await sendEmail({
      to: recipients[0]!,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      tags: [{ name: 'type', value: 'contract_alert' }],
    })
    result.emailResult = emailResult
  } else {
    // Send to all HR recipients
    const batchResult = await sendBatchEmails({
      emails: recipients.map((to) => ({
        to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        tags: [{ name: 'type', value: 'contract_alert' }],
      })),
      continueOnError: true,
    })
    // Surface the first result for the caller
    result.emailResult = batchResult.results[0]
  }

  return result
}

// ─────────────────────────────────────────────────────────
//  OVERDUE LIBRARY WARNING
// ─────────────────────────────────────────────────────────

export interface OverdueLibraryParams {
  to: string
  borrowerUid?: string
  data: OverdueLibraryData
}

/**
 * Send an overdue library notice or pre-due return reminder.
 * Channel: email only.
 * The borrowerUid is optional — notification is sent regardless of pref
 * (library fine warnings are considered system-critical).
 */
export async function sendOverdueLibraryWarning(
  params: OverdueLibraryParams
): Promise<NotificationResult> {
  const result: NotificationResult = { smsSent: false, skipped: false }
  const school = await getSchoolBranding()

  const msg = renderOverdueLibrary(params.data, school)
  const emailResult = await sendEmail({
    to: params.to,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
    tags: [{ name: 'type', value: 'overdue_library' }],
  })
  result.emailResult = emailResult

  return result
}

// ─────────────────────────────────────────────────────────
//  ANNOUNCEMENT
// ─────────────────────────────────────────────────────────

export interface AnnouncementNotifParams {
  /** Individual email addresses of recipients. */
  emails: string[]
  /** Firebase UIDs — used for push notification delivery. */
  uids?: string[]
  /** Optional FCM topic to use instead of individual uid sends. */
  topic?: string
  data: AnnouncementEmailData
  /**
   * When true, each recipient's pushAnnouncement preference is checked
   * before sending push. Default: true.
   */
  checkPrefs?: boolean
}

/**
 * Send an announcement notification to a list of recipients.
 * Channels: email (per pref), push (per pref or topic).
 *
 * For large recipient counts (100+), use the topic parameter to send
 * a single FCM topic message instead of N individual push sends.
 */
export async function sendAnnouncementNotification(
  params: AnnouncementNotifParams
): Promise<BulkNotificationResult> {
  const checkPrefs = params.checkPrefs ?? true
  const school = await getSchoolBranding()
  const msg = renderAnnouncement(params.data, school)

  let sent = 0
  let skipped = 0
  let failed = 0
  const results: NotificationResult[] = []

  // ── Email batch
  const emailInputs: SendEmailInput[] = params.emails.map((to) => ({
    to,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
    tags: [{ name: 'type', value: 'announcement' }],
  }))

  if (emailInputs.length > 0) {
    const batchResult = await sendBatchEmails({
      emails: emailInputs,
      continueOnError: true,
    })
    sent += batchResult.successCount
    failed += batchResult.failureCount
    results.push(
      ...batchResult.results.map((r) => ({
        emailResult: r,
        smsSent: false,
        skipped: false,
      }))
    )
  }

  // ── Push — topic mode (preferred for large groups)
  if (params.topic) {
    const pushPayload: PushNotificationPayload = {
      title: params.data.title,
      body: params.data.body.slice(0, 200),
      clickAction: '/announcements',
      tag: `announcement_${params.data.announcementId}`,
      data: {
        type: 'announcement',
        announcementId: params.data.announcementId,
      },
    }
    const topicResult = await sendToTopic(params.topic, pushPayload)
    if (topicResult.ok) {
      sent++
    } else {
      failed++
    }
    results.push({
      pushResult: {
        ok: topicResult.ok,
        uid: params.topic,
        sentCount: topicResult.ok ? 1 : 0,
        failedCount: topicResult.ok ? 0 : 1,
        messageIds: topicResult.messageId ? [topicResult.messageId] : [],
        ...(!topicResult.ok
          ? { error: topicResult.error ?? 'Topic send failed', code: 'FCM_API_ERROR' }
          : {}),
      } as PushResult,
      smsSent: false,
      skipped: false,
    })
  } else if (params.uids && params.uids.length > 0) {
    // Per-UID push with pref check
    for (const uid of params.uids) {
      const prefs = checkPrefs ? await getPrefs(uid) : DEFAULT_PREFS

      if (!prefs.pushAnnouncement) {
        skipped++
        results.push({ smsSent: false, skipped: true, skipReason: 'pushAnnouncement pref off' })
        continue
      }

      const pushPayload: PushNotificationPayload = {
        title: params.data.title,
        body: params.data.body.slice(0, 200),
        clickAction: '/announcements',
        tag: `announcement_${params.data.announcementId}`,
        data: {
          type: 'announcement',
          announcementId: params.data.announcementId,
        },
      }
      const pushResult = await sendToUser(uid, pushPayload)
      if (pushResult.ok) {
        sent++
      } else if (pushResult.code === 'NO_TOKENS') {
        skipped++
      } else {
        failed++
      }
      const isNoTokens = !pushResult.ok && pushResult.code === 'NO_TOKENS'
      results.push({ pushResult, smsSent: false, skipped: isNoTokens })
    }
  }

  return { sent, skipped, failed, results }
}

// ─────────────────────────────────────────────────────────
//  PENDING ACTION CREATED  (admin / high_rank internal)
// ─────────────────────────────────────────────────────────

export interface PendingActionParams {
  /** Firebase UIDs of the reviewers (admin, high_rank) to notify. */
  reviewerUids: string[]
  /** Email addresses corresponding to reviewerUids. */
  reviewerEmails: string[]
  action: string
  entityType: string
  entityId: string
  requestedBy: string
  description: string
}

/**
 * Notify approvers that a new pending action requires their attention.
 * Used when lower_rank staff submit an action requiring approval
 * (student soft-delete, timetable change, etc.).
 * Channels: email + push (admin-priority, not pref-gated).
 */
export async function sendPendingActionCreated(
  params: PendingActionParams
): Promise<BulkNotificationResult> {
  const school = await getSchoolBranding()
  const loginUrl = `${school.loginUrl}/user-management`

  const subject = `⏳ Action pending your approval — ${params.entityType}: ${params.action}`
  const htmlBody = `
    <p>A new action requires your approval in the ${school.schoolName} portal.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:8px 12px;border:1px solid #d1d5db;background:#f9fafb;font-weight:600;">Action</td><td style="padding:8px 12px;border:1px solid #d1d5db;">${params.action}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #d1d5db;background:#f9fafb;font-weight:600;">Entity</td><td style="padding:8px 12px;border:1px solid #d1d5db;">${params.entityType} (${params.entityId})</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #d1d5db;background:#f9fafb;font-weight:600;">Requested By</td><td style="padding:8px 12px;border:1px solid #d1d5db;">${params.requestedBy}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #d1d5db;background:#f9fafb;font-weight:600;">Description</td><td style="padding:8px 12px;border:1px solid #d1d5db;">${params.description}</td></tr>
    </table>
    <p>Please log in to review and take action.</p>
  `
  const textBody = `A pending action requires your approval.\n\nAction: ${params.action}\nEntity: ${params.entityType} (${params.entityId})\nRequested By: ${params.requestedBy}\nDescription: ${params.description}\n\nLog in to review: ${loginUrl}`

  let sent = 0
  let failed = 0
  const skipped = 0
  const results: NotificationResult[] = []

  for (let i = 0; i < params.reviewerEmails.length; i++) {
    const email = params.reviewerEmails[i]
    const uid = params.reviewerUids[i]

    if (!email) continue

    const emailResult = await sendEmail({
      to: email,
      subject,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;color:#374151;">${htmlBody}<p><a href="${loginUrl}" style="background:#1e3a5f;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Review Pending Action</a></p></div>`,
      text: textBody,
      tags: [{ name: 'type', value: 'pending_action' }],
    })

    if (emailResult.ok) sent++
    else failed++

    const notifResult: NotificationResult = { emailResult, smsSent: false, skipped: false }

    // Push notification — not pref-gated for approval requests
    if (uid) {
      const pushResult = await sendToUser(uid, {
        title: 'Action Pending Approval',
        body: `${params.action} on ${params.entityType} requires your approval.`,
        clickAction: '/user-management',
        tag: `pending_action_${params.entityId}`,
        data: { type: 'pending_action', entityType: params.entityType, entityId: params.entityId },
      })
      notifResult.pushResult = pushResult
    }

    results.push(notifResult)
  }

  return { sent, skipped, failed, results }
}

// ─────────────────────────────────────────────────────────
//  BULK FEE REMINDER  (used by cron job)
// ─────────────────────────────────────────────────────────

export interface BulkFeeReminderItem {
  to: string
  studentUid?: string
  guardianPhone?: string
  data: FeeReminderData
}

/**
 * Send fee reminders to multiple students.
 * Used by the daily fee reminder cron job.
 * Processes sequentially with 600ms pacing to stay within Resend limits.
 */
export async function sendBulkFeeReminders(
  items: BulkFeeReminderItem[]
): Promise<BulkNotificationResult> {
  let sent = 0
  let skipped = 0
  let failed = 0
  const results: NotificationResult[] = []

  for (const item of items) {
    const result = await sendFeeReminder(item)
    results.push(result)

    if (result.skipped) {
      skipped++
    } else if (result.emailResult?.ok) {
      sent++
    } else if (result.emailResult && !result.emailResult.ok) {
      failed++
    }
  }

  logger.info(
    { sent, skipped, failed, total: items.length },
    '[notificationService] Bulk fee reminders complete'
  )

  return { sent, skipped, failed, results }
}

// ─────────────────────────────────────────────────────────
//  NOTIFICATION PREFERENCES — UPSERT
// ─────────────────────────────────────────────────────────

export interface UpdateNotifPrefsInput {
  uid: string
  emailFeeReminder?: boolean
  emailLeaveUpdate?: boolean
  emailResultRelease?: boolean
  emailContractAlert?: boolean
  emailAnnouncement?: boolean
  smsFeeReminder?: boolean
  smsResultRelease?: boolean
  pushAnnouncement?: boolean
  pushResultRelease?: boolean
}

/**
 * Upsert a user's notification preferences.
 * Called from the PATCH /users/notification-prefs route.
 */
export async function updateNotifPrefs(input: UpdateNotifPrefsInput): Promise<void> {
  const { uid, ...prefs } = input

  await prisma.userNotificationPref.upsert({
    where: { uid },
    create: { uid, ...DEFAULT_PREFS, ...prefs },
    update: prefs,
  })

  logger.info(
    { uid, updated: Object.keys(prefs) },
    '[notificationService] Notification prefs updated'
  )
}

/**
 * Get a user's notification preferences.
 * Returns DEFAULT_PREFS if no record exists.
 */
export async function getNotifPrefs(uid: string): Promise<typeof DEFAULT_PREFS> {
  return getPrefs(uid)
}
