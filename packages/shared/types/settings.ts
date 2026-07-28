/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: packages/shared/types/settings.ts
 * [R-PHASE]: R8 — Academics IV: Report Cards, Transcripts, Promotion & Risk
 *   Assessment
 * [PURPOSE]: Adds SCHOOL_LOGO_URL (PrintableReportCard.tsx's real logo,
 *   replacing the hardcoded "CREST" text placeholder) and six risk
 *   threshold keys (RISK_FEE_DEBT_HIGH/MEDIUM, RISK_ABSENCE_HIGH/MEDIUM,
 *   RISK_SUBJECT_FAILS_HIGH/MEDIUM) — riskService.ts's thresholds were the
 *   one hardcoded-threshold set in the exam/academic domain with no
 *   admin-configuration mechanism at all, unlike grading and promotion.
 *
 *   R14 — Analytics & Reports Domain — adds
 *   HR_CONTRACT_EXPIRY_LOOKAHEAD_DAYS. reportService.getHRReport()'s
 *   contract-expiry window was a hardcoded 60-day literal, independent of
 *   (and free to silently drift from) the 60-day default the contract-alert
 *   pipeline uses. Contract-expiry lookahead is a real school policy value,
 *   so it belongs in SystemSettings alongside every other admin-configurable
 *   HR threshold rather than as a magic number inside one report function.
 * [DEPENDS ON]: none
 */

import { DEFAULT_PAYE_BRACKETS } from '../constants/malawi/finance'

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

/**
 * [PRODUCTION FIX 2026-07-27] The school's canonical department → job-title
 * taxonomy. Replaces free-text department/jobTitle inputs on staff creation
 * (which let every staff member spell their own department differently,
 * silently breaking any department-scoped rollup such as Finance's
 * per-department budget) with a single admin/hr/high_rank-editable source
 * of truth. Keys are department names; each value is the list of job
 * titles available within that department, in display order.
 */
export interface DepartmentTitles {
  [departmentName: string]: string[]
}

/** One entry in SETTING_KEYS.SCHOOL_LEADERSHIP_TEAM — deliberately minimal,
 *  public-safe fields only. See that key's comment for why this is a
 *  curated list rather than real StaffProfile records. */
export interface LeadershipMember {
  name:     string
  title:    string
  bio?:     string
  photoKey?: string // Appwrite file ID, FILE_PREFIX.STAFF_PHOTO or a public one
  order?:   number
}

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
  // [PRODUCTION FIX 2026-07-28] Public landing-page hero copy — the
  // sub-headline under the school name ("Secondary School Management
  // System") and the tagline beneath it ("Excellence in Education — from
  // Form 1 through MSCE.") were hardcoded strings in page.tsx. Same
  // admin/hr/high_rank-editable pattern as SCHOOL_NAME.
  SCHOOL_SYSTEM_TAGLINE:          'school_system_tagline',
  SCHOOL_HERO_SUBTITLE:           'school_hero_subtitle',
  // Public leadership/management team listing for the Discover ->
  // Leadership page. A deliberately minimal admin-curated list (name,
  // title, bio, optional photo) rather than exposing real StaffProfile
  // records publicly, which would leak internal HR data never meant to be
  // public (employee numbers, department, contact details, etc).
  SCHOOL_LEADERSHIP_TEAM:         'school_leadership_team',
  SCHOOL_FOUNDED_YEAR:            'school_founded_year',
  SCHOOL_LOGO_URL:                'school_logo_url',

  // ── Exam and grading
  EXAM_PASS_MARK_THRESHOLD:       'exam_pass_mark_threshold',
  EXAM_MANEB_CENTRE_NUMBER:       'exam_maneb_centre_number',
  EXAM_MANEB_CENTRE_NAME:         'exam_maneb_centre_name',
  EXAM_MANEB_REG_DEADLINE:        'exam_maneb_reg_deadline',

  // ── Student promotion
  PROMOTION_MIN_AVERAGE:          'promotion_min_average',
  PROMOTION_REQUIRED_PASSES:      'promotion_required_passes',

  // ── Student risk thresholds
  RISK_FEE_DEBT_HIGH:             'risk_fee_debt_high',
  RISK_FEE_DEBT_MEDIUM:           'risk_fee_debt_medium',
  RISK_ABSENCE_HIGH:              'risk_absence_high',
  RISK_ABSENCE_MEDIUM:            'risk_absence_medium',
  RISK_SUBJECT_FAILS_HIGH:        'risk_subject_fails_high',
  RISK_SUBJECT_FAILS_MEDIUM:      'risk_subject_fails_medium',

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

  // ── HR — contract management
  HR_CONTRACT_EXPIRY_LOOKAHEAD_DAYS: 'hr_contract_expiry_lookahead_days',

  // ── HR — department & job title taxonomy (production fix, 2026-07-27)
  HR_DEPARTMENT_TITLES:           'hr_department_titles',

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
  readonly [SETTING_KEYS.SCHOOL_SYSTEM_TAGLINE]: string
  readonly [SETTING_KEYS.SCHOOL_HERO_SUBTITLE]:  string
  readonly [SETTING_KEYS.SCHOOL_LEADERSHIP_TEAM]: LeadershipMember[]
  readonly [SETTING_KEYS.SCHOOL_VISION]:         string
  readonly [SETTING_KEYS.SCHOOL_MISSION]:        string
  readonly [SETTING_KEYS.SCHOOL_CORE_VALUES]:    string[]   // list of short value statements
  readonly [SETTING_KEYS.SCHOOL_ADDRESS]:        string
  readonly [SETTING_KEYS.SCHOOL_PHONE]:          string
  readonly [SETTING_KEYS.SCHOOL_EMAIL]:          string
  readonly [SETTING_KEYS.SCHOOL_WEBSITE]:        string
  readonly [SETTING_KEYS.SCHOOL_FOUNDED_YEAR]:   number
  readonly [SETTING_KEYS.SCHOOL_LOGO_URL]:       string  // Appwrite file view URL, '' if none uploaded

  // ── Exam and grading
  readonly [SETTING_KEYS.EXAM_PASS_MARK_THRESHOLD]: number  // whole-number percent, default 35
  readonly [SETTING_KEYS.EXAM_MANEB_CENTRE_NUMBER]: string
  readonly [SETTING_KEYS.EXAM_MANEB_CENTRE_NAME]:   string
  readonly [SETTING_KEYS.EXAM_MANEB_REG_DEADLINE]:  string  // "YYYY-MM-DD"

  // ── Promotion
  readonly [SETTING_KEYS.PROMOTION_MIN_AVERAGE]:      number  // percent, default 35
  readonly [SETTING_KEYS.PROMOTION_REQUIRED_PASSES]:  number  // subject count, default 5

  // ── Student risk thresholds — the boundaries riskService.ts's
  // assessStudentRisk() checks (percentages except subject-fail counts)
  readonly [SETTING_KEYS.RISK_FEE_DEBT_HIGH]:        number  // % balance remaining, default 70
  readonly [SETTING_KEYS.RISK_FEE_DEBT_MEDIUM]:      number  // % balance remaining, default 40
  readonly [SETTING_KEYS.RISK_ABSENCE_HIGH]:         number  // % absent, default 25
  readonly [SETTING_KEYS.RISK_ABSENCE_MEDIUM]:       number  // % absent, default 15
  readonly [SETTING_KEYS.RISK_SUBJECT_FAILS_HIGH]:   number  // subject count, default 4
  readonly [SETTING_KEYS.RISK_SUBJECT_FAILS_MEDIUM]: number  // subject count, default 2

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
  readonly [SETTING_KEYS.HR_CONTRACT_EXPIRY_LOOKAHEAD_DAYS]: number  // days
  readonly [SETTING_KEYS.HR_DEPARTMENT_TITLES]: DepartmentTitles

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
  [SETTING_KEYS.SCHOOL_SYSTEM_TAGLINE]: {
    key: SETTING_KEYS.SCHOOL_SYSTEM_TAGLINE,
    category: SETTING_CATEGORIES.SCHOOL_IDENTITY,
    isPublic: true,
    description: 'Sub-headline shown under the school name in the site header and hero (e.g. "Secondary School Management System").',
    defaultValue: 'Secondary School Management System',
  },
  [SETTING_KEYS.SCHOOL_HERO_SUBTITLE]: {
    key: SETTING_KEYS.SCHOOL_HERO_SUBTITLE,
    category: SETTING_CATEGORIES.SCHOOL_IDENTITY,
    isPublic: true,
    description: 'The tagline shown beneath the hero headline on the landing page (e.g. "Excellence in Education — from Form 1 through MSCE.").',
    defaultValue: 'Excellence in Education — from Form 1 through MSCE.',
  },
  [SETTING_KEYS.SCHOOL_LEADERSHIP_TEAM]: {
    key: SETTING_KEYS.SCHOOL_LEADERSHIP_TEAM,
    category: SETTING_CATEGORIES.SCHOOL_IDENTITY,
    isPublic: true,
    description: 'Public leadership/management team listing shown on the Discover -> Leadership page.',
    defaultValue: [],
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
  [SETTING_KEYS.SCHOOL_LOGO_URL]: {
    key: SETTING_KEYS.SCHOOL_LOGO_URL,
    category: SETTING_CATEGORIES.SCHOOL_IDENTITY,
    isPublic: true,
    description: 'Signed Appwrite view URL for the school crest/logo, shown on report cards and transcripts. Empty until one is uploaded.',
    defaultValue: '',
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

  // ── Student risk thresholds
  [SETTING_KEYS.RISK_FEE_DEBT_HIGH]: {
    key: SETTING_KEYS.RISK_FEE_DEBT_HIGH,
    category: SETTING_CATEGORIES.ACADEMIC,
    isPublic: false,
    description: 'Fee balance remaining (% of total) above which a student is flagged HIGH risk.',
    defaultValue: 70,
  },
  [SETTING_KEYS.RISK_FEE_DEBT_MEDIUM]: {
    key: SETTING_KEYS.RISK_FEE_DEBT_MEDIUM,
    category: SETTING_CATEGORIES.ACADEMIC,
    isPublic: false,
    description: 'Fee balance remaining (% of total) above which a student is flagged MEDIUM risk.',
    defaultValue: 40,
  },
  [SETTING_KEYS.RISK_ABSENCE_HIGH]: {
    key: SETTING_KEYS.RISK_ABSENCE_HIGH,
    category: SETTING_CATEGORIES.ACADEMIC,
    isPublic: false,
    description: 'Absence rate (%) above which a student is flagged HIGH risk.',
    defaultValue: 25,
  },
  [SETTING_KEYS.RISK_ABSENCE_MEDIUM]: {
    key: SETTING_KEYS.RISK_ABSENCE_MEDIUM,
    category: SETTING_CATEGORIES.ACADEMIC,
    isPublic: false,
    description: 'Absence rate (%) above which a student is flagged MEDIUM risk.',
    defaultValue: 15,
  },
  [SETTING_KEYS.RISK_SUBJECT_FAILS_HIGH]: {
    key: SETTING_KEYS.RISK_SUBJECT_FAILS_HIGH,
    category: SETTING_CATEGORIES.ACADEMIC,
    isPublic: false,
    description: 'Number of failed subjects above which a student is flagged HIGH risk.',
    defaultValue: 4,
  },
  [SETTING_KEYS.RISK_SUBJECT_FAILS_MEDIUM]: {
    key: SETTING_KEYS.RISK_SUBJECT_FAILS_MEDIUM,
    category: SETTING_CATEGORIES.ACADEMIC,
    isPublic: false,
    description: 'Number of failed subjects at or above which a student is flagged MEDIUM risk.',
    defaultValue: 2,
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
    defaultValue: DEFAULT_PAYE_BRACKETS.brackets,
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
  [SETTING_KEYS.HR_CONTRACT_EXPIRY_LOOKAHEAD_DAYS]: {
    key: SETTING_KEYS.HR_CONTRACT_EXPIRY_LOOKAHEAD_DAYS,
    category: SETTING_CATEGORIES.HR,
    isPublic: false,
    description: 'How many days ahead of a contract end date a staff contract counts as "expiring soon" in HR reports and alerts.',
    defaultValue: 60,
  },

  [SETTING_KEYS.HR_DEPARTMENT_TITLES]: {
    key: SETTING_KEYS.HR_DEPARTMENT_TITLES,
    category: SETTING_CATEGORIES.HR,
    isPublic: true, // every staff-creation form (HR and admin) needs to read this
    description: 'Department → job-title taxonomy used by the staff creation form and staff directory filters. Edit under Settings → Departments & Titles.',
    defaultValue: {
      'Sciences':        ['Biology Teacher', 'Chemistry Teacher', 'Physics Teacher', 'Laboratory Technician'],
      'Mathematics':      ['Mathematics Teacher'],
      'Languages':        ['English Teacher', 'Chichewa Teacher', 'French Teacher'],
      'Humanities':       ['History Teacher', 'Geography Teacher', 'Religious Education Teacher'],
      'Physical Education': ['Physical Education Teacher', 'Sports Coordinator'],
      'Administration':  ['Head Teacher', 'Deputy Head Teacher', 'Registrar', 'Bursar', 'Clerk', 'Secretary'],
      'Library':          ['Librarian', 'Library Assistant'],
      'Support Staff':   ['Groundskeeper', 'Security Guard', 'Cleaner', 'Driver'],
    },
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
  schoolLogoUrl: string
  currentAcademicYear: string
  timezone: string
  currency: string
  currencyLocale: string
}