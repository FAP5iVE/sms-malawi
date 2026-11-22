/**
 * assignmentRules.test.ts
 * Pure-logic tests for packages/shared/utils/assignment.ts: the due-date /
 * lateness boundaries (Africa/Blantyre), the student workflow state + badge
 * definition, rich-text helpers and the upload allowlists. No database, no
 * framework - these are the rules the API and the UI both import.
 */
import { describe, it, expect } from 'vitest'
import {
  isValidYmd, schoolDayOf, daysBetween, endOfSchoolDay, noonOfSchoolDay, deadlineFor,
  classifyByInstant, classifyByDay, validateSubmittedOn, studentAssignmentState, isOutstanding,
  richTextHasContent, utf8Length, extractEmbeddedFileIds, checkFileAgainstRules, isInlineSafeMime,
  fileExtension, ASSIGNMENT_LIMITS,
} from '@shared/utils/assignment'

// A due day as the new code stores it (end of 5 Nov in Malawi) and as OLD rows stored it
// (date input -> midnight UTC). Both must give the same deadline.
const dueNew = endOfSchoolDay('2026-11-05')
const dueLegacy = new Date('2026-11-05T00:00:00.000Z')

describe('school time', () => {
  it('Malawi has no DST: the fixed +02:00 offset matches the platform tz data all year', () => {
    const offset = (iso: string) => {
      const d = new Date(iso)
      const local = new Date(d.toLocaleString('en-US', { timeZone: 'Africa/Blantyre' }))
      return Math.round((local.getTime() - new Date(d.toLocaleString('en-US', { timeZone: 'UTC' })).getTime()) / 3_600_000)
    }
    for (const iso of ['2026-01-15T12:00:00Z', '2026-04-15T12:00:00Z', '2026-07-15T12:00:00Z', '2026-10-25T12:00:00Z']) {
      expect(offset(iso)).toBe(2)
    }
  })
  it('schoolDayOf rolls the day at 22:00 UTC (midnight in Malawi)', () => {
    expect(schoolDayOf(new Date('2026-11-05T21:59:59.999Z'))).toBe('2026-11-05')
    expect(schoolDayOf(new Date('2026-11-05T22:00:00.000Z'))).toBe('2026-11-06')
  })
  it('isValidYmd rejects impossible calendar dates', () => {
    expect(isValidYmd('2026-11-05')).toBe(true)
    expect(isValidYmd('2028-02-29')).toBe(true)
    expect(isValidYmd('2026-02-29')).toBe(false)
    expect(isValidYmd('2026-13-01')).toBe(false)
    expect(isValidYmd('2026-11-31')).toBe(false)
    expect(isValidYmd('5/11/2026')).toBe(false)
    expect(isValidYmd('')).toBe(false)
  })
  it('daysBetween is signed and whole', () => {
    expect(daysBetween('2026-11-05', '2026-11-08')).toBe(3)
    expect(daysBetween('2026-11-08', '2026-11-05')).toBe(-3)
    expect(daysBetween('2026-11-05', '2026-11-05')).toBe(0)
  })
})

describe('deadlineFor / classifyByInstant (a student\'s own hand-in)', () => {
  it('new and legacy due rows share one deadline: 23:59:59.999 CAT on the due day', () => {
    expect(deadlineFor(dueNew).toISOString()).toBe('2026-11-05T21:59:59.999Z')
    expect(deadlineFor(dueLegacy).toISOString()).toBe('2026-11-05T21:59:59.999Z')
  })
  const cases: Array<[string, string, 'SUBMITTED' | 'LATE']> = [
    ['days before the due date',            '2026-11-01T09:00:00Z', 'SUBMITTED'],
    ['the morning of the due date',         '2026-11-05T06:00:00Z', 'SUBMITTED'],
    ['3pm on the due date (the old bug)',   '2026-11-05T13:00:00Z', 'SUBMITTED'],
    ['one millisecond before end of day',   '2026-11-05T21:59:59.998Z', 'SUBMITTED'],
    ['exactly at the last millisecond',     '2026-11-05T21:59:59.999Z', 'SUBMITTED'],
    ['one millisecond after the deadline',  '2026-11-05T22:00:00.000Z', 'LATE'],
    ['the following day',                   '2026-11-06T10:00:00Z', 'LATE'],
    ['a week later',                        '2026-11-12T10:00:00Z', 'LATE'],
  ]
  for (const [label, at, want] of cases) {
    it(`${label} -> ${want} (new row)`, () => expect(classifyByInstant(new Date(at), dueNew)).toBe(want))
    it(`${label} -> ${want} (legacy row)`, () => expect(classifyByInstant(new Date(at), dueLegacy)).toBe(want))
  }
})

describe('deadlineFor with other stored representations (the due DAY is read in school time)', () => {
  it('a due value stored as 00:00 Malawi time (22:00Z the day before) belongs to the NEW day', () => {
    const startOfDayCat = new Date('2026-11-04T22:00:00.000Z') // 05 Nov 00:00 CAT
    expect(schoolDayOf(startOfDayCat)).toBe('2026-11-05')
    expect(deadlineFor(startOfDayCat).toISOString()).toBe('2026-11-05T21:59:59.999Z')
  })
  it('an arbitrary instant late in the UTC evening is already the next day in Malawi', () => {
    const due = new Date('2026-11-05T23:00:00.000Z') // 06 Nov 01:00 CAT
    expect(deadlineFor(due).toISOString()).toBe('2026-11-06T21:59:59.999Z')
    expect(classifyByInstant(new Date('2026-11-06T12:00:00Z'), due)).toBe('SUBMITTED')
    expect(classifyByInstant(new Date('2026-11-06T22:00:00Z'), due)).toBe('LATE')
  })
  it('an ordinary afternoon instant resolves to its own day', () => {
    const due = new Date('2026-11-05T14:23:00.000Z')
    expect(deadlineFor(due).toISOString()).toBe('2026-11-05T21:59:59.999Z')
  })
})

describe('classifyByDay / validateSubmittedOn (a teacher-recorded hand-in)', () => {
  it('on or before the due day is on time; after is late (both row formats)', () => {
    for (const due of [dueNew, dueLegacy]) {
      expect(classifyByDay('2026-11-01', due)).toBe('SUBMITTED')
      expect(classifyByDay('2026-11-05', due)).toBe('SUBMITTED')
      expect(classifyByDay('2026-11-06', due)).toBe('LATE')
    }
  })
  it('agrees with classifyByInstant for the same calendar day', () => {
    for (const at of ['2026-11-05T21:59:59.999Z', '2026-11-05T22:00:00.000Z']) {
      expect(classifyByDay(schoolDayOf(at), dueNew)).toBe(classifyByInstant(new Date(at), dueNew))
    }
  })
  const posted = new Date('2026-11-02T08:00:00Z')
  const now = new Date('2026-11-08T08:00:00Z')
  it('accepts a day between posting and today (inclusive)', () => {
    expect(validateSubmittedOn('2026-11-02', { postedAt: posted, now })).toBeNull()
    expect(validateSubmittedOn('2026-11-08', { postedAt: posted, now })).toBeNull()
  })
  it('rejects future, pre-publication and invalid dates', () => {
    expect(validateSubmittedOn('2026-11-09', { postedAt: posted, now })).toMatch(/future/)
    expect(validateSubmittedOn('2026-11-01', { postedAt: posted, now })).toMatch(/before the assignment was posted/)
    expect(validateSubmittedOn('2026-02-30', { postedAt: posted, now })).toMatch(/valid/)
    expect(validateSubmittedOn('yesterday', { postedAt: posted, now })).toMatch(/valid/)
  })
  it('"today" is judged in school time, not UTC', () => {
    // 23:30 UTC on the 8th is already the 9th in Malawi
    const lateNight = new Date('2026-11-08T23:30:00Z')
    expect(validateSubmittedOn('2026-11-09', { postedAt: posted, now: lateNight })).toBeNull()
  })
  it('a teacher-entered date is stored at noon so its calendar day is stable', () => {
    expect(schoolDayOf(noonOfSchoolDay('2026-11-04'))).toBe('2026-11-04')
    expect(noonOfSchoolDay('2026-11-04').toISOString()).toBe('2026-11-04T10:00:00.000Z')
  })
})

describe('studentAssignmentState and the tab badge', () => {
  const before = new Date('2026-11-05T12:00:00Z')
  const after = new Date('2026-11-06T12:00:00Z')
  it('nothing handed in: PENDING until the deadline, then OVERDUE', () => {
    expect(studentAssignmentState({ dueDate: dueNew, submission: null, now: before })).toBe('PENDING')
    expect(studentAssignmentState({ dueDate: dueNew, submission: null, now: after })).toBe('OVERDUE')
  })
  it('a MISSING marker is NOT a hand-in', () => {
    expect(studentAssignmentState({ dueDate: dueNew, submission: { status: 'MISSING' }, now: before })).toBe('PENDING')
    expect(studentAssignmentState({ dueDate: dueNew, submission: { status: 'MISSING' }, now: after })).toBe('OVERDUE')
  })
  it('real hand-ins keep their status regardless of the clock', () => {
    expect(studentAssignmentState({ dueDate: dueNew, submission: { status: 'SUBMITTED' }, now: after })).toBe('SUBMITTED')
    expect(studentAssignmentState({ dueDate: dueNew, submission: { status: 'LATE' }, now: before })).toBe('LATE')
  })
  it('the badge counts only PENDING work', () => {
    expect(isOutstanding('PENDING')).toBe(true)
    for (const s of ['OVERDUE', 'SUBMITTED', 'LATE'] as const) expect(isOutstanding(s)).toBe(false)
  })
})

describe('rich text helpers', () => {
  it('detects real content vs an emptied editor', () => {
    expect(richTextHasContent('<p></p>')).toBe(false)
    expect(richTextHasContent('<p>&nbsp; </p>')).toBe(false)
    expect(richTextHasContent(null)).toBe(false)
    expect(richTextHasContent('<p>Solve it</p>')).toBe(true)
    expect(richTextHasContent('<img src="https://x/y.png">')).toBe(true)
    expect(richTextHasContent('<p><span data-math="x^2">x^2</span></p>')).toBe(true)
  })
  it('measures UTF-8 bytes, not characters', () => {
    expect(utf8Length('abc')).toBe(3)
    expect(utf8Length('é')).toBe(2)
    expect(utf8Length('√')).toBe(3)
  })
  it('extracts embedded file ids once each', () => {
    const html = '<img src="https://e/storage/buckets/b/files/assignment_image_AbC123xyz987/view"><img src="https://e/files/assignment_image_AbC123xyz987/view"><img src="https://e/files/other_QQQQQQQQ/view">'
    expect(extractEmbeddedFileIds(html, 'assignment_image')).toEqual(['assignment_image_AbC123xyz987'])
    expect(extractEmbeddedFileIds('<p>none</p>', 'assignment_image')).toEqual([])
  })
})

describe('upload allowlists', () => {
  const ok = (name: string, mimeType: string, sizeBytes = 1000) => ({ name, mimeType, sizeBytes })
  it('accepts normal teacher and student files', () => {
    expect(checkFileAgainstRules(ok('worksheet.pdf', 'application/pdf'), 'ATTACHMENT')).toBeNull()
    expect(checkFileAgainstRules(ok('work.DOCX', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'SUBMISSION')).toBeNull()
    expect(checkFileAgainstRules(ok('photo.jpg', 'image/jpeg'), 'SUBMISSION')).toBeNull()
    expect(checkFileAgainstRules(ok('IMG_1.HEIC', 'image/heic'), 'SUBMISSION')).toBeNull()
    expect(checkFileAgainstRules(ok('d.png', 'image/png; charset=binary'), 'IMAGE')).toBeNull()
  })
  it('refuses script-capable and unknown types', () => {
    for (const n of ['x.html', 'x.htm', 'x.svg', 'x.js', 'x.exe', 'x.xml', 'x.php', 'noextension', 'x.pdf.exe']) {
      expect(checkFileAgainstRules(ok(n, 'application/octet-stream'), 'ATTACHMENT')).toMatch(/not an allowed file type/)
    }
  })
  it('refuses a file whose reported type contradicts its extension', () => {
    expect(checkFileAgainstRules(ok('evil.pdf', 'text/html'), 'SUBMISSION')).toMatch(/does not look like a \.pdf/)
    expect(checkFileAgainstRules(ok('evil.png', 'image/svg+xml'), 'IMAGE')).toMatch(/does not look like/)
  })
  it('embedded pictures must be raster images, not documents', () => {
    expect(checkFileAgainstRules(ok('a.pdf', 'application/pdf'), 'IMAGE')).toMatch(/not an allowed file type/)
  })
  it('enforces size and non-empty', () => {
    expect(checkFileAgainstRules(ok('a.pdf', 'application/pdf', ASSIGNMENT_LIMITS.maxFileBytes), 'ATTACHMENT')).toBeNull()
    expect(checkFileAgainstRules(ok('a.pdf', 'application/pdf', ASSIGNMENT_LIMITS.maxFileBytes + 1), 'ATTACHMENT')).toMatch(/larger than/)
    expect(checkFileAgainstRules(ok('a.pdf', 'application/pdf', 0), 'ATTACHMENT')).toMatch(/empty/)
  })
  it('only PDFs and raster images may render inline from the same-origin proxy', () => {
    for (const m of ['application/pdf', 'image/png', 'image/jpeg; x=y']) expect(isInlineSafeMime(m)).toBe(true)
    for (const m of ['text/html', 'image/svg+xml', 'application/xml', 'text/plain', 'application/zip']) expect(isInlineSafeMime(m)).toBe(false)
    expect(fileExtension('a.b.PDF')).toBe('pdf')
  })
})
