'use server'

import { cookies } from 'next/headers'
import * as admin from 'firebase-admin'
import * as settingsService from '@/server/services/settingsService'
import { hasPermission } from '@shared/types/permissions'
import { SETTING_KEYS } from '@shared/types/settings'
import type { UserRole } from '@shared/types/roles'
import {
  AcademicSettingsFormSchema,
  SchoolIdentityFormSchema,
  ExamSettingsFormSchema,
  FinanceSettingsFormSchema,
  LibrarySettingsFormSchema,
  HRSettingsFormSchema,
  type AcademicSettingsFormInput,
  type SchoolIdentityFormInput,
  type ExamSettingsFormInput,
  type FinanceSettingsFormInput,
  type LibrarySettingsFormInput,
  type HRSettingsFormInput,
} from '@shared/schemas/settings'

// ─── SHARED HELPERS ───────────────────────────────────────

interface ActionResult<T = undefined> {
  success: boolean
  error?: string
  data?: T
}

/**
 * Verify the caller from the session cookie.
 * Returns the uid and role, or throws with an error ActionResult.
 */
async function getCallerFromCookie(): Promise<{ uid: string; role: UserRole }> {
  const cookieStore = await cookies()
  const uid = cookieStore.get('sms_session')?.value
  const role = cookieStore.get('sms_role')?.value as UserRole | undefined

  if (!uid || !role) {
    throw new Error('You must be signed in to perform this action.')
  }

  // Double-verify the UID against Firebase Admin to prevent
  // cookie forgery — Server Actions can be called directly.
  try {
    const user = await admin.auth().getUser(uid)
    const claims = user.customClaims
    const verifiedRole = claims?.['role'] as UserRole | undefined
    if (!verifiedRole || verifiedRole !== role) {
      throw new Error('Session is invalid or role has changed. Please sign in again.')
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('Session is invalid')) throw err
    throw new Error('Could not verify your session. Please sign in again.')
  }

  return { uid, role }
}

// ─────────────────────────────────────────────────────────
//  ACADEMIC SETTINGS
// ─────────────────────────────────────────────────────────

export async function updateAcademicSettings(
  input: AcademicSettingsFormInput
): Promise<ActionResult> {
  const parsed = AcademicSettingsFormSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Validation failed.' }
  }

  let caller: { uid: string; role: UserRole }
  try {
    caller = await getCallerFromCookie()
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }

  if (!hasPermission(caller.role, 'settings.manageAcademicPolicy')) {
    return { success: false, error: 'You do not have permission to update academic settings.' }
  }

  const { currentAcademicYear, currentTerm, term1Start, term1End,
          term2Start, term2End, term3Start, term3End } = parsed.data

  await settingsService.setMany(
    [
      { key: SETTING_KEYS.CURRENT_ACADEMIC_YEAR, value: currentAcademicYear },
      { key: SETTING_KEYS.CURRENT_TERM,           value: currentTerm },
      { key: SETTING_KEYS.TERM1_START,            value: term1Start },
      { key: SETTING_KEYS.TERM1_END,              value: term1End },
      { key: SETTING_KEYS.TERM2_START,            value: term2Start },
      { key: SETTING_KEYS.TERM2_END,              value: term2End },
      { key: SETTING_KEYS.TERM3_START,            value: term3Start },
      { key: SETTING_KEYS.TERM3_END,              value: term3End },
    ],
    caller.uid
  )

  return { success: true }
}

// ─────────────────────────────────────────────────────────
//  SCHOOL IDENTITY SETTINGS
// ─────────────────────────────────────────────────────────

export async function updateSchoolIdentity(
  input: SchoolIdentityFormInput
): Promise<ActionResult> {
  const parsed = SchoolIdentityFormSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Validation failed.' }
  }

  let caller: { uid: string; role: UserRole }
  try {
    caller = await getCallerFromCookie()
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }

  if (!hasPermission(caller.role, 'settings.manageAcademicPolicy')) {
    return { success: false, error: 'You do not have permission to update school identity settings.' }
  }

  const d = parsed.data

  await settingsService.setMany(
    [
      { key: SETTING_KEYS.SCHOOL_NAME,         value: d.schoolName },
      { key: SETTING_KEYS.SCHOOL_SLOGAN,       value: d.schoolSlogan },
      { key: SETTING_KEYS.SCHOOL_VISION,       value: d.schoolVision },
      { key: SETTING_KEYS.SCHOOL_MISSION,      value: d.schoolMission },
      { key: SETTING_KEYS.SCHOOL_CORE_VALUES,  value: d.schoolCoreValues },
      { key: SETTING_KEYS.SCHOOL_ADDRESS,      value: d.schoolAddress },
      { key: SETTING_KEYS.SCHOOL_PHONE,        value: d.schoolPhone },
      { key: SETTING_KEYS.SCHOOL_EMAIL,        value: d.schoolEmail },
      { key: SETTING_KEYS.SCHOOL_WEBSITE,      value: d.schoolWebsite },
      { key: SETTING_KEYS.SCHOOL_FOUNDED_YEAR, value: d.schoolFoundedYear },
    ],
    caller.uid
  )

  return { success: true }
}

// ─────────────────────────────────────────────────────────
//  EXAM / GRADING SETTINGS
// ─────────────────────────────────────────────────────────

export async function updateExamSettings(
  input: ExamSettingsFormInput
): Promise<ActionResult> {
  const parsed = ExamSettingsFormSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Validation failed.' }
  }

  let caller: { uid: string; role: UserRole }
  try {
    caller = await getCallerFromCookie()
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }

  if (!hasPermission(caller.role, 'settings.manageExamConfig')) {
    return { success: false, error: 'You do not have permission to update exam settings.' }
  }

  const d = parsed.data

  await settingsService.setMany(
    [
      { key: SETTING_KEYS.EXAM_PASS_MARK_THRESHOLD, value: d.passMarkThreshold },
      { key: SETTING_KEYS.EXAM_MANEB_CENTRE_NUMBER, value: d.manebCentreNumber },
      { key: SETTING_KEYS.EXAM_MANEB_CENTRE_NAME,   value: d.manebCentreName },
      { key: SETTING_KEYS.EXAM_MANEB_REG_DEADLINE,  value: d.manebRegDeadline },
      { key: SETTING_KEYS.PROMOTION_MIN_AVERAGE,     value: d.promotionMinAverage },
      { key: SETTING_KEYS.PROMOTION_REQUIRED_PASSES, value: d.promotionRequiredPasses },
    ],
    caller.uid
  )

  return { success: true }
}

// ─────────────────────────────────────────────────────────
//  FINANCE SETTINGS
// ─────────────────────────────────────────────────────────

export async function updateFinanceSettings(
  input: FinanceSettingsFormInput
): Promise<ActionResult> {
  const parsed = FinanceSettingsFormSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Validation failed.' }
  }

  let caller: { uid: string; role: UserRole }
  try {
    caller = await getCallerFromCookie()
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }

  if (!hasPermission(caller.role, 'settings.manageFinanceConfig')) {
    return { success: false, error: 'You do not have permission to update finance settings.' }
  }

  const d = parsed.data

  await settingsService.setMany(
    [
      { key: SETTING_KEYS.FINANCE_LATE_PENALTY_PER_DAY,    value: d.latePenaltyPerDay },
      { key: SETTING_KEYS.FINANCE_LATE_PENALTY_GRACE_DAYS, value: d.latePenaltyGraceDays },
      { key: SETTING_KEYS.FINANCE_INSTALLMENT_OPTIONS,     value: d.installmentOptions },
      { key: SETTING_KEYS.FINANCE_PAYROLL_RUN_DAY,         value: d.payrollRunDay },
      { key: SETTING_KEYS.FINANCE_PENSION_PERCENT,         value: d.pensionPercent },
      { key: SETTING_KEYS.FINANCE_PAYE_BRACKETS,           value: d.payeBrackets },
    ],
    caller.uid
  )

  return { success: true }
}

// ─────────────────────────────────────────────────────────
//  LIBRARY SETTINGS
// ─────────────────────────────────────────────────────────

export async function updateLibrarySettings(
  input: LibrarySettingsFormInput
): Promise<ActionResult> {
  const parsed = LibrarySettingsFormSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Validation failed.' }
  }

  let caller: { uid: string; role: UserRole }
  try {
    caller = await getCallerFromCookie()
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }

  if (!hasPermission(caller.role, 'settings.manageLibraryConfig')) {
    return { success: false, error: 'You do not have permission to update library settings.' }
  }

  const d = parsed.data

  await settingsService.setMany(
    [
      { key: SETTING_KEYS.LIBRARY_LOAN_PERIOD_STUDENT,  value: d.loanPeriodStudent },
      { key: SETTING_KEYS.LIBRARY_LOAN_PERIOD_STAFF,    value: d.loanPeriodStaff },
      { key: SETTING_KEYS.LIBRARY_MAX_BOOKS_STUDENT,    value: d.maxBooksStudent },
      { key: SETTING_KEYS.LIBRARY_MAX_BOOKS_STAFF,      value: d.maxBooksStaff },
      { key: SETTING_KEYS.LIBRARY_FINE_PER_DAY,         value: d.finePerDay },
      { key: SETTING_KEYS.LIBRARY_FINE_GRACE_DAYS,      value: d.fineGraceDays },
      { key: SETTING_KEYS.LIBRARY_REMINDER_DAYS_BEFORE, value: d.reminderDaysBefore },
    ],
    caller.uid
  )

  return { success: true }
}

// ─────────────────────────────────────────────────────────
//  HR SETTINGS
// ─────────────────────────────────────────────────────────

export async function updateHRSettings(
  input: HRSettingsFormInput
): Promise<ActionResult> {
  const parsed = HRSettingsFormSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Validation failed.' }
  }

  let caller: { uid: string; role: UserRole }
  try {
    caller = await getCallerFromCookie()
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }

  if (!hasPermission(caller.role, 'settings.manageHRConfig')) {
    return { success: false, error: 'You do not have permission to update HR settings.' }
  }

  const d = parsed.data

  await settingsService.setMany(
    [
      { key: SETTING_KEYS.HR_MAX_CONCURRENT_LEAVE_PCT, value: d.maxConcurrentLeavePct },
      { key: SETTING_KEYS.HR_ANNUAL_LEAVE_DAYS,        value: d.annualLeaveDays },
      { key: SETTING_KEYS.HR_SICK_LEAVE_DAYS,          value: d.sickLeaveDays },
      { key: SETTING_KEYS.HR_MATERNITY_LEAVE_DAYS,     value: d.maternityLeaveDays },
      { key: SETTING_KEYS.HR_PATERNITY_LEAVE_DAYS,     value: d.paternityLeaveDays },
      { key: SETTING_KEYS.HR_STUDY_LEAVE_DAYS,         value: d.studyLeaveDays },
      { key: SETTING_KEYS.HR_EMERGENCY_LEAVE_DAYS,     value: d.emergencyLeaveDays },
    ],
    caller.uid
  )

  return { success: true }
}

// ─────────────────────────────────────────────────────────
//  MAINTENANCE MODE TOGGLE
// ─────────────────────────────────────────────────────────

/**
 * Toggle app maintenance mode on or off.
 * Admin only — no form schema needed (single boolean).
 */
export async function setMaintenanceMode(
  enabled: boolean
): Promise<ActionResult> {
  let caller: { uid: string; role: UserRole }
  try {
    caller = await getCallerFromCookie()
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }

  if (caller.role !== 'admin') {
    return { success: false, error: 'Only administrators may toggle maintenance mode.' }
  }

  await settingsService.set(SETTING_KEYS.APP_MAINTENANCE_MODE, enabled, caller.uid)

  return { success: true, data: undefined }
}