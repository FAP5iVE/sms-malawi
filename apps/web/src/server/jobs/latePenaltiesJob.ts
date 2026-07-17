import { applyLatePenalties } from '@/server/services/feeService'
import { logger } from '@/lib/logger'

export async function dailyLatePenaltiesJob(): Promise<{ count: number }> {
  const count = await applyLatePenalties()
  logger.info({ event: 'late_penalties.applied', count })
  return { count }
}