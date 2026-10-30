/**
 * assignmentIsolation.test.ts
 * Assignment marks are informational "session" marks. They must never influence exam
 * results, continuous assessment, term grades, ranking or report cards. This is a
 * STRUCTURAL guard: it scans the server source and fails if any file other than the
 * assignment feature and a short, reviewed list of read-only reporting/calendar
 * consumers touches the assignment tables. A new consumer must be added to the
 * allowlist deliberately (and reviewed for whether it reads `marks`/`feedback`).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd() // apps/web (the unit project's cwd)
const SRC = join(ROOT, 'src')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) { if (name !== 'node_modules' && name !== '__tests__') walk(p, out) }
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}
const rel = (p: string) => relative(SRC, p).replace(/\\/g, '/')
const TOUCHES_ASSIGNMENT_TABLES = /prisma\.assignment\b|prisma\.assignment[A-Z]\w*|\bassignmentSubmission\b|\bassignmentAttachment\b|\bassignmentView\b/

/** Files allowed to read the assignment tables, and why. None of them may read marks/feedback. */
const ALLOWED = new Set([
  'server/services/assignmentService.ts',                 // the feature itself
  'server/services/analyticsService.ts',                  // counts non-"MISSING" hand-ins per assignment
  'server/services/analytics/studentAnalytics.ts',        // status + date only
  'server/services/analytics/academicAnalytics.ts',       // groupBy status only
  'server/routes/calendar.ts',                            // due dates only
  'app/api/files/[fileId]/route.ts',                      // owner lookup for a hand-in file
])

describe('assignment data stays out of exams, CA, grades, ranking and report cards', () => {
  const files = walk(SRC).filter((f) => rel(f).startsWith('server/') || rel(f).startsWith('app/api/') || rel(f).startsWith('lib/'))

  it('only the reviewed files touch the assignment tables', () => {
    const offenders = files.map(rel).filter((f) => !ALLOWED.has(f) && TOUCHES_ASSIGNMENT_TABLES.test(readFileSync(join(SRC, f), 'utf8')))
    expect(offenders).toEqual([])
  })

  it('no exam / result / grade / ranking / report-card / transcript / CA code imports the assignment service', () => {
    const RESULT_CODE = /(exam|result|grade|ranking|reportCard|transcript|continuous|promotion|marksheet)/i
    const importers = files.map(rel).filter((f) => RESULT_CODE.test(f) && /assignmentService/.test(readFileSync(join(SRC, f), 'utf8')))
    expect(importers).toEqual([])
  })

  it('the reviewed read-only consumers never select marks or feedback from assignment rows', () => {
    // Look at each assignment query's select block in these files.
    for (const f of ['server/services/analyticsService.ts', 'server/services/analytics/studentAnalytics.ts', 'server/services/analytics/academicAnalytics.ts', 'server/routes/calendar.ts']) {
      const text = readFileSync(join(SRC, f), 'utf8')
      const queries = text.match(/prisma\.assignment(?:Submission)?\.(?:findMany|groupBy|findFirst)\(\{[\s\S]*?\n\s{2,6}\}\)/g) ?? []
      expect(queries.length).toBeGreaterThan(0)
      for (const q of queries) expect(q).not.toMatch(/\bmarks\b|\bfeedback\b/)
    }
  })

  it('the exam / continuous-assessment mark models have no relation to assignments in the Prisma schema', () => {
    const schema = readFileSync(join(ROOT, 'prisma/schema.prisma'), 'utf8').replace(/\r\n/g, '\n')
    const model = (name: string) => schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? ''
    for (const m of ['ExamMark', 'Exam']) {
      expect(model(m)).not.toBe('')
      expect(model(m)).not.toMatch(/Assignment/)
    }
    expect(model('AssignmentSubmission')).not.toMatch(/\bExam\b|ExamMark/)
  })
})

describe('storage prefixes the service tests assume still match the real ones', () => {
  it('lib/storage.ts defines the same assignment prefixes', () => {
    const text = readFileSync(join(SRC, 'lib/storage.ts'), 'utf8')
    expect(text).toMatch(/ASSIGNMENT_SUBMISSION:\s*'assignment_submission'/)
    expect(text).toMatch(/ASSIGNMENT_FILE:\s*'assignment_file'/)
    expect(text).toMatch(/ASSIGNMENT_IMAGE:\s*'assignment_image'/)
  })
  it('only pictures are public-read; documents and hand-ins never are', () => {
    const text = readFileSync(join(SRC, 'lib/storage.ts'), 'utf8')
    const block = text.match(/PUBLIC_FILE_PREFIXES[^\n]*=\s*\[[\s\S]*?\r?\n\]/)?.[0] ?? '' // up to the closing bracket on its own line (comments contain "[" and "]")
    expect(block).not.toBe('') // found the DEFINITION, not a mention in a comment
    expect(block).toContain('FILE_PREFIX.ASSIGNMENT_IMAGE')
    expect(block).not.toContain('ASSIGNMENT_FILE')
    expect(block).not.toContain('ASSIGNMENT_SUBMISSION')
  })
})
