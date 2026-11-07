// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { defaultTopicsForRole, PARENT_TOPIC } from '../pushTopics'
import { STAFF_ROLES, USER_ROLES } from '@shared/types/roles'

describe('defaultTopicsForRole', () => {
  it('students: all, students, and their class', () => {
    expect(defaultTopicsForRole('student', 'c1')).toEqual(['announcements_all', 'announcements_students', 'announcements_class_c1'])
    expect(defaultTopicsForRole('student')).toEqual(['announcements_all', 'announcements_students'])
  })

  it('every staff role gets the staff topic', () => {
    for (const r of STAFF_ROLES) expect(defaultTopicsForRole(r)).toContain('announcements_staff')
  })

  it('academic and exam_officer also get the academic topic; nobody else does', () => {
    for (const r of USER_ROLES) {
      const has = defaultTopicsForRole(r).includes('announcements_academic')
      expect(has, r).toBe(r === 'academic' || r === 'exam_officer')
    }
  })

  it('a parent is on ONLY the parent topic: no staff, student, class or all-users topic', () => {
    expect(defaultTopicsForRole('parent')).toEqual([PARENT_TOPIC])
    expect(defaultTopicsForRole('parent', 'some-class')).toEqual([PARENT_TOPIC])
  })

  it('no non-staff role other than student ever lands on the staff topic (the old else-branch bug)', () => {
    for (const r of USER_ROLES) {
      const staffTopic = defaultTopicsForRole(r).includes('announcements_staff')
      expect(staffTopic, r).toBe((STAFF_ROLES as readonly string[]).includes(r))
    }
  })

  it('an unrecognised or missing role subscribes to nothing', () => {
    for (const r of [undefined, null, '', 'teacher', 'Admin', 3, {}]) expect(defaultTopicsForRole(r)).toEqual([])
  })

  it('push.ts delegates to it and no longer has an else-branch to the staff topic', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../push.ts'), 'utf8').replace(/\r\n/g, '\n')
    expect(src).toMatch(/defaultTopicsForRole\(role, classId\)/)
    const fnStart = src.indexOf('export async function subscribeUserToDefaultTopics')
    const fnBody = src.slice(fnStart, fnStart + 900)
    expect(fnBody).not.toMatch(/announcements_staff/)
  })
})
