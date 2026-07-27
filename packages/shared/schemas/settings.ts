/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: packages/shared/schemas/settings.ts
 * [R-PHASE]: R8 — Academics IV: Report Cards, Transcripts, Promotion & Risk
 *   Assessment
 * [PURPOSE]: Adds validation schemas for SCHOOL_LOGO_URL and the six new
 *   risk threshold settings keys, matching this same phase's additions to
 *   types/settings.ts.
 * [DEPENDS ON]: none
 */
import { z } from 'zod'
import { SETTING_KEYS, type SettingKey } from '../types/settings'

// ─────────────────────────────────────────────────────────
//  INDIVIDUAL VALUE SCHEMAS
// ─────────────────────────────────────────────────────────

const academicYearSchema = z
  .string()
  .regex(/^\d{4}\/\d{4}$/, 'Must be in "YYYY/YYYY" format, e.g. "2025/2026"')
  .refine((v) => {
  const parts = v.split('/').map(Number)
  const start = parts[0]
  const end   = parts[1]
  if (start === undefined || end === undefined) return false
  return end === start + 1
}, 'End year must be exactly one year after start year')

const termSchema = z.union([z.literal(1), z.literal(2), z.literal(3)])

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be an ISO date in "YYYY-MM-DD" format')
  .refine((v) => !isNaN(Date.parse(v)), 'Must be a valid calendar date')

const percentSchema = (label: string) =>
  z
    .number()
    .int(`${label} must be a whole number`)
    .min(0, `${label} cannot be negative`)
    .max(100, `${label} cannot exceed 100`)

const positiveIntSchema = (label: string) =>
  z
    .number()
    .int(`${label} must be a whole number`)
    .positive(`${label} must be a positive number`)

const nonNegativeIntSchema = (label: string) =>
  z
    .number()
    .int(`${label} must be a whole number`)
    .min(0, `${label} cannot be negative`)

const mwkAmountSchema = (label: string) =>
  z
    .number()
    .min(0, `${label} cannot be negative`)

const payeBracketSchema = z.object({
  minAnnualMwk: nonNegativeIntSchema('Min annual MWK'),
  maxAnnualMwk: z.number().int().positive().nullable(),
  ratePercent: percentSchema('Rate percent'),
  label: z.string().min(1, 'Label is required').max(120),
})

const payeBracketsSchema = z
  .array(payeBracketSchema)
  .min(1, 'At least one PAYE bracket is required')
  .refine((brackets) => {
  for (let i = 1; i < brackets.length; i++) {
    const current  = brackets[i]
    const previous = brackets[i - 1]
    if (!current || !previous) return false
    if (current.minAnnualMwk <= previous.minAnnualMwk) return false
  }
  return true
}, 'PAYE brackets must be in ascending order of minAnnualMwk')
  .refine((brackets) => {
    // Exactly one bracket should have maxAnnualMwk = null (the top bracket)
    const topBrackets = brackets.filter((b) => b.maxAnnualMwk === null)
    return topBrackets.length === 1
  }, 'Exactly one bracket must have no upper limit (maxAnnualMwk: null)')

const installmentOptionSchema = z.union([z.literal(2), z.literal(3), z.literal(4)])
const installmentOptionsSchema = z
  .array(installmentOptionSchema)
  .min(1, 'At least one installment option must be configured')

const dayOfMonthSchema = z
  .number()
  .int()
  .min(1, 'Day must be at least 1')
  .max(28, 'Day cannot exceed 28 (safe for all months)')

// ─────────────────────────────────────────────────────────
//  FULL SETTING VALUE SCHEMA MAP
//  Maps each SettingKey to the Zod schema for its value.
//  Use SETTING_VALUE_SCHEMAS[key].parse(rawValue) to validate.
// ─────────────────────────────────────────────────────────

export const SETTING_VALUE_SCHEMAS: { readonly [K in SettingKey]: z.ZodType } = {
  // ── Academic
  [SETTING_KEYS.CURRENT_ACADEMIC_YEAR]: academicYearSchema,
  [SETTING_KEYS.CURRENT_TERM]:          termSchema,
  [SETTING_KEYS.TERM1_START]:           isoDateSchema,
  [SETTING_KEYS.TERM1_END]:             isoDateSchema,
  [SETTING_KEYS.TERM2_START]:           isoDateSchema,
  [SETTING_KEYS.TERM2_END]:             isoDateSchema,
  [SETTING_KEYS.TERM3_START]:           isoDateSchema,
  [SETTING_KEYS.TERM3_END]:             isoDateSchema,

  // ── School identity
  [SETTING_KEYS.SCHOOL_NAME]:
    z.string().min(2, 'School name must be at least 2 characters').max(200),
  [SETTING_KEYS.SCHOOL_SLOGAN]:
    z.string().max(300),
  [SETTING_KEYS.SCHOOL_VISION]:
    z.string().max(1000),
  [SETTING_KEYS.SCHOOL_MISSION]:
    z.string().max(1000),
  [SETTING_KEYS.SCHOOL_CORE_VALUES]:
    z.array(z.string().min(1).max(80)).min(1).max(10),
  [SETTING_KEYS.SCHOOL_ADDRESS]:
    z.string().max(500),
  [SETTING_KEYS.SCHOOL_PHONE]:
    z.string().max(30),
  [SETTING_KEYS.SCHOOL_EMAIL]:
    z.string().email('Must be a valid email address').max(200),
  [SETTING_KEYS.SCHOOL_WEBSITE]:
    z.string().url('Must be a valid URL').max(300).or(z.literal('')),
  [SETTING_KEYS.SCHOOL_FOUNDED_YEAR]:
    z.number().int().min(1800).max(new Date().getFullYear()),
  [SETTING_KEYS.SCHOOL_LOGO_URL]:
    z.string().url('Must be a valid URL').max(1000).or(z.literal('')),

  // ── Exam and grading
  [SETTING_KEYS.EXAM_PASS_MARK_THRESHOLD]:
    percentSchema('Pass mark threshold'),
  [SETTING_KEYS.EXAM_MANEB_CENTRE_NUMBER]:
    z.string().max(20),
  [SETTING_KEYS.EXAM_MANEB_CENTRE_NAME]:
    z.string().max(200),
  [SETTING_KEYS.EXAM_MANEB_REG_DEADLINE]:
    isoDateSchema,

  // ── Promotion
  [SETTING_KEYS.PROMOTION_MIN_AVERAGE]:
    percentSchema('Minimum average'),
  [SETTING_KEYS.PROMOTION_REQUIRED_PASSES]:
    positiveIntSchema('Required passes').max(20),

  // ── Student risk thresholds
  [SETTING_KEYS.RISK_FEE_DEBT_HIGH]:
    percentSchema('High fee-debt threshold'),
  [SETTING_KEYS.RISK_FEE_DEBT_MEDIUM]:
    percentSchema('Medium fee-debt threshold'),
  [SETTING_KEYS.RISK_ABSENCE_HIGH]:
    percentSchema('High absence threshold'),
  [SETTING_KEYS.RISK_ABSENCE_MEDIUM]:
    percentSchema('Medium absence threshold'),
  [SETTING_KEYS.RISK_SUBJECT_FAILS_HIGH]:
    nonNegativeIntSchema('High subject-fails threshold').max(20),
  [SETTING_KEYS.RISK_SUBJECT_FAILS_MEDIUM]:
    nonNegativeIntSchema('Medium subject-fails threshold').max(20),

  // ── Finance — fees
  [SETTING_KEYS.FINANCE_LATE_PENALTY_PER_DAY]:
    mwkAmountSchema('Late penalty per day'),
  [SETTING_KEYS.FINANCE_LATE_PENALTY_GRACE_DAYS]:
    nonNegativeIntSchema('Grace period days').max(90),
  [SETTING_KEYS.FINANCE_INSTALLMENT_OPTIONS]:
    installmentOptionsSchema,

  // ── Finance — payroll
  [SETTING_KEYS.FINANCE_PAYROLL_RUN_DAY]:
    dayOfMonthSchema,
  [SETTING_KEYS.FINANCE_PENSION_PERCENT]:
    percentSchema('Pension percent'),
  [SETTING_KEYS.FINANCE_PAYE_BRACKETS]:
    payeBracketsSchema,

  // ── Library
  [SETTING_KEYS.LIBRARY_LOAN_PERIOD_STUDENT]:
    positiveIntSchema('Loan period (student)').max(365),
  [SETTING_KEYS.LIBRARY_LOAN_PERIOD_STAFF]:
    positiveIntSchema('Loan period (staff)').max(365),
  [SETTING_KEYS.LIBRARY_MAX_BOOKS_STUDENT]:
    positiveIntSchema('Max books (student)').max(50),
  [SETTING_KEYS.LIBRARY_MAX_BOOKS_STAFF]:
    positiveIntSchema('Max books (staff)').max(50),
  [SETTING_KEYS.LIBRARY_FINE_PER_DAY]:
    mwkAmountSchema('Fine per day'),
  [SETTING_KEYS.LIBRARY_FINE_GRACE_DAYS]:
    nonNegativeIntSchema('Fine grace days').max(30),
  [SETTING_KEYS.LIBRARY_REMINDER_DAYS_BEFORE]:
    positiveIntSchema('Reminder days before due').max(30),

  // ── HR
  [SETTING_KEYS.HR_MAX_CONCURRENT_LEAVE_PCT]:
    percentSchema('Max concurrent leave percent'),
  [SETTING_KEYS.HR_ANNUAL_LEAVE_DAYS]:
    positiveIntSchema('Annual leave days').max(365),
  [SETTING_KEYS.HR_SICK_LEAVE_DAYS]:
    positiveIntSchema('Sick leave days').max(365),
  [SETTING_KEYS.HR_MATERNITY_LEAVE_DAYS]:
    positiveIntSchema('Maternity leave days').max(365),
  [SETTING_KEYS.HR_PATERNITY_LEAVE_DAYS]:
    positiveIntSchema('Paternity leave days').max(60),
  [SETTING_KEYS.HR_STUDY_LEAVE_DAYS]:
    positiveIntSchema('Study leave days').max(180),
  [SETTING_KEYS.HR_EMERGENCY_LEAVE_DAYS]:
    positiveIntSchema('Emergency leave days').max(30),
  // R15 (typecheck cleanup): SETTING_KEYS gained
  // HR_CONTRACT_EXPIRY_LOOKAHEAD_DAYS in R14 but this exhaustive
  // { [K in SettingKey] } map was never extended — a blocking type error
  // the baseline environment masked behind an unresolved-zod module error.
  // Bounds mirror the contract-alert pipeline's sensible range.
  [SETTING_KEYS.HR_CONTRACT_EXPIRY_LOOKAHEAD_DAYS]:
    positiveIntSchema('Contract expiry lookahead days').max(365),

  // [PRODUCTION FIX 2026-07-27] Department name -> non-empty list of job
  // titles. Both department names and title names must be non-blank after
  // trimming — this is the single source of truth for staff-creation
  // dropdowns, so a blank entry would silently become an unselectable or
  // confusing option there.
  [SETTING_KEYS.HR_DEPARTMENT_TITLES]:
    z.record(
      z.string().trim().min(1, 'Department name cannot be blank'),
      z.array(z.string().trim().min(1, 'Job title cannot be blank')),
    ),

  // ── Security
  [SETTING_KEYS.SESSION_TIMEOUT_STUDENT_MINS]:
    positiveIntSchema('Student session timeout').max(480),
  [SETTING_KEYS.SESSION_TIMEOUT_STAFF_MINS]:
    positiveIntSchema('Staff session timeout').max(480),
  [SETTING_KEYS.MAX_LOGIN_ATTEMPTS]:
    positiveIntSchema('Max login attempts').max(20),
  [SETTING_KEYS.LOCKOUT_DURATION_MINS]:
    positiveIntSchema('Lockout duration').max(1440),

  // ── System
  [SETTING_KEYS.APP_MAINTENANCE_MODE]:
    z.boolean(),
  [SETTING_KEYS.APP_TIMEZONE]:
    z.string().min(1).max(60),
  [SETTING_KEYS.APP_CURRENCY]:
    z.string().length(3, 'Must be a 3-letter ISO 4217 currency code').toUpperCase(),
  [SETTING_KEYS.APP_CURRENCY_LOCALE]:
    z.string().min(2).max(20),
} as const

// ─────────────────────────────────────────────────────────
//  BATCH UPDATE SCHEMA
//  Used when the admin settings page submits multiple changes at once.
// ─────────────────────────────────────────────────────────

export const BatchSettingsUpdateSchema = z.object({
  updates: z
    .array(
      z.object({
        key: z.string(),
        value: z.unknown(),
      })
    )
    .min(1, 'At least one update is required')
    .max(50, 'No more than 50 settings may be updated in a single batch'),
})

export type BatchSettingsUpdateInput = z.infer<typeof BatchSettingsUpdateSchema>

// ─────────────────────────────────────────────────────────
//  PER-CATEGORY FORM SCHEMAS
//  Used by settings.actions.ts to validate full category forms.
// ─────────────────────────────────────────────────────────

export const AcademicSettingsFormSchema = z
  .object({
    currentAcademicYear: academicYearSchema,
    currentTerm:         termSchema,
    term1Start:          isoDateSchema,
    term1End:            isoDateSchema,
    term2Start:          isoDateSchema,
    term2End:            isoDateSchema,
    term3Start:          isoDateSchema,
    term3End:            isoDateSchema,
  })
  .refine((d) => d.term1Start < d.term1End, {
    message: 'Term 1 end must be after Term 1 start',
    path: ['term1End'],
  })
  .refine((d) => d.term2Start < d.term2End, {
    message: 'Term 2 end must be after Term 2 start',
    path: ['term2End'],
  })
  .refine((d) => d.term3Start < d.term3End, {
    message: 'Term 3 end must be after Term 3 start',
    path: ['term3End'],
  })
  .refine((d) => d.term1End < d.term2Start, {
    message: 'Term 2 must start after Term 1 ends',
    path: ['term2Start'],
  })
  .refine((d) => d.term2End < d.term3Start, {
    message: 'Term 3 must start after Term 2 ends',
    path: ['term3Start'],
  })

export type AcademicSettingsFormInput = z.infer<typeof AcademicSettingsFormSchema>

export const SchoolIdentityFormSchema = z.object({
  schoolName:       z.string().min(2).max(200),
  schoolSlogan:     z.string().max(300),
  schoolVision:     z.string().max(1000),
  schoolMission:    z.string().max(1000),
  schoolCoreValues: z.array(z.string().min(1).max(80)).min(1).max(10),
  schoolAddress:    z.string().max(500),
  schoolPhone:      z.string().max(30),
  schoolEmail:      z.string().email().max(200),
  schoolWebsite:    z.string().url().max(300).or(z.literal('')),
  schoolFoundedYear:z.number().int().min(1800).max(new Date().getFullYear()),
})

export type SchoolIdentityFormInput = z.infer<typeof SchoolIdentityFormSchema>

export const ExamSettingsFormSchema = z.object({
  passMarkThreshold:     percentSchema('Pass mark'),
  manebCentreNumber:     z.string().max(20),
  manebCentreName:       z.string().max(200),
  manebRegDeadline:      isoDateSchema,
  promotionMinAverage:   percentSchema('Promotion min average'),
  promotionRequiredPasses: positiveIntSchema('Required passes').max(20),
})

export type ExamSettingsFormInput = z.infer<typeof ExamSettingsFormSchema>

export const FinanceSettingsFormSchema = z.object({
  latePenaltyPerDay:    mwkAmountSchema('Late penalty per day'),
  latePenaltyGraceDays: nonNegativeIntSchema('Grace days').max(90),
  installmentOptions:   installmentOptionsSchema,
  payrollRunDay:        dayOfMonthSchema,
  pensionPercent:       percentSchema('Pension percent'),
  payeBrackets:         payeBracketsSchema,
})

export type FinanceSettingsFormInput = z.infer<typeof FinanceSettingsFormSchema>

export const LibrarySettingsFormSchema = z.object({
  loanPeriodStudent:    positiveIntSchema('Student loan period').max(365),
  loanPeriodStaff:      positiveIntSchema('Staff loan period').max(365),
  maxBooksStudent:      positiveIntSchema('Max books student').max(50),
  maxBooksStaff:        positiveIntSchema('Max books staff').max(50),
  finePerDay:           mwkAmountSchema('Fine per day'),
  fineGraceDays:        nonNegativeIntSchema('Fine grace days').max(30),
  reminderDaysBefore:   positiveIntSchema('Reminder days').max(30),
})

export type LibrarySettingsFormInput = z.infer<typeof LibrarySettingsFormSchema>

export const HRSettingsFormSchema = z.object({
  maxConcurrentLeavePct: percentSchema('Max concurrent leave'),
  annualLeaveDays:       positiveIntSchema('Annual leave days').max(365),
  sickLeaveDays:         positiveIntSchema('Sick leave days').max(365),
  maternityLeaveDays:    positiveIntSchema('Maternity leave days').max(365),
  paternityLeaveDays:    positiveIntSchema('Paternity leave days').max(60),
  studyLeaveDays:        positiveIntSchema('Study leave days').max(180),
  emergencyLeaveDays:    positiveIntSchema('Emergency leave days').max(30),
})

export type HRSettingsFormInput = z.infer<typeof HRSettingsFormSchema>

export const SecuritySettingsFormSchema = z.object({
  sessionTimeoutStudentMins: positiveIntSchema('Student timeout').max(480),
  sessionTimeoutStaffMins:   positiveIntSchema('Staff timeout').max(480),
  maxLoginAttempts:          positiveIntSchema('Max attempts').max(20),
  lockoutDurationMins:       positiveIntSchema('Lockout duration').max(1440),
})

export type SecuritySettingsFormInput = z.infer<typeof SecuritySettingsFormSchema>