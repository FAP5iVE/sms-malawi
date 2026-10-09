/**
 * attendancePermissions.test.ts
 * [CHANGE TYPE]: NEW FILE
 * Locks in the viewing-vs-marking split for class attendance:
 *   • class.viewAttendance — oversight roles + teachers: read ANY class's register.
 *   • class.markAttendance — teachers only (and the route additionally requires
 *     the requester to be that class's own assigned teacher).
 */
import { describe, it, expect } from 'vitest'
import { hasPermission } from '@shared/types/permissions'
import type { UserRole } from '@shared/types/roles'

const CAN_VIEW: UserRole[]    = ['admin', 'high_rank', 'lower_rank', 'academic', 'exam_officer']
const CANNOT_VIEW: UserRole[] = ['student', 'finance', 'library', 'hr']

describe('class attendance permissions', () => {
  it.each(CAN_VIEW)('%s can VIEW a class register', (role) => {
    expect(hasPermission(role, 'class.viewAttendance')).toBe(true)
  })

  it.each(CANNOT_VIEW)('%s cannot view a class register', (role) => {
    expect(hasPermission(role, 'class.viewAttendance')).toBe(false)
  })

  it('only teachers (academic) hold the MARK permission', () => {
    for (const role of [...CAN_VIEW, ...CANNOT_VIEW]) {
      expect(hasPermission(role, 'class.markAttendance')).toBe(role === 'academic')
    }
  })

  it('every role that can mark can also view (marking implies viewing)', () => {
    for (const role of [...CAN_VIEW, ...CANNOT_VIEW]) {
      if (hasPermission(role, 'class.markAttendance')) {
        expect(hasPermission(role, 'class.viewAttendance')).toBe(true)
      }
    }
  })
})
