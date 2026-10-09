'use client'

/**
 * apps/web/src/components/shared/StaffSelect.tsx
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Searchable "choose a staff member" control backed by
 *   GET /hr/staff-picker (useStaffPicker) — works for every role that is
 *   allowed to pick staff, including Finance, which the real staff directory
 *   (GET /hr) is closed to. Submits the StaffProfile id.
 *   Search matches name, employee number, department and job title.
 */

import { useMemo } from 'react'
import { useStaffPicker } from '@/hooks/useHR'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { ApiError } from '@/lib/api-client'

export interface StaffSelectProps {
  id?: string
  /** Selected StaffProfile id ('' = none). */
  value: string
  onChange: (staffId: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function StaffSelect({
  id,
  value,
  onChange,
  placeholder = 'Select a staff member…',
  disabled,
  className,
}: StaffSelectProps) {
  const { data, isLoading, isError, error, refetch } = useStaffPicker()

  const options = useMemo(
    () =>
      (data ?? []).map((s) => ({
        value: s.id,
        label: `${s.firstName} ${s.lastName}`,
        description: [s.employeeNo, s.department, s.jobTitle].filter(Boolean).join(' · '),
        keywords: `${s.employeeNo} ${s.department} ${s.jobTitle}`,
      })),
    [data],
  )

  const errorMessage = isError
    ? error instanceof ApiError && error.status === 403
      ? 'You don’t have permission to list staff.'
      : 'Could not load the staff list.'
    : null

  return (
    <SearchableSelect
      id={id}
      options={options}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      searchPlaceholder="Search by name, staff no. or department…"
      isLoading={isLoading}
      errorMessage={errorMessage}
      onRetry={() => refetch()}
      emptyMessage="No active staff members found."
      disabled={disabled}
      className={className}
    />
  )
}

export default StaffSelect
