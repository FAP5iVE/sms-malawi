/**
 * apps/web/src/lib/hills/studentClass.ts
 *
 * [PURPOSE]: One place that answers "which class is this student in". The student
 *   endpoints (list and detail) return the class as flat fields (`className`,
 *   `classForm`, `classStream`), but several screens read a nested `class` object that
 *   no endpoint fills in, so they showed "Class not recorded" or "Unassigned" for
 *   students who do have a class. Every screen now reads the class through this helper,
 *   which accepts either shape.
 */
export interface StudentClassSource {
  className?: string | null
  classForm?: number | null
  classStream?: string | null
  /** Number of classes in the same form for the year (2 or more means "show the stream"). */
  classStreamCount?: number | null
  class?: { name: string; form?: number | null; stream?: string | null } | null
}

/** The class name ("Form 3 B"), or null when the student has no class. */
export function studentClassName(s: StudentClassSource | null | undefined): string | null {
  if (!s) return null
  const name = s.className ?? s.class?.name ?? null
  return name && name.trim() ? name.trim() : null
}

/** The class name, or the fallback text when the student has no class. */
export function studentClassLabel(s: StudentClassSource | null | undefined, fallback = 'No class yet'): string {
  return studentClassName(s) ?? fallback
}

/** The stream letter, only when the school runs more than one stream in this form. */
export function studentStream(s: StudentClassSource | null | undefined): string | null {
  if (!s) return null
  const stream = (s.classStream ?? s.class?.stream ?? '').trim()
  if (!stream) return null
  if (s.classStreamCount != null && s.classStreamCount < 2) return null
  return stream
}

/**
 * The class as people say it: "Form 3 B". The class name already carries the stream in most
 * schools ("Form 3 B"); when it does not, the stream is added, but only when the form really
 * has more than one stream. Returns null when the student has no class.
 */
export function studentClassWithStream(s: StudentClassSource | null | undefined): string | null {
  const name = studentClassName(s)
  if (!name) return null
  const stream = studentStream(s)
  if (!stream) return name
  return name.toLowerCase().endsWith(stream.toLowerCase()) ? name : `${name} ${stream}`
}
