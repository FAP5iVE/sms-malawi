'use server'

/**
 * [CHANGE TYPE]: SECURITY FIX (P0)
 * [PURPOSE]: Every action here is a public HTTP endpoint (Next.js Server
 *   Actions can be invoked directly, without our UI). The previous
 *   getCallerFromCookie() trusted the client-written `sms_session` (a bare
 *   UID) and `sms_role` cookies; admin.auth().getUser(uid) only proves the
 *   account exists, not that the caller owns it, so anyone who knew an
 *   admin's UID could forge both cookies and change school-wide settings.
 *
 *   Now each action takes the caller's Firebase ID token as its FIRST
 *   argument and resolves identity through requireCurrentUser()
 *   (lib/serverAuth.ts), which verifies it with verifyIdToken(token, true).
 *   Cookies are never read here.
 *
 *   Order in every action: authenticate → authorise → validate → mutate.
 *   Unauthenticated callers get a 401-style result (code UNAUTHENTICATED),
 *   authenticated callers lacking permission a 403-style result (FORBIDDEN),
 *   and neither learns anything about the form schema.
 *
 *   Client usage:
 *     const token = await getAuth().currentUser?.getIdToken()
 *     const res = await updateExamSettings(token ?? '', values)
 *
 *   NOTE: a 'use server' file may only export async functions, and each one
 *   is a public endpoint. Keep helpers non-exported, and add a case to
 *   __tests__/settings.actions.test.ts for every new export (that test fails
 *   if an exported action is not covered).
 */

import * as settingsService from '@/server/services/settingsService'
import { requireCurrentUser, AuthError, type CurrentUser } from '@/lib/serverAuth'
import { hasPermission } from '@shared/types/permissions'
import { SETTING_KEYS } from '@shared/types/settings'
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
  /**
   * Machine-readable failure class (HTTP-status analogue):
   *   UNAUTHENTICATED ≈ 401, FORBIDDEN ≈ 403, VALIDATION ≈ 422.
   */
  code?: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'VALIDATION'
}

type Gate =
  | { ok: true; caller: CurrentUser }
  | { ok: false; result: ActionResult }

/**
 * Authenticate the caller from their ID token, then check the exact
 * permission for this operation. Never throws; a failed gate carries the
 * ActionResult to return unchanged. Fails closed on anything unexpected.
 */
async function authorize(
  idToken: unknown,
  isAllowed: (caller: CurrentUser) => boolean,
  deniedMessage: string
): Promise<Gate> {
  let caller: CurrentUser
  try {
    caller = await requireCurrentUser(idToken)
  } catch (err) {
    const error =
      err instanceof AuthError
        ? err.message
        : 'Could not verify your session. Please sign in again.'
    return { ok: false, result: { success: false, code: 'UNAUTHENTICATED', error } }
  }

  if (!isAllowed(caller)) {
    return { ok: false, result: { success: false, code: 'FORBIDDEN', error: deniedMessage } }
  }
  return { ok: true, caller }
}

function invalid(message: string | undefined): ActionResult {
  return { success: false, code: 'VALIDATION', error: message ?? 'Validation failed.' }
}

// ─────────────────────────────────────────────────────────
//  ACADEMIC SETTINGS
// ─────────────────────────────────────────────────────────

export async function updateAcademicSettings(
  idToken: string,
  input: AcademicSettingsFormInput
): Promise<ActionResult> {
  const gate = await authorize(
    idToken,
    (c) => hasPermission(c.role, 'settings.manageAcademicPolicy', c.superUser),
    'You do not have permission to update academic settings.'
  )
  if (!gate.ok) return gate.result

  const parsed = AcademicSettingsFormSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message)

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
    gate.caller.uid
  )

  return { success: true }
}

// ─────────────────────────────────────────────────────────
//  SCHOOL IDENTITY SETTINGS
// ─────────────────────────────────────────────────────────

export async function updateSchoolIdentity(
  idToken: string,
  input: SchoolIdentityFormInput
): Promise<ActionResult> {
  const gate = await authorize(
    idToken,
    (c) => hasPermission(c.role, 'settings.manageAcademicPolicy', c.superUser),
    'You do not have permission to update school identity settings.'
  )
  if (!gate.ok) return gate.result

  const parsed = SchoolIdentityFormSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message)

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
    gate.caller.uid
  )

  return { success: true }
}

// ─────────────────────────────────────────────────────────
//  EXAM / GRADING SETTINGS
// ─────────────────────────────────────────────────────────

export async function updateExamSettings(
  idToken: string,
  input: ExamSettingsFormInput
): Promise<ActionResult> {
  const gate = await authorize(
    idToken,
    (c) => hasPermission(c.role, 'settings.manageExamConfig', c.superUser),
    'You do not have permission to update exam settings.'
  )
  if (!gate.ok) return gate.result

  const parsed = ExamSettingsFormSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message)

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
    gate.caller.uid
  )

  return { success: true }
}

// ─────────────────────────────────────────────────────────
//  FINANCE SETTINGS
// ─────────────────────────────────────────────────────────

export async function updateFinanceSettings(
  idToken: string,
  input: FinanceSettingsFormInput
): Promise<ActionResult> {
  const gate = await authorize(
    idToken,
    (c) => hasPermission(c.role, 'settings.manageFinanceConfig', c.superUser),
    'You do not have permission to update finance settings.'
  )
  if (!gate.ok) return gate.result

  const parsed = FinanceSettingsFormSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message)

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
    gate.caller.uid
  )

  return { success: true }
}

// ─────────────────────────────────────────────────────────
//  LIBRARY SETTINGS
// ─────────────────────────────────────────────────────────

export async function updateLibrarySettings(
  idToken: string,
  input: LibrarySettingsFormInput
): Promise<ActionResult> {
  const gate = await authorize(
    idToken,
    (c) => hasPermission(c.role, 'settings.manageLibraryConfig', c.superUser),
    'You do not have permission to update library settings.'
  )
  if (!gate.ok) return gate.result

  const parsed = LibrarySettingsFormSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message)

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
    gate.caller.uid
  )

  return { success: true }
}

// ─────────────────────────────────────────────────────────
//  HR SETTINGS
// ─────────────────────────────────────────────────────────

export async function updateHRSettings(
  idToken: string,
  input: HRSettingsFormInput
): Promise<ActionResult> {
  const gate = await authorize(
    idToken,
    (c) => hasPermission(c.role, 'settings.manageHRConfig', c.superUser),
    'You do not have permission to update HR settings.'
  )
  if (!gate.ok) return gate.result

  const parsed = HRSettingsFormSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message)

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
    gate.caller.uid
  )

  return { success: true }
}

// ─────────────────────────────────────────────────────────
//  MAINTENANCE MODE TOGGLE
// ─────────────────────────────────────────────────────────

/**
 * Toggle app maintenance mode on or off.
 * Admin only. No form schema (single boolean), but the argument still crosses
 * the network, so it is type-checked at runtime before anything is written.
 */
export async function setMaintenanceMode(
  idToken: string,
  enabled: boolean
): Promise<ActionResult> {
  const gate = await authorize(
    idToken,
    (c) => c.role === 'admin' || c.superUser,
    'Only administrators may toggle maintenance mode.'
  )
  if (!gate.ok) return gate.result

  if (typeof enabled !== 'boolean') return invalid('Invalid maintenance mode value.')

  await settingsService.set(SETTING_KEYS.APP_MAINTENANCE_MODE, enabled, gate.caller.uid)

  return { success: true, data: undefined }
}
