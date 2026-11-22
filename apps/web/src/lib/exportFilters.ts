/**
 * Turns the active report filters (the URL query string) into the lines printed
 * on an export, so a PDF or workbook says which filters produced it. Pure.
 *
 * `tab` is the report itself and is not a filter. A filter whose value is an
 * internal id (class, department, teacher …) is printed as its id and marked
 * "(id)", because the file must be traceable even where a name is not to hand.
 */
export const FILTER_LABELS: Readonly<Record<string, string>> = {
  bucket: 'Ageing bucket',
  status: 'Status',
  classId: 'Class (id)',
  subject: 'Subject',
  teacherUid: 'Teacher (id)',
  days: 'Window (days)',
  months: 'Window (months)',
  window: 'Window',
  type: 'Type',
  form: 'Form',
  category: 'Category',
  condition: 'Condition',
  departmentId: 'Department (id)',
  buildingId: 'Building (id)',
  roomId: 'Room (id)',
  custodianUid: 'Custodian (id)',
  stocktakeTerm: 'Stocktake term',
  from: 'From',
  to: 'To',
  q: 'Search',
}

const IGNORED = new Set(['tab'])

export function filterLinesFromParams(
  entries: Iterable<readonly [string, string]>,
  labels: Readonly<Record<string, string>> = FILTER_LABELS,
): string[] {
  const lines: string[] = []
  const seen = new Set<string>()
  for (const [key, value] of entries) {
    if (IGNORED.has(key) || value === '' || seen.has(key)) continue
    seen.add(key)
    lines.push(`${labels[key] ?? key}: ${value}`)
  }
  return lines
}
