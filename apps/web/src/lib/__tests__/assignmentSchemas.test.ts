/**
 * assignmentSchemas.test.ts
 * Validation rules for the assignment API contract (packages/shared/schemas/student.ts):
 * creation/edit, marking (submitted-on is mandatory), student hand-in, id params,
 * and the guarantee that any payload the schemas accept fits the API's 50 KB body limit.
 */
import { describe, it, expect } from 'vitest'
import {
  CreateAssignmentSchema, UpdateAssignmentSchema, MarkSubmissionSchema, SubmitAssignmentSchema, IdParamSchema,
} from '@shared/schemas/student'
import { ASSIGNMENT_LIMITS } from '@shared/utils/assignment'

const base = {
  title: 'Algebra set',
  subject: 'Mathematics',
  dueDate: '2026-11-05',
  description: '<p>Solve <span data-math="x^2" data-display="inline">x^2</span></p>',
}
const issuePaths = (r: { success: boolean; error?: { issues: { path: (string | number)[] }[] } }) =>
  r.success ? [] : r.error!.issues.map((i) => i.path.join('.'))

describe('CreateAssignmentSchema', () => {
  it('accepts a valid assignment and fills defaults', () => {
    const r = CreateAssignmentSchema.safeParse(base)
    expect(r.success).toBe(true)
    if (r.success) { expect(r.data.marksEnabled).toBe(false); expect(r.data.attachments).toEqual([]) }
  })
  it('requires visible content: an emptied editor is rejected, picture/formula-only is fine', () => {
    expect(CreateAssignmentSchema.safeParse({ ...base, description: '<p></p>' }).success).toBe(false)
    expect(CreateAssignmentSchema.safeParse({ ...base, description: '<img src="https://x/y.png">' }).success).toBe(true)
    expect(CreateAssignmentSchema.safeParse({ ...base, description: '<p><span data-math="1">1</span></p>' }).success).toBe(true)
  })
  it('rejects impossible or malformed due dates (not just wrong-looking ones)', () => {
    for (const d of ['5/11/2026', '2026-02-30', '2026-13-01', '', 'tomorrow']) {
      expect(CreateAssignmentSchema.safeParse({ ...base, dueDate: d }).success).toBe(false)
    }
  })
  it('title: min 3, max 200, no control characters, trimmed', () => {
    expect(CreateAssignmentSchema.safeParse({ ...base, title: 'ab' }).success).toBe(false)
    expect(CreateAssignmentSchema.safeParse({ ...base, title: 'x'.repeat(201) }).success).toBe(false)
    expect(CreateAssignmentSchema.safeParse({ ...base, title: 'bad\u0000title' }).success).toBe(false)
    const r = CreateAssignmentSchema.safeParse({ ...base, title: '  Fractions  ' })
    expect(r.success && r.data.title).toBe('Fractions')
  })
  it('marking: total marks required and sane when enabled', () => {
    expect(issuePaths(CreateAssignmentSchema.safeParse({ ...base, marksEnabled: true }))).toContain('maxMarks')
    expect(CreateAssignmentSchema.safeParse({ ...base, marksEnabled: true, maxMarks: 20 }).success).toBe(true)
    for (const m of [0, -5, 1.5, 1001]) {
      expect(CreateAssignmentSchema.safeParse({ ...base, marksEnabled: true, maxMarks: m }).success).toBe(false)
    }
  })
  it('attachments: only a storage id is accepted, at most 10, ids must be well-formed', () => {
    const att = (n: number) => Array.from({ length: n }, (_, i) => ({ fileKey: `assignment_file_${i}abcdefgh` }))
    expect(CreateAssignmentSchema.safeParse({ ...base, attachments: att(10) }).success).toBe(true)
    expect(CreateAssignmentSchema.safeParse({ ...base, attachments: att(11) }).success).toBe(false)
    for (const k of ['../etc/passwd', 'a/b', 'a b', "x'y", '', 'k'.repeat(65)]) {
      expect(CreateAssignmentSchema.safeParse({ ...base, attachments: [{ fileKey: k }] }).success).toBe(false)
    }
  })
  it('byte caps: multi-byte text counts by bytes', () => {
    const justUnder = '<p>' + 'a'.repeat(ASSIGNMENT_LIMITS.maxContentBytes - 7) + '</p>'
    expect(CreateAssignmentSchema.safeParse({ ...base, description: justUnder }).success).toBe(true)
    // 15,000 two-byte characters = 30,000 bytes + tags -> over the cap although only ~15k characters
    const multibyte = '<p>' + 'é'.repeat(15_000) + '</p>'
    expect(CreateAssignmentSchema.safeParse({ ...base, description: multibyte }).success).toBe(false)
    expect(CreateAssignmentSchema.safeParse({ ...base, requirements: 'r'.repeat(ASSIGNMENT_LIMITS.maxRequirementsBytes + 1) }).success).toBe(false)
  })
  it('anything the schema accepts fits the API 50 KB JSON body limit (worst case)', () => {
    const worst = {
      title: 'T'.repeat(200),
      subject: 'S'.repeat(100),
      dueDate: '2026-11-05',
      description: '<p>' + 'a'.repeat(ASSIGNMENT_LIMITS.maxContentBytes - 7) + '</p>',
      requirements: 'r'.repeat(ASSIGNMENT_LIMITS.maxRequirementsBytes),
      marksEnabled: true,
      maxMarks: 1000,
      attachments: Array.from({ length: ASSIGNMENT_LIMITS.maxAttachments }, (_, i) => ({ fileKey: `assignment_file_${'x'.repeat(40)}${i}` })),
    }
    expect(CreateAssignmentSchema.safeParse(worst).success).toBe(true)
    expect(new TextEncoder().encode(JSON.stringify(worst)).length).toBeLessThan(50 * 1024)
  })
})

describe('UpdateAssignmentSchema', () => {
  it('accepts any subset without injecting defaults', () => {
    const r = UpdateAssignmentSchema.safeParse({ title: 'New title' })
    expect(r.success).toBe(true)
    if (r.success) { expect(r.data.marksEnabled).toBeUndefined(); expect(r.data.attachments).toBeUndefined() }
  })
  it('cannot change the subject of a posted assignment (silently dropped)', () => {
    const r = UpdateAssignmentSchema.safeParse({ title: 'Ok title', subject: 'Physics' })
    expect(r.success && 'subject' in r.data).toBe(false)
  })
  it('still requires total marks when switching marks on', () => {
    expect(UpdateAssignmentSchema.safeParse({ marksEnabled: true }).success).toBe(false)
    expect(UpdateAssignmentSchema.safeParse({ marksEnabled: true, maxMarks: 10 }).success).toBe(true)
  })
  it('expectedUpdatedAt must be an ISO timestamp', () => {
    expect(UpdateAssignmentSchema.safeParse({ title: 'Fine title', expectedUpdatedAt: '2026-11-05T10:00:00.000Z' }).success).toBe(true)
    expect(UpdateAssignmentSchema.safeParse({ title: 'Fine title', expectedUpdatedAt: 'yesterday' }).success).toBe(false)
  })
})

describe('MarkSubmissionSchema (teacher records a student)', () => {
  it('SUBMITTED and LATE REQUIRE the submitted-on date', () => {
    for (const status of ['SUBMITTED', 'LATE'] as const) {
      const r = MarkSubmissionSchema.safeParse({ status })
      expect(r.success).toBe(false)
      expect(issuePaths(r)).toContain('submittedOn')
    }
  })
  it('MISSING (not submitted) needs no date', () => {
    expect(MarkSubmissionSchema.safeParse({ status: 'MISSING' }).success).toBe(true)
  })
  it('accepts a full record', () => {
    expect(MarkSubmissionSchema.safeParse({ status: 'SUBMITTED', submittedOn: '2026-11-04', marks: 8.5, feedback: 'Good work' }).success).toBe(true)
  })
  it('rejects marks on a not-submitted student', () => {
    expect(issuePaths(MarkSubmissionSchema.safeParse({ status: 'MISSING', marks: 5 }))).toContain('marks')
  })
  it('rejects negative, NaN, Infinity and non-numeric marks', () => {
    const rec = { status: 'SUBMITTED', submittedOn: '2026-11-04' }
    for (const m of [-1, Number.NaN, Number.POSITIVE_INFINITY, '8' as unknown as number]) {
      expect(MarkSubmissionSchema.safeParse({ ...rec, marks: m }).success).toBe(false)
    }
    expect(MarkSubmissionSchema.safeParse({ ...rec, marks: null }).success).toBe(true) // "not marked yet"
  })
  it('expectedUpdatedAt accepts an ISO timestamp or null ("no record yet") and nothing else', () => {
    const rec = { status: 'SUBMITTED', submittedOn: '2026-11-04' }
    expect(MarkSubmissionSchema.safeParse({ ...rec, expectedUpdatedAt: '2026-11-05T10:00:00.000Z' }).success).toBe(true)
    expect(MarkSubmissionSchema.safeParse({ ...rec, expectedUpdatedAt: null }).success).toBe(true)
    expect(MarkSubmissionSchema.safeParse({ ...rec }).success).toBe(true)
    expect(MarkSubmissionSchema.safeParse({ ...rec, expectedUpdatedAt: 'later' }).success).toBe(false)
  })
  it('rejects malformed dates, unknown statuses and control characters in feedback', () => {
    expect(MarkSubmissionSchema.safeParse({ status: 'SUBMITTED', submittedOn: 'yesterday' }).success).toBe(false)
    expect(MarkSubmissionSchema.safeParse({ status: 'SUBMITTED', submittedOn: '2026-02-30' }).success).toBe(false)
    expect(MarkSubmissionSchema.safeParse({ status: 'DONE', submittedOn: '2026-11-04' }).success).toBe(false)
    expect(MarkSubmissionSchema.safeParse({ status: 'SUBMITTED', submittedOn: '2026-11-04', feedback: 'a\u0007b' }).success).toBe(false)
    expect(MarkSubmissionSchema.safeParse({ status: 'SUBMITTED', submittedOn: '2026-11-04', feedback: 'x'.repeat(2001) }).success).toBe(false)
  })
})

describe('SubmitAssignmentSchema (student hand-in)', () => {
  it('needs a file or a note', () => {
    expect(SubmitAssignmentSchema.safeParse({}).success).toBe(false)
    expect(SubmitAssignmentSchema.safeParse({ note: '   ' }).success).toBe(false)
    expect(SubmitAssignmentSchema.safeParse({ note: 'done' }).success).toBe(true)
    expect(SubmitAssignmentSchema.safeParse({ fileId: 'assignment_submission_abc123XYZ' }).success).toBe(true)
    expect(SubmitAssignmentSchema.safeParse({ fileId: 'assignment_submission_abc123XYZ', note: 'both' }).success).toBe(true)
  })
  it('rejects path-like or oversized ids', () => {
    for (const f of ['../x', 'a/b', 'x'.repeat(65), 'a b']) expect(SubmitAssignmentSchema.safeParse({ fileId: f }).success).toBe(false)
  })
})

describe('IdParamSchema', () => {
  it('accepts cuid-like ids and refuses everything that is not an id', () => {
    for (const ok of ['cmgx1abcd0000xyz', 'assignment_submission_AbC123', 'a-b_c']) expect(IdParamSchema.safeParse(ok).success).toBe(true)
    for (const bad of ['', '../..', 'a/b', 'a b', "a'b", 'a;drop', 'x'.repeat(65), 'é']) expect(IdParamSchema.safeParse(bad).success).toBe(false)
  })
})
