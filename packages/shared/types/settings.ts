// ─────────────────────────────────────────────────────────
//  COMPLEX VALUE INTERFACES
//  Defined before the value map so the map can reference them.
// ─────────────────────────────────────────────────────────

/**
 * A single bracket in Malawi's PAYE (Pay As You Earn) income tax schedule.
 * Brackets are applied to ANNUAL gross salary in MWK.
 * Source: Malawi Revenue Authority — verify before production use.
 */
export interface PayeBracket {
  /** Lower bound of this bracket in annual MWK (inclusive). */
  minAnnualMwk: number
  /** Upper bound of this bracket in annual MWK (inclusive). null = no ceiling. */
  maxAnnualMwk: number | null
  /** Tax rate as a whole-number percentage (0–100). */
  ratePercent: number
  /** Human-readable label for display in payroll UI. */
  label: string
}

/**
 * An installment count option offered when creating an installment plan.
 * e.g. 2 = pay in 2 installments, 3 = pay in 3 installments.
 */
export type InstallmentOption = 2 | 3 | 4

// ─────────────────────────────────────────────────────────
//  SETTING KEYS
//  Single source of truth for all key string literals.
//  Use SETTING_KEYS.FOO instead of raw string literals to
//  prevent typos and enable IDE autocomplete.
// ─────────────────────────────────────────────────────────

export const SETTING_KEYS = {
  // ── Academic calendar
  CURRENT_ACADEMIC_YEAR:          'current_academic_year',
  CURRENT_TERM:                   'current_term',
  TERM1_START:                    'term1_start',
  TERM1_END:                      'term1_end',
  TERM2_START:                    'term2_start',
  TERM2_END:                      'term2_end',
  TERM3_START:                    'term3_start',
  TERM3_END:                      'term3_end',

  // ── School identity
  SCHOOL_NAME:                    'school_name',
  SCHOOL_SLOGAN:                  'school_slogan',
  SCHOOL_VISION:                  'school_vision',
  SCHOOL_MISSION:                 'school_mission',
  SCHOOL_CORE_VALUES:             'school_core_values',
  SCHOOL_ADDRESS:                 'school_address',
  SCHOOL_PHONE:                   'school_phone',
  SCHOOL_EMAIL:                   'school_email',
  SCHOOL_WEBSITE:                 'school_website',
  SCHOOL_FOUNDED_YEAR:            'school_founded_year',

  // ── Exam and grading
  EXAM_PASS_MARK_THRESHOLD:       'exam_pass_mark_threshold',
  EXAM_MANEB_CENTRE_NUMBER:       'exam_maneb_centre_number',
  EXAM_MANEB_CENTRE_NAME:         'exam_maneb_centre_name',
  EXAM_MANEB_REG_DEADLINE:        'exam_maneb_reg_deadline',

  // ── Student promotion
  PROMOTION_MIN_AVERAGE:          'promotion_min_average',
  PROMOTION_REQUIRED_PASSES:      'promotion_required_passes',

  // ── Finance — fee and penalty
  FINANCE_LATE_PENALTY_PER_DAY:   'finance_late_penalty_per_day',
  FINANCE_LATE_PENALTY_GRACE_DAYS:'finance_late_penalty_grace_days',
  FINANCE_INSTALLMENT_OPTIONS:    'finance_installment_options',

  // ── Finance — payroll
  FINANCE_PAYROLL_RUN_DAY:        'finance_payroll_run_day',
  FINANCE_PENSION_PERCENT:        'finance_pension_percent',
  FINANCE_PAYE_BRACKETS:          'finance_paye_brackets',

  // ── Library
  LIBRARY_LOAN_PERIOD_STUDENT:    'library_loan_period_student',
  LIBRARY_LOAN_PERIOD_STAFF:      'library_loan_period_staff',
  LIBRARY_MAX_BOOKS_STUDENT:      'library_max_books_student',
  LIBRARY_MAX_BOOKS_STAFF:        'library_max_books_staff',
  LIBRARY_FINE_PER_DAY:           'library_fine_per_day',
  LIBRARY_FINE_GRACE_DAYS:        'library_fine_grace_days',
  LIBRARY_REMINDER_DAYS_BEFORE:   'library_reminder_days_before',

  // ── HR — leave entitlements (days per year)
  HR_MAX_CONCURRENT_LEAVE_PCT:    'hr_max_concurrent_leave_pct',
  HR_ANNUAL_LEAVE_DAYS:           'hr_annual_leave_days',
  HR_SICK_LEAVE_DAYS:             'hr_sick_leave_days',
  HR_MATERNITY_LEAVE_DAYS:        'hr_maternity_leave_days',
  HR_PATERNITY_LEAVE_DAYS:        'hr_paternity_leave_days',
  HR_STUDY_LEAVE_DAYS:            'hr_study_leave_days',
  HR_EMERGENCY_LEAVE_DAYS:        'hr_emergency_leave_days',

  // ── Security — session
  SESSION_TIMEOUT_STUDENT_MINS:   'session_timeout_student_mins',
  SESSION_TIMEOUT_STAFF_MINS:     'session_timeout_staff_mins',
  MAX_LOGIN_ATTEMPTS:             'max_login_attempts',
  LOCKOUT_DURATION_MINS:          'lockout_duration_mins',

  // ── System
  APP_MAINTENANCE_MODE:           'app_maintenance_mode',
  APP_TIMEZONE:                   'app_timezone',
  APP_CURRENCY:                   'app_currency',
  APP_CURRENCY_LOCALE:            'app_currency_locale',
} as const

/** Union type of all setting key strings. */
export type SettingKey = typeof SETTING_KEYS[keyof typeof SETTING_KEYS]

// ─────────────────────────────────────────────────────────
//  SETTING CATEGORIES
//  Matches the category strings stored in system_settings.category.
// ─────────────────────────────────────────────────────────

export const SETTING_CATEGORIES = {
  ACADEMIC:       'academic',
  SCHOOL_IDENTITY:'school_identity',
  EXAM:           'exam',
  FINANCE:        'finance',
  LIBRARY:        'library',
  HR:             'hr',
  SECURITY:       'security',
  SYSTEM:         'system',
} as const

export type SettingCategory = typeof SETTING_CATEGORIES[keyof typeof SETTING_CATEGORIES]

// ─────────────────────────────────────────────────────────
//  SETTING VALUE MAP
//  Maps every SettingKey to its precise TypeScript value type.
//  This enables type-safe get<K>(key: K): Promise<SettingValueMap[K]>
//  in the service and hooks.
// ─────────────────────────────────────────────────────────

export interface SettingValueMap {
  // ── Academic
  readonly [SETTING_KEYS.CURRENT_ACADEMIC_YEAR]: string     // "2025/2026"
  readonly [SETTING_KEYS.CURRENT_TERM]:          1 | 2 | 3
  readonly [SETTING_KEYS.TERM1_START]:           string     // "YYYY-MM-DD"
  readonly [SETTING_KEYS.TERM1_END]:             string
  readonly [SETTING_KEYS.TERM2_START]:           string
  readonly [SETTING_KEYS.TERM2_END]:             string
  readonly [SETTING_KEYS.TERM3_START]:           string
  readonly [SETTING_KEYS.TERM3_END]:             string

  // ── School identity
  readonly [SETTING_KEYS.SCHOOL_NAME]:           string
  readonly [SETTING_KEYS.SCHOOL_SLOGAN]:         string
  readonly [SETTING_KEYS.SCHOOL_VISION]:         string
  readonly [SETTING_KEYS.SCHOOL_MISSION]:        string
  readonly [SETTING_KEYS.SCHOOL_CORE_VALUES]:    string[]   // list of short value statements
  readonly [SETTING_KEYS.SCHOOL_ADDRESS]:        string
  readonly [SETTING_KEYS.SCHOOL_PHONE]:          string
  readonly [SETTING_KEYS.SCHOOL_EMAIL]:          string
  readonly [SETTING_KEYS.SCHOOL_WEBSITE]:        string
  readonly [SETTING_KEYS.SCHOOL_FOUNDED_YEAR]:   number

  // ── Exam and grading
  readonly [SETTING_KEYS.EXAM_PASS_MARK_THRESHOLD]: number  // whole-number percent, default 35
  readonly [SETTING_KEYS.EXAM_MANEB_CENTRE_NUMBER]: string
  readonly [SETTING_KEYS.EXAM_MANEB_CENTRE_NAME]:   string
  readonly [SETTING_KEYS.EXAM_MANEB_REG_DEADLINE]:  string  // "YYYY-MM-DD"

  // ── Promotion
  readonly [SETTING_KEYS.PROMOTION_MIN_AVERAGE]:      number  // percent, default 35
  readonly [SETTING_KEYS.PROMOTION_REQUIRED_PASSES]:  number  // subject count, default 5

  // ── Finance — fees
  readonly [SETTING_KEYS.FINANCE_LATE_PENALTY_PER_DAY]:    number  // MWK
  readonly [SETTING_KEYS.FINANCE_LATE_PENALTY_GRACE_DAYS]: number  // days
  readonly [SETTING_KEYS.FINANCE_INSTALLMENT_OPTIONS]:     InstallmentOption[]

  // ── Finance — payroll
  readonly [SETTING_KEYS.FINANCE_PAYROLL_RUN_DAY]:   number        // 1–28
  readonly [SETTING_KEYS.FINANCE_PENSION_PERCENT]:   number        // percentage
  readonly [SETTING_KEYS.FINANCE_PAYE_BRACKETS]:     PayeBracket[]

  // ── Library
  readonly [SETTING_KEYS.LIBRARY_LOAN_PERIOD_STUDENT]:  number  // days
  readonly [SETTING_KEYS.LIBRARY_LOAN_PERIOD_STAFF]:    number
  readonly [SETTING_KEYS.LIBRARY_MAX_BOOKS_STUDENT]:    number
  readonly [SETTING_KEYS.LIBRARY_MAX_BOOKS_STAFF]:      number
  readonly [SETTING_KEYS.LIBRARY_FINE_PER_DAY]:         number  // MWK
  readonly [SETTING_KEYS.LIBRARY_FINE_GRACE_DAYS]:      number
  readonly [SETTING_KEYS.LIBRARY_REMINDER_DAYS_BEFORE]: number

  // ── HR
  readonly [SETTING_KEYS.HR_MAX_CONCURRENT_LEAVE_PCT]: number  // percent 0–100
  readonly [SETTING_KEYS.HR_ANNUAL_LEAVE_DAYS]:        number
  readonly [SETTING_KEYS.HR_SICK_LEAVE_DAYS]:          number
  readonly [SETTING_KEYS.HR_MATERNITY_LEAVE_DAYS]:     number
  readonly [SETTING_KEYS.HR_PATERNITY_LEAVE_DAYS]:     number
  readonly [SETTING_KEYS.HR_STUDY_LEAVE_DAYS]:         number
  readonly [SETTING_KEYS.HR_EMERGENCY_LEAVE_DAYS]:     number

  // ── Security
  readonly [SETTING_KEYS.SESSION_TIMEOUT_STUDENT_MINS]: number
  readonly [SETTING_KEYS.SESSION_TIMEOUT_STAFF_MINS]:   number
  readonly [SETTING_KEYS.MAX_LOGIN_ATTEMPTS]:           number
  readonly [SETTING_KEYS.LOCKOUT_DURATION_MINS]:        number

  // ── System
  readonly [SETTING_KEYS.APP_MAINTENANCE_MODE]:  boolean
  readonly [SETTING_KEYS.APP_TIMEZONE]:          string   // "Africa/Blantyre"
  readonly [SETTING_KEYS.APP_CURRENCY]:          string   // "MWK"
  readonly [SETTING_KEYS.APP_CURRENCY_LOCALE]:   string   // "en-MW"
}

// ─────────────────────────────────────────────────────────
//  SETTING METADATA
//  Describes each setting: category, public visibility,
//  description, and default value.
//  Used by: settingsService (seeding, cache TTL), settings UI
// ─────────────────────────────────────────────────────────

export interface SettingMeta<K extends SettingKey = SettingKey> {
  key: K
  category: SettingCategory
  /** Readable by any authenticated user without special permission. */
  isPublic: boolean
  description: string
  defaultValue: SettingValueMap[K]
}

/** Default Malawi PAYE brackets (2025 — verify with MRA before production). */
const DEFAULT_PAYE_BRACKETS: PayeBracket[] = [
  {
    minAnnualMwk: 0,
    maxAnnualMwk: 1_200_000,
    ratePercent: 0,
    label: 'Tax-free band (0 – MWK 1,200,000)',
  },
  {
    minAnnualMwk: 1_200_001,
    maxAnnualMwk: 2_400_000,
    ratePercent: 25,
    label: '25% band (MWK 1,200,001 – 2,400,000)',
  },
  {
    minAnnualMwk: 2_400_001,
    maxAnnualMwk: null,
    ratePercent: 30,
    label: '30% band (above MWK 2,400,000)',
  },
]

export const SETTING_META: { readonly [K in SettingKey]: SettingMeta<K> } = {
  // ── Academic
  [SETTING_KEYS.CURRENT_ACADEMIC_YEAR]: {
    key: SETTING_KEYS.CURRENT_ACADEMIC_YEAR,
    category: SETTING_CATEGORIES.ACADEMIC,
    isPublic: true,
    description: 'The currently active academic year in "YYYY/YYYY" format.',
    defaultValue: '2025/2026',
  },
  [SETTING_KEYS.CURRENT_TERM]: {
    key: SETTING_KEYS.CURRENT_TERM,
    category: SETTING_CATEGORIES.ACADEMIC,
    isPublic: true,
    description: 'The currently active term (1, 2, or 3).',
    defaultValue: 1,
  },
  [SETTING_KEYS.TERM1_START]: {
    key: SETTING_KEYS.TERM1_START,
    category: SETTING_CATEGORIES.ACADEMIC,
    isPublic: true,
    description: 'Term 1 start date (ISO date YYYY-MM-DD). Malawi: typically September.',
    defaultValue: '2025-09-01',
  },
  [SETTING_KEYS.TERM1_END]: {
    key: SETTING_KEYS.TERM1_END,
    category: SETTING_CATEGORIES.ACADEMIC,
    isPublic: true,
    description: 'Term 1 end date (ISO date YYYY-MM-DD). Malawi: typically early December.',
    defaultValue: '2025-12-05',
  },
  [SETTING_KEYS.TERM2_START]: {
    key: SETTING_KEYS.TERM2_START,
    category: SETTING_CATEGORIES.ACADEMIC,
    isPublic: true,
    description: 'Term 2 start date. Malawi: typically January.',
    defaultValue: '2026-01-12',
  },
  [SETTING_KEYS.TERM2_END]: {
    key: SETTING_KEYS.TERM2_END,
    category: SETTING_CATEGORIES.ACADEMIC,
    isPublic: true,
    description: 'Term 2 end date. Malawi: typically April.',
    defaultValue: '2026-04-10',
  },
  [SETTING_KEYS.TERM3_START]: {
    key: SETTING_KEYS.TERM3_START,
    category: SETTING_CATEGORIES.ACADEMIC,
    isPublic: true,
    description: 'Term 3 start date. Malawi: typically May.',
    defaultValue: '2026-05-04',
  },
  [SETTING_KEYS.TERM3_END]: {
    key: SETTING_KEYS.TERM3_END,
    category: SETTING_CATEGORIES.ACADEMIC,
    isPublic: true,
    description: 'Term 3 end date. Malawi: typically late July.',
    defaultValue: '2026-07-24',
  },

  // ── School identity
  [SETTING_KEYS.SCHOOL_NAME]: {
    key: SETTING_KEYS.SCHOOL_NAME,
    category: SETTING_CATEGORIES.SCHOOL_IDENTITY,
    isPublic: true,
    description: 'Full official name of the school.',
    defaultValue: 'Secondary School Management System',
  },
  [SETTING_KEYS.SCHOOL_SLOGAN]: {
    key: SETTING_KEYS.SCHOOL_SLOGAN,
    category: SETTING_CATEGORIES.SCHOOL_IDENTITY,
    isPublic: true,
    description: 'School motto or slogan displayed on the landing page.',
    defaultValue: 'Excellence in Education',
  },
  [SETTING_KEYS.SCHOOL_VISION]: {
    key: SETTING_KEYS.SCHOOL_VISION,
    category: SETTING_CATEGORIES.SCHOOL_IDENTITY,
    isPublic: true,
    description: 'School vision statement.',
    defaultValue: 'To be a centre of excellence that nurtures well-rounded individuals.',
  },
  [SETTING_KEYS.SCHOOL_MISSION]: {
    key: SETTING_KEYS.SCHOOL_MISSION,
    category: SETTING_CATEGORIES.SCHOOL_IDENTITY,
    isPublic: true,
    description: 'School mission statement.',
    defaultValue: 'To provide quality education through innovative teaching and a supportive environment.',
  },
  [SETTING_KEYS.SCHOOL_CORE_VALUES]: {
    key: SETTING_KEYS.SCHOOL_CORE_VALUES,
    category: SETTING_CATEGORIES.SCHOOL_IDENTITY,
    isPublic: true,
    description: 'List of core values displayed on the explore page.',
    defaultValue: ['Integrity', 'Excellence', 'Respect', 'Responsibility', 'Innovation'],
  },
  [SETTING_KEYS.SCHOOL_ADDRESS]: {
    key: SETTING_KEYS.SCHOOL_ADDRESS,
    category: SETTING_CATEGORIES.SCHOOL_IDENTITY,
    isPublic: true,
    description: 'Physical address of the school.',
    defaultValue: 'P.O. Box 1, Blantyre, Malawi',
  },
  [SETTING_KEYS.SCHOOL_PHONE]: {
    key: SETTING_KEYS.SCHOOL_PHONE,
    category: SETTING_CATEGORIES.SCHOOL_IDENTITY,
    isPublic: true,
    description: 'Main contact phone number (with country code).',
    defaultValue: '+265 1 000 000',
  },
  [SETTING_KEYS.SCHOOL_EMAIL]: {
    key: SETTING_KEYS.SCHOOL_EMAIL,
    category: SETTING_CATEGORIES.SCHOOL_IDENTITY,
    isPublic: true,
    description: 'Main contact email address.',
    defaultValue: 'info@school.mw',
  },
  [SETTING_KEYS.SCHOOL_WEBSITE]: {
    key: SETTING_KEYS.SCHOOL_WEBSITE,
    category: SETTING_CATEGORIES.SCHOOL_IDENTITY,
    isPublic: true,
    description: 'School website URL.',
    defaultValue: 'https://school.mw',
  },
  [SETTING_KEYS.SCHOOL_FOUNDED_YEAR]: {
    key: SETTING_KEYS.SCHOOL_FOUNDED_YEAR,
    category: SETTING_CATEGORIES.SCHOOL_IDENTITY,
    isPublic: true,
    description: 'Year the school was established.',
    defaultValue: 1990,
  },

  // ── Exam and grading
  [SETTING_KEYS.EXAM_PASS_MARK_THRESHOLD]: {
    key: SETTING_KEYS.EXAM_PASS_MARK_THRESHOLD,
    category: SETTING_CATEGORIES.EXAM,
    isPublic: false,
    description: 'Minimum percentage required to pass any internal exam. MANEB standard is 35%.',
    defaultValue: 35,
  },
  [SETTING_KEYS.EXAM_MANEB_CENTRE_NUMBER]: {
    key: SETTING_KEYS.EXAM_MANEB_CENTRE_NUMBER,
    category: SETTING_CATEGORIES.EXAM,
    isPublic: false,
    description: 'Official MANEB examination centre number assigned to the school.',
    defaultValue: '',
  },
  [SETTING_KEYS.EXAM_MANEB_CENTRE_NAME]: {
    key: SETTING_KEYS.EXAM_MANEB_CENTRE_NAME,
    category: SETTING_CATEGORIES.EXAM,
    isPublic: false,
    description: 'Official MANEB examination centre name as registered with MANEB.',
    defaultValue: '',
  },
  [SETTING_KEYS.EXAM_MANEB_REG_DEADLINE]: {
    key: SETTING_KEYS.EXAM_MANEB_REG_DEADLINE,
    category: SETTING_CATEGORIES.EXAM,
    isPublic: false,
    description: 'MANEB candidate registration deadline for the current academic year (ISO date).',
    defaultValue: '2026-03-31',
  },

  // ── Promotion
  [SETTING_KEYS.PROMOTION_MIN_AVERAGE]: {
    key: SETTING_KEYS.PROMOTION_MIN_AVERAGE,
    category: SETTING_CATEGORIES.EXAM,
    isPublic: false,
    description: 'Minimum annual average percentage a student must achieve to be promoted.',
    defaultValue: 35,
  },
  [SETTING_KEYS.PROMOTION_REQUIRED_PASSES]: {
    key: SETTING_KEYS.PROMOTION_REQUIRED_PASSES,
    category: SETTING_CATEGORIES.EXAM,
    isPublic: false,
    description: 'Minimum number of subjects a student must pass to be promoted to the next form.',
    defaultValue: 5,
  },

  // ── Finance — fees and penalties
  [SETTING_KEYS.FINANCE_LATE_PENALTY_PER_DAY]: {
    key: SETTING_KEYS.FINANCE_LATE_PENALTY_PER_DAY,
    category: SETTING_CATEGORIES.FINANCE,
    isPublic: false,
    description: 'Late fee penalty applied per day after the grace period expires (MWK).',
    defaultValue: 500,
  },
  [SETTING_KEYS.FINANCE_LATE_PENALTY_GRACE_DAYS]: {
    key: SETTING_KEYS.FINANCE_LATE_PENALTY_GRACE_DAYS,
    category: SETTING_CATEGORIES.FINANCE,
    isPublic: false,
    description: 'Number of days after fee due date before daily penalty starts accruing.',
    defaultValue: 7,
  },
  [SETTING_KEYS.FINANCE_INSTALLMENT_OPTIONS]: {
    key: SETTING_KEYS.FINANCE_INSTALLMENT_OPTIONS,
    category: SETTING_CATEGORIES.FINANCE,
    isPublic: false,
    description: 'Available installment count options when creating a payment plan for a student.',
    defaultValue: [2, 3, 4],
  },

  // ── Finance — payroll
  [SETTING_KEYS.FINANCE_PAYROLL_RUN_DAY]: {
    key: SETTING_KEYS.FINANCE_PAYROLL_RUN_DAY,
    category: SETTING_CATEGORIES.FINANCE,
    isPublic: false,
    description: 'Day of the month (1–28) on which monthly payroll is processed.',
    defaultValue: 25,
  },
  [SETTING_KEYS.FINANCE_PENSION_PERCENT]: {
    key: SETTING_KEYS.FINANCE_PENSION_PERCENT,
    category: SETTING_CATEGORIES.FINANCE,
    isPublic: false,
    description: 'Employee pension contribution as a percentage of gross salary.',
    defaultValue: 5,
  },
  [SETTING_KEYS.FINANCE_PAYE_BRACKETS]: {
    key: SETTING_KEYS.FINANCE_PAYE_BRACKETS,
    category: SETTING_CATEGORIES.FINANCE,
    isPublic: false,
    description: 'PAYE income tax brackets. Each bracket defines a monthly income range and tax rate. Verify with MRA annually.',
    defaultValue: DEFAULT_PAYE_BRACKETS,
  },

  // ── Library
  [SETTING_KEYS.LIBRARY_LOAN_PERIOD_STUDENT]: {
    key: SETTING_KEYS.LIBRARY_LOAN_PERIOD_STUDENT,
    category: SETTING_CATEGORIES.LIBRARY,
    isPublic: false,
    description: 'Default loan period for students in days.',
    defaultValue: 14,
  },
  [SETTING_KEYS.LIBRARY_LOAN_PERIOD_STAFF]: {
    key: SETTING_KEYS.LIBRARY_LOAN_PERIOD_STAFF,
    category: SETTING_CATEGORIES.LIBRARY,
    isPublic: false,
    description: 'Default loan period for staff in days.',
    defaultValue: 21,
  },
  [SETTING_KEYS.LIBRARY_MAX_BOOKS_STUDENT]: {
    key: SETTING_KEYS.LIBRARY_MAX_BOOKS_STUDENT,
    category: SETTING_CATEGORIES.LIBRARY,
    isPublic: false,
    description: 'Maximum number of books a student may borrow simultaneously.',
    defaultValue: 3,
  },
  [SETTING_KEYS.LIBRARY_MAX_BOOKS_STAFF]: {
    key: SETTING_KEYS.LIBRARY_MAX_BOOKS_STAFF,
    category: SETTING_CATEGORIES.LIBRARY,
    isPublic: false,
    description: 'Maximum number of books a staff member may borrow simultaneously.',
    defaultValue: 5,
  },
  [SETTING_KEYS.LIBRARY_FINE_PER_DAY]: {
    key: SETTING_KEYS.LIBRARY_FINE_PER_DAY,
    category: SETTING_CATEGORIES.LIBRARY,
    isPublic: false,
    description: 'Daily overdue fine per book (MWK).',
    defaultValue: 50,
  },
  [SETTING_KEYS.LIBRARY_FINE_GRACE_DAYS]: {
    key: SETTING_KEYS.LIBRARY_FINE_GRACE_DAYS,
    category: SETTING_CATEGORIES.LIBRARY,
    isPublic: false,
    description: 'Days past due date before fine starts accruing.',
    defaultValue: 1,
  },
  [SETTING_KEYS.LIBRARY_REMINDER_DAYS_BEFORE]: {
    key: SETTING_KEYS.LIBRARY_REMINDER_DAYS_BEFORE,
    category: SETTING_CATEGORIES.LIBRARY,
    isPublic: false,
    description: 'Days before due date to send the borrower a return reminder notification.',
    defaultValue: 2,
  },

  // ── HR
  [SETTING_KEYS.HR_MAX_CONCURRENT_LEAVE_PCT]: {
    key: SETTING_KEYS.HR_MAX_CONCURRENT_LEAVE_PCT,
    category: SETTING_CATEGORIES.HR,
    isPublic: false,
    description: 'Maximum percentage of staff in one department that may be on leave simultaneously.',
    defaultValue: 30,
  },
  [SETTING_KEYS.HR_ANNUAL_LEAVE_DAYS]: {
    key: SETTING_KEYS.HR_ANNUAL_LEAVE_DAYS,
    category: SETTING_CATEGORIES.HR,
    isPublic: false,
    description: 'Default annual leave entitlement in days per calendar year.',
    defaultValue: 18,
  },
  [SETTING_KEYS.HR_SICK_LEAVE_DAYS]: {
    key: SETTING_KEYS.HR_SICK_LEAVE_DAYS,
    category: SETTING_CATEGORIES.HR,
    isPublic: false,
    description: 'Default sick leave entitlement in days per calendar year.',
    defaultValue: 10,
  },
  [SETTING_KEYS.HR_MATERNITY_LEAVE_DAYS]: {
    key: SETTING_KEYS.HR_MATERNITY_LEAVE_DAYS,
    category: SETTING_CATEGORIES.HR,
    isPublic: false,
    description: 'Maternity leave entitlement in days.',
    defaultValue: 90,
  },
  [SETTING_KEYS.HR_PATERNITY_LEAVE_DAYS]: {
    key: SETTING_KEYS.HR_PATERNITY_LEAVE_DAYS,
    category: SETTING_CATEGORIES.HR,
    isPublic: false,
    description: 'Paternity leave entitlement in days.',
    defaultValue: 5,
  },
  [SETTING_KEYS.HR_STUDY_LEAVE_DAYS]: {
    key: SETTING_KEYS.HR_STUDY_LEAVE_DAYS,
    category: SETTING_CATEGORIES.HR,
    isPublic: false,
    description: 'Study leave entitlement in days per calendar year.',
    defaultValue: 10,
  },
  [SETTING_KEYS.HR_EMERGENCY_LEAVE_DAYS]: {
    key: SETTING_KEYS.HR_EMERGENCY_LEAVE_DAYS,
    category: SETTING_CATEGORIES.HR,
    isPublic: false,
    description: 'Emergency leave entitlement in days per calendar year.',
    defaultValue: 3,
  },

  // ── Security
  [SETTING_KEYS.SESSION_TIMEOUT_STUDENT_MINS]: {
    key: SETTING_KEYS.SESSION_TIMEOUT_STUDENT_MINS,
    category: SETTING_CATEGORIES.SECURITY,
    isPublic: false,
    description: 'Inactivity timeout for student accounts in minutes.',
    defaultValue: 60,
  },
  [SETTING_KEYS.SESSION_TIMEOUT_STAFF_MINS]: {
    key: SETTING_KEYS.SESSION_TIMEOUT_STAFF_MINS,
    category: SETTING_CATEGORIES.SECURITY,
    isPublic: false,
    description: 'Inactivity timeout for all staff accounts in minutes.',
    defaultValue: 300,
  },
  [SETTING_KEYS.MAX_LOGIN_ATTEMPTS]: {
    key: SETTING_KEYS.MAX_LOGIN_ATTEMPTS,
    category: SETTING_CATEGORIES.SECURITY,
    isPublic: false,
    description: 'Maximum consecutive failed login attempts before account lockout.',
    defaultValue: 5,
  },
  [SETTING_KEYS.LOCKOUT_DURATION_MINS]: {
    key: SETTING_KEYS.LOCKOUT_DURATION_MINS,
    category: SETTING_CATEGORIES.SECURITY,
    isPublic: false,
    description: 'Duration of account lockout after max failed attempts in minutes.',
    defaultValue: 30,
  },

  // ── System
  [SETTING_KEYS.APP_MAINTENANCE_MODE]: {
    key: SETTING_KEYS.APP_MAINTENANCE_MODE,
    category: SETTING_CATEGORIES.SYSTEM,
    isPublic: false,
    description: 'When true, the app shows a maintenance page to all non-admin users.',
    defaultValue: false,
  },
  [SETTING_KEYS.APP_TIMEZONE]: {
    key: SETTING_KEYS.APP_TIMEZONE,
    category: SETTING_CATEGORIES.SYSTEM,
    isPublic: true,
    description: 'IANA timezone name for the school location. Used for date display and cron scheduling.',
    defaultValue: 'Africa/Blantyre',
  },
  [SETTING_KEYS.APP_CURRENCY]: {
    key: SETTING_KEYS.APP_CURRENCY,
    category: SETTING_CATEGORIES.SYSTEM,
    isPublic: true,
    description: 'ISO 4217 currency code for financial display.',
    defaultValue: 'MWK',
  },
  [SETTING_KEYS.APP_CURRENCY_LOCALE]: {
    key: SETTING_KEYS.APP_CURRENCY_LOCALE,
    category: SETTING_CATEGORIES.SYSTEM,
    isPublic: true,
    description: 'BCP 47 locale string for Intl.NumberFormat currency formatting.',
    defaultValue: 'en-MW',
  },
} as const

// ─────────────────────────────────────────────────────────
//  UTILITY TYPES
// ─────────────────────────────────────────────────────────

/** Keys that belong to a specific category. */
export type KeysInCategory<C extends SettingCategory> = {
  [K in SettingKey]: typeof SETTING_META[K]['category'] extends C ? K : never
}[SettingKey]

/** Keys that are public (readable by any authenticated user). */
export type PublicSettingKey = {
  [K in SettingKey]: typeof SETTING_META[K]['isPublic'] extends true ? K : never
}[SettingKey]

/** Partial map of setting values, used for batch responses. */
export type SettingValuePartial = Partial<SettingValueMap>

/** Full setting row as stored/returned by the service. */
export interface SettingRow<K extends SettingKey = SettingKey> {
  key: K
  value: SettingValueMap[K]
  category: SettingCategory
  isPublic: boolean
  description: string | null
  updatedByUid: string | null
  updatedAt: Date
}

/** Shape returned by getAll() for the admin settings UI. */
export type CategoryGroupedSettings = {
  [C in SettingCategory]?: Array<SettingRow<KeysInCategory<C>>>
}

/** School identity subset — safe to expose to the public landing page. */
export interface SchoolIdentitySettings {
  schoolName: string
  schoolSlogan: string
  schoolVision: string
  schoolMission: string
  schoolCoreValues: string[]
  schoolAddress: string
  schoolPhone: string
  schoolEmail: string
  schoolWebsite: string
  schoolFoundedYear: number
  currentAcademicYear: string
  timezone: string
  currency: string
  currencyLocale: string
}