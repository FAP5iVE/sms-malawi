'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import { queryKeys } from '@/lib/api-client'
import { useAuthStore } from '@/store/authStore'
import type {
  SettingKey,
  SettingValueMap,
  SettingCategory,
  CategoryGroupedSettings,
  SchoolIdentitySettings,
  SettingRow,
} from '@shared/types/settings'

// ─────────────────────────────────────────────────────────
//  GET SINGLE SETTING
// ─────────────────────────────────────────────────────────

interface SingleSettingResponse<K extends SettingKey> {
  key: K
  value: SettingValueMap[K]
  category: SettingCategory
  isPublic: boolean
}

/**
 * Fetch and cache a single setting value.
 * Type-safe: TypeScript knows the return type based on the key.
 *
 * @example
 *   const { data } = useSetting(SETTING_KEYS.SCHOOL_NAME)
 *   // data is: SingleSettingResponse<'school_name'> | undefined
 *   // data.value is: string
 */
export function useSetting<K extends SettingKey>(key: K) {
  const { initialized } = useAuthStore()

  return useQuery({
    queryKey: [...queryKeys.settings.all(), 'key', key],
    queryFn: () => apiFetch<SingleSettingResponse<K>>(`/settings/${key}`),
    enabled: initialized,
    // Settings change rarely — use generous stale times per category
    staleTime: 30 * 60 * 1000,   // 30 minutes default
    gcTime:    60 * 60 * 1000,   // 1 hour garbage-collection
  })
}

// ─────────────────────────────────────────────────────────
//  GET PUBLIC SETTINGS
// ─────────────────────────────────────────────────────────

/**
 * Fetch all settings marked isPublic = true.
 * Available to any authenticated role.
 * Cached aggressively — these rarely change.
 */
export function usePublicSettings() {
  const { initialized } = useAuthStore()

  return useQuery({
    queryKey: queryKeys.settings.system(),
    queryFn: () => apiFetch<Partial<SettingValueMap>>('/settings/public'),
    enabled: initialized,
    staleTime: 60 * 60 * 1000,  // 1 hour
    gcTime:    24 * 60 * 60 * 1000,
  })
}

// ─────────────────────────────────────────────────────────
//  GET SCHOOL IDENTITY (unauthenticated safe)
// ─────────────────────────────────────────────────────────

/**
 * Fetch school identity settings.
 * Does NOT require authentication — safe for use on public pages.
 * Uses the /settings/identity endpoint which has no auth gate.
 */
export function useSchoolIdentity() {
  return useQuery({
    queryKey: ['settings', 'identity'],
    queryFn: () => apiFetch<SchoolIdentitySettings>('/settings/identity'),
    staleTime: 24 * 60 * 60 * 1000,  // 24 hours
    gcTime:    48 * 60 * 60 * 1000,
    retry: 2,
  })
}

// ─────────────────────────────────────────────────────────
//  GET ALL SETTINGS (admin / high_rank)
// ─────────────────────────────────────────────────────────

/**
 * Fetch all settings grouped by category with full metadata.
 * Only succeeds for admin and high_rank — other roles get 403.
 */
export function useAllSettings() {
  const { role, initialized } = useAuthStore()
  const canAccess = role === 'admin' || role === 'high_rank'

  return useQuery({
    queryKey: ['settings', 'all'],
    queryFn: () => apiFetch<CategoryGroupedSettings>('/settings/all'),
    enabled: initialized && canAccess,
    staleTime: 5 * 60 * 1000,
    gcTime:    15 * 60 * 1000,
  })
}

// ─────────────────────────────────────────────────────────
//  UPDATE SINGLE SETTING
// ─────────────────────────────────────────────────────────

interface UpdateSettingVariables<K extends SettingKey> {
  key: K
  value: SettingValueMap[K]
}

interface UpdateSettingResponse<K extends SettingKey> {
  key: K
  value: SettingValueMap[K]
  updatedByUid: string
  updatedAt: string
}

/**
 * Mutation to update a single setting value.
 * Invalidates all settings-related cache entries on success.
 *
 * @example
 *   const { mutate: updateSetting, isPending } = useUpdateSetting()
 *   updateSetting({ key: SETTING_KEYS.CURRENT_TERM, value: 2 })
 */
export function useUpdateSetting<K extends SettingKey>() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ key, value }: UpdateSettingVariables<K>) =>
      apiFetch<UpdateSettingResponse<K>>(`/settings/${key}`, {
        method: 'PATCH',
        body: JSON.stringify({ value }),
      }),

    onSuccess: (data) => {
      // Invalidate the specific key cache
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.settings.all(), 'key', data.key],
      })
      // Invalidate public settings (value may be public)
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.system() })
      // Invalidate the all-settings view (admin panel)
      queryClient.invalidateQueries({ queryKey: ['settings', 'all'] })
      // Invalidate identity settings (may be school identity key)
      queryClient.invalidateQueries({ queryKey: ['settings', 'identity'] })
    },
  })
}

// ─────────────────────────────────────────────────────────
//  BATCH UPDATE SETTINGS
// ─────────────────────────────────────────────────────────

interface BatchUpdateVariables {
  updates: Array<{ key: SettingKey; value: unknown }>
}

interface BatchUpdateResponse {
  updated: string[]
  count: number
  updatedAt: string
}

/**
 * Mutation to update multiple settings in a single atomic transaction.
 * Admin only — permission enforced server-side.
 */
export function useBatchUpdateSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (variables: BatchUpdateVariables) =>
      apiFetch<BatchUpdateResponse>('/settings/batch', {
        method: 'POST',
        body: JSON.stringify(variables),
      }),

    onSuccess: () => {
      // Invalidate all settings cache on a batch update
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.all() })
      queryClient.invalidateQueries({ queryKey: ['settings', 'all'] })
      queryClient.invalidateQueries({ queryKey: ['settings', 'identity'] })
    },
  })
}

// ─────────────────────────────────────────────────────────
//  SEED DEFAULTS
// ─────────────────────────────────────────────────────────

interface SeedResult {
  seeded: number
}

/**
 * Trigger server-side seeding of missing default settings.
 * Admin only. Idempotent — safe to call multiple times.
 */
export function useSeedSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () =>
      apiFetch<SeedResult>('/settings/seed', { method: 'POST' }),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.all() })
      queryClient.invalidateQueries({ queryKey: ['settings', 'all'] })
    },
  })
}

// ─────────────────────────────────────────────────────────
//  CATEGORY SETTINGS HOOKS
//  Convenience hooks for each settings category page.
//  These fetch the relevant keys for a category form in one call.
// ─────────────────────────────────────────────────────────

/**
 * Returns all academic settings needed for the academic policy form.
 * High_rank and admin only.
 */
export function useAcademicSettings() {
  const { role, initialized } = useAuthStore()
  const canAccess = role === 'admin' || role === 'high_rank'

  return useQuery({
    queryKey: ['settings', 'category', 'academic'],
    queryFn: async () => {
      const [year, term, t1s, t1e, t2s, t2e, t3s, t3e] = await Promise.all([
        apiFetch<SingleSettingResponse<'current_academic_year'>>('/settings/current_academic_year'),
        apiFetch<SingleSettingResponse<'current_term'>>('/settings/current_term'),
        apiFetch<SingleSettingResponse<'term1_start'>>('/settings/term1_start'),
        apiFetch<SingleSettingResponse<'term1_end'>>('/settings/term1_end'),
        apiFetch<SingleSettingResponse<'term2_start'>>('/settings/term2_start'),
        apiFetch<SingleSettingResponse<'term2_end'>>('/settings/term2_end'),
        apiFetch<SingleSettingResponse<'term3_start'>>('/settings/term3_start'),
        apiFetch<SingleSettingResponse<'term3_end'>>('/settings/term3_end'),
      ])
      return {
        currentAcademicYear: year.value,
        currentTerm:         term.value,
        term1Start:          t1s.value,
        term1End:            t1e.value,
        term2Start:          t2s.value,
        term2End:            t2e.value,
        term3Start:          t3s.value,
        term3End:            t3e.value,
      }
    },
    enabled: initialized && canAccess,
    staleTime: 60 * 60 * 1000,
  })
}

/**
 * Returns all exam / promotion settings needed for the exam config form.
 * High_rank, admin, and exam_officer.
 */
export function useExamSettings() {
  const { role, initialized } = useAuthStore()
  const canAccess =
    role === 'admin' || role === 'high_rank' || role === 'exam_officer'

  return useQuery({
    queryKey: ['settings', 'category', 'exam'],
    queryFn: async () => {
      const [passThreshold, manebNo, manebName, manebDeadline, minAvg, reqPasses] =
        await Promise.all([
          apiFetch<SingleSettingResponse<'exam_pass_mark_threshold'>>('/settings/exam_pass_mark_threshold'),
          apiFetch<SingleSettingResponse<'exam_maneb_centre_number'>>('/settings/exam_maneb_centre_number'),
          apiFetch<SingleSettingResponse<'exam_maneb_centre_name'>>('/settings/exam_maneb_centre_name'),
          apiFetch<SingleSettingResponse<'exam_maneb_reg_deadline'>>('/settings/exam_maneb_reg_deadline'),
          apiFetch<SingleSettingResponse<'promotion_min_average'>>('/settings/promotion_min_average'),
          apiFetch<SingleSettingResponse<'promotion_required_passes'>>('/settings/promotion_required_passes'),
        ])
      return {
        passMarkThreshold:       passThreshold.value,
        manebCentreNumber:       manebNo.value,
        manebCentreName:         manebName.value,
        manebRegDeadline:        manebDeadline.value,
        promotionMinAverage:     minAvg.value,
        promotionRequiredPasses: reqPasses.value,
      }
    },
    enabled: initialized && canAccess,
    staleTime: 30 * 60 * 1000,
  })
}

/**
 * Returns all library settings needed for the library config form.
 * Library role and admin.
 */
export function useLibrarySettings() {
  const { role, initialized } = useAuthStore()
  const canAccess = role === 'admin' || role === 'library'

  return useQuery({
    queryKey: ['settings', 'category', 'library'],
    queryFn: async () => {
      const [lpStudent, lpStaff, maxStudent, maxStaff, fineDay, fineGrace, reminderDays] =
        await Promise.all([
          apiFetch<SingleSettingResponse<'library_loan_period_student'>>('/settings/library_loan_period_student'),
          apiFetch<SingleSettingResponse<'library_loan_period_staff'>>('/settings/library_loan_period_staff'),
          apiFetch<SingleSettingResponse<'library_max_books_student'>>('/settings/library_max_books_student'),
          apiFetch<SingleSettingResponse<'library_max_books_staff'>>('/settings/library_max_books_staff'),
          apiFetch<SingleSettingResponse<'library_fine_per_day'>>('/settings/library_fine_per_day'),
          apiFetch<SingleSettingResponse<'library_fine_grace_days'>>('/settings/library_fine_grace_days'),
          apiFetch<SingleSettingResponse<'library_reminder_days_before'>>('/settings/library_reminder_days_before'),
        ])
      return {
        loanPeriodStudent: lpStudent.value,
        loanPeriodStaff:   lpStaff.value,
        maxBooksStudent:   maxStudent.value,
        maxBooksStaff:     maxStaff.value,
        finePerDay:        fineDay.value,
        fineGraceDays:     fineGrace.value,
        reminderDaysBefore:reminderDays.value,
      }
    },
    enabled: initialized && canAccess,
    staleTime: 30 * 60 * 1000,
  })
}

/**
 * Returns all HR settings needed for the HR config form.
 * HR role and admin.
 */
export function useHRSettings() {
  const { role, initialized } = useAuthStore()
  const canAccess = role === 'admin' || role === 'hr' || role === 'high_rank'

  return useQuery({
    queryKey: ['settings', 'category', 'hr'],
    queryFn: async () => {
      const [maxLeave, annual, sick, maternity, paternity, study, emergency] =
        await Promise.all([
          apiFetch<SingleSettingResponse<'hr_max_concurrent_leave_pct'>>('/settings/hr_max_concurrent_leave_pct'),
          apiFetch<SingleSettingResponse<'hr_annual_leave_days'>>('/settings/hr_annual_leave_days'),
          apiFetch<SingleSettingResponse<'hr_sick_leave_days'>>('/settings/hr_sick_leave_days'),
          apiFetch<SingleSettingResponse<'hr_maternity_leave_days'>>('/settings/hr_maternity_leave_days'),
          apiFetch<SingleSettingResponse<'hr_paternity_leave_days'>>('/settings/hr_paternity_leave_days'),
          apiFetch<SingleSettingResponse<'hr_study_leave_days'>>('/settings/hr_study_leave_days'),
          apiFetch<SingleSettingResponse<'hr_emergency_leave_days'>>('/settings/hr_emergency_leave_days'),
        ])
      return {
        maxConcurrentLeavePct: maxLeave.value,
        annualLeaveDays:       annual.value,
        sickLeaveDays:         sick.value,
        maternityLeaveDays:    maternity.value,
        paternityLeaveDays:    paternity.value,
        studyLeaveDays:        study.value,
        emergencyLeaveDays:    emergency.value,
      }
    },
    enabled: initialized && canAccess,
    staleTime: 30 * 60 * 1000,
  })
}

/**
 * Returns finance settings.
 * Finance role and admin.
 */
export function useFinanceSettings() {
  const { role, initialized } = useAuthStore()
  const canAccess = role === 'admin' || role === 'finance'

  return useQuery({
    queryKey: ['settings', 'category', 'finance'],
    queryFn: async () => {
      const [penaltyDay, graceDays, installOpts, payrollDay, pension, paye] =
        await Promise.all([
          apiFetch<SingleSettingResponse<'finance_late_penalty_per_day'>>('/settings/finance_late_penalty_per_day'),
          apiFetch<SingleSettingResponse<'finance_late_penalty_grace_days'>>('/settings/finance_late_penalty_grace_days'),
          apiFetch<SingleSettingResponse<'finance_installment_options'>>('/settings/finance_installment_options'),
          apiFetch<SingleSettingResponse<'finance_payroll_run_day'>>('/settings/finance_payroll_run_day'),
          apiFetch<SingleSettingResponse<'finance_pension_percent'>>('/settings/finance_pension_percent'),
          apiFetch<SingleSettingResponse<'finance_paye_brackets'>>('/settings/finance_paye_brackets'),
        ])
      return {
        latePenaltyPerDay:    penaltyDay.value,
        latePenaltyGraceDays: graceDays.value,
        installmentOptions:   installOpts.value,
        payrollRunDay:        payrollDay.value,
        pensionPercent:       pension.value,
        payeBrackets:         paye.value,
      }
    },
    enabled: initialized && canAccess,
    staleTime: 30 * 60 * 1000,
  })
}