/**
 * "2025/2026" + 2 → ["2023/2024", "2024/2025", "2025/2026"].
 * The window is derived from the school's configured current year, never listed
 * as literals, so it keeps meaning "the last few years" after the school rolls over.
 * An unparseable year yields just that year.
 */
export function recentAcademicYears(currentYear: string, yearsBack: number): string[] {
  const start = Number.parseInt(currentYear.split('/')[0] ?? '', 10)
  if (Number.isNaN(start)) return [currentYear]
  const years: string[] = []
  for (let offset = Math.max(0, yearsBack); offset >= 0; offset -= 1) {
    const from = start - offset
    years.push(`${from}/${from + 1}`)
  }
  return years
}
